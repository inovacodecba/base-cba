// Base do mapa de satélite usada pelo NetworkMap (Equipamentos de Rede) — os
// pinos ficam sobre uma imagem de satélite ao vivo (Esri World Imagery,
// gratuito, sem chave/conta — nunca embutimos uma cópia estática por causa
// dos termos de uso e direitos de imagem do Google/Esri). Fatorado num módulo
// próprio (tile layer, enquadramento inicial, algoritmo de rótulos sem
// sobreposição) porque também serviu o antigo modo "Áreas" (`PlantMap.jsx`,
// removido a pedido do usuário — só ficou "Equipamentos de Rede"); mantido
// separado do NetworkMap caso um modo baseado em mapa volte a existir.
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export const SAT_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SAT_ATTRIBUTION = "Tiles &copy; Esri — Esri, Maxar, Earthstar Geographics";
// Zoom máximo com cobertura de satélite confiável pra região da planta —
// acima disso o Esri costuma não ter imagem (tile em branco), por isso o
// Leaflet nunca pede além desse nível.
export const SAT_MAX_ZOOM = 18;

// Extensão conhecida da planta (extraída dos ~87 pontos de rede importados
// do KML do usuário) — usada como enquadramento inicial de qualquer mapa da
// planta, pra sempre abrir centralizado no lugar certo mesmo antes de
// qualquer pino específico ser posicionado.
export const PLANT_CENTER = [-23.5296, -47.2674];
export const PLANT_BOUNDS = [[-23.5476, -47.2791], [-23.5116, -47.2556]];

export function createSatelliteMap(container, T, opts = {}) {
  const map = L.map(container, { zoomControl: true, attributionControl: true, minZoom: 13, ...opts });
  // Tile de fallback (mesma cor de fundo do app) para quando um tile pontual
  // não existir na cobertura do Esri — em vez de branco, funde com o tema.
  const errorTile = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${T.input}"/></svg>`)}`;
  L.tileLayer(SAT_TILE_URL, {
    attribution: SAT_ATTRIBUTION,
    maxZoom: SAT_MAX_ZOOM,
    maxNativeZoom: SAT_MAX_ZOOM,
    errorTileUrl: errorTile,
  }).addTo(map);
  return map;
}

// CSS compartilhado dos dois mapas (tooltip, cores do tema nos controles).
// `scope` é a classe própria de cada mapa (ex.: "nm-map", "pm-map") pra não
// vazar estilo de um pro outro se algum dia os dois estiverem na tela juntos.
export function satelliteMapCss(T, scope) {
  return `
    .${scope}-tooltip{ background:${T.panel}; color:${T.textBright}; border:1px solid ${T.border}; font-family:inherit; font-size:10.5px; font-weight:600; padding:2px 6px; border-radius:4px; box-shadow:none; pointer-events:none; }
    .${scope}-tooltip::before{ display:none; }
    .${scope}.leaflet-container{ background:${T.input}; font-family:inherit; }
    .${scope} .leaflet-control-attribution{ background:${T.panel}CC; color:${T.textFaint}; font-size:9px; }
    .${scope} .leaflet-control-attribution a{ color:${T.textMuted}; }
    .${scope} .leaflet-control-zoom a{ background:${T.panel}; color:${T.text}; border-color:${T.border}!important; }
  `;
}

// Estimativa da caixa (em pixels de tela) que um rótulo permanente vai
// ocupar, dado texto/direção/offset do tooltip — usada só pra decidir
// colisão (não precisa ser pixel-perfeita, só consistente o bastante pra
// comparar duas caixas). Medido a partir do CSS real dos tooltips
// (`satelliteMapCss`: fonte 10.5px peso 600, padding 2px 6px, borda 1px):
// ~6.1px por caractere é a média empírica pra essa fonte/peso.
const LABEL_CHAR_PX = 6.1;
const LABEL_PAD_X = 12; // padding horizontal (6px de cada lado)
const LABEL_H = 18; // altura ~ fonte + padding + borda

