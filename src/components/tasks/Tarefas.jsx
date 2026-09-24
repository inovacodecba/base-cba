// "Tarefas" — quadro Kanban simplificado (tipo Trello interno), pedido do
// usuário: criar tarefa, atribuir responsável(is), ver o andamento em 3
// colunas fixas (A Fazer / Em Andamento / Concluído), e uma segunda visão
// agrupada por pessoa (pra ver rápido "quem tem o quê"). Puramente
// apresentacional — mesmo padrão container/presentational do resto do app
// (Dashboard.jsx, Documentos.jsx): todo o CRUD de verdade (chamadas ao
// Supabase) mora no App.jsx, aqui só se recebe os dados prontos e se
// dispara callbacks.
//
// Arrastar-e-soltar: implementado com a API nativa do HTML5 (draggable +
// onDragStart/onDragOver/onDrop), sem nenhuma lib nova — mantém o bundle
// pequeno (site é hospedado no GitHub Pages) e cobre bem o uso no desktop
// (mouse). Só que essa API do navegador NÃO dispara em toque de celular, e
// o app é um PWA pensado pra Android/iPhone — por isso cada card também tem
// 2 setinhas (‹ ›) que movem a tarefa pra coluna anterior/seguinte com 1
// toque, funcionando igual em qualquer aparelho. Arrastar é um bônus no
// desktop; as setas são o caminho garantido em todo lugar.
//
// Múltiplos responsáveis (31/08/2026): uma tarefa pode ter vários
// responsáveis (array `responsaveis`) — cada um conta pro próprio badge de
// "tarefas em aberto" (todos são avisados, não só um "principal"). A visão
// "Por Pessoa" existe justamente porque, com vários responsáveis por
// tarefa, fica mais difícil enxergar a carga de cada colaborador só
// olhando o quadro por status — aqui cada pessoa vira um cartão com a
// contagem de pendências e a lista das tarefas dela.
import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, ChevronDown, CalendarDays, ClipboardCheck, Kanban, Users } from "lucide-react";
import { Overlay } from "../common.jsx";
import { makeStyleHelpers } from "../../theme.js";
import { TASK_STATUS } from "../../constants.js";

const COLS = Object.keys(TASK_STATUS); // ["a_fazer", "em_andamento", "concluido"]

// "2026-08-31" → "31/08" — as tarefas guardam só a data (sem hora), então
// não reaproveita `fd()`/`ts()` de utils.js (esses esperam o formato
// "dd/mm/aaaa, hh:mm:ss" que o app usa pra movimentações, com hora junto).
const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
};

