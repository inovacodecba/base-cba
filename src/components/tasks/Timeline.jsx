// "Linha do tempo" (23/10/2026) — pedido do Rodrigo: escolher tarefas e ver
// a semana "passo a passo", uma barra por tarefa, de segunda a sexta (estilo
// Gantt). A barra vai de `data_inicio` até `prazo`.
//
// Regras:
//  • Está na linha do tempo = tem `data_inicio`. "Tirar da linha do tempo"
//    só limpa o início (o prazo continua).
//  • Só dias úteis (seg–sex), igual à jornada do time. Uma barra que passa
//    pelo fim de semana continua na segunda seguinte.
//  • Arrastar a barra muda as duas datas; arrastar a ponta direita muda só o
//    prazo; a esquerda, só o início. Pointer events → funciona com mouse e
//    com o dedo. Tocar sem arrastar abre um painel com as datas e atalhos
//    (no celular é o caminho mais fácil).
import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Search, GanttChart, Eye, EyeOff, ExternalLink, CalendarDays, Check } from "lucide-react";
import { Overlay } from "../common.jsx";
import { makeStyleHelpers } from "../../theme.js";
import { TASK_STATUS } from "../../constants.js";
import { statusColor, projectColor, todayIso, AvatarStack, EmptyState, priorityOrder } from "./taskUi.jsx";

