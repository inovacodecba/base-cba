// Componentes de apresentação pequenos e reutilizáveis, usados tanto pelo
// App.jsx (telas de Inventário/Movimentações/modais) quanto pelo novo
// Dashboard. Extraídos do App.jsx original — comportamento inalterado.
import { useEffect, useRef } from "react";
import { ArrowUp, ArrowDown, ArrowLeftRight, ArrowUpDown, Circle } from "lucide-react";
import { CAT_COLOR } from "../constants.js";
import { SC } from "../constants.js";

export function Overlay({ onClose, children, wide, T }) {
  const panelRef = useRef(null);
  // Foca o painel só na MONTAGEM do modal (deps vazias) — não a cada
  // re-render, senão digitar em qualquer campo dentro do modal (que causa
  // re-render do App) roubaria o foco de volta do input a cada tecla.
  useEffect(() => { panelRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: T.overlay, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "overlay-in 150ms ease" }} onClick={onClose}>
      <style>{`@keyframes overlay-in{from{opacity:0}to{opacity:1}}@keyframes panel-in{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{ background: T.panel, borderRadius: 10, padding: "20px 22px 24px", width: "100%", maxWidth: wide ? 640 : 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.5)", animation: "panel-in 180ms ease", outline: "none" }}
      >
        {children}
      </div>
    </div>
  );
}

// `color` é opcional — quando informado (ex.: via `catColor()` no App.jsx,
// que também cobre categorias criadas dinamicamente pela equipe), tem
// prioridade sobre o mapa fixo CAT_COLOR, que só conhece as categorias
// originais e serve de fallback de segurança.
export function CategoryBadge({ c, T, onClick, active, color: colorProp }) {
  const color = colorProp || CAT_COLOR[c] || CAT_COLOR["Diversos"];
  return <span onClick={onClick} style={{
    display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700,
    padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap",
    background: active ? color : `${color}16`, color: active ? "#fff" : color,
    border: `1px solid ${active ? color : color + "30"}`,
    cursor: onClick ? "pointer" : "default",
  }}>{c}</span>;
}

export function StatusDot({ s, T }) {
  const sc = SC[s] || SC.operacional;
  const dot = T.isLight ? sc.dot.light : sc.dot.dark;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: T.textMuted }}>
    <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0, display: "inline-block" }} />
    {sc.label}
  </span>;
}

export function SortTh({ col, label, align, invSort, setInvSort, T }) {
  const active = invSort.col === col;
  const Icon = active ? (invSort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return <th onClick={() => setInvSort(p => p.col === col ? { col, dir: p.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" })}
    style={{ padding: "9px 12px", textAlign: align || "left", fontSize: 10, fontWeight: 700, color: active ? T.accent : T.textFaint, textTransform: "uppercase", letterSpacing: .7, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", background: T.th, borderBottom: `1px solid ${T.border}` }}>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{label}<Icon size={11} strokeWidth={2.5} style={{ opacity: active ? 1 : .35 }} /></span>
  </th>;
}

export function DirIcon({ dir, size = 12 }) {
  return dir === "entrada" ? <ArrowUp size={size} strokeWidth={2.5} /> : dir === "transferencia" ? <ArrowLeftRight size={size} strokeWidth={2.5} /> : dir === "status" ? <Circle size={size - 4} fill="currentColor" /> : <ArrowDown size={size} strokeWidth={2.5} />;
}