// Classifica o prazo em atrasado / hoje / próximo / normal — só isso muda a
// cor do chip; a data em si sempre aparece.
function dueInfo(prazo, T) {
  if (!prazo) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${prazo}T00:00:00`);
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return { label: `Atrasada · ${fmtDate(prazo)}`, color: "#ef4444" };
  if (days === 0) return { label: "Hoje", color: "#f97316" };
  if (days <= 2) return { label: `${fmtDate(prazo)} · em ${days}d`, color: "#eab308" };
  return { label: fmtDate(prazo), color: T.textFaint };
}

// Pilha de avatares (iniciais) dos responsáveis — até 3 visíveis, o resto
// vira "+N" pra não estourar a largura do card.
function AvatarStack({ T, names, size = 18 }) {
  if (!names || names.length === 0) return null;
  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  return (
    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
      {shown.map((n, i) => (
        <span key={n} title={n} style={{
          width: size, height: size, borderRadius: "50%", background: `${T.accent}22`, color: T.accent,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, fontWeight: 700,
          border: `1.5px solid ${T.panel}`, marginLeft: i === 0 ? 0 : -6, flexShrink: 0,
        }}>{n.trim().slice(0, 1).toUpperCase()}</span>
      ))}
      {extra > 0 && <span style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, marginLeft: 4 }}>+{extra}</span>}
    </div>
  );
}

// Dropdown simples com checkboxes pra escolher vários responsáveis — a
// equipe é pequena (poucas pessoas), então uma lista com checkbox resolve
// bem sem precisar de nenhuma lib de multi-select.
function TeamMultiSelect({ T, team, value, onChange, inp }) {
  const [open, setOpen] = useState(false);
  const toggle = (name) => onChange(value.includes(name) ? value.filter(n => n !== name) : [...value, name]);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ ...inp(), textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: value.length ? T.text : T.textFaint }}>
          {value.length ? value.join(", ") : "Sem responsável"}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: .6, transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms ease" }} />
      </button>
      {open && (
        <>
          {/* backdrop invisível só pra fechar ao clicar fora, sem precisar de listener global */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: T.panel, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: 4, zIndex: 21, maxHeight: 190, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.28)",
          }}>
            {team.length === 0 && <div style={{ padding: 8, fontSize: 11.5, color: T.textFaint }}>Nenhum colaborador cadastrado.</div>}
            {team.map(name => (
              <label key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 6, fontSize: 12.5, color: T.text, cursor: "pointer" }}>
                <input type="checkbox" checked={value.includes(name)} onChange={() => toggle(name)} style={{ accentColor: T.accent, width: 14, height: 14, flexShrink: 0 }} />
                {name}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TaskCard({ T, task, isMine, onEdit, onDelete, onMove, onDragStart, isFirst, isLast }) {
  const due = dueInfo(task.prazo, T);
  const responsaveis = task.responsaveis || [];
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      style={{
        background: T.input, border: `1px solid ${T.border}`, borderLeft: `3px solid ${isMine ? T.accent : T.border}`,
        borderRadius: 7, padding: "10px 10px 8px", marginBottom: 8, cursor: "grab",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "flex-start" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, wordBreak: "break-word" }}>{task.titulo}</div>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <button onClick={() => onEdit(task)} aria-label="Editar tarefa" style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: "none", background: "transparent", color: T.textFaint, cursor: "pointer" }}><Pencil size={12} /></button>
          <button onClick={() => onDelete(task)} aria-label="Excluir tarefa" style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: "none", background: "transparent", color: T.textFaint, cursor: "pointer" }}><Trash2 size={12} /></button>
        </div>
      </div>

      {task.descricao && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{task.descricao}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <AvatarStack T={T} names={responsaveis} />
          <span style={{ fontSize: 10.5, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {responsaveis.length ? responsaveis.join(", ") : "Sem responsável"}
          </span>
        </div>
        {due && <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 700, color: due.color, flexShrink: 0 }}><CalendarDays size={11} strokeWidth={2.25} />{due.label}</span>}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 8 }}>
        <button onClick={() => onMove(task, -1)} disabled={isFirst} aria-label="Mover para a coluna anterior" style={{ width: 24, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: isFirst ? T.textFaint : T.textMuted, opacity: isFirst ? .4 : 1, cursor: isFirst ? "default" : "pointer" }}><ChevronLeft size={13} /></button>
        <button onClick={() => onMove(task, 1)} disabled={isLast} aria-label="Mover para a próxima coluna" style={{ width: 24, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: isLast ? T.textFaint : T.textMuted, opacity: isLast ? .4 : 1, cursor: isLast ? "default" : "pointer" }}><ChevronRight size={13} /></button>
      </div>
    </div>
  );
}

// Uma linha compacta de tarefa dentro do cartão de uma pessoa (visão "Por
// Pessoa") — clicar abre o mesmo modal de edição do quadro, pra não ter
// dois lugares diferentes editando a mesma coisa de jeitos diferentes.
function PersonTaskRow({ T, task, onEdit }) {
  const cfg = TASK_STATUS[task.status];
  const dot = T.isLight ? cfg.dot.light : cfg.dot.dark;
  const due = dueInfo(task.prazo, T);
  return (
    <button
      className="task-person-row"
      onClick={() => onEdit(task)}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 6, border: "none",
        background: "transparent", cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit",
      }}
    >
      <span title={cfg.label} style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.titulo}</span>
      {due && <span style={{ fontSize: 9.5, fontWeight: 700, color: due.color, flexShrink: 0 }}>{due.label}</span>}
    </button>
  );
}

// Cartão de uma pessoa na visão "Por Pessoa": nome, badge de pendências e a
// lista das tarefas dela (concluídas por último, mais urgentes primeiro).
function PersonCard({ T, name, list, onEdit, isMe, muted }) {
  const openCount = list.filter(t => t.status !== "concluido").length;
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: list.length ? `1px solid ${T.borderSoft}` : "none" }}>
        {!muted && <span style={{ width: 22, height: 22, borderRadius: "50%", background: `${T.accent}22`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{name.slice(0, 1).toUpperCase()}</span>}
        <span style={{ fontSize: 12.5, fontWeight: 700, color: muted ? T.textFaint : T.textBright }}>{name}{isMe ? " (você)" : ""}</span>
        {openCount > 0 && <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: "#ef4444", background: "#ef444422", borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>{openCount} em aberto</span>}
        {openCount === 0 && <span style={{ marginLeft: "auto", fontSize: 10.5, color: T.textFaint, flexShrink: 0 }}>{list.length ? "tudo em dia" : "sem tarefas"}</span>}
      </div>
      {list.length > 0 && (
        <div style={{ padding: 6, display: "flex", flexDirection: "column" }}>
          {list.map(t => <PersonTaskRow key={t.id} T={T} task={t} onEdit={onEdit} />)}
        </div>
      )}
    </div>
  );
}

// Agrupa as tarefas por responsável — cada pessoa da equipe aparece sempre
// (mesmo sem tarefa, pra deixar claro que ela está livre), mais um grupo
// "Sem responsável" no fim se houver tarefa sem ninguém atribuído.
function PorPessoaView({ T, tasks, team, currentUser, onEdit }) {
  const { porPessoa, semResponsavel } = useMemo(() => {
    const rank = (t) => (t.status === "concluido" ? 1 : 0); // pendentes primeiro, concluídas por último
    const cmp = (a, b) => rank(a) - rank(b) || (a.prazo || "9999-99-99").localeCompare(b.prazo || "9999-99-99");
    return {
      porPessoa: team.map(name => ({ name, list: tasks.filter(t => (t.responsaveis || []).includes(name)).sort(cmp) })),
      semResponsavel: tasks.filter(t => !(t.responsaveis || []).length).sort(cmp),
    };
  }, [tasks, team]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {porPessoa.map(({ name, list }) => (
        <PersonCard key={name} T={T} name={name} list={list} onEdit={onEdit} isMe={name === currentUser} />
      ))}
      {semResponsavel.length > 0 && (
        <PersonCard T={T} name="Sem responsável" list={semResponsavel} onEdit={onEdit} muted />
      )}
      {porPessoa.length === 0 && semResponsavel.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "30px 16px", color: T.textFaint }}>
          <Users size={26} strokeWidth={1.6} />
          <div style={{ fontSize: 12 }}>Nenhuma tarefa criada ainda.</div>
        </div>
      )}
    </div>
  );
}

export function Tarefas({ T, tasks, team, currentUser, onCreate, onUpdate, onUpdateStatus, onDelete, showToast }) {
  const { inp, btn, ghost } = makeStyleHelpers(T);
  const lbl = (children) => <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: .6 }}>{children}</div>;

  const [tab, setTab] = useState("quadro"); // "quadro" | "pessoa"
  const [modal, setModal] = useState(null); // { type: "new" } | { type: "edit", id }
  const [form, setForm] = useState({ titulo: "", descricao: "", responsaveis: [], prazo: "", status: "a_fazer" });
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const openNew = () => { setForm({ titulo: "", descricao: "", responsaveis: currentUser ? [currentUser] : [], prazo: "", status: "a_fazer" }); setModal({ type: "new" }); };
  const openEdit = (t) => { setForm({ titulo: t.titulo, descricao: t.descricao || "", responsaveis: t.responsaveis || [], prazo: t.prazo || "", status: t.status }); setModal({ type: "edit", id: t.id }); };
  const closeModal = () => setModal(null);

  const submit = () => {
    const titulo = form.titulo.trim();
    if (!titulo) return showToast("Digite um título pra tarefa", "err");
    const payload = { titulo, descricao: form.descricao.trim(), responsaveis: form.responsaveis, prazo: form.prazo || null };
    if (modal.type === "new") onCreate(payload);
    else onUpdate(modal.id, { ...payload, status: form.status });
    closeModal();
  };

  const moveTask = (task, dir) => {
    const idx = COLS.indexOf(task.status);
    const next = COLS[idx + dir];
    if (next) onUpdateStatus(task.id, next);
  };

  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; };
  const onDropCol = (e, col) => {
    e.preventDefault();
    if (dragId != null) onUpdateStatus(dragId, col);
    setDragId(null); setDragOverCol(null);
  };

  // Prazo mais próximo primeiro (sem prazo vai pro fim); em empate, mais
  // recém-criada primeiro — mesma ideia de "o que precisa de atenção agora
  // aparece no topo", sem precisar de reordenação manual (arrastar dentro
  // da mesma coluna só muda de status, não a ordem — mantém simples).
  const sorted = (col) => tasks
    .filter(t => t.status === col)
    .sort((a, b) => (a.prazo || "9999-99-99").localeCompare(b.prazo || "9999-99-99") || (b.criado_em_iso || "").localeCompare(a.criado_em_iso || ""));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setTab("quadro")} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
            background: tab === "quadro" ? `${T.accent}18` : "transparent", color: tab === "quadro" ? T.accent : T.textMuted,
          }}><Kanban size={14} /> Quadro</button>
          <button onClick={() => setTab("pessoa")} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
            background: tab === "pessoa" ? `${T.accent}18` : "transparent", color: tab === "pessoa" ? T.accent : T.textMuted,
          }}><Users size={14} /> Por Pessoa</button>
        </div>
        <button onClick={openNew} style={{ ...btn(T.accent), display: "flex", alignItems: "center", gap: 6, padding: "9px 14px" }}><Plus size={14} strokeWidth={2.5} /> Nova Tarefa</button>
      </div>

      {tab === "quadro" ? (
        <>
          <div className="tasks-board" style={{ display: "grid", gap: 14 }}>
            {COLS.map(col => {
              const list = sorted(col);
              const cfg = TASK_STATUS[col];
              const dot = T.isLight ? cfg.dot.light : cfg.dot.dark;
              return (
                <div
                  key={col}
                  onDragOver={e => { e.preventDefault(); setDragOverCol(col); }}
                  onDragLeave={() => setDragOverCol(p => p === col ? null : p)}
                  onDrop={e => onDropCol(e, col)}
                  style={{ background: T.panel, border: `1px solid ${dragOverCol === col ? T.accent : T.border}`, borderRadius: 10, display: "flex", flexDirection: "column", minHeight: 160, transition: "border-color 120ms ease" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 14px", borderBottom: `1px solid ${T.borderSoft}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.textBright }}>{cfg.label}</span>
                    <span style={{ fontSize: 11, color: T.textFaint, marginLeft: "auto" }}>{list.length}</span>
                  </div>
                  <div style={{ padding: 10, flex: 1, overflowY: "auto", maxHeight: 560 }}>
                    {list.length === 0 && <div style={{ padding: "20px 8px", fontSize: 11, color: T.textFaint, textAlign: "center" }}>Nenhuma tarefa aqui.</div>}
                    {list.map(t => (
                      <TaskCard
                        key={t.id} T={T} task={t} isMine={(t.responsaveis || []).includes(currentUser)}
                        onEdit={openEdit} onDelete={onDelete} onMove={moveTask} onDragStart={onDragStart}
                        isFirst={COLS.indexOf(t.status) === 0} isLast={COLS.indexOf(t.status) === COLS.length - 1}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {tasks.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "30px 16px", color: T.textFaint }}>
              <ClipboardCheck size={26} strokeWidth={1.6} />
              <div style={{ fontSize: 12 }}>Nenhuma tarefa criada ainda — comece com "Nova Tarefa".</div>
            </div>
          )}
        </>
      ) : (
        <PorPessoaView T={T} tasks={tasks} team={team} currentUser={currentUser} onEdit={openEdit} />
      )}

      {modal && (
        <Overlay T={T} onClose={closeModal}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: T.textBright }}>{modal.type === "new" ? "Nova Tarefa" : "Editar Tarefa"}</h3>

          {lbl("Título *")}
          <input autoFocus value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="ex: Revisar estoque do almoxarifado" style={inp({ marginBottom: 10 })} />

          {lbl("Descrição")}
          <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Detalhe opcional" rows={3} style={{ ...inp({ marginBottom: 10 }), resize: "vertical", fontFamily: "inherit" }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              {lbl("Responsáveis")}
              <TeamMultiSelect T={T} team={team} value={form.responsaveis} onChange={(v) => setForm(p => ({ ...p, responsaveis: v }))} inp={inp} />
            </div>
            <div>
              {lbl("Prazo")}
              <input type="date" value={form.prazo} onChange={e => setForm(p => ({ ...p, prazo: e.target.value }))} style={inp()} />
            </div>
          </div>

          {modal.type === "edit" && <>
            {lbl("Status")}
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} style={inp({ marginBottom: 4 })}>
              {COLS.map(c => <option key={c} value={c}>{TASK_STATUS[c].label}</option>)}
            </select>
          </>}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {modal.type === "edit" && (
              <button onClick={() => { onDelete({ id: modal.id, titulo: form.titulo }); closeModal(); }} style={{ ...ghost(), color: "#ef4444", borderColor: "#ef444430" }}>Excluir</button>
            )}
            <button onClick={submit} style={{ ...btn(T.accent), flex: 1, padding: "10px" }}>{modal.type === "new" ? "Criar tarefa" : "Salvar alterações"}</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
