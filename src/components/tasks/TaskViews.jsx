// Visões extras do módulo Tarefas (10/2026, "estilo Notion"): Tabela e
// Calendário. Recebem a lista já filtrada pela barra de busca/filtros do
// Tarefas.jsx e só abrem a página da tarefa ao clicar — nenhuma edição
// complexa aqui (exceto trocar o status direto na tabela, igual ao Notion).
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Table2, CornerDownRight } from "lucide-react";
import { TASK_STATUS } from "../../constants.js";
import {
  COLS, PriorityBadge, CategoryTag, ProjectTag, AvatarStack, ProgressBar, dueInfo, fmtDate, statusColor, priorityOrder,
  taskProgress, todayIso, EmptyState,
} from "./taskUi.jsx";

// ── Tabela ────────────────────────────────────────────────────────────────
const SORTERS = {
  titulo: (a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"),
  status: (a, b) => COLS.indexOf(a.status) - COLS.indexOf(b.status),
  responsaveis: (a, b) => (a.responsaveis?.[0] || "~").localeCompare(b.responsaveis?.[0] || "~", "pt-BR"),
  prazo: (a, b) => (a.prazo || "9999-99-99").localeCompare(b.prazo || "9999-99-99"),
  prioridade: (a, b) => priorityOrder(a) - priorityOrder(b),
  projeto: (a, b, pm) => (pm[a.projeto_id]?.nome || "~").localeCompare(pm[b.projeto_id]?.nome || "~", "pt-BR"),
  categoria: (a, b) => (a.categoria || "~").localeCompare(b.categoria || "~", "pt-BR"),
};

export function TabelaView({ T, tasks, allTasks, projects, onOpen, onUpdateStatus }) {
  const [sort, setSort] = useState({ key: "prazo", dir: 1 });
  const projectsById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);
  const rows = useMemo(() => {
    const fn = SORTERS[sort.key];
    return [...tasks].sort((a, b) => fn(a, b, projectsById) * sort.dir || priorityOrder(b) - priorityOrder(a));
  }, [tasks, sort, projectsById]);
  const parentTitle = (t) => t.parent_id ? allTasks.find(x => x.id === t.parent_id)?.titulo : null;

  const th = (key, label, w) => (
    <th
      onClick={() => setSort(s => ({ key, dir: s.key === key ? -s.dir : 1 }))}
      style={{ textAlign: "left", padding: "10px 10px", fontSize: 10.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, cursor: "pointer", whiteSpace: "nowrap", width: w, userSelect: "none", borderBottom: `1px solid ${T.border}`, background: T.th }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  );
  const td = { padding: "9px 10px", fontSize: 12.5, color: T.text, borderBottom: `1px solid ${T.borderSoft}`, verticalAlign: "middle" };

  if (tasks.length === 0) return <EmptyState T={T} icon={Table2}>Nenhuma tarefa com esses filtros.</EmptyState>;

  return (
    <div className="tk-view" style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
        <thead>
          <tr>
            {th("titulo", "Tarefa")}
            {th("status", "Status", 140)}
            {th("responsaveis", "Responsáveis", 150)}
            {th("prazo", "Prazo", 100)}
            {th("prioridade", "Prioridade", 100)}
            {th("projeto", "Projeto", 150)}
            {th("categoria", "Categoria", 120)}
            <th style={{ padding: "10px 10px", fontSize: 10.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, width: 110, textAlign: "left", borderBottom: `1px solid ${T.border}`, background: T.th }}>Progresso</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(t => {
            const due = dueInfo(t.prazo, T, t.status);
            const prog = taskProgress(t, allTasks);
            const pt = parentTitle(t);
            return (
              <tr key={t.id} className="tk-row" onClick={() => onOpen(t.id)} style={{ cursor: "pointer" }}>
                <td style={{ ...td, fontWeight: 600, maxWidth: 320 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titulo}</div>
                  {pt && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: T.textFaint, fontWeight: 500, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><CornerDownRight size={10} /> {pt}</div>}
                </td>
                <td style={td} onClick={e => e.stopPropagation()}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(T, t.status), flexShrink: 0 }} />
                    <select value={t.status} onChange={e => onUpdateStatus(t.id, e.target.value)} aria-label="Status" style={{ background: "transparent", border: "none", color: T.text, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>
                      {COLS.map(c => <option key={c} value={c}>{TASK_STATUS[c].label}</option>)}
                    </select>
                  </span>
                </td>
                <td style={td}>
                  {(t.responsaveis || []).length
                    ? <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}><AvatarStack T={T} names={t.responsaveis} size={18} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100, fontSize: 11.5 }}>{t.responsaveis.join(", ")}</span></span>
                    : <span style={{ color: T.textFaint }}>—</span>}
                </td>
                <td style={{ ...td, color: t.prazo ? due.color === T.textFaint ? T.text : due.color : T.textFaint, fontWeight: due.days != null && due.days <= 2 ? 700 : 400, whiteSpace: "nowrap" }}>{t.prazo ? fmtDate(t.prazo) : "—"}</td>
                <td style={td}><PriorityBadge T={T} prioridade={t.prioridade} compact /></td>
                <td style={td}>{t.projeto_id && projectsById[t.projeto_id] ? <ProjectTag project={projectsById[t.projeto_id]} /> : <span style={{ color: T.textFaint }}>—</span>}</td>
                <td style={td}>{t.categoria ? <CategoryTag categoria={t.categoria} /> : <span style={{ color: T.textFaint }}>—</span>}</td>
                <td style={td}>
                  {prog.total > 0
                    ? <span style={{ display: "flex", alignItems: "center", gap: 6 }}><ProgressBar T={T} done={prog.done} total={prog.total} color={statusColor(T, "concluido")} height={5} /><span style={{ fontSize: 10.5, color: T.textFaint, whiteSpace: "nowrap" }}>{prog.done}/{prog.total}</span></span>
                    : <span style={{ color: T.textFaint }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Calendário ────────────────────────────────────────────────────────────
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function CalendarioView({ T, tasks, onOpen }) {
  const today = todayIso();
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(today);
  const [dir, setDir] = useState(0); // direção da última troca de mês (anima o calendário pro lado certo)

  const byDay = useMemo(() => {
    const map = {};
    tasks.forEach(t => { if (t.prazo) (map[t.prazo] ||= []).push(t); });
    Object.values(map).forEach(l => l.sort((a, b) => (a.status === "concluido") - (b.status === "concluido") || priorityOrder(b) - priorityOrder(a)));
    return map;
  }, [tasks]);
  const semPrazo = tasks.filter(t => !t.prazo && t.status !== "concluido").length;

  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const shift = (n) => { setDir(n); setMonth(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; }); };
  const goToday = () => { const d = new Date(); setMonth({ y: d.getFullYear(), m: d.getMonth() }); setSelected(today); };
  const selectedList = byDay[selected] || [];
  const navBtn = { width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer" };

  return (
    <div className="tk-view" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: T.textBright, flex: 1 }}>{MONTHS[month.m]} {month.y}</span>
          <button onClick={goToday} className="tk-chip-btn" style={{ ...navBtn, width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>Hoje</button>
          <button onClick={() => shift(-1)} aria-label="Mês anterior" className="tk-nav-btn" style={navBtn}><ChevronLeft size={16} /></button>
          <button onClick={() => shift(1)} aria-label="Próximo mês" className="tk-nav-btn" style={navBtn}><ChevronRight size={16} /></button>
        </div>
        <div className="tk-cal" style={{ marginBottom: 4 }}>
          {WEEKDAYS.map(w => <div key={w} style={{ fontSize: 10.5, fontWeight: 700, color: T.textFaint, textAlign: "center", padding: "2px 0" }}>{w}</div>)}
        </div>
        <div key={`${month.y}-${month.m}`} className={`tk-cal${dir < 0 ? " tk-cal-anim-l" : dir > 0 ? " tk-cal-anim-r" : ""}`}>
          {cells.map((d, i) => {
            if (d == null) return <div key={`e${i}`} />;
            const key = iso(month.y, month.m, d);
            const list = byDay[key] || [];
            const isToday = key === today;
            const isSel = key === selected;
            const late = list.some(t => t.status !== "concluido" && key < today);
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className="tk-cal-day"
                style={{
                  display: "flex", flexDirection: "column", alignItems: "stretch", gap: 3, padding: 4, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left", minWidth: 0,
                  border: `1px solid ${isSel ? T.accent : T.borderSoft}`, background: isSel ? `${T.accent}14` : T.input,
                }}
              >
                <span style={{
                  alignSelf: "flex-start", fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, padding: "0 4px", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  background: isToday ? T.accent : "transparent", color: isToday ? "#fff" : late ? "#ef4444" : T.textMuted,
                }}>{d}</span>
                <div className="tk-cal-items" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  {list.slice(0, 3).map(t => (
                    <span key={t.id} title={t.titulo} style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 5px", borderRadius: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      background: `${statusColor(T, t.status)}1f`, color: t.status === "concluido" ? T.textFaint : T.text,
                      textDecoration: t.status === "concluido" ? "line-through" : "none", borderLeft: `2px solid ${statusColor(T, t.status)}`,
                    }}>{t.titulo}</span>
                  ))}
                  {list.length > 3 && <span style={{ fontSize: 9.5, color: T.textFaint, fontWeight: 700 }}>+{list.length - 3}</span>}
                </div>
                <div className="tk-cal-dots" style={{ gap: 2, flexWrap: "wrap" }}>
                  {list.slice(0, 4).map(t => <span key={t.id} style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor(T, t.status) }} />)}
                </div>
              </button>
            );
          })}
        </div>
        {semPrazo > 0 && <div style={{ fontSize: 11, color: T.textFaint, marginTop: 8 }}>{semPrazo} tarefa(s) em aberto sem prazo não aparecem no calendário.</div>}
      </div>

      <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.textBright, marginBottom: 6 }}>
          {selected === today ? "Hoje" : `${selected.slice(8, 10)}/${selected.slice(5, 7)}/${selected.slice(0, 4)}`} · {selectedList.length} tarefa(s)
        </div>
        {selectedList.length === 0 && <div style={{ fontSize: 12, color: T.textFaint, padding: "6px 0" }}>Nada com prazo neste dia.</div>}
        {selectedList.map(t => (
          <button key={`${selected}-${t.id}`} onClick={() => onOpen(t.id)} className="tk-row tk-item-in" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 6px", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <span title={TASK_STATUS[t.status]?.label} style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(T, t.status), flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: t.status === "concluido" ? T.textFaint : T.text, textDecoration: t.status === "concluido" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titulo}</span>
            <AvatarStack T={T} names={t.responsaveis || []} size={17} />
            {(t.prioridade === "alta" || t.prioridade === "urgente") && <PriorityBadge T={T} prioridade={t.prioridade} compact />}
          </button>
        ))}
      </div>
    </div>
  );
}

