// Peças visuais reutilizáveis do novo Dashboard: tile de estatística, card
// de painel com cabeçalho, e um donut chart em SVG puro (sem dependência
// externa de gráficos).
import { TrendingUp, TrendingDown } from "lucide-react";

export function PanelCard({ T, title, action, onAction, children, style }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", ...style }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.textBright }}>{title}</span>
        {action && <button onClick={onAction} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>{action}</button>}
      </div>
      {children}
    </div>
  );
}

export function StatTile({ T, icon: Icon, label, value, sub, color, onClick, trend }) {
  return (
    <div
      onClick={onClick}
      className="stat-tile"
      style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 16px", cursor: onClick ? "pointer" : "default", boxShadow: T.shadow, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, transition: "border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease" }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = color || T.accent; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 4px 14px -4px ${(color || T.accent)}40`; } }}
      onMouseLeave={e => { if (onClick) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = T.shadow; } }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {Icon && (
          <span style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}18`, color }}>
            <Icon size={14} strokeWidth={2.25} />
          </span>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: color || T.textBright, lineHeight: 1 }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minHeight: 14 }}>
        {sub && <div style={{ fontSize: 11, color: T.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
        {trend && trend.value !== 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, fontWeight: 700, color: trend.value > 0 ? "#22c55e" : "#ef4444", flexShrink: 0, fontFamily: "'DM Mono',monospace" }}>
            {trend.value > 0 ? <TrendingUp size={11} strokeWidth={2.5} /> : <TrendingDown size={11} strokeWidth={2.5} />}
            {trend.value > 0 ? "+" : ""}{trend.value}
          </div>
        )}
      </div>
    </div>
  );
}

// Donut chart em SVG puro. `data` é [{label, value, color}]. Sempre vem
// acompanhado de uma legenda com rótulo + valor (nunca só cor) — ver skill
// de dataviz: identidade nunca depende só de cor.
export function DonutChart({ T, data, size = 132, thickness = 16, centerLabel, centerValue }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 ? 2 : 0;
  let acc = 0;
  const segments = total > 0 ? data.filter(d => d.value > 0).map(d => {
    const len = Math.max(0, (d.value / total) * c - gap);
    const seg = { ...d, offset: acc };
    acc += (d.value / total) * c;
    return { ...seg, len };
  }) : [];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.borderSoft} strokeWidth={thickness} />
            {segments.map((s, i) => (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${s.len} ${c - s.len}`}
                strokeDashoffset={-s.offset}
                strokeLinecap="butt"
              />
            ))}
          </g>
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: T.textBright, lineHeight: 1.1 }}>{centerValue}</div>
          {centerLabel && <div style={{ fontSize: 9, color: T.textFaint, marginTop: 3, maxWidth: size - 30 }}>{centerLabel}</div>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1, minWidth: 140 }}>
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
              <span style={{ color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
              <span style={{ color: T.textFaint, fontFamily: "'DM Mono',monospace" }}>{d.value} <span style={{ opacity: .7 }}>({pct}%)</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
