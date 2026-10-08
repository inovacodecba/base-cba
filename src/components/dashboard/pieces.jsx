// Peças visuais reutilizáveis do Dashboard (e reaproveitadas por outras
// telas — Configurações, Em Uso, Alertas — então qualquer mudança aqui tem
// que continuar funcionando sem os novos props opcionais, que só enriquecem
// quem passar `icon`/`delay`): tile de estatística, card de painel com
// cabeçalho, e um donut chart em SVG puro (sem dependência externa de
// gráficos).
//
// Reskin "painel analytics" (10/2026): pedido do usuário foi aproximar a
// Visão Geral da estética de um dashboard tipo SaaS (cards escuros
// arredondados, badges de tendência em pílula, números que "contam" ao
// entrar, anel do donut desenhando-se) — sem inventar elementos que não têm
// função aqui (sem busca fake, sem bandeira de país, sem tabela de
// campanha) e sem quebrar os outros lugares que já usam essas peças.
import { useEffect, useRef, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

// Conta de 0 até `target` com easing — usado pelos números grandes (StatTile
// e centro do donut) pra dar uma sensação de "painel vivo" sem precisar de
// nenhuma lib de animação. Refaz a contagem sempre que `target` muda (ex.:
// filtro diferente), o que também funciona como um feedback visual de que
// o número realmente atualizou.
function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(0);
  const prevTarget = useRef(0);
  useEffect(() => {
    if (typeof target !== "number" || !isFinite(target)) { setVal(target); return; }
    const from = prevTarget.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevTarget.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// Flag que vira `true` um instante depois da montagem — usado pra animar
// "de 0 até o valor final" em propriedades (como o anel do donut) que
// precisam existir primeiro no estado inicial pra depois transicionar.
// Dois rAF encadeados garantem que o estado inicial foi pintado antes da
// troca; ambos são cancelados se o componente desmontar no meio.
export function useMountedAfterPaint() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raf2;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
  }, []);
  return ready;
}

