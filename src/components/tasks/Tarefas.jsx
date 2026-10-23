// "Tarefas" — quadro Kanban interno (tipo Trello) que virou um mini-Notion
// (10/2026). Puramente apresentacional, mesmo padrão container/presentational
// do resto do app: todo o CRUD de verdade (chamadas ao Supabase) mora no
// App.jsx e chega aqui pelo objeto `api`.
//
// Visões: Quadro (Kanban), Tabela, Calendário, Por Pessoa e Projetos — todas
// usam a mesma barra de busca + filtros. Clicar numa tarefa abre a página
// dela (TaskPage.jsx) com propriedades, checklist, subtarefas, anexos,
// comentários e histórico, igual à página de um item no Notion.
//
// Arrastar-e-soltar: API nativa do HTML5 (sem lib). Ela NÃO dispara no toque
// do celular, por isso cada card também tem as setinhas ‹ › — o caminho
// garantido em qualquer aparelho.
//
// Múltiplos responsáveis (31/08/2026): cada responsável conta pro próprio
// badge de "tarefas em aberto". A visão "Por Pessoa" mostra a carga de cada um.
//
// Subtarefas: no Quadro e na Tabela aparecem só as tarefas "de cima" (com o
// progresso das filhas no card), pra não encher o quadro — o filtro
// "Mostrar subtarefas" (ou uma busca) traz as filhas também.
import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import {
  Plus, ChevronLeft, ChevronRight, CalendarDays, ClipboardCheck, Kanban, Users, ArrowRight, CheckCircle2, Tag, Table2,
  CalendarRange, FolderKanban, GanttChart, Search, SlidersHorizontal, X, ListTree, Paperclip, CornerDownRight,
} from "lucide-react";
import { Overlay } from "../common.jsx";
import { makeStyleHelpers } from "../../theme.js";
import { TASK_STATUS, TASK_PRIORITY } from "../../constants.js";
import {
  COLS, PRIORITIES, TaskStyles, PriorityBadge, CategoryTag, ProjectTag, AvatarStack, TeamMultiSelect, dueInfo, fmtDate,
  priorityOrder, taskProgress, statusColor, EmptyState,
} from "./taskUi.jsx";
import { TaskPage } from "./TaskPage.jsx";
import { TabelaView, CalendarioView } from "./TaskViews.jsx";
import { TimelineView } from "./Timeline.jsx";
import { ProjetosView, ProjetoPage, ProjectModal } from "./Projetos.jsx";

const TABS = [
  { key: "quadro", label: "Quadro", icon: Kanban },
  { key: "tabela", label: "Tabela", icon: Table2 },
  { key: "timeline", label: "Linha do tempo", icon: GanttChart },
  { key: "calendario", label: "Calendário", icon: CalendarRange },
  { key: "pessoa", label: "Por Pessoa", icon: Users },
  { key: "projetos", label: "Projetos", icon: FolderKanban },
];
const TAB_KEY = "tk-tab";
const readTab = () => { try { const v = localStorage.getItem(TAB_KEY); return TABS.some(t => t.key === v) ? v : "quadro"; } catch { return "quadro"; } };

const EMPTY_FILTERS = { resp: "todos", status: "todos", prio: "todas", projeto: "todos", cat: "todas", prazo: "todos", subs: false };

// Abas com uma pílula que desliza até a aba ativa (mede a posição real do
// botão, então funciona mesmo com a barra rolando de lado no celular).
function TabBar({ T, tab, setTab }) {
  const refs = useRef({});
  const trackRef = useRef(null);
  const [pill, setPill] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[tab];
      if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    refs.current[tab]?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab]);
  return (
    <div ref={trackRef} className="tk-tabs" role="tablist" style={{ position: "relative" }}>
      {pill && <span className="tk-tab-pill" style={{ left: 0, width: pill.w, transform: `translateX(${pill.x}px)` }} />}
      {TABS.map(({ key, label, icon: Icon }) => {
        const on = tab === key;
        return (
          <button key={key} ref={el => { refs.current[key] = el; }} role="tab" aria-selected={on} onClick={() => setTab(key)} className="tk-chip-btn" style={{
            position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 7, border: "none", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, background: "transparent", color: on ? T.accent : T.textMuted,
          }}><Icon size={14} /> {label}</button>
        );
      })}
    </div>
  );
}

