// Logo "Pulso" (10/2026) — nome novo da plataforma. Símbolo redesenhado a
// partir da arte enviada pelo Rodrigo: uma fita que começa fininha (ondinha
// de batimento), sobe num pico alto e termina num laço em forma de "P",
// mais grossa no laço, com o verso laranja dando volume.
//
// Animação (pedido: "a cobrinha foge do mouse"): a fita é uma corrente de
// pontos presos por mola na posição original. Quando o cursor (ou o dedo,
// no celular) chega perto, os pontos próximos são empurrados pra longe e,
// quando ele sai, voltam balançando pro lugar. Física simples rodando em
// requestAnimationFrame só enquanto há movimento — parado, não gasta nada.
// Quem tem "reduzir movimento" ligado no aparelho vê o logo parado.
import { useEffect, useId, useRef } from "react";

// Caminho central da fita (viewBox -3 -6 124 104), traçado sobre a arte:
// ponta → ondinha → vale → pico alto → vale → sobe no laço → volta → curva
// de baixo → ponta final.
const PATH = "M3 53 C9 52 15 34 21 34 C27 34 26 63 31 63 C37 63 39 3 46 3 C53 3 51 42 57 42 C62 42 68 12 86 10 C104 8 116 22 114 34 C112 48 100 58 86 57 C72 56 62 62 56 74 C52 82 54 90 60 88 C66 86 70 76 70 68";
export const PULSO_VIEWBOX = "-3 -6 124 104";
const N = 96; // pontos da corrente

// Espessura ao longo da fita (t = 0 na ponta esquerda, 1 no fim).
const widthAt = (t) => (
  t < 0.15 ? 2 + (t / 0.15) * 4.2
    : t < 0.5 ? 6.2 + ((t - 0.15) / 0.35) * 5.3
      : t < 0.9 ? 11.5 + ((t - 0.5) / 0.4) * 3
        : 14.5 - ((t - 0.9) / 0.1) * 3.5
);

let REST = null;
// Amostra o caminho em N pontos (precisa do DOM: mede o <path> num SVG oculto).
function restPoints() {
  if (REST) return REST;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden");
  const el = document.createElementNS(NS, "path");
  el.setAttribute("d", PATH);
  svg.appendChild(el);
  document.body.appendChild(svg);
  const len = el.getTotalLength();
  REST = Array.from({ length: N }, (_, i) => { const p = el.getPointAtLength((len * i) / (N - 1)); return { x: p.x, y: p.y }; });
  svg.remove();
  return REST;
}

const f1 = (n) => Math.round(n * 10) / 10;

// Contorno da fita com espessura variável (lado esquerdo → volta pelo direito).
export function ribbonD(pts) {
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const w = widthAt(i / (pts.length - 1)) / 2;
    left.push(`${f1(pts[i].x - ty * w)} ${f1(pts[i].y + tx * w)}`);
    right.push(`${f1(pts[i].x + ty * w)} ${f1(pts[i].y - tx * w)}`);
  }
  return `M${left.join("L")}L${right.reverse().join("L")}Z`;
}
// Linha de brilho fina por cima (só do meio pro fim, onde a fita é grossa).
function sheenD(pts) {
  const s = pts.slice(Math.floor(pts.length * 0.2));
  return `M${s.map(p => `${f1(p.x - 0.8)} ${f1(p.y - 1.6)}`).join("L")}`;
}

