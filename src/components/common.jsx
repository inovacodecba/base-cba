// Componentes de apresentação pequenos e reutilizáveis, usados tanto pelo
// App.jsx (telas de Inventário/Movimentações/modais) quanto pelo novo
// Dashboard. Extraídos do App.jsx original — comportamento inalterado.
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, ArrowDown, ArrowLeftRight, ArrowUpDown, Circle } from "lucide-react";
import { CAT_COLOR } from "../constants.js";
import { SC } from "../constants.js";

// Animações do modal (10/2026): no desktop ele surge com um leve "pulo"; no
// celular (≤640px) vira uma gaveta que sobe de baixo, igual app nativo.
// Fechar tocando fora ou no Esc toca a animação de saída antes de sumir
// (fechar por botão de dentro do modal continua instantâneo — quem fecha
// ali é o App, que desmonta o modal direto).
const OVERLAY_CSS = `
  @keyframes ov-fade-in{from{opacity:0}to{opacity:1}}
  @keyframes ov-fade-out{from{opacity:1}to{opacity:0}}
  @keyframes ov-pop-in{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}
  @keyframes ov-pop-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(8px) scale(.97)}}
  @keyframes ov-sheet-in{from{transform:translateY(100%)}to{transform:none}}
  @keyframes ov-sheet-out{from{transform:none}to{transform:translateY(100%)}}
  .ov-backdrop{animation:ov-fade-in 200ms ease both}
  .ov-backdrop.ov-closing{animation:ov-fade-out 180ms ease both}
  .ov-panel{animation:ov-pop-in 280ms cubic-bezier(.34,1.4,.64,1) both}
  .ov-closing .ov-panel{animation:ov-pop-out 180ms ease both}
  .ov-grip{display:none}
  @media (max-width:640px){
    .ov-backdrop{align-items:flex-end!important;padding:0!important}
    .ov-panel{max-width:100%!important;border-radius:18px 18px 0 0!important;max-height:88vh!important;padding-bottom:calc(24px + env(safe-area-inset-bottom,0px))!important;animation:ov-sheet-in 340ms cubic-bezier(.2,.8,.2,1) both}
    .ov-closing .ov-panel{animation:ov-sheet-out 220ms ease-in both}
    .ov-grip{display:block}
  }
`;

export function Overlay({ onClose, children, wide, T }) {
  const panelRef = useRef(null);
  const [closing, setClosing] = useState(false);
  // Foca o painel só na MONTAGEM do modal (deps vazias) — não a cada
  // re-render, senão digitar em qualquer campo dentro do modal (que causa
  // re-render do App) roubaria o foco de volta do input a cada tecla.
  useEffect(() => { panelRef.current?.focus({ preventScroll: true }); }, []);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []); // se o App já desmontou o modal (ex.: Esc tratado lá), não chama onClose de novo
  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(onClose, 200);
  }, [closing, onClose]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  // Portal no <body>: telas com animação (transform) viram a "caixa" do
  // position:fixed — sem isso o modal ficava preso dentro da tela e as abas
  // apareciam por cima dele (bug visto na Linha do tempo, 23/10/2026).
  return createPortal(
    <div className={`ov-backdrop${closing ? " ov-closing" : ""}`} style={{ position: "fixed", inset: 0, background: T.overlay, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: T.text }} onClick={close}>
      <style>{OVERLAY_CSS}</style>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="ov-panel"
        onClick={e => e.stopPropagation()}
        style={{ background: T.panel, borderRadius: 14, padding: "20px 22px 24px", width: "100%", maxWidth: wide ? 640 : 520, maxHeight: "90vh", overflowY: "auto", overflowX: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.5)", outline: "none" }}
      >
        <div className="ov-grip" style={{ width: 38, height: 4, borderRadius: 2, background: T.border, margin: "-8px auto 14px" }} />
        {children}
      </div>
    </div>,
    document.body
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
