// Tema (claro/escuro) + cor de destaque (accent) e helpers de estilo inline
// compartilhados por App.jsx e pelos componentes (layout/dashboard/etc).
export const ACCENT_PRESETS = [
  { key: "iris", label: "Íris", dark: "#8c66ff", light: "#6425e0" },
  { key: "blue", label: "Azul", dark: "#4f86f7", light: "#2563eb" },
  { key: "purple", label: "Roxo", dark: "#a78bfa", light: "#7c3aed" },
  { key: "amber", label: "Âmbar", dark: "#f5a524", light: "#d97706" },
  { key: "green", label: "Verde", dark: "#4ade80", light: "#16a34a" },
  { key: "rose", label: "Rosa", dark: "#fb7185", light: "#e11d48" },
  { key: "cyan", label: "Ciano", dark: "#22d3ee", light: "#0891b2" },
];
const ACCENT_DEFAULT = "iris";

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function relLuminance(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substring(i, i + 2), 16) / 255);
  const lin = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(hexA, hexB) {
  const [l1, l2] = [relLuminance(hexA), relLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
export function bestTextOn(bg) {
  const white = "#ffffff", nearBlack = "#0b0d12";
  return contrastRatio(bg, white) >= contrastRatio(bg, nearBlack) ? white : nearBlack;
}

export function getTheme(theme, accentKey = ACCENT_DEFAULT) {
  const preset = ACCENT_PRESETS.find(p => p.key === accentKey) || ACCENT_PRESETS[0];
  const isLight = theme === "light";
  const accent = isLight ? preset.light : preset.dark;
  const rowHover = hexToRgba(accent, isLight ? .04 : .05);
  const base = isLight ? {
    bg: "#f1f2f5", panel: "#ffffff", panelAlt: "rgba(0,0,0,.04)", panelAlt2: "rgba(0,0,0,.06)",
    input: "#f8f9fb", text: "#111318", textBright: "#000", textMuted: "#555b6e", textDim: "#737b8c",
    textFaint: "#5f6779", textGhost: "#7c8494", border: "rgba(0,0,0,.1)", borderSoft: "rgba(0,0,0,.06)",
    hover: "rgba(0,0,0,.04)", overlay: "rgba(0,0,0,.4)", scrollbar: "#c5c8d0",
    shadow: "0 1px 3px rgba(0,0,0,.08)", th: "rgba(0,0,0,.03)",
  } : {
    bg: "#060608", panel: "#0f0f16", panelAlt: "rgba(255,255,255,.04)", panelAlt2: "rgba(255,255,255,.06)",
    input: "#08080c", text: "#d8dae8", textBright: "#eceef8", textMuted: "#8086a0", textDim: "#5c6278",
    textFaint: "#7a8199", textGhost: "#5f6680", border: "rgba(255,255,255,.08)", borderSoft: "rgba(255,255,255,.04)",
    hover: "rgba(255,255,255,.04)", overlay: "rgba(0,0,0,.7)", scrollbar: "#2a2e40",
    shadow: "none", th: "rgba(255,255,255,.02)",
  };
  return { ...base, accent, rowHover, isLight };
}

export function makeStyleHelpers(T) {
  const inp = (ex = {}) => ({ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12, background: T.input, color: T.text, outline: "none", display: "block", fontFamily: "inherit", ...ex });
  const btn = (bg, tx = bestTextOn(bg)) => ({ background: bg, border: "none", color: tx, padding: "6px 13px", borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" });
  const ghost = () => ({ ...btn(T.panelAlt, T.text), border: `1px solid ${T.border}` });
  const sbtn = (c) => ({ background: `${c}14`, border: `1px solid ${c}28`, color: c, padding: "4px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });
  const rowBtn = () => ({ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.textFaint, cursor: "pointer" });
  const rowBtnHover = (c) => ({
    onMouseEnter: e => { e.currentTarget.style.background = `${c}14`; e.currentTarget.style.color = c; e.currentTarget.style.borderColor = `${c}40`; },
    onMouseLeave: e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textFaint; e.currentTarget.style.borderColor = T.border; },
  });
  const mT = { margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: T.textBright };
  return { inp, btn, ghost, sbtn, rowBtn, rowBtnHover, mT };
}
