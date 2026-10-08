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
//
// Reskin "cartão de produto" (10/2026): pedido do usuário foi deixar a
// estética parecida com um painel tipo SaaS (cards com badge, tag de
// urgência, mini-infobox de responsável/prazo, botões em pílula) + mais
// animação pra melhorar a sensação de uso — mantendo 100% do comportamento
// que já existia (drag-and-drop, setas, modal, visão por pessoa). Só a
// camada visual mudou; toda a lógica de dados é a mesma de antes.
import { useState, useMemo } from "react";
import { Plus, ChevronLeft, ChevronRight, ChevronDown, CalendarDays, ClipboardCheck, Kanban, Users, ArrowRight, CheckCircle2, Flag, Tag } from "lucide-react";
import { Overlay } from "../common.jsx";
import { makeStyleHelpers } from "../../theme.js";
import { TASK_STATUS, TASK_PRIORITY } from "../../constants.js";

const COLS = Object.keys(TASK_STATUS); // ["a_fazer", "em_andamento", "concluido"]
const PRIORITIES = Object.keys(TASK_PRIORITY); // ["baixa", "media", "alta", "urgente"]

// Cor da tag de categoria (10/2026) — "Projeto"/"Infra"/"Compras"/etc são
// texto livre (sem tabela própria, ver migração `add_tarefas_categoria_
// prioridade`), então a cor não pode vir de um mapa fixo como CAT_COLOR do
// inventário. Em vez disso, deriva um índice estável a partir do próprio
// nome (hash simples) — a mesma categoria sempre cai na mesma cor da
// paleta, em qualquer sessão, sem precisar persistir "categoria → cor" em
// lugar nenhum.
const CAT_TAG_PALETTE = ["#3b82f6", "#f97316", "#8b5cf6", "#06b6d4", "#22c55e", "#ec4899", "#14b8a6", "#f43f5e", "#84cc16", "#eab308"];
function categoryColor(name) {
  if (!name) return null;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CAT_TAG_PALETTE[hash % CAT_TAG_PALETTE.length];
}

// "2026-08-31" → "31/08" — as tarefas guardam só a data (sem hora), então
// não reaproveita `fd()`/`ts()` de utils.js (esses esperam o formato
// "dd/mm/aaaa, hh:mm:ss" que o app usa pra movimentações, com hora junto).
const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
};

// Classifica o prazo em atrasado / hoje / próximo / normal — vira tanto a
// cor do chip "due" quanto a tag de urgência no topo do card (reaproveita o
// mesmo dado real do banco, sem inventar um campo de "prioridade" que não
// existe no schema). Uma tarefa já concluída nunca é "atrasada" — depois de
// pronta, a urgência do prazo deixa de fazer sentido (evita o estranhamento
// de ver "Atrasada" em vermelho num card que já foi resolvido).
function dueInfo(prazo, T, status) {
  if (status === "concluido") { const c = T.isLight ? "#1b9e4b" : "#22c55e"; return { label: "Concluída", color: c, full: "Concluída" }; }
  if (!prazo) return { label: "Sem prazo", color: T.textFaint, full: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${prazo}T00:00:00`);
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return { label: "Atrasada", full: `Atrasada · ${fmtDate(prazo)}`, color: "#ef4444" };
  if (days === 0) return { label: "Hoje", full: "Hoje", color: "#f97316" };
  if (days <= 2) return { label: `Em ${days}d`, full: `${fmtDate(prazo)} · em ${days}d`, color: "#eab308" };
  return { label: fmtDate(prazo), full: fmtDate(prazo), color: T.textFaint };
}

// Pílula de prioridade — sempre visível no card (mesmo "Baixa"/"Média"),
// diferente do selo de prazo que só aparece quando há algo a sinalizar.
// Prioridade é uma escolha explícita da pessoa ao criar a tarefa, então
// escondê-la quando "normal" esconderia informação que ela decidiu
// registrar; já o prazo é inferido automaticamente, por isso aquele segue
// a regra de "só mostra o que precisa de atenção".
function PriorityBadge({ T, prioridade, compact }) {
  const cfg = TASK_PRIORITY[prioridade] || TASK_PRIORITY.media;
  const c = T.isLight ? cfg.color.light : cfg.color.dark;
  return (
    <span title={`Prioridade: ${cfg.label}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700, color: c, background: `${c}18`, border: `1px solid ${c}30`, borderRadius: 20, padding: compact ? "2px 7px" : "3px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
      <Flag size={10} strokeWidth={2.5} /> {cfg.label}
    </span>
  );
}

