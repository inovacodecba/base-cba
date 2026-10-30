// Utilidades do Mapa de equipamentos v2 (30/10/2026): ícones por tipo,
// distâncias, agrupamento ("cluster") e preferências salvas de camadas.
// Separado do NetworkMap.jsx pra o componente ficar só com a tela.

// Ícones (SVG simples, traço branco) — um por tipo de equipamento.
const SVG = (paths) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
export const TIPO_ICON = {
  totem: SVG('<rect x="8" y="2.5" width="8" height="15" rx="1.6"/><path d="M5.5 21h13"/><path d="M12 6.5v4.5"/>'),
  amplimax: SVG('<path d="M12 11.5V21"/><circle cx="12" cy="9.5" r="1.4" fill="#fff"/><path d="M8.6 6.1a4.8 4.8 0 0 0 0 6.8"/><path d="M15.4 6.1a4.8 4.8 0 0 1 0 6.8"/><path d="M5.8 3.3a8.8 8.8 0 0 0 0 12.4"/><path d="M18.2 3.3a8.8 8.8 0 0 1 0 12.4"/>'),
  impressora: SVG('<path d="M6.5 9V3h11v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
  caixa_baixa: SVG('<path d="M21 7.5 12 3 3 7.5v9L12 21l9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5"/><path d="M12 12v9"/>'),
  outro: SVG('<circle cx="12" cy="12" r="5"/>'),
};

// Distância em metros entre dois pontos {lat, lng} (fórmula de haversine).
export function distM(a, b) {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`);

// Amplimax mais próximo de cada totem: Map(keyDoTotem -> { amp, d }).
export function nearestAmplimax(equips, keyOf) {
  const amps = equips.filter(e => e.tipo === "amplimax");
  const out = new Map();
  equips.forEach(e => {
    if (e.tipo !== "totem" || !amps.length) return;
    let best = null;
    amps.forEach(a => { const d = distM(e, a); if (!best || d < best.d) best = { amp: a, d }; });
    out.set(keyOf(e), best);
  });
  return out;
}

// Agrupa pontos que ficariam a menos de `radiusPx` um do outro na tela.
// Guloso e simples (são ~100 pontos): o primeiro ainda livre puxa todos os
// vizinhos dentro do raio. Devolve listas de itens.
export function clusterize(map, items, radiusPx) {
  const pts = items.map(e => ({ e, p: map.latLngToLayerPoint([e.lat, e.lng]) }));
  const used = new Array(pts.length).fill(false);
  const groups = [];
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const g = [pts[i].e];
    for (let j = i + 1; j < pts.length; j++) {
      if (used[j]) continue;
      if (pts[i].p.distanceTo(pts[j].p) < radiusPx) { used[j] = true; g.push(pts[j].e); }
    }
    groups.push(g);
  }
  return groups;
}

// Camadas do mapa (liga/desliga) — ficam salvas no aparelho de quem usa.
export const LAYERS_DEFAULT = { nomes: true, agrupar: true, alcance: false, ligacoes: false, ocorrencias: true };
const LAYERS_KEY = "nm2-layers";
export function loadLayers() {
  try { return { ...LAYERS_DEFAULT, ...JSON.parse(localStorage.getItem(LAYERS_KEY) || "{}") }; } catch { return { ...LAYERS_DEFAULT }; }
}
export function saveLayers(l) { try { localStorage.setItem(LAYERS_KEY, JSON.stringify(l)); } catch { /* sem storage: só não lembra */ } }
export function loadRaio() { try { return Number(localStorage.getItem("nm2-raio")) || 80; } catch { return 80; } }
export function saveRaio(r) { try { localStorage.setItem("nm2-raio", String(r)); } catch { /* idem */ } }

export const CATEGORIAS = {
  veicular: { label: "Monitoramento veicular", short: "Veicular", color: "#2563eb" },
  materiais: { label: "Movimentação de materiais", short: "Materiais", color: "#f97316" },
};