// Caixinha de info rotulada (label pequeno em cima, valor embaixo).
function InfoBox({ T, label, children }) {
  return (
    <div style={{ background: T.panelAlt, borderRadius: 7, padding: "6px 8px", minWidth: 0 }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</div>
    </div>
  );
}

function TaskCard({ T, btn, ghost, task, allTasks, project, parentTitle, isMine, flash, onOpen, onMove, onDragStart, onDragEnd, isDragging, isFirst, isLast, delay }) {
  const due = dueInfo(task.prazo, T, task.status);
  const responsaveis = task.responsaveis || [];
  const leadInitial = responsaveis[0] ? responsaveis[0].trim().slice(0, 1).toUpperCase() : null;
  const prog = taskProgress(task, allTasks);
  const nAnexos = Array.isArray(task.anexos) ? task.anexos.length : 0;
  return (
    <div
      className={`tk-card${isDragging ? " tk-dragging" : ""}${flash ? " tk-flash" : ""}`}
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      style={{
        background: T.input, border: `1px solid ${T.border}`, borderLeft: `3px solid ${isMine ? T.accent : T.border}`,
        borderRadius: 10, padding: "12px 12px 10px", marginBottom: 10, cursor: "grab", animationDelay: `${delay}ms`,
      }}
    >
      {parentTitle && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.textFaint, marginBottom: 5, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><CornerDownRight size={10} /> {parentTitle}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <button onClick={() => onOpen(task.id)} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{
            width: 24, height: 24, borderRadius: "50%", background: `${T.accent}1c`, border: `1px solid ${T.accent}33`,
            color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, flexShrink: 0,
          }}>{leadInitial || <ClipboardCheck size={12} />}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, wordBreak: "break-word" }}>{task.titulo}</span>
        </button>
        <span title={due.full} style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, color: due.color, background: `${due.color}18`, border: `1px solid ${due.color}30`, borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap" }}>{due.label}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        <PriorityBadge T={T} prioridade={task.prioridade} />
        <ProjectTag project={project} />
        <CategoryTag categoria={task.categoria} />
      </div>

      {task.descricao && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{task.descricao}</div>}

      {(prog.total > 0 || nAnexos > 0) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 10.5, fontWeight: 700, color: T.textMuted }}>
          {prog.subs > 0 && <span title="Subtarefas concluídas" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: prog.subsDone === prog.subs ? statusColor(T, "concluido") : T.textMuted }}><ListTree size={12} /> {prog.subsDone}/{prog.subs}</span>}
          {prog.check > 0 && <span title="Checklist" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: prog.checkDone === prog.check ? statusColor(T, "concluido") : T.textMuted }}><CheckCircle2 size={12} /> {prog.checkDone}/{prog.check}</span>}
          {nAnexos > 0 && <span title="Anexos" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Paperclip size={12} /> {nAnexos}</span>}
        </div>
      )}

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

        <button onClick={() => onOpen(task.id)} className="tk-pill-btn" style={{ ...ghost(), flex: 1, borderRadius: 999, padding: "7px 10px", fontSize: 11 }}>Abrir</button>

        {isLast ? (
          <span style={{ flex: 1.3, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 700, color: T.textFaint, background: T.panelAlt }}><CheckCircle2 size={12} /> Concluída</span>
        ) : (
          <button onClick={() => onMove(task, 1)} className="tk-pill-btn" style={{ ...btn(T.accent), flex: 1.3, borderRadius: 999, padding: "7px 10px", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>Avançar <ArrowRight size={12} /></button>
        )}
      </div>
    </div>
  );
}