export function PulsoMark({ size = 32 }) {
  const uid = `pl${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const svgRef = useRef(null);
  const backRef = useRef(null);
  const frontRef = useRef(null);
  const sheenRef = useRef(null);
  const capRef = useRef(null);
  const capBackRef = useRef(null);

  const rest = restPoints();
  const restD = ribbonD(rest);
  const restSheen = sheenD(rest);
  const last = rest[N - 1];

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pts = rest.map(p => ({ ...p }));
    const vel = rest.map(() => ({ x: 0, y: 0 }));
    const mouse = { x: 0, y: 0, on: false };
    let raf = 0;

    const draw = () => {
      const d = ribbonD(pts);
      frontRef.current?.setAttribute("d", d);
      backRef.current?.setAttribute("d", d);
      sheenRef.current?.setAttribute("d", sheenD(pts));
      const e = pts[N - 1];
      capRef.current?.setAttribute("cx", f1(e.x)); capRef.current?.setAttribute("cy", f1(e.y));
      capBackRef.current?.setAttribute("cx", f1(e.x)); capBackRef.current?.setAttribute("cy", f1(e.y));
    };

    // Raio de "medo" em px de tela, convertido pra unidades do desenho (com
    // teto, senão no logo pequeno do menu a fita fugiria pra longe demais).
    const unitsPerPx = () => 124 / (svg.getBoundingClientRect().width || 124);
    const tick = () => {
      const upp = unitsPerPx();
      const R = Math.min(64 * upp, 42);
      let moving = false;
      for (let i = 0; i < N; i++) {
        const p = pts[i], r = rest[i], v = vel[i];
        let fx = (r.x - p.x) * 0.07, fy = (r.y - p.y) * 0.07;
        if (mouse.on) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y, dist = Math.hypot(dx, dy) || 0.001;
          if (dist < R) { const k = 4.2 * (1 - dist / R) ** 2; fx += (dx / dist) * k; fy += (dy / dist) * k; }
        }
        v.x = (v.x + fx) * 0.8; v.y = (v.y + fy) * 0.8;
      }
      // Suaviza: cada ponto puxa o vizinho, então a fita dobra como uma
      // cobrinha em vez de "amassar" só num ponto.
      for (let i = 0; i < N; i++) {
        const a = vel[Math.max(0, i - 1)], b = vel[Math.min(N - 1, i + 1)], v = vel[i];
        v.sx = v.x * 0.5 + (a.x + b.x) * 0.25; v.sy = v.y * 0.5 + (a.y + b.y) * 0.25;
      }
      for (let i = 0; i < N; i++) {
        const p = pts[i], v = vel[i];
        v.x = v.sx; v.y = v.sy;
        p.x += v.x; p.y += v.y;
        if (Math.abs(v.x) + Math.abs(v.y) > 0.01 || Math.abs(p.x - rest[i].x) + Math.abs(p.y - rest[i].y) > 0.05) moving = true;
      }
      draw();
      if (moving || mouse.on) raf = requestAnimationFrame(tick);
      else { pts.forEach((p, i) => { p.x = rest[i].x; p.y = rest[i].y; }); draw(); raf = 0; }
    };
    const start = () => { if (!raf) raf = requestAnimationFrame(tick); };

    const toSvg = (cx, cy) => {
      const m = svg.getScreenCTM();
      if (!m) return null;
      const pt = new DOMPoint(cx, cy).matrixTransform(m.inverse());
      return { x: pt.x, y: pt.y };
    };
    const near = (cx, cy) => {
      const r = svg.getBoundingClientRect(), pad = 70;
      return cx > r.left - pad && cx < r.right + pad && cy > r.top - pad && cy < r.bottom + pad;
    };
    const onMove = (cx, cy) => {
      if (near(cx, cy)) {
        const p = toSvg(cx, cy);
        if (!p) return;
        mouse.x = p.x; mouse.y = p.y; mouse.on = true; start();
      } else if (mouse.on) { mouse.on = false; start(); }
    };
    const onMouse = (e) => onMove(e.clientX, e.clientY);
    const onTouch = (e) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); };
    const off = () => { if (mouse.on) { mouse.on = false; start(); } };

    window.addEventListener("mousemove", onMouse, { passive: true });
    document.addEventListener("mouseleave", off);
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchend", off);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouse);
      document.removeEventListener("mouseleave", off);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", off);
    };
  }, [rest]);

  const capR = widthAt(1) / 2;
  return (
    <svg ref={svgRef} width={size * 1.19} height={size} viewBox={PULSO_VIEWBOX} fill="none" aria-hidden="true" style={{ overflow: "visible", flexShrink: 0 }}>
      <defs>
        {/* frente: lilás → azul → azul escuro → rosa → laranja (igual à arte) */}
        <linearGradient id={`${uid}-f`} x1="0" y1="50" x2="118" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset=".22" stopColor="#3b82f6" />
          <stop offset=".45" stopColor="#1d4ed8" />
          <stop offset=".62" stopColor="#2563eb" />
          <stop offset=".8" stopColor="#ec4899" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        {/* verso (aparece na borda, dá o efeito de fita torcida) */}
        <linearGradient id={`${uid}-b`} x1="0" y1="0" x2="118" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f472b6" />
          <stop offset=".5" stopColor="#f97316" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      <g transform="translate(1.6 -1.4)">
        <path ref={backRef} d={restD} fill={`url(#${uid}-b)`} />
        <circle ref={capBackRef} cx={last.x} cy={last.y} r={capR} fill={`url(#${uid}-b)`} />
      </g>
      <path ref={frontRef} d={restD} fill={`url(#${uid}-f)`} />
      <circle ref={capRef} cx={last.x} cy={last.y} r={capR} fill={`url(#${uid}-f)`} />
      <path ref={sheenRef} d={restSheen} stroke="#fff" strokeOpacity=".28" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PulsoLogo({ size = 32, color = "#1e293b", gap, fontSize }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: gap ?? size * 0.3, userSelect: "none" }} aria-label="Pulso">
      <PulsoMark size={size} />
      <span style={{ fontSize: fontSize ?? size * 0.82, fontWeight: 800, color, letterSpacing: ".02em", lineHeight: 1, fontFamily: "'DM Sans',sans-serif" }}>PULSO</span>
    </span>
  );
}
