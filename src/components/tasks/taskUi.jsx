// Peças visuais e helpers compartilhados pelas telas de Tarefas (quadro,
// tabela, calendário, por pessoa, projetos e a página da tarefa). Saíram do
// Tarefas.jsx quando o módulo ganhou as funções "estilo Notion" (10/2026),
// pra não ter cópia do mesmo badge/cálculo em vários arquivos.
import { useState } from "react";
import { ChevronDown, Flag, Tag } from "lucide-react";
import { TASK_STATUS, TASK_PRIORITY } from "../../constants.js";

export const COLS = Object.keys(TASK_STATUS); // ["a_fazer", "em_andamento", "concluido"]
export const PRIORITIES = Object.keys(TASK_PRIORITY); // ["baixa", "media", "alta", "urgente"]

// Cor da tag de categoria — "Projeto"/"Infra"/"Compras"/etc são texto livre
// (sem tabela própria), então a cor deriva de um hash do nome: a mesma
// categoria sempre cai na mesma cor, sem guardar "categoria → cor" no banco.
// A mesma paleta serve de opções de cor dos projetos.
export const CAT_TAG_PALETTE = ["#3b82f6", "#f97316", "#8b5cf6", "#06b6d4", "#22c55e", "#ec4899", "#14b8a6", "#f43f5e", "#84cc16", "#eab308"];
export function categoryColor(name) {
  if (!name) return null;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CAT_TAG_PALETTE[hash % CAT_TAG_PALETTE.length];
}
export const projectColor = (p) => (p?.cor || categoryColor(p?.nome || "") || CAT_TAG_PALETTE[0]);