// Linha compacta de tarefa dentro do cartão de uma pessoa (visão "Por Pessoa").
function PersonTaskRow({ T, task, onOpen }) {
  const cfg = TASK_STATUS[task.status];
  const due = dueInfo(task.prazo, T, task.status);
  const showPriority = task.prioridade === "alta" || task.prioridade === "urgente";
  return (
    <button
      className="task-person-row"
      onClick={() => onOpen(task.id)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit" }}
    >
      <span title={cfg.label} style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(T, task.status), flexShrink: 0 }} />
      {showPriority && <PriorityBadge T={T} prioridade={task.prioridade} compact />}
      <span style={{ fontSize: 12, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {task.parent_id ? "↳ " : ""}{task.titulo}{task.categoria ? <span style={{ color: T.textFaint, fontWeight: 500 }}> · {task.categoria}</span> : null}
      </span>
      {due.full && <span style={{ fontSize: 9.5, fontWeight: 700, color: due.color, flexShrink: 0 }}>{due.full}</span>}
    </button>
  );
}

function PersonCard({ T, name, list, onOpen, isMe, muted, delay }) {
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
          {list.map(t => <PersonTaskRow key={t.id} T={T} task={t} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

function PorPessoaView({ T, tasks, team, currentUser, onOpen }) {
  const { porPessoa, semResponsavel } = useMemo(() => {
    const rank = (t) => (t.status === "concluido" ? 1 : 0);
    const cmp = (a, b) => rank(a) - rank(b) || priorityOrder(b) - priorityOrder(a) || (a.prazo || "9999-99-99").localeCompare(b.prazo || "9999-99-99");
    return {
      porPessoa: team.map(name => ({ name, list: tasks.filter(t => (t.responsaveis || []).includes(name)).sort(cmp) })),
      semResponsavel: tasks.filter(t => !(t.responsaveis || []).length).sort(cmp),
    };
  }, [tasks, team]);

  return (
    <div className="tk-view" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {porPessoa.map(({ name, list }, i) => (
        <PersonCard key={name} T={T} name={name} list={list} onOpen={onOpen} isMe={name === currentUser} delay={Math.min(i * 40, 240)} />
      ))}
      {semResponsavel.length > 0 && <PersonCard T={T} name="Sem responsável" list={semResponsavel} onOpen={onOpen} muted delay={Math.min(porPessoa.length * 40, 240)} />}
      {porPessoa.length === 0 && semResponsavel.length === 0 && <EmptyState T={T} icon={Users}>Nenhuma tarefa encontrada.</EmptyState>}
    </div>
  );
}

// Barra de busca + filtros (vale pra todas as visões, menos Projetos).
function FilterBar({ T, q, setQ, filters, setFilters, team, projects, categories, tab }) {
  const { inp, ghost } = makeStyleHelpers(T);
  const [open, setOpen] = useState(false);
  const active = Object.entries(filters).filter(([k, v]) => v !== EMPTY_FILTERS[k] && !(k === "status" && tab === "quadro")).length;
  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value }));
  const lbl = (c) => <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: .6 }}>{c}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.textFaint, pointerEvents: "none" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tarefa…" style={inp({ paddingLeft: 32, paddingRight: q ? 30 : 10, fontSize: 13, padding: "9px 10px 9px 32px" })} />
          {q && <button onClick={() => setQ("")} aria-label="Limpar busca" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.textFaint, cursor: "pointer", display: "flex", padding: 4 }}><X size={14} /></button>}
        </div>
        <button onClick={() => setOpen(o => !o)} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 10, display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderColor: active ? T.accent : T.border, color: active ? T.accent : T.text }}>
          <SlidersHorizontal size={14} /> Filtros{active ? ` (${active})` : ""}
        </button>
      </div>
      <div className={`tk-collapse${open ? " open" : ""}`}><div>
        <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          <div>{lbl("Responsável")}
            <select value={filters.resp} onChange={set("resp")} style={inp()}>
              <option value="todos">Todos</option>
              <option value="minhas">Minhas tarefas</option>
              <option value="ninguem">Sem responsável</option>
              {team.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {tab !== "quadro" && <div>{lbl("Status")}
            <select value={filters.status} onChange={set("status")} style={inp()}>
              <option value="todos">Todos</option>
              <option value="abertas">Em aberto</option>
              {COLS.map(c => <option key={c} value={c}>{TASK_STATUS[c].label}</option>)}
            </select>
          </div>}
          <div>{lbl("Prioridade")}
            <select value={filters.prio} onChange={set("prio")} style={inp()}>
              <option value="todas">Todas</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
            </select>
          </div>
          <div>{lbl("Prazo")}
            <select value={filters.prazo} onChange={set("prazo")} style={inp()}>
              <option value="todos">Todos</option>
              <option value="atrasadas">Atrasadas</option>
              <option value="hoje">Hoje</option>
              <option value="semana">Próximos 7 dias</option>
              <option value="sem">Sem prazo</option>
            </select>
          </div>
          <div>{lbl("Projeto")}
            <select value={filters.projeto} onChange={set("projeto")} style={inp()}>
              <option value="todos">Todos</option>
              <option value="sem">Sem projeto</option>
              {projects.map(p => <option key={p.id} value={String(p.id)}>{p.nome}</option>)}
            </select>
          </div>
          <div>{lbl("Categoria")}
            <select value={filters.cat} onChange={set("cat")} style={inp()}>
              <option value="todas">Todas</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {(tab === "quadro" || tab === "tabela") && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.text, cursor: "pointer", alignSelf: "end", paddingBottom: 6 }}>
              <input type="checkbox" checked={filters.subs} onChange={e => setFilters(f => ({ ...f, subs: e.target.checked }))} style={{ accentColor: T.accent, width: 15, height: 15 }} />
              Mostrar subtarefas
            </label>
          )}
          {active > 0 && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} style={{ ...ghost(), alignSelf: "end", color: "#ef4444", borderColor: "#ef444430" }}>Limpar filtros</button>
          )}
        </div>
      </div></div>
    </div>
  );
}