function labelBox(pt, text, direction, offset) {
  const w = text.length * LABEL_CHAR_PX + LABEL_PAD_X;
  const ox = offset?.x ?? 0, oy = offset?.y ?? 0;
  switch (direction) {
    case "left": return { x0: pt.x - ox - w, x1: pt.x - ox, y0: pt.y + oy - LABEL_H / 2, y1: pt.y + oy + LABEL_H / 2 };
    case "top": return { x0: pt.x - w / 2, x1: pt.x + w / 2, y0: pt.y - LABEL_H, y1: pt.y };
    case "bottom": return { x0: pt.x - w / 2, x1: pt.x + w / 2, y0: pt.y, y1: pt.y + LABEL_H };
    default: return { x0: pt.x + ox, x1: pt.x + ox + w, y0: pt.y + oy - LABEL_H / 2, y1: pt.y + oy + LABEL_H / 2 }; // "right"
  }
}

function boxesOverlap(a, b, gapPx) {
  return a.x0 - gapPx < b.x1 && a.x1 + gapPx > b.x0 && a.y0 - gapPx < b.y1 && a.y1 + gapPx > b.y0;
}

// Fecha o rótulo de quem colidiria visualmente com outro já aceito,
// priorizando o marcador selecionado (`selectedKey`). Usado pelos ~87 pontos
// do NetworkMap, com `zoomThreshold` pra não poluir de longe (sem threshold,
// tenta sempre mostrar e só esconde quem realmente colide — comportamento
// que também serviu o antigo modo "Áreas", com poucos pinos).
//
// Abaixo do `zoomThreshold`, só o marcador selecionado (se houver) mantém o
// rótulo aberto — os demais ficam só como cor, sem nome, pra não poluir a
// visão de longe. O selecionado NUNCA some por causa do zoom (só clicando
// nele já garante ver o nome, não importa o quão zoom-out o mapa esteja).
//
// BUG corrigido: a colisão usava só a distância em linha reta entre os
// pontos (`minGapPx`, um raio fixo de 46px), ignorando de que lado o rótulo
// realmente se estende (`direction`/`offset` do tooltip). Isso subestimava
// a colisão real quando dois tooltips se estendiam pro mesmo lado (sempre
// "right" antes) e SUPERESTIMAVA quando dois pontos ficavam fisicamente a
// poucos metros um do outro (comum: um totem e o Amplimax dele ficam lado a
// lado por design) — nesse caso nenhum zoom, nem o máximo do mapa, separa
// os pontos o bastante pra escapar de um raio fixo de 46px, então um dos
// dois nunca aparecia, não importa o quanto o usuário desse zoom. Corrigido
// calculando a caixa real de cada rótulo (texto + direção + offset, ver
// `labelBox`) e testando sobreposição de caixa contra caixa — mais preciso,
// e junto com `NetworkMap.jsx` atribuindo uma direção diferente por tipo de
// equipamento (totem/amplimax/impressora/caixa de baixa cada um pra um lado
// do pino), a maioria dos pares fisicamente colados agora cabe lado a lado
// em vez de brigar pelo mesmo espaço.
export function declutterLabels(map, markersMap, { selectedKey, zoomThreshold, gapPx = 3 } = {}) {
  const belowThreshold = zoomThreshold != null && map.getZoom() < zoomThreshold;
  const entries = [...markersMap.entries()].sort(([k]) => (k === selectedKey ? -1 : 0));
  const accepted = [];
  entries.forEach(([k, marker]) => {
    if (belowThreshold && k !== selectedKey) { marker.closeTooltip(); return; }
    const tooltip = marker.getTooltip();
    if (!tooltip) return;
    const pt = map.latLngToContainerPoint(marker.getLatLng());
    const box = labelBox(pt, tooltip.getContent(), tooltip.options.direction, tooltip.options.offset);
    const collides = accepted.some(b => boxesOverlap(box, b, gapPx));
    if (collides) marker.closeTooltip();
    else { marker.openTooltip(); accepted.push(box); }
  });
}
