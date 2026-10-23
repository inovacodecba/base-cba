// Visões extras do módulo Tarefas (10/2026, "estilo Notion"): Tabela e
// Calendário. Recebem a lista já filtrada pela barra de busca/filtros do
// Tarefas.jsx.
//
// Tabela = planilha (16/10/2026, pedido do Rodrigo: "não consigo editar"):
// cada célula é editável ali mesmo e salva sozinha — texto ao sair do
// campo (ou Enter), listas/datas na hora. A ordem das linhas fica parada
// enquanto se edita (senão a linha "pularia" ao mudar o prazo); só reordena
// ao clicar no cabeçalho de uma coluna.
import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Table2, CornerDownRight, Maximize2, Plus } from "lucide-react";
import { TASK_STATUS, TASK_PRIORITY } from "../../constants.js";
import {
  COLS, PRIORITIES, PriorityBadge, AvatarStack, TeamMultiSelect, statusColor, priorityColor, priorityOrder, projectColor,
  todayIso, EmptyState,
} from "./taskUi.jsx";

// ── Tabela ────────────────────────────────────────────────────────────────
const SORTERS = {
  titulo: (a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"),
  descricao: (a, b) => (a.descricao || "~").localeCompare(b.descricao || "~", "pt-BR"),
  status: (a, b) => COLS.indexOf(a.status) - COLS.indexOf(b.status),
  responsaveis: (a, b) => (a.responsaveis?.[0] || "~").localeCompare(b.responsaveis?.[0] || "~", "pt-BR"),
  prazo: (a, b) => (a.prazo || "9999-99-99").localeCompare(b.prazo || "9999-99-99"),
  prioridade: (a, b) => priorityOrder(a) - priorityOrder(b),
  projeto: (a, b, pm) => (pm[a.projeto_id]?.nome || "~").localeCompare(pm[b.projeto_id]?.nome || "~", "pt-BR"),
  categoria: (a, b) => (a.categoria || "~").localeCompare(b.categoria || "~", "pt-BR"),
};

// Célula de texto: edita no lugar, salva no blur/Enter, Esc desfaz.
function EditText({ T, value, onSave, placeholder, bold, required, list }) {
  const [v, setV] = useState(value || "");
  useEffect(() => { setV(value || ""); }, [value]);
  const commit = () => {
    const t = v.trim();
    if (required && !t) { setV(value || ""); return; }
    if (t !== (value || "")) onSave(t);
  };
  return (
    <input
      value={v} onChange={e => setV(e.target.value)} onBlur={commit} list={list}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(value || ""); setTimeout(() => e.target.blur()); } }}
      placeholder={placeholder} title={v}
      className="tk-cell"
      style={{ fontWeight: bold ? 600 : 400, color: T.text }}
    />
  );
}