export function PanelCard({ T, title, icon: Icon, iconColor, action, onAction, children, style, delay = 0 }) {
  return (
    <div className="pc-card" style={{ animationDelay: `${delay}ms`, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", ...style }}>
      <style>{`
        @keyframes pc-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .pc-card{animation:pc-in 380ms cubic-bezier(.2,.8,.2,1) both}
        .pc-action{transition:background 140ms ease,transform 140ms ease}
        .pc-action:hover{transform:translateY(-1px)}
        .pc-action:active{transform:translateY(0) scale(.96)}
      `}</style>
      <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && (
            <span style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${iconColor || T.accent}18`, color: iconColor || T.accent }}>
              <Icon size={13} strokeWidth={2.25} />
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: T.textBright }}>{title}</span>
        </span>
        {action && (
          <button onClick={onAction} className="pc-action" style={{ fontSize: 10.5, fontWeight: 700, color: T.accent, background: `${T.accent}14`, border: "none", borderRadius: 999, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>{action}</button>
        )}
      </div>
      {children}
    </div>
  );
}

export function StatTile({ T, icon: Icon, label, value, sub, color, onClick, trend, delay = 0 }) {
  const shown = useCountUp(value);
  return (
    <div
      onClick={onClick}
      className="stat-tile st-in"
      style={{ animationDelay: `${delay}ms`, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", cursor: onClick ? "pointer" : "default", boxShadow: T.shadow, display: "flex", flexDirection: "column", gap: 9, minWidth: 0, transition: "border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease" }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = color || T.accent; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 20px -6px ${(color || T.accent)}45`; } }}
      onMouseLeave={e => { if (onClick) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = T.shadow; } }}
    >
      <style>{`@keyframes st-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.st-in{animation:st-in 380ms cubic-bezier(.2,.8,.2,1) both}`}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {Icon && (
          <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}18`, color }}>
            <Icon size={14} strokeWidth={2.25} />
          </span>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: color || T.textBright, lineHeight: 1 }}>{shown}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minHeight: 18 }}>
        {sub && <div style={{ fontSize: 11, color: T.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
        {trend && trend.value !== 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, flexShrink: 0, fontFamily: "'DM Mono',monospace",
            color: trend.value > 0 ? "#16a34a" : "#ef4444", background: trend.value > 0 ? "#16a34a1c" : "#ef44441c", borderRadius: 999, padding: "2px 7px",
          }}>
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
// de dataviz: identidade nunca depende só de cor. O anel "desenha" do zero
// até o valor real ao montar (só decorativo — os ângulos finais são sempre
// os reais, a animação não distorce nenhum dado).
export function DonutChart({ T, data, size = 132, thickness = 16, centerLabel, centerValue }) {
  const ready = useMountedAfterPaint();
  const shownCenter = useCountUp(centerValue);
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
                strokeDasharray={ready ? `${s.len} ${c - s.len}` : `0 ${c}`}
                strokeDashoffset={-s.offset}
                strokeLinecap="butt"
                style={{ transition: `stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)`, transitionDelay: `${i * 90}ms` }}
              />
            ))}
          </g>
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: T.textBright, lineHeight: 1.1 }}>{shownCenter}</div>
          {centerLabel && <div style={{ fontSize: 9, color: T.textFaint, marginTop: 3, maxWidth: size - 30 }}>{centerLabel}</div>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1, minWidth: 140 }}>
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: ready ? 1 : 0, transform: ready ? "translateX(0)" : "translateX(-4px)", transition: `opacity 320ms ease, transform 320ms ease`, transitionDelay: `${150 + i * 60}ms` }}>
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

// Gráfico de linha em SVG puro (mesmo princípio do DonutChart acima: sem
// lib externa de gráficos). `series` é [{label, color, points:number[]}],
// todas com o mesmo tamanho de `labels` (eixo X). O traçado "desenha" com
// stroke-dashoffset ao montar via `pathLength=1` (truque que normaliza o
// comprimento do path pra 1, então a animação funciona igual independente
// do tamanho real da linha) — só decorativo, os valores plotados nunca são
// alterados pela animação.
export function LineChart({ T, series, labels, height = 160 }) {
  const ready = useMountedAfterPaint();
  const width = 600; // viewBox fixo; escala de verdade via width:100% no SVG
  const padY = 10;
  const max = Math.max(1, ...series.flatMap(s => s.points));
  const n = labels.length;
  const stepX = n > 1 ? width / (n - 1) : width;
  const toY = v => padY + (1 - v / max) * (height - padY * 2);
  const toX = i => i * stepX;
  const pathFor = pts => pts.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const areaFor = pts => `${pathFor(pts)} L${toX(pts.length - 1).toFixed(1)},${height} L0,${height} Z`;
  const labelEvery = Math.max(1, Math.ceil(n / 8)); // no máximo ~8 rótulos no eixo X, pra não embolar em telas pequenas

  return (
    <div style={{ padding: "14px 16px 16px" }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible", display: "block" }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`lc-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke={T.borderSoft} strokeWidth={1} />
        ))}
        {series.map((s, i) => (
          <g key={i}>
            <path d={areaFor(s.points)} fill={`url(#lc-grad-${i})`} opacity={ready ? 1 : 0} style={{ transition: "opacity 500ms ease", transitionDelay: `${i * 130 + 250}ms` }} />
            <path
              d={pathFor(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={ready ? 0 : 1}
              style={{ transition: "stroke-dashoffset 850ms cubic-bezier(.2,.8,.2,1)", transitionDelay: `${i * 130}ms` }}
            />
            {s.points.map((v, pi) => (
              <circle key={pi} cx={toX(pi)} cy={toY(v)} r={2.6} fill={s.color} opacity={ready ? 1 : 0} style={{ transition: "opacity 260ms ease", transitionDelay: `${850 + i * 130}ms` }} />
            ))}
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {labels.map((l, i) => (
          <span key={i} style={{ fontSize: 9, color: T.textFaint, visibility: i % labelEvery === 0 || i === n - 1 ? "visible" : "hidden" }}>{l}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {series.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textMuted }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