// Tag de categoria (texto livre — ver comentário de CAT_TAG_PALETTE acima).
function CategoryTag({ T, categoria }) {
  if (!categoria) return null;
  const c = categoryColor(categoria);
  return (
    <span title={categoria} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700, color: c, background: `${c}18`, border: `1px solid ${c}30`, borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140, flexShrink: 1 }}>
      <Tag size={10} strokeWidth={2.5} /> {categoria}
    </span>
  );
}

// Estilos/animações locais ao módulo Tarefas — ficam num único <style> no
// topo do componente principal (ver `Tarefas`) em vez de espalhados pelo
// <style> global do App.jsx, pra manter esse pedaço do design "preso" ao
// componente que o usa (mesma ideia de separação de responsabilidades do
// resto do projeto).
function TaskStyles({ T }) {
  return (
    <style>{`
      @keyframes tk-card-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes tk-view-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
      .tk-view{animation:tk-view-in 200ms ease both}
      .tk-card{animation:tk-card-in 320ms cubic-bezier(.2,.8,.2,1) both;transition:transform 160ms ease,box-shadow 160ms ease,border-color 160ms ease}
      .tk-card:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(0,0,0,.16)}
      .tk-card.tk-dragging{opacity:.42}
      .tk-chip-btn,.tk-pill-btn,.tk-nav-btn{transition:transform 140ms ease,background 140ms ease,color 140ms ease,border-color 140ms ease,box-shadow 140ms ease,opacity 140ms ease}
      .tk-chip-btn:hover,.tk-pill-btn:hover:not(:disabled),.tk-nav-btn:hover:not(:disabled){transform:translateY(-1px)}
      .tk-chip-btn:active,.tk-pill-btn:active:not(:disabled),.tk-nav-btn:active:not(:disabled){transform:translateY(0) scale(.96)}
      .tk-tab-track{position:relative;display:flex;background:${T.panelAlt};border-radius:10px;padding:3px}
      .tk-tab-indicator{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:7px;background:${T.panel};box-shadow:0 1px 4px rgba(0,0,0,.18);transition:transform 240ms cubic-bezier(.3,.8,.3,1)}
      .tk-col{transition:border-color 160ms ease,background 160ms ease}
      .task-person-row{transition:background 140ms ease,transform 140ms ease}
      .task-person-row:hover{background:rgba(127,127,127,.10);transform:translateX(2px)}
    `}</style>
  );
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

// Caixinha de info rotulada (label pequeno em cima, valor embaixo) — mesmo
// recurso visual usado em painéis tipo SaaS pra mostrar 2 atributos lado a
// lado (aqui: Responsável / Prazo) sem precisar de tabela.
function InfoBox({ T, label, children }) {
  return (
    <div style={{ background: T.panelAlt, borderRadius: 7, padding: "6px 8px", minWidth: 0 }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</div>
    </div>
  );
}

function TaskCard({ T, btn, ghost, task, isMine, onEdit, onMove, onDragStart, onDragEnd, isDragging, isFirst, isLast, delay }) {
  const due = dueInfo(task.prazo, T, task.status);
  const responsaveis = task.responsaveis || [];
  const leadInitial = responsaveis[0] ? responsaveis[0].trim().slice(0, 1).toUpperCase() : null;
  return (
    <div
      className={`tk-card${isDragging ? " tk-dragging" : ""}`}
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      style={{
        background: T.input, border: `1px solid ${T.border}`, borderLeft: `3px solid ${isMine ? T.accent : T.border}`,
        borderRadius: 10, padding: "12px 12px 10px", marginBottom: 10, cursor: "grab", animationDelay: `${delay}ms`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            width: 24, height: 24, borderRadius: "50%", background: `${T.accent}1c`, border: `1px solid ${T.accent}33`,
            color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, flexShrink: 0,
          }}>{leadInitial || <ClipboardCheck size={12} />}</span>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, wordBreak: "break-word" }}>{task.titulo}</div>
        </div>
        <span title={due.full} style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, color: due.color, background: `${due.color}18`, border: `1px solid ${due.color}30`, borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap" }}>{due.label}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <PriorityBadge T={T} prioridade={task.prioridade} />
        <CategoryTag T={T} categoria={task.categoria} />
      </div>

      {task.descricao && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{task.descricao}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
        <InfoBox T={T} label="Responsável">
          {responsaveis.length ? (
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <AvatarStack T={T} names={responsaveis} size={15} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{responsaveis.join(", ")}</span>
            </span>
          ) : <span style={{ color: T.textFaint, fontWeight: 500 }}>Ninguém</span>}
        </InfoBox>
        <InfoBox T={T} label="Prazo">
          {task.prazo ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CalendarDays size={11} strokeWidth={2.25} style={{ flexShrink: 0, opacity: .7 }} />{fmtDate(task.prazo)}</span> : <span style={{ color: T.textFaint, fontWeight: 500 }}>—</span>}
        </InfoBox>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
        <button onClick={() => onMove(task, -1)} disabled={isFirst} aria-label="Mover para a coluna anterior" className="tk-nav-btn" style={{ width: 24, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: isFirst ? T.textFaint : T.textMuted, opacity: isFirst ? .35 : 1, cursor: isFirst ? "default" : "pointer", flexShrink: 0 }}><ChevronLeft size={13} /></button>
        <button onClick={() => onMove(task, 1)} disabled={isLast} aria-label="Mover para a próxima coluna" className="tk-nav-btn" style={{ width: 24, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: isLast ? T.textFaint : T.textMuted, opacity: isLast ? .35 : 1, cursor: isLast ? "default" : "pointer", flexShrink: 0 }}><ChevronRight size={13} /></button>

        <button onClick={() => onEdit(task)} className="tk-pill-btn" style={{ ...ghost(), flex: 1, borderRadius: 999, padding: "7px 10px", fontSize: 11 }}>Detalhes</button>

        {isLast ? (
          <span style={{ flex: 1.3, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 700, color: T.textFaint, background: T.panelAlt }}><CheckCircle2 size={12} /> Concluída</span>
        ) : (
          <button onClick={() => onMove(task, 1)} className="tk-pill-btn" style={{ ...btn(T.accent), flex: 1.3, borderRadius: 999, padding: "7px 10px", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>Avançar <ArrowRight size={12} /></button>
        )}
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
  const due = dueInfo(task.prazo, T, task.status);
  // Flag de prioridade só aparece aqui pra alta/urgente — nesta linha
  // compacta (visão "Por Pessoa") o espaço é curto, então só vale destacar
  // o que precisa de atenção, igual ao critério que o selo de prazo já usa.
  const pcfg = TASK_PRIORITY[task.prioridade];
  const showPriority = pcfg && (task.prioridade === "alta" || task.prioridade === "urgente");
  const pColor = showPriority ? (T.isLight ? pcfg.color.light : pcfg.color.dark) : null;
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
      {showPriority && <Flag size={10} strokeWidth={2.5} style={{ color: pColor, flexShrink: 0 }} />}
      <span style={{ fontSize: 12, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {task.titulo}{task.categoria ? <span style={{ color: T.textFaint, fontWeight: 500 }}> · {task.categoria}</span> : null}
      </span>
      {due.full && <span style={{ fontSize: 9.5, fontWeight: 700, color: due.color, flexShrink: 0 }}>{due.full}</span>}
    </button>
  );
}

// Cartão de uma pessoa na visão "Por Pessoa": nome, badge de pendências e a
// lista das tarefas dela (concluídas por último, mais urgentes primeiro).
function PersonCard({ T, name, list, onEdit, isMe, muted, delay }) {
  const openCount = list.filter(t => t.status !== "concluido").length;
  return (
    <div className="tk-card" style={{ animationDelay: `${delay}ms`, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10 }}>
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
    const prio = (t) => TASK_PRIORITY[t.prioridade]?.order ?? TASK_PRIORITY.media.order;
    const cmp = (a, b) => rank(a) - rank(b) || prio(b) - prio(a) || (a.prazo || "9999-99-99").localeCompare(b.prazo || "9999-99-99");
    return {
      porPessoa: team.map(name => ({ name, list: tasks.filter(t => (t.responsaveis || []).includes(name)).sort(cmp) })),
      semResponsavel: tasks.filter(t => !(t.responsaveis || []).length).sort(cmp),
    };
  }, [tasks, team]);

  return (
    <div className="tk-view" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {porPessoa.map(({ name, list }, i) => (
        <PersonCard key={name} T={T} name={name} list={list} onEdit={onEdit} isMe={name === currentUser} delay={Math.min(i * 40, 240)} />
      ))}
      {semResponsavel.length > 0 && (
        <PersonCard T={T} name="Sem responsável" list={semResponsavel} onEdit={onEdit} muted delay={Math.min(porPessoa.length * 40, 240)} />
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
  const [form, setForm] = useState({ titulo: "", descricao: "", responsaveis: [], prazo: "", status: "a_fazer", categoria: "", prioridade: "media" });
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [catFilter, setCatFilter] = useState("todas"); // "todas" | nome da categoria

  const openNew = () => { setForm({ titulo: "", descricao: "", responsaveis: currentUser ? [currentUser] : [], prazo: "", status: "a_fazer", categoria: "", prioridade: "media" }); setModal({ type: "new" }); };
  const openEdit = (t) => { setForm({ titulo: t.titulo, descricao: t.descricao || "", responsaveis: t.responsaveis || [], prazo: t.prazo || "", status: t.status, categoria: t.categoria || "", prioridade: t.prioridade || "media" }); setModal({ type: "edit", id: t.id }); };
  const closeModal = () => setModal(null);

  const submit = () => {
    const titulo = form.titulo.trim();
    if (!titulo) return showToast("Digite um título pra tarefa", "err");
    const payload = { titulo, descricao: form.descricao.trim(), responsaveis: form.responsaveis, prazo: form.prazo || null, categoria: form.categoria.trim() || null, prioridade: form.prioridade };
    if (modal.type === "new") onCreate(payload);
    else onUpdate(modal.id, { ...payload, status: form.status });
    closeModal();
  };

  // Segregação por categoria (10/2026) — "legal segregar pro projeto/infra/
  // compras etc", pedido do usuário a partir de um print de referência.
  // Sem tela de gestão própria: as opções do filtro são simplesmente as
  // categorias que já foram digitadas em alguma tarefa (texto livre), então
  // a lista cresce sozinha conforme o time usa.
  const categoriesUsed = useMemo(() => {
    const set = new Set(tasks.map(t => t.categoria).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tasks]);
  const visibleTasks = catFilter === "todas" ? tasks : tasks.filter(t => t.categoria === catFilter);

  const moveTask = (task, dir) => {
    const idx = COLS.indexOf(task.status);
    const next = COLS[idx + dir];
    if (next) onUpdateStatus(task.id, next);
  };

  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; };
  const onDragEnd = () => { setDragId(null); setDragOverCol(null); };
  const onDropCol = (e, col) => {
    e.preventDefault();
    if (dragId != null) onUpdateStatus(dragId, col);
    setDragId(null); setDragOverCol(null);
  };

  // Prioridade primeiro (urgente no topo), depois prazo mais próximo (sem
  // prazo vai pro fim), e em empate a mais recém-criada — mesma ideia de "o
  // que precisa de atenção agora aparece no topo", sem precisar de
  // reordenação manual (arrastar dentro da mesma coluna só muda de status,
  // não a ordem — mantém simples). Respeita o filtro de categoria ativo.
  const sorted = (col) => visibleTasks
    .filter(t => t.status === col)
    .sort((a, b) => {
      const prio = (TASK_PRIORITY[b.prioridade]?.order ?? TASK_PRIORITY.media.order) - (TASK_PRIORITY[a.prioridade]?.order ?? TASK_PRIORITY.media.order);
      if (prio) return prio;
      return (a.prazo || "9999-99-99").localeCompare(b.prazo || "9999-99-99") || (b.criado_em_iso || "").localeCompare(a.criado_em_iso || "");
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <TaskStyles T={T} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="tk-tab-track">
          <div className="tk-tab-indicator" style={{ transform: tab === "pessoa" ? "translateX(100%)" : "translateX(0)" }} />
          <button onClick={() => setTab("quadro")} className="tk-chip-btn" style={{
            position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, background: "transparent", color: tab === "quadro" ? T.accent : T.textMuted,
          }}><Kanban size={14} /> Quadro</button>
          <button onClick={() => setTab("pessoa")} className="tk-chip-btn" style={{
            position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, background: "transparent", color: tab === "pessoa" ? T.accent : T.textMuted,
          }}><Users size={14} /> Por Pessoa</button>
        </div>
        <button onClick={openNew} className="tk-pill-btn" style={{ ...btn(T.accent), borderRadius: 999, display: "flex", alignItems: "center", gap: 6, padding: "9px 16px" }}><Plus size={14} strokeWidth={2.5} /> Nova Tarefa</button>
      </div>

      {categoriesUsed.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            onClick={() => setCatFilter("todas")}
            className="tk-chip-btn"
            style={{
              display: "flex", alignItems: "center", padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700,
              border: `1px solid ${catFilter === "todas" ? T.accent : T.border}`, background: catFilter === "todas" ? `${T.accent}18` : "transparent", color: catFilter === "todas" ? T.accent : T.textMuted,
            }}
          >Todas</button>
          {categoriesUsed.map(c => {
            const color = categoryColor(c);
            const active = catFilter === c;
            return (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                className="tk-chip-btn"
                style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700,
                  border: `1px solid ${active ? color : T.border}`, background: active ? `${color}18` : "transparent", color: active ? color : T.textMuted,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                {c}
              </button>
            );
          })}
        </div>
      )}

      {tab === "quadro" ? (
        <div className="tk-view">
          <div className="tasks-board" style={{ display: "grid", gap: 14 }}>
            {COLS.map(col => {
              const list = sorted(col);
              const cfg = TASK_STATUS[col];
              const dot = T.isLight ? cfg.dot.light : cfg.dot.dark;
              return (
                <div
                  key={col}
                  className="tk-col"
                  onDragOver={e => { e.preventDefault(); setDragOverCol(col); }}
                  onDragLeave={() => setDragOverCol(p => p === col ? null : p)}
                  onDrop={e => onDropCol(e, col)}
                  style={{ background: T.panel, border: `1px solid ${dragOverCol === col ? T.accent : T.border}`, borderRadius: 12, display: "flex", flexDirection: "column", minHeight: 160 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "13px 14px", borderBottom: `1px solid ${T.borderSoft}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: T.textBright }}>{cfg.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: dot, background: `${dot}1c`, border: `1px solid ${dot}30`, borderRadius: 20, padding: "2px 9px" }}>{list.length}</span>
                  </div>
                  <div style={{ padding: 10, flex: 1, overflowY: "auto", maxHeight: 560 }}>
                    {list.length === 0 && <div style={{ padding: "20px 8px", fontSize: 11, color: T.textFaint, textAlign: "center" }}>Nenhuma tarefa aqui.</div>}
                    {list.map((t, i) => (
                      <TaskCard
                        key={t.id} T={T} btn={btn} ghost={ghost} task={t} isMine={(t.responsaveis || []).includes(currentUser)}
                        onEdit={openEdit} onMove={moveTask} onDragStart={onDragStart} onDragEnd={onDragEnd} isDragging={dragId === t.id}
                        isFirst={COLS.indexOf(t.status) === 0} isLast={COLS.indexOf(t.status) === COLS.length - 1} delay={Math.min(i * 40, 240)}
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
          {tasks.length > 0 && visibleTasks.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "30px 16px", color: T.textFaint }}>
              <Tag size={26} strokeWidth={1.6} />
              <div style={{ fontSize: 12 }}>Nenhuma tarefa na categoria "{catFilter}".</div>
            </div>
          )}
        </div>
      ) : (
        <PorPessoaView T={T} tasks={visibleTasks} team={team} currentUser={currentUser} onEdit={openEdit} />
      )}

      {modal && (
        <Overlay T={T} onClose={closeModal}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: T.textBright }}>{modal.type === "new" ? "Nova Tarefa" : "Editar Tarefa"}</h3>

          {lbl("Título *")}
          <input autoFocus value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="ex: Revisar estoque do almoxarifado" style={inp({ marginBottom: 10 })} />

          {lbl("Descrição")}
          <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Detalhe opcional" rows={3} style={{ ...inp({ marginBottom: 10 }), resize: "vertical", fontFamily: "inherit" }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              {lbl("Responsáveis")}
              <TeamMultiSelect T={T} team={team} value={form.responsaveis} onChange={(v) => setForm(p => ({ ...p, responsaveis: v }))} inp={inp} />
            </div>
            <div>
              {lbl("Prazo")}
              <input type="date" value={form.prazo} onChange={e => setForm(p => ({ ...p, prazo: e.target.value }))} style={inp()} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 }}>
            <div>
              {lbl("Categoria")}
              <input
                value={form.categoria}
                onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
                placeholder="ex: Projeto, Infra, Compras"
                list="tk-cat-options"
                style={inp()}
              />
              <datalist id="tk-cat-options">
                {categoriesUsed.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              {lbl("Prioridade")}
              <select value={form.prioridade} onChange={e => setForm(p => ({ ...p, prioridade: e.target.value }))} style={inp()}>
                {PRIORITIES.map(p => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
              </select>
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
              <button onClick={() => { onDelete({ id: modal.id, titulo: form.titulo }); closeModal(); }} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, color: "#ef4444", borderColor: "#ef444430" }}>Excluir</button>
            )}
            <button onClick={submit} className="tk-pill-btn" style={{ ...btn(T.accent), borderRadius: 999, flex: 1, padding: "10px" }}>{modal.type === "new" ? "Criar tarefa" : "Salvar alterações"}</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}