function applyFilters(tasks, { q, filters, currentUser, tab }) {
  const term = q.trim().toLowerCase();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysTo = (p) => Math.round((new Date(`${p}T00:00:00`) - today) / 86400000);
  return tasks.filter(t => {
    if (term && !(`${t.titulo} ${t.descricao || ""} ${t.categoria || ""}`.toLowerCase().includes(term))) return false;
    const resp = t.responsaveis || [];
    if (filters.resp === "minhas" && !resp.includes(currentUser)) return false;
    if (filters.resp === "ninguem" && resp.length) return false;
    if (!["todos", "minhas", "ninguem"].includes(filters.resp) && !resp.includes(filters.resp)) return false;
    if (tab !== "quadro") {
      if (filters.status === "abertas" && t.status === "concluido") return false;
      if (COLS.includes(filters.status) && t.status !== filters.status) return false;
    }
    if (filters.prio !== "todas" && (t.prioridade || "media") !== filters.prio) return false;
    if (filters.projeto === "sem" && t.projeto_id) return false;
    if (!["todos", "sem"].includes(filters.projeto) && String(t.projeto_id) !== filters.projeto) return false;
    if (filters.cat !== "todas" && t.categoria !== filters.cat) return false;
    if (filters.prazo !== "todos") {
      if (filters.prazo === "sem") { if (t.prazo) return false; }
      else {
        if (!t.prazo || t.status === "concluido") return false;
        const d = daysTo(t.prazo);
        if (filters.prazo === "atrasadas" && d >= 0) return false;
        if (filters.prazo === "hoje" && d !== 0) return false;
        if (filters.prazo === "semana" && (d < 0 || d > 7)) return false;
      }
    }
    // Quadro/Tabela: só tarefas "de cima", a não ser que peça as subtarefas
    // ou esteja buscando algo (aí a filha que bate com a busca aparece).
    if ((tab === "quadro" || tab === "tabela") && t.parent_id && !filters.subs && !term) return false;
    return true;
  });
}