// "2026-08-31" → "31/08" (tarefas guardam só a data, sem hora).
export const fmtDate = (iso) => {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
export const fmtDateFull = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
// timestamptz → "14/10 13:54"
export const fmtDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
// Data local de hoje no formato do banco ("2026-10-14") — não usa
// toISOString() porque ele converte pra UTC (à noite viraria o dia seguinte).
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const statusColor = (T, status) => {
  const cfg = TASK_STATUS[status] || TASK_STATUS.a_fazer;
  return T.isLight ? cfg.dot.light : cfg.dot.dark;
};
export const priorityColor = (T, prioridade) => {
  const cfg = TASK_PRIORITY[prioridade] || TASK_PRIORITY.media;
  return T.isLight ? cfg.color.light : cfg.color.dark;
};
export const priorityOrder = (t) => TASK_PRIORITY[t.prioridade]?.order ?? TASK_PRIORITY.media.order;

// Classifica o prazo em atrasado / hoje / próximo / normal. Tarefa concluída
// nunca é "atrasada" — depois de pronta, a urgência do prazo não faz sentido.
export function dueInfo(prazo, T, status) {
  if (status === "concluido") { const c = T.isLight ? "#1b9e4b" : "#22c55e"; return { label: "Concluída", color: c, full: "Concluída", days: null }; }
  if (!prazo) return { label: "Sem prazo", color: T.textFaint, full: null, days: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${prazo}T00:00:00`);
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return { label: "Atrasada", full: `Atrasada · ${fmtDate(prazo)}`, color: "#ef4444", days };
  if (days === 0) return { label: "Hoje", full: "Hoje", color: "#f97316", days };
  if (days <= 2) return { label: `Em ${days}d`, full: `${fmtDate(prazo)} · em ${days}d`, color: "#eab308", days };
  return { label: fmtDate(prazo), full: fmtDate(prazo), color: T.textFaint, days };
}

// Filhas diretas de uma tarefa (subtarefas).
export const childrenOf = (tasks, id) => tasks.filter(t => t.parent_id === id);
// Ids de toda a descendência (pra não deixar escolher uma filha/neta como
// "Tarefa principal" — viraria um ciclo).
export function descendantIds(tasks, id) {
  const out = new Set();
  const walk = (pid) => tasks.forEach(t => { if (t.parent_id === pid && !out.has(t.id)) { out.add(t.id); walk(t.id); } });
  walk(id);
  return out;
}
// Progresso da tarefa: subtarefas concluídas + itens de checklist marcados.
export function taskProgress(task, tasks) {
  const subs = childrenOf(tasks, task.id);
  const subsDone = subs.filter(s => s.status === "concluido").length;
  const check = Array.isArray(task.checklist) ? task.checklist : [];
  const checkDone = check.filter(i => i.feito).length;
  return { subs: subs.length, subsDone, check: check.length, checkDone, total: subs.length + check.length, done: subsDone + checkDone };
}

export const pillStyle = (c, extra = {}) => ({
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700, color: c, background: `${c}18`,
  border: `1px solid ${c}30`, borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap", flexShrink: 0, ...extra,
});

export function PriorityBadge({ T, prioridade, compact }) {
  const cfg = TASK_PRIORITY[prioridade] || TASK_PRIORITY.media;
  const c = priorityColor(T, prioridade);
  return (
    <span title={`Prioridade: ${cfg.label}`} style={pillStyle(c, compact ? { padding: "2px 7px" } : {})}>
      <Flag size={10} strokeWidth={2.5} /> {cfg.label}
    </span>
  );
}

export function CategoryTag({ categoria }) {
  if (!categoria) return null;
  const c = categoryColor(categoria);
  return (
    <span title={categoria} style={pillStyle(c, { overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140, flexShrink: 1 })}>
      <Tag size={10} strokeWidth={2.5} /> {categoria}
    </span>
  );
}

export function StatusPill({ T, status }) {
  const c = statusColor(T, status);
  return (
    <span style={pillStyle(c)}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
      {(TASK_STATUS[status] || TASK_STATUS.a_fazer).label}
    </span>
  );
}

export function ProjectTag({ project }) {
  if (!project) return null;
  const c = projectColor(project);
  return (
    <span title={`Projeto: ${project.nome}`} style={pillStyle(c, { overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160, flexShrink: 1 })}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: c, flexShrink: 0 }} /> {project.nome}
    </span>
  );
}

export function ProgressBar({ T, done, total, color, height = 6 }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ height, borderRadius: height, background: T.panelAlt2, overflow: "hidden", flex: 1, minWidth: 40 }}>
      <div className="tk-bar" style={{ width: `${pct}%`, height: "100%", borderRadius: height, background: color || T.accent, transition: "width 420ms cubic-bezier(.2,.8,.2,1)" }} />
    </div>
  );
}

// Iniciais dos responsáveis — até 3 visíveis, o resto vira "+N".
export function AvatarStack({ T, names, size = 18 }) {
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

// Dropdown com checkboxes pra escolher vários responsáveis (equipe pequena,
// sem lib de multi-select).
export function TeamMultiSelect({ T, team, value, onChange, inp, style }) {
  const [open, setOpen] = useState(false);
  const toggle = (name) => onChange(value.includes(name) ? value.filter(n => n !== name) : [...value, name]);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ ...inp(), textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, ...style }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {value.length > 0 && <AvatarStack T={T} names={value} size={16} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: value.length ? T.text : T.textFaint }}>
            {value.length ? value.join(", ") : "Sem responsável"}
          </span>
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: .6, transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms ease" }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, minWidth: 200, background: T.panel, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: 4, zIndex: 21, maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.28)",
          }}>
            {team.length === 0 && <div style={{ padding: 8, fontSize: 11.5, color: T.textFaint }}>Nenhum colaborador cadastrado.</div>}
            {team.map(name => (
              <label key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px", borderRadius: 6, fontSize: 12.5, color: T.text, cursor: "pointer" }}>
                <input type="checkbox" checked={value.includes(name)} onChange={() => toggle(name)} style={{ accentColor: T.accent, width: 15, height: 15, flexShrink: 0 }} />
                {name}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Estilos/animações do módulo Tarefas num único <style>.
export function TaskStyles({ T }) {
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
      .tk-col{transition:border-color 160ms ease,background 160ms ease}
      .task-person-row{transition:background 140ms ease,transform 140ms ease}
      .task-person-row:hover{background:rgba(127,127,127,.10);transform:translateX(2px)}
      .tk-tabs{display:flex;gap:4px;background:${T.panelAlt};border-radius:10px;padding:3px;overflow-x:auto;scrollbar-width:none;max-width:100%}
      .tk-tabs::-webkit-scrollbar{display:none}
      .tk-row{transition:background 120ms ease}
      .tk-row:hover{background:${T.rowHover}}
      .tk-prop{display:grid;grid-template-columns:150px minmax(0,1fr);align-items:center;gap:8px;min-height:36px}
      .tk-prop-label{display:flex;align-items:center;gap:8px;font-size:12.5px;color:${T.textMuted}}
      .tk-ghost-input{background:transparent!important;border-color:transparent!important}
      .tk-ghost-input:hover{background:${T.panelAlt}!important}
      .tk-ghost-input:focus{background:${T.input}!important;border-color:${T.border}!important}
      .tk-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
      .tk-cal-day{min-height:92px}
      .tk-cal-dots{display:none}
      /* ── movimento extra (10/2026, "mais fluido") ── */
      @keyframes tk-page-in{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
      .tk-page{animation:tk-page-in 340ms cubic-bezier(.2,.8,.2,1) both}
      @keyframes tk-item-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
      .tk-item-in{animation:tk-item-in 240ms cubic-bezier(.2,.8,.2,1) both}
      @keyframes tk-flash{0%{box-shadow:0 0 0 0 ${T.accent}88}60%{box-shadow:0 0 0 6px ${T.accent}00}100%{box-shadow:0 0 0 0 ${T.accent}00}}
      .tk-card.tk-flash{animation:tk-card-in 320ms cubic-bezier(.2,.8,.2,1) both,tk-flash 900ms ease-out 120ms}
      @keyframes tk-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
      .tk-bar{transform-origin:left;animation:tk-grow 700ms cubic-bezier(.2,.8,.2,1) both}
      .tk-tab-pill{position:absolute;top:3px;bottom:3px;border-radius:7px;background:${T.panel};box-shadow:0 1px 4px rgba(0,0,0,.18);transition:transform 360ms cubic-bezier(.34,1.25,.64,1),width 360ms cubic-bezier(.34,1.25,.64,1);pointer-events:none}
      .tk-collapse{display:grid;grid-template-rows:0fr;transition:grid-template-rows 300ms cubic-bezier(.2,.8,.2,1),opacity 220ms ease;opacity:0}
      .tk-collapse.open{grid-template-rows:1fr;opacity:1}
      .tk-collapse > div{overflow:hidden;min-height:0}
      .tk-check{appearance:none;-webkit-appearance:none;width:18px;height:18px;border-radius:5px;border:1.6px solid ${T.textFaint};background:transparent;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background 180ms ease,border-color 180ms ease,transform 180ms cubic-bezier(.34,1.56,.64,1);margin:0}
      .tk-check:checked{background:${T.accent};border-color:${T.accent};transform:scale(1.08)}
      .tk-check:checked::after{content:"";width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:translateY(-1px) rotate(45deg);animation:tk-tick 260ms cubic-bezier(.34,1.56,.64,1) both}
      .tk-check:active{transform:scale(.88)}
      @keyframes tk-tick{from{opacity:0;transform:translateY(-1px) rotate(45deg) scale(.3)}to{opacity:1;transform:translateY(-1px) rotate(45deg) scale(1)}}
      .tk-done-text{background-image:linear-gradient(currentColor,currentColor);background-repeat:no-repeat;background-position:0 55%;background-size:0 1.5px;transition:background-size 300ms cubic-bezier(.2,.8,.2,1),color 220ms ease}
      .tk-done-text.done{background-size:100% 1.5px}
      @keyframes tk-cal-l{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:none}}
      @keyframes tk-cal-r{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
      .tk-cal-anim-l{animation:tk-cal-l 280ms cubic-bezier(.2,.8,.2,1) both}
      .tk-cal-anim-r{animation:tk-cal-r 280ms cubic-bezier(.2,.8,.2,1) both}
      .tk-col.tk-drop{background:${T.accent}0d!important;transform:scale(1.01)}
      .tk-col{transition:border-color 160ms ease,background 160ms ease,transform 200ms cubic-bezier(.2,.8,.2,1)}
      @media (max-width:640px){
        .tk-prop{grid-template-columns:118px minmax(0,1fr)}
        .tk-cal-day{min-height:52px}
        .tk-cal-items{display:none}
        .tk-cal-dots{display:flex}
      }
    `}</style>
  );
}

export function EmptyState({ T, icon: Icon, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "30px 16px", color: T.textFaint, textAlign: "center" }}>
      <Icon size={26} strokeWidth={1.6} />
      <div style={{ fontSize: 12 }}>{children}</div>
    </div>
  );
}