const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
// Soma `n` dias úteis (n pode ser negativo). Partindo de um fim de semana,
// cai primeiro no dia útil mais próximo na direção do movimento.
function addBiz(iso, n) {
  const d = fromIso(iso);
  const step = n >= 0 ? 1 : -1;
  while (isWeekend(d)) d.setDate(d.getDate() + step);
  let left = Math.abs(n);
  while (left > 0) { d.setDate(d.getDate() + step); if (!isWeekend(d)) left--; }
  return toIso(d);
}
const mondayOf = (iso) => { const d = fromIso(iso); const wd = d.getDay(); d.setDate(d.getDate() + (wd === 0 ? 1 : wd === 6 ? 2 : 1 - wd)); return toIso(d); };
const fmtShort = (iso) => { const d = fromIso(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };

const RANGES = [{ key: 1, label: "1 semana" }, { key: 2, label: "2 semanas" }, { key: 4, label: "4 semanas" }];

export function TimelineView({ T, tasks, allTasks, projects, onOpen, onUpdate, showToast }) {
  const { inp, btn, ghost } = makeStyleHelpers(T);
  const today = todayIso();
  const [start, setStart] = useState(() => mondayOf(today));
  const [weeks, setWeeks] = useState(() => { try { return Number(localStorage.getItem("tk-tl-weeks")) || 1; } catch { return 1; } });
  const [picker, setPicker] = useState(false);
  const [editId, setEditId] = useState(null);
  // Quais tarefas da linha do tempo aparecem (só na tela de quem está vendo — não muda nada no banco)
  const [hidden, setHidden] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("tk-tl-hidden") || "[]")); } catch { return new Set(); } });
  const [showMenu, setShowMenu] = useState(false);
  const toggleHidden = (id) => setHidden(h => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); try { localStorage.setItem("tk-tl-hidden", JSON.stringify([...n])); } catch { /* sem storage */ } return n; });
  const setAllHidden = (ids) => { const n = new Set(ids); setHidden(n); try { localStorage.setItem("tk-tl-hidden", JSON.stringify([...n])); } catch { /* sem storage */ } };
  const [drag, setDrag] = useState(null); // { id, mode, x0, colW, ini, fim, dIni, dFim, moved }
  const gridRef = useRef(null);

  useEffect(() => { try { localStorage.setItem("tk-tl-weeks", String(weeks)); } catch { /* sem storage */ } }, [weeks]);

  const cols = useMemo(() => Array.from({ length: weeks * 5 }, (_, i) => addBiz(start, i)), [start, weeks]);
  const first = cols[0], last = cols[cols.length - 1];
  const projectsById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);

  const fimDe = (t) => (t.prazo && t.prazo >= t.data_inicio ? t.prazo : t.data_inicio);
  const onTimeline = tasks.filter(t => t.data_inicio);
  const rows = onTimeline
    .filter(t => !hidden.has(t.id))
    .filter(t => t.data_inicio <= last && fimDe(t) >= first)
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio) || fimDe(a).localeCompare(fimDe(b)) || priorityOrder(b) - priorityOrder(a));
  const nVisiveis = onTimeline.filter(t => !hidden.has(t.id)).length;
  const foraDoPeriodo = nVisiveis - rows.length;

  // índice da coluna (dia útil) de uma data, preso ao intervalo visível
  const colIndex = (iso, side) => {
    if (iso < first) return 0;
    if (iso > last) return cols.length - 1;
    let i = cols.indexOf(iso);
    if (i >= 0) return i;
    // caiu num fim de semana: início vai pra segunda seguinte, fim pra sexta anterior
    i = cols.findIndex(c => c > iso);
    return side === "ini" ? i : i - 1;
  };

  const save = (t, ini, fim) => {
    if (ini === t.data_inicio && fim === fimDe(t)) return;
    onUpdate(t.id, { data_inicio: ini, prazo: fim }, { silent: true });
  };

  // ── arrastar (mouse ou dedo) ──
  const onPointerDown = (e, t, mode) => {
    e.stopPropagation();
    const el = gridRef.current;
    if (!el) return;
    const colW = el.getBoundingClientRect().width / cols.length;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* sem captura: o arraste ainda funciona dentro da linha */ }
    setDrag({ id: t.id, mode, x0: e.clientX, colW, ini: t.data_inicio, fim: fimDe(t), dIni: 0, dFim: 0, moved: false });
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const steps = Math.round(dx / drag.colW);
    const moved = drag.moved || Math.abs(dx) > 6;
    if (drag.mode === "move") setDrag(d => ({ ...d, dIni: steps, dFim: steps, moved }));
    else if (drag.mode === "ini") setDrag(d => ({ ...d, dIni: steps, moved }));
    else setDrag(d => ({ ...d, dFim: steps, moved }));
  };
  const dragDates = (d) => {
    let ini = addBiz(d.ini, d.dIni), fim = addBiz(d.fim, d.dFim);
    if (d.mode === "ini" && ini > fim) ini = fim;
    if (d.mode === "fim" && fim < ini) fim = ini;
    return { ini, fim };
  };
  const onPointerUp = () => {
    if (!drag) return;
    const t = tasks.find(x => x.id === drag.id);
    if (t) {
      if (!drag.moved) setEditId(t.id); // toque simples = abre o painel
      else { const { ini, fim } = dragDates(drag); save(t, ini, fim); }
    }
    setDrag(null);
  };

  // ── adicionar tarefas (seletor) ──
  const addTasks = (ids) => {
    const defIni = today >= first && today <= last && !isWeekend(fromIso(today)) ? today : first;
    ids.forEach(id => {
      const t = allTasks.find(x => x.id === id);
      if (!t) return;
      let ini = defIni, fim;
      if (t.prazo) { fim = t.prazo; if (fim < ini) ini = fim; } else fim = defIni;
      onUpdate(id, { data_inicio: ini, prazo: fim }, { silent: true });
    });
    if (ids.length) showToast(ids.length === 1 ? "Tarefa adicionada à linha do tempo" : `${ids.length} tarefas adicionadas`);
  };

  const editTask = editId ? allTasks.find(t => t.id === editId) : null;
  const navBtn = { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 9, border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer" };
  const periodo = `${fmtShort(first)} – ${fmtShort(last)} · ${MONTHS[fromIso(first).getMonth()]}${fromIso(first).getMonth() !== fromIso(last).getMonth() ? `/${MONTHS[fromIso(last).getMonth()]}` : ""} ${fromIso(last).getFullYear()}`;
  const todayIdx = today >= first && today <= last ? cols.indexOf(today) : -1;

  return (
    <div className="tk-view" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`
        .tl-wrap{background:${T.panel};border:1px solid ${T.border};border-radius:12px;overflow:hidden}
        .tl-grid{display:grid;grid-template-columns:220px minmax(0,1fr)}
        .tl-label{padding:0 12px;border-right:1px solid ${T.borderSoft};display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer}
        .tl-label:hover{background:${T.rowHover}}
        .tl-row{position:relative;height:48px;border-bottom:1px solid ${T.borderSoft}}
        .tl-bar{position:absolute;top:8px;height:32px;border-radius:9px;display:flex;align-items:center;gap:6px;padding:0 10px;color:#fff;font-size:12px;font-weight:700;cursor:grab;touch-action:none;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,.18);transition:left 180ms cubic-bezier(.2,.8,.2,1),width 180ms cubic-bezier(.2,.8,.2,1),box-shadow 150ms ease,transform 150ms ease;overflow:hidden;white-space:nowrap;animation:tl-in 360ms cubic-bezier(.2,.8,.2,1) both}
        .tl-bar:hover{box-shadow:0 6px 16px rgba(0,0,0,.28);transform:translateY(-1px)}
        .tl-bar.drag{transition:none;cursor:grabbing;box-shadow:0 10px 24px rgba(0,0,0,.35);z-index:3}
        .tl-bar.done{opacity:.55}
        .tl-h{position:absolute;top:0;bottom:0;width:14px;cursor:ew-resize;touch-action:none;display:flex;align-items:center;justify-content:center}
        .tl-h::after{content:"";width:3px;height:14px;border-radius:2px;background:rgba(255,255,255,.75)}
        .tl-h.l{left:0}.tl-h.r{right:0}
        .tl-cut-l{border-top-left-radius:0;border-bottom-left-radius:0}
        .tl-cut-r{border-top-right-radius:0;border-bottom-right-radius:0}
        @keyframes tl-in{from{opacity:0;transform:scaleX(.6);transform-origin:left}to{opacity:1;transform:none}}
        .tl-mlabel{display:none}
        @media (max-width:640px){
          .tl-grid{grid-template-columns:minmax(0,1fr)}
          .tl-label{display:none}
          .tl-row{height:62px}
          .tl-bar{top:24px;height:30px}
          .tl-mlabel{display:block;position:absolute;top:4px;left:8px;right:8px;font-size:11.5px;font-weight:700;color:${T.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
          .tl-colhead b{font-size:10px!important}
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setStart(s => addBiz(s, -5 * weeks))} aria-label="Período anterior" className="tk-nav-btn" style={navBtn}><ChevronLeft size={16} /></button>
        <button onClick={() => setStart(mondayOf(today))} className="tk-chip-btn" style={{ ...navBtn, width: "auto", padding: "0 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>Hoje</button>
        <button onClick={() => setStart(s => addBiz(s, 5 * weeks))} aria-label="Próximo período" className="tk-nav-btn" style={navBtn}><ChevronRight size={16} /></button>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.textBright, flex: 1, minWidth: 140 }}>{periodo}</span>
        <select value={weeks} onChange={e => setWeeks(Number(e.target.value))} style={inp({ width: "auto", padding: "8px 10px" })} aria-label="Período">
          {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        {onTimeline.length > 0 && (
          <button onClick={() => setShowMenu(true)} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderColor: hidden.size ? T.accent : T.border, color: hidden.size ? T.accent : T.text }}><Eye size={14} /> Mostrando {nVisiveis} de {onTimeline.length}</button>
        )}
        <button onClick={() => setPicker(true)} className="tk-pill-btn" style={{ ...btn(T.accent), borderRadius: 999, display: "flex", alignItems: "center", gap: 6, padding: "9px 14px" }}><Plus size={14} strokeWidth={2.5} /> Selecionar tarefas</button>
      </div>

      <div className="tl-wrap">
        {/* cabeçalho dos dias */}
        <div className="tl-grid" style={{ borderBottom: `1px solid ${T.border}`, background: T.th }}>
          <div className="tl-label" style={{ cursor: "default", fontSize: 10.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, height: 44 }}>Tarefa</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
            {cols.map((c, i) => {
              const d = fromIso(c), isT = c === today;
              return (
                <div key={c} className="tl-colhead" style={{ textAlign: "center", padding: "6px 0", borderLeft: i ? `1px solid ${i % 5 === 0 ? T.border : T.borderSoft}` : "none", color: isT ? T.accent : T.textMuted }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4 }}>{WD[d.getDay()]}</div>
                  <b style={{ fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 22, borderRadius: 11, background: isT ? T.accent : "transparent", color: isT ? "#fff" : T.text, padding: "0 4px" }}>{weeks > 2 ? d.getDate() : fmtShort(c)}</b>
                </div>
              );
            })}
          </div>
        </div>

        {rows.length === 0 && (
          <div style={{ padding: 10 }}>
            <EmptyState T={T} icon={GanttChart}>
              {onTimeline.length === 0 ? "Nenhuma tarefa na linha do tempo ainda. Use \"Selecionar tarefas\" para montar a sua semana." : nVisiveis === 0 ? "Todas as tarefas estão escondidas. Use \"Mostrando\" para escolher quais aparecem." : "Nenhuma tarefa neste período."}
            </EmptyState>
          </div>
        )}

        {rows.map((t, ri) => {
          const isDrag = drag && drag.id === t.id;
          const { ini, fim } = isDrag ? dragDates(drag) : { ini: t.data_inicio, fim: fimDe(t) };
          const a = colIndex(ini, "ini"), b = colIndex(fim, "fim");
          const span = Math.max(1, b - a + 1);
          const proj = t.projeto_id ? projectsById[t.projeto_id] : null;
          const cor = t.status === "concluido" ? statusColor(T, "concluido") : (proj ? projectColor(proj) : T.accent);
          const cutL = ini < first, cutR = fim > last;
          return (
            <div key={t.id} className="tl-grid">
              <div className="tl-label tl-row" onClick={() => onOpen(t.id)} title="Abrir tarefa">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(T, t.status), flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: t.status === "concluido" ? T.textFaint : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.titulo}</span>
                <AvatarStack T={T} names={t.responsaveis || []} size={17} />
              </div>
              <div className="tl-row" style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / cols.length}% - 1px), ${T.borderSoft} calc(${100 / cols.length}% - 1px), ${T.borderSoft} ${100 / cols.length}%)` }}
                ref={ri === 0 ? gridRef : undefined}
                onPointerMove={isDrag ? onPointerMove : undefined}
                onPointerUp={isDrag ? onPointerUp : undefined}
                onPointerCancel={isDrag ? () => setDrag(null) : undefined}
              >
                {todayIdx >= 0 && <span style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${(todayIdx + .5) * 100 / cols.length}% - 1px)`, width: 2, background: `${T.accent}55`, pointerEvents: "none" }} />}
                <span className="tl-mlabel">{t.titulo}</span>
                <div
                  className={`tl-bar${isDrag ? " drag" : ""}${t.status === "concluido" ? " done" : ""}${cutL ? " tl-cut-l" : ""}${cutR ? " tl-cut-r" : ""}`}
                  style={{ left: `calc(${a * 100 / cols.length}% + 4px)`, width: `calc(${span * 100 / cols.length}% - 8px)`, background: `linear-gradient(135deg, ${cor}, ${cor}d0)`, animationDelay: `${Math.min(ri * 40, 300)}ms` }}
                  onPointerDown={e => onPointerDown(e, t, "move")}
                  onPointerMove={isDrag ? onPointerMove : undefined}
                  onPointerUp={isDrag ? onPointerUp : undefined}
                  title={`${t.titulo} · ${fmtShort(ini)} → ${fmtShort(fim)}`}
                >
                  {!cutL && <span className="tl-h l" onPointerDown={e => onPointerDown(e, t, "ini")} />}
                  {t.status === "concluido" && <Check size={13} strokeWidth={3} style={{ flexShrink: 0 }} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", paddingLeft: 2 }}>{span >= 2 || weeks === 1 ? t.titulo : ""}</span>
                  {isDrag && drag.moved && <span style={{ marginLeft: "auto", fontSize: 10.5, background: "rgba(0,0,0,.25)", borderRadius: 6, padding: "2px 6px", flexShrink: 0 }}>{fmtShort(ini)} → {fmtShort(fim)}</span>}
                  {!cutR && <span className="tl-h r" onPointerDown={e => onPointerDown(e, t, "fim")} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11.5, color: T.textFaint, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>Arraste a barra para mudar os dias · puxe a ponta para aumentar ou diminuir · toque para editar.</span>
        {foraDoPeriodo > 0 && <span>{foraDoPeriodo} tarefa(s) da linha do tempo estão fora deste período.</span>}
      </div>

      {showMenu && (
        <Overlay T={T} onClose={() => setShowMenu(false)}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: T.textBright }}>Quais tarefas aparecem</h3>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>Desmarque para esconder da sua visão. A tarefa continua na linha do tempo e volta quando você marcar de novo.</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => setAllHidden([])} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, padding: "6px 12px", fontSize: 11.5 }}>Marcar todas</button>
            <button onClick={() => setAllHidden(onTimeline.map(t => t.id))} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, padding: "6px 12px", fontSize: 11.5 }}>Desmarcar todas</button>
          </div>
          <div style={{ maxHeight: "52vh", overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
            {[...onTimeline].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)).map(t => {
              const on = !hidden.has(t.id);
              const p = t.projeto_id ? projectsById[t.projeto_id] : null;
              return (
                <label key={t.id} className="tk-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer" }}>
                  <input type="checkbox" className="tk-check" checked={on} onChange={() => toggleHidden(t.id)} />
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: p ? projectColor(p) : T.accent, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: on ? T.text : T.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titulo}</span>
                  <span style={{ fontSize: 11, color: T.textFaint, whiteSpace: "nowrap" }}>{fmtShort(t.data_inicio)} → {fmtShort(fimDe(t))}</span>
                  {!on && <EyeOff size={13} style={{ color: T.textFaint, flexShrink: 0 }} />}
                </label>
              );
            })}
          </div>
          <button onClick={() => setShowMenu(false)} className="tk-pill-btn" style={{ ...btn(T.accent), borderRadius: 999, width: "100%", padding: 11, marginTop: 12 }}>Pronto</button>
        </Overlay>
      )}

      {picker && <TaskPicker T={T} tasks={allTasks} projectsById={projectsById} onClose={() => setPicker(false)} onConfirm={(ids) => { setPicker(false); addTasks(ids); }} />}

      {editTask && (
        <Overlay T={T} onClose={() => setEditId(null)}>
          <EditPanel
            T={T} task={editTask} fim={fimDe(editTask)} inp={inp} btn={btn} ghost={ghost}
            onSave={(ini, fim) => { save(editTask, ini, fim < ini ? ini : fim); setEditId(null); }}
            onShift={(n) => { save(editTask, addBiz(editTask.data_inicio, n), addBiz(fimDe(editTask), n)); }}
            onRemove={() => { onUpdate(editTask.id, { data_inicio: null }, { silent: true }); setEditId(null); showToast("Tirada da linha do tempo", "warn"); }}
            onOpen={() => { setEditId(null); onOpen(editTask.id); }}
          />
        </Overlay>
      )}
    </div>
  );
}

function EditPanel({ T, task, fim, inp, btn, ghost, onSave, onShift, onRemove, onOpen }) {
  const [ini, setIni] = useState(task.data_inicio);
  const [end, setEnd] = useState(fim);
  useEffect(() => { setIni(task.data_inicio); setEnd(fim); }, [task.data_inicio, fim]);
  const lbl = (c) => <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: .6 }}>{c}</div>;
  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: T.textBright }}>{task.titulo}</h3>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 14 }}>{TASK_STATUS[task.status]?.label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div>{lbl("Início")}<input type="date" value={ini || ""} onChange={e => setIni(e.target.value)} style={inp()} /></div>
        <div>{lbl("Fim (prazo)")}<input type="date" value={end || ""} min={ini || undefined} onChange={e => setEnd(e.target.value)} style={inp()} /></div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button onClick={() => onShift(-1)} className="tk-pill-btn" style={{ ...ghost(), flex: 1, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}><ChevronLeft size={14} /> 1 dia antes</button>
        <button onClick={() => onShift(1)} className="tk-pill-btn" style={{ ...ghost(), flex: 1, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>1 dia depois <ChevronRight size={14} /></button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onRemove} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, color: "#ef4444", borderColor: "#ef444430", display: "flex", alignItems: "center", gap: 5 }}><X size={13} /> Tirar da linha do tempo</button>
        <button onClick={onOpen} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, display: "flex", alignItems: "center", gap: 5 }}><ExternalLink size={13} /> Abrir tarefa</button>
        <button onClick={() => ini && onSave(ini, end || ini)} className="tk-pill-btn" style={{ ...btn(T.accent), borderRadius: 999, flex: 1, minWidth: 120 }}>Salvar datas</button>
      </div>
    </div>
  );
}

function TaskPicker({ T, tasks, projectsById, onClose, onConfirm }) {
  const { inp, btn } = makeStyleHelpers(T);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [showDone, setShowDone] = useState(false);
  const term = q.trim().toLowerCase();
  const list = tasks
    .filter(t => !t.data_inicio && (showDone || t.status !== "concluido"))
    .filter(t => !term || `${t.titulo} ${t.categoria || ""} ${projectsById[t.projeto_id]?.nome || ""}`.toLowerCase().includes(term))
    .sort((a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999") || a.titulo.localeCompare(b.titulo, "pt-BR"));
  const toggle = (id) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // "Selecionar todas" vale para a lista que está aparecendo (respeita a busca)
  const allSel = list.length > 0 && list.every(x => sel.has(x.id));
  const toggleAll = () => setSel(s => { const n = new Set(s); list.forEach(x => (allSel ? n.delete(x.id) : n.add(x.id))); return n; });
  return (
    <Overlay T={T} onClose={onClose} wide>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: T.textBright }}>Selecionar tarefas</h3>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>A barra começa hoje (ou no 1º dia do período) e vai até o prazo da tarefa. Depois é só arrastar.</div>
      <div style={{ position: "relative", marginBottom: 8 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.textFaint }} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar tarefa ou projeto…" style={inp({ padding: "9px 10px 9px 32px", fontSize: 13 })} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: T.text, cursor: "pointer" }}>
          <input type="checkbox" className="tk-check" checked={allSel} onChange={toggleAll} disabled={!list.length} /> Selecionar todas{list.length ? ` (${list.length})` : ""}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.textMuted, cursor: "pointer", marginLeft: "auto" }}>
          <input type="checkbox" className="tk-check" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Mostrar concluídas
        </label>
      </div>
      <div style={{ maxHeight: "48vh", overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
        {list.length === 0 && <div style={{ padding: 16, fontSize: 12, color: T.textFaint, textAlign: "center" }}>Nenhuma tarefa disponível (as que já estão na linha do tempo não aparecem aqui).</div>}
        {list.map(t => {
          const p = projectsById[t.projeto_id];
          return (
            <label key={t.id} className="tk-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer" }}>
              <input type="checkbox" className="tk-check" checked={sel.has(t.id)} onChange={() => toggle(t.id)} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, color: T.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titulo}</span>
                <span style={{ fontSize: 11, color: T.textFaint }}>
                  {p && <><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: projectColor(p), marginRight: 4 }} />{p.nome} · </>}
                  {t.prazo ? <><CalendarDays size={10} style={{ verticalAlign: -1 }} /> {fmtShort(t.prazo)}</> : "sem prazo"}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <button onClick={() => onConfirm([...sel])} disabled={!sel.size} className="tk-pill-btn" style={{ ...btn(T.accent), borderRadius: 999, width: "100%", padding: 11, marginTop: 12, opacity: sel.size ? 1 : .5 }}>
        {sel.size ? `Adicionar ${sel.size} à linha do tempo` : "Escolha as tarefas"}
      </button>
    </Overlay>
  );
}