export function Tarefas({ T, tasks, projects, team, currentUser, myUid, isAdmin, api, showToast }) {
  const { inp, btn, ghost } = makeStyleHelpers(T);
  const lbl = (children) => <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: .6 }}>{children}</div>;

  const [tab, setTabState] = useState(readTab);
  const setTab = (t) => { setTabState(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* sem storage: só não lembra */ } };
  const [openTaskId, setOpenTaskId] = useState(null);
  const [openProjectId, setOpenProjectId] = useState(null);
  const [newModal, setNewModal] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [form, setForm] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [movedId, setMovedId] = useState(null); // card que acabou de mudar de coluna (pisca uma vez)
  useEffect(() => { if (movedId == null) return; const t = setTimeout(() => setMovedId(null), 1200); return () => clearTimeout(t); }, [movedId]);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const openTask = tasks.find(t => t.id === openTaskId) || null;
  const openProject = projects.find(p => p.id === openProjectId) || null;
  // Se a tarefa/projeto aberto sumir (excluído), volta pra lista sozinho.
  useEffect(() => { if (openTaskId != null && !openTask) setOpenTaskId(null); }, [openTaskId, openTask]);
  useEffect(() => { if (openProjectId != null && !openProject) setOpenProjectId(null); }, [openProjectId, openProject]);
  // Abrir página nova começa do topo (no celular a lista pode estar rolada).
  useEffect(() => { window.scrollTo({ top: 0 }); document.querySelector("main")?.scrollTo?.({ top: 0 }); }, [openTaskId, openProjectId]);

  const goTask = (id) => setOpenTaskId(id);
  const goProject = (id) => { setOpenTaskId(null); setOpenProjectId(id); };

  const projectsById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);
  const tasksById = useMemo(() => Object.fromEntries(tasks.map(t => [t.id, t])), [tasks]);
  const categoriesUsed = useMemo(() => Array.from(new Set(tasks.map(t => t.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [tasks]);
  const visibleTasks = useMemo(() => applyFilters(tasks, { q, filters, currentUser, tab }), [tasks, q, filters, currentUser, tab]);

  const openNew = () => {
    setForm({ titulo: "", descricao: "", responsaveis: currentUser ? [currentUser] : [], prazo: "", categoria: "", prioridade: "media", projeto_id: filters.projeto !== "todos" && filters.projeto !== "sem" ? filters.projeto : "" });
    setNewModal(true);
  };
  const submitNew = async (andOpen) => {
    const titulo = form.titulo.trim();
    if (!titulo) return showToast("Digite um título pra tarefa", "err");
    const payload = { titulo, descricao: form.descricao.trim(), responsaveis: form.responsaveis, prazo: form.prazo || null, categoria: form.categoria.trim() || null, prioridade: form.prioridade, projeto_id: form.projeto_id ? Number(form.projeto_id) : null, parent_id: null };
    setNewModal(false);
    const saved = await api.createTask(payload);
    if (saved && andOpen) setOpenTaskId(saved.id);
  };

  const moveTask = (task, dir) => {
    const next = COLS[COLS.indexOf(task.status) + dir];
    if (next) { setMovedId(task.id); api.updateStatus(task.id, next); }
  };
  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; };
  const onDragEnd = () => { setDragId(null); setDragOverCol(null); };
  const onDropCol = (e, col) => {
    e.preventDefault();
    if (dragId != null) { setMovedId(dragId); api.updateStatus(dragId, col); }
    setDragId(null); setDragOverCol(null);
  };

  // Prioridade primeiro (urgente no topo), depois prazo mais próximo, e em
  // empate a mais recente.
  const sorted = (col) => visibleTasks
    .filter(t => t.status === col)
    .sort((a, b) => priorityOrder(b) - priorityOrder(a)
      || (a.prazo || "9999-99-99").localeCompare(b.prazo || "9999-99-99")
      || (b.criado_em_iso || "").localeCompare(a.criado_em_iso || ""));

  // ── páginas (tarefa / projeto) ──
  if (openTask) {
    return (
      <div>
        <TaskStyles T={T} />
        <TaskPage
          T={T} task={openTask} tasks={tasks} projects={projects} team={team} currentUser={currentUser} myUid={myUid} isAdmin={isAdmin}
          api={api} showToast={showToast} onOpenTask={goTask} onOpenProject={goProject}
          onBack={() => setOpenTaskId(null)}
        />
      </div>
    );
  }
  if (openProject) {
    return (
      <div>
        <TaskStyles T={T} />
        <ProjetoPage
          T={T} project={openProject} tasks={tasks} currentUser={currentUser}
          onBack={() => setOpenProjectId(null)} onOpenTask={goTask}
          onUpdate={api.updateProject} onDelete={api.deleteProject} onCreateTask={api.createTask}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <TaskStyles T={T} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <TabBar T={T} tab={tab} setTab={setTab} />
        {tab === "projetos"
          ? <button onClick={() => setProjectModal(true)} className="tk-pill-btn" style={{ ...btn(T.accent), borderRadius: 999, display: "flex", alignItems: "center", gap: 6, padding: "9px 16px" }}><Plus size={14} strokeWidth={2.5} /> Novo Projeto</button>
          : <button onClick={openNew} className="tk-pill-btn" style={{ ...btn(T.accent), borderRadius: 999, display: "flex", alignItems: "center", gap: 6, padding: "9px 16px" }}><Plus size={14} strokeWidth={2.5} /> Nova Tarefa</button>}
      </div>

      {tab !== "projetos" && (
        <FilterBar T={T} q={q} setQ={setQ} filters={filters} setFilters={setFilters} team={team} projects={projects} categories={categoriesUsed} tab={tab} />
      )}

      {tab === "quadro" && (
        <div className="tk-view">
          <div className="tasks-board" style={{ display: "grid", gap: 14 }}>
            {COLS.map(col => {
              const list = sorted(col);
              const cfg = TASK_STATUS[col];
              const dot = statusColor(T, col);
              return (
                <div
                  key={col}
                  className={`tk-col${dragOverCol === col ? " tk-drop" : ""}`}
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
                        key={t.id} T={T} btn={btn} ghost={ghost} task={t} allTasks={tasks}
                        project={t.projeto_id ? projectsById[t.projeto_id] : null}
                        parentTitle={t.parent_id ? tasksById[t.parent_id]?.titulo : null}
                        isMine={(t.responsaveis || []).includes(currentUser)} flash={movedId === t.id}
                        onOpen={goTask} onMove={moveTask} onDragStart={onDragStart} onDragEnd={onDragEnd} isDragging={dragId === t.id}
                        isFirst={COLS.indexOf(t.status) === 0} isLast={COLS.indexOf(t.status) === COLS.length - 1} delay={Math.min(i * 40, 240)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {tasks.length === 0 && <EmptyState T={T} icon={ClipboardCheck}>Nenhuma tarefa criada ainda — comece com "Nova Tarefa".</EmptyState>}
          {tasks.length > 0 && visibleTasks.length === 0 && <EmptyState T={T} icon={Tag}>Nenhuma tarefa com esses filtros.</EmptyState>}
        </div>
      )}
      {tab === "tabela" && (
        <TabelaView
          T={T} tasks={visibleTasks} allTasks={tasks} projects={projects} team={team} onOpen={goTask}
          onUpdate={api.updateTask} onCreate={api.createTask}
          newDefaults={{ responsaveis: currentUser ? [currentUser] : [], projeto_id: filters.projeto !== "todos" && filters.projeto !== "sem" ? Number(filters.projeto) : null }}
        />
      )}
      {tab === "timeline" && <TimelineView T={T} tasks={visibleTasks} allTasks={tasks} projects={projects} onOpen={goTask} onUpdate={api.updateTask} showToast={showToast} />}
      {tab === "calendario" && <CalendarioView T={T} tasks={visibleTasks} onOpen={goTask} />}
      {tab === "pessoa" && <PorPessoaView T={T} tasks={visibleTasks} team={team} currentUser={currentUser} onOpen={goTask} />}
      {tab === "projetos" && <ProjetosView T={T} projects={projects} tasks={tasks} onOpenProject={goProject} onNew={() => setProjectModal(true)} />}

      {newModal && form && (
        <Overlay T={T} onClose={() => setNewModal(false)}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: T.textBright }}>Nova Tarefa</h3>

          {lbl("Título *")}
          <input autoFocus value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="ex: Revisar estoque do almoxarifado" style={inp({ marginBottom: 10 })} />

          {lbl("Descrição")}
          <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Detalhe opcional" rows={3} style={{ ...inp({ marginBottom: 10 }), resize: "vertical" }} />

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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              {lbl("Categoria")}
              <input value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} placeholder="ex: Infra, Compras" list="tk-cat-options" style={inp()} />
              <datalist id="tk-cat-options">{categoriesUsed.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              {lbl("Prioridade")}
              <select value={form.prioridade} onChange={e => setForm(p => ({ ...p, prioridade: e.target.value }))} style={inp()}>
                {PRIORITIES.map(p => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
              </select>
            </div>
          </div>

          {lbl("Projeto")}
          <select value={form.projeto_id} onChange={e => setForm(p => ({ ...p, projeto_id: e.target.value }))} style={inp({ marginBottom: 4 })}>
            <option value="">Nenhum</option>
            {projects.map(p => <option key={p.id} value={String(p.id)}>{p.nome}</option>)}
          </select>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => submitNew(true)} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, flex: 1, padding: "10px" }}>Criar e abrir</button>
            <button onClick={() => submitNew(false)} className="tk-pill-btn" style={{ ...btn(T.accent), borderRadius: 999, flex: 1, padding: "10px" }}>Criar tarefa</button>
          </div>
        </Overlay>
      )}

      {projectModal && (
        <ProjectModal T={T} onClose={() => setProjectModal(false)} onSave={async (p) => { setProjectModal(false); const saved = await api.createProject(p); if (saved) goProject(saved.id); }} />
      )}
    </div>
  );
}