export function TabelaView({ T, tasks, allTasks, projects, team, onOpen, onUpdate, onCreate, newDefaults }) {
  const [sort, setSort] = useState({ key: "prazo", dir: 1 });
  const [novo, setNovo] = useState("");
  const projectsById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);
  const categoriesUsed = useMemo(() => Array.from(new Set(allTasks.map(t => t.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [allTasks]);

  // Ordem congelada: recalcula só quando muda a coluna de ordenação ou
  // entra/sai tarefa da lista — editar uma célula não mexe na posição.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const idsKey = tasks.map(t => t.id).sort().join(",");
  const order = useMemo(() => {
    const fn = SORTERS[sort.key];
    return [...tasksRef.current].sort((a, b) => fn(a, b, projectsById) * sort.dir || priorityOrder(b) - priorityOrder(a)).map(t => t.id);
  }, [sort, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => Object.fromEntries(tasks.map(t => [t.id, t])), [tasks]);
  const rows = order.map(id => byId[id]).filter(Boolean);
  const parentTitle = (t) => t.parent_id ? allTasks.find(x => x.id === t.parent_id)?.titulo : null;
  const save = (id, patch) => onUpdate(id, patch, { silent: true });

  const addRow = async () => {
    const titulo = novo.trim();
    if (!titulo) return;
    setNovo("");
    await onCreate({ titulo, descricao: "", prazo: null, categoria: null, prioridade: "media", parent_id: null, ...newDefaults }, { silent: true });
  };

  const thBase = { textAlign: "left", padding: "9px 8px", fontSize: 10.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, whiteSpace: "nowrap", userSelect: "none", borderBottom: `1px solid ${T.border}`, background: T.th, position: "sticky", top: 0, zIndex: 1 };
  const th = (key, label, w) => (
    <th onClick={() => setSort(s => ({ key, dir: s.key === key ? -s.dir : 1 }))} style={{ ...thBase, cursor: "pointer", width: w }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  );
  const td = { padding: "3px 4px", fontSize: 12.5, color: T.text, borderBottom: `1px solid ${T.borderSoft}`, borderRight: `1px solid ${T.borderSoft}`, verticalAlign: "middle" };
  const cellSel = { className: "tk-cell", style: { color: T.text, cursor: "pointer" } };

  return (
    <div className="tk-view" style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "auto", maxHeight: "72vh" }}>
      <style>{`
        .tk-cell{width:100%;min-width:0;background:transparent;border:1px solid transparent;border-radius:6px;padding:6px 6px;font-size:12.5px;font-family:inherit;outline:none;transition:background 120ms ease,border-color 120ms ease}
        .tk-cell:hover{background:${T.panelAlt}}
        .tk-cell:focus{background:${T.input};border-color:${T.accent}}
        .tk-cell::placeholder{color:${T.textFaint}}
        .tk-sheet tr:hover td{background:${T.rowHover}}
      `}</style>
      <datalist id="tk-sheet-cat">{categoriesUsed.map(c => <option key={c} value={c} />)}</datalist>
      <table className="tk-sheet" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1180 }}>
        <thead>
          <tr>
            <th style={{ ...thBase, width: 34 }} />
            {th("titulo", "Tarefa", 260)}
            {th("descricao", "Observação", 260)}
            {th("status", "Status", 130)}
            {th("responsaveis", "Responsáveis", 170)}
            {th("prazo", "Prazo", 130)}
            {th("prioridade", "Prioridade", 110)}
            {th("projeto", "Projeto", 170)}
            {th("categoria", "Categoria", 120)}
          </tr>
        </thead>
        <tbody>
          {rows.map(t => {
            const pt = parentTitle(t);
            const proj = t.projeto_id ? projectsById[t.projeto_id] : null;
            return (
              <tr key={t.id}>
                <td style={{ ...td, textAlign: "center" }}>
                  <button onClick={() => onOpen(t.id)} title="Abrir página da tarefa" aria-label={`Abrir ${t.titulo}`} style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 6, background: "transparent", color: T.textFaint, cursor: "pointer" }}><Maximize2 size={13} /></button>
                </td>
                <td style={td}>
                  <EditText T={T} value={t.titulo} required bold onSave={v => save(t.id, { titulo: v })} />
                  {pt && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: T.textFaint, padding: "0 7px 4px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><CornerDownRight size={10} /> {pt}</div>}
                </td>
                <td style={td}><EditText T={T} value={t.descricao} placeholder="—" onSave={v => save(t.id, { descricao: v })} /></td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 2, paddingLeft: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(T, t.status), flexShrink: 0 }} />
                    <select value={t.status} onChange={e => save(t.id, { status: e.target.value })} aria-label="Status" {...cellSel}>
                      {COLS.map(c => <option key={c} value={c}>{TASK_STATUS[c].label}</option>)}
                    </select>
                  </div>
                </td>
                <td style={td}>
                  <TeamMultiSelect T={T} team={team} value={t.responsaveis || []} onChange={v => save(t.id, { responsaveis: v })} inp={() => ({ width: "100%", fontSize: 12, padding: "6px 6px", borderRadius: 6, border: "1px solid transparent", background: "transparent", color: T.text, fontFamily: "inherit" })} fixed />
                </td>
                <td style={td}>
                  <input type="date" value={t.prazo || ""} onChange={e => save(t.id, { prazo: e.target.value || null })} aria-label="Prazo" {...cellSel} />
                </td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 2, paddingLeft: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: priorityColor(T, t.prioridade), flexShrink: 0 }} />
                    <select value={t.prioridade || "media"} onChange={e => save(t.id, { prioridade: e.target.value })} aria-label="Prioridade" {...cellSel}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
                    </select>
                  </div>
                </td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 2, paddingLeft: 6 }}>
                    {proj && <span style={{ width: 8, height: 8, borderRadius: 2, background: projectColor(proj), flexShrink: 0 }} />}
                    <select value={t.projeto_id || ""} onChange={e => save(t.id, { projeto_id: e.target.value ? Number(e.target.value) : null })} aria-label="Projeto" className="tk-cell" style={{ color: proj ? T.text : T.textFaint, cursor: "pointer" }}>
                      <option value="">—</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                </td>
                <td style={td}><EditText T={T} value={t.categoria} placeholder="—" list="tk-sheet-cat" onSave={v => save(t.id, { categoria: v || null })} /></td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...td, textAlign: "center", color: T.textFaint }}><Plus size={14} /></td>
            <td style={td} colSpan={8}>
              <input
                value={novo} onChange={e => setNovo(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addRow(); }} onBlur={addRow}
                placeholder="Nova tarefa — digite o título e aperte Enter" className="tk-cell" style={{ color: T.text }}
              />
            </td>
          </tr>
        </tbody>
      </table>
      {tasks.length === 0 && <EmptyState T={T} icon={Table2}>Nenhuma tarefa com esses filtros.</EmptyState>}
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

