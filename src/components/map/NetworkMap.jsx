// Mapa de Equipamentos v2 (30/10/2026) — pedido do Rodrigo: "um mapa
// fluido, fácil de entender, com funcionalidades úteis", usando como base o
// KMZ do Google My Maps ("Equipamentos e alcançe do amplimax"), que agora
// traz MAC/IP de cada lado dos totens.
//
// O que mudou em relação ao v1:
//  • Mapa ocupa a tela; busca e filtros flutuam em cima; painel ao lado
//    (desktop) ou gaveta embaixo (celular) com visão geral, ocorrências e a
//    ficha do equipamento selecionado.
//  • Ícone próprio por tipo (totem, Amplimax, impressora, caixa de baixa) e
//    agrupamento com contador quando os pontos ficam colados de longe.
//  • Camadas que liga/desliga ("pra deixar mais limpo"): nomes, agrupar,
//    alcance do Amplimax (raio ajustável), ligação totem → Amplimax e
//    destaque de ocorrências. Ficam salvas no aparelho.
//  • Filtro por categoria do totem (Monitoramento veicular / Movimentação
//    de materiais).
//  • Ficha com MAC/IP (copia com um toque), Amplimax mais próximo e a
//    distância, ocorrências e as tarefas ligadas ao equipamento.
//
// Satélite: Esri World Imagery ao vivo (sem chave, só atribuição) — ver
// satelliteMap.js. Leaflet é carregado sob demanda (lazy, no App.jsx).
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Search, X, Layers, Plus, Minus, Crosshair, Download, Tags, ChevronUp, ChevronDown, MapPinPlus } from "lucide-react";
import L from "leaflet";
import { makeStyleHelpers } from "../../theme.js";
import { EQUIP_TIPO } from "../../constants.js";
import { dlCSV } from "../../utils.js";
import { OcorrenciaForm } from "./Ocorrencias.jsx";
import { createSatelliteMap, satelliteMapCss, declutterLabels, PLANT_CENTER, SAT_MAX_ZOOM } from "./satelliteMap.js";
import { TIPO_ICON, clusterize, nearestAmplimax, loadLayers, saveLayers, loadRaio, saveRaio, CATEGORIAS, LAYERS_DEFAULT } from "./mapUtils.js";
import { SidePanel, EquipForm } from "./EquipPanel.jsx";

const TIPO_ORDER = ["totem", "amplimax", "impressora", "caixa_baixa", "outro"];
const TIPO_LABEL_DIR = { totem: "right", amplimax: "left", impressora: "top", caixa_baixa: "bottom", outro: "right" };
const CLUSTER_PX = 38;
const keyOf = (e) => (e.id != null ? `id${e.id}` : `n${e.name}|${e.lat}|${e.lng}`);

const LAYER_INFO = [
  ["nomes", "Nomes dos equipamentos", "Mostra o nome ao lado de cada ponto (de perto)."],
  ["agrupar", "Agrupar pontos próximos", "De longe, junta os pontos colados num círculo com o total."],
  ["alcance", "Alcance do Amplimax", "Círculo de cobertura em volta de cada Amplimax."],
  ["ligacoes", "Ligação totem → Amplimax", "Linha até o Amplimax mais próximo (verde dentro do alcance, laranja fora)."],
  ["ocorrencias", "Destacar ocorrências", "Pisca em vermelho quem tem ocorrência aberta."],
];

export function NetworkMap({ T, sb, equipamentos, onAddEquipamento, onRemoveEquipamento, onUpdateEquipamento, onOpenCadastros, showToast, tasks = [], onCreateTask, onOpenTask, currentUser, focusEquip }) {
  const { inp, ghost } = makeStyleHelpers(T);
  const wrapRef = useRef(null);
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const pinsLayerRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const markersRef = useRef(new Map());
  const shownRef = useRef(new Set()); // o que já estava na tela — só o que é novo faz a animação de entrada
  const addingRef = useRef(null);
  const labelZoomRef = useRef(null);
  const [zoom, setZoom] = useState(16);

  const [layers, setLayersState] = useState(loadLayers);
  const setLayer = (k, v) => setLayersState(p => { const n = { ...p, [k]: v }; saveLayers(n); return n; });
  const [raio, setRaioState] = useState(loadRaio);
  const setRaio = (r) => { setRaioState(r); saveRaio(r); };
  const [showLayers, setShowLayers] = useState(false);

  const [tipos, setTipos] = useState(() => new Set(TIPO_ORDER));
  const [cat, setCat] = useState("todas"); // todas | veicular | materiais
  const [selKey, setSelKey] = useState(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [adding, setAdding] = useState(null); // { ...dados } ou { id, move: true }
  const [form, setForm] = useState(null); // { modo: "novo" | "editar", equip? }
  const [sheet, setSheet] = useState("min"); // celular: min | mid | max
  const [panelOpen, setPanelOpen] = useState(true); // desktop

  // ── ocorrências ──
  const [ocorrencias, setOcorrencias] = useState([]);
  const [formOcorr, setFormOcorr] = useState(null);
  const carregarOcorrencias = useCallback(() => { if (sb) sb("equipamento_ocorrencias?order=created_at.desc&limit=500").then(r => setOcorrencias(r || [])).catch(() => {}); }, [sb]);
  useEffect(() => { carregarOcorrencias(); }, [carregarOcorrencias]);
  const comAberta = useMemo(() => new Set(ocorrencias.filter(o => o.status === "aberta").map(o => o.equipamento_id)), [ocorrencias]);
  const salvarOcorrencia = async (dados) => {
    try { await sb("equipamento_ocorrencias", "POST", dados); showToast?.("Ocorrência registrada"); carregarOcorrencias(); return true; }
    catch (e) { showToast?.(`Erro ao registrar: ${e.message}`, "err"); return false; }
  };
  const mudarStatus = async (o, status) => {
    try { await sb("rpc/ocorrencia_set_status", "POST", { p_id: o.id, p_status: status }); showToast?.(status === "resolvida" ? "Marcada como resolvida" : "Ocorrência reaberta"); carregarOcorrencias(); }
    catch (e) { showToast?.(`Erro: ${e.message}`, "err"); }
  };

  // ── dados derivados ──
  const byKey = useMemo(() => new Map(equipamentos.map(e => [keyOf(e), e])), [equipamentos]);
  const sel = selKey ? byKey.get(selKey) || null : null;
  const visible = useMemo(() => equipamentos.filter(e =>
    tipos.has(e.tipo in EQUIP_TIPO ? e.tipo : "outro") &&
    (cat === "todas" || (e.tipo === "totem" && (e.categorias || []).includes(cat)))
  ), [equipamentos, tipos, cat]);
  const nearest = useMemo(() => nearestAmplimax(equipamentos, keyOf), [equipamentos]);
  const foraDoAlcance = useMemo(() => equipamentos.filter(e => e.tipo === "totem" && (nearest.get(keyOf(e))?.d ?? Infinity) > raio), [equipamentos, nearest, raio]);
  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return equipamentos.filter(e => {
      const macs = (e.dados?.lados || []).map(l => `${l.mac || ""} ${l.ip || ""}`).join(" ");
      return `${e.name} ${e.area} ${macs}`.toLowerCase().includes(q);
    }).slice(0, 8);
  }, [search, equipamentos]);

  const isMobile = () => window.matchMedia?.("(max-width: 760px)").matches;

  const select = useCallback((e, { fly = true } = {}) => {
    if (!e) { setSelKey(null); return; }
    setSelKey(keyOf(e));
    setTipos(p => (p.has(e.tipo) ? p : new Set(p).add(e.tipo)));
    if (cat !== "todas" && !(e.categorias || []).includes(cat)) setCat("todas");
    if (isMobile()) setSheet("mid"); else setPanelOpen(true);
    const map = mapRef.current;
    if (map && fly) {
      // Centraliza na parte do mapa que fica livre: à esquerda do painel
      // (desktop) ou acima da gaveta (celular).
      const z = Math.max(map.getZoom(), SAT_MAX_ZOOM - 1);
      const mob = isMobile();
      const off = mob ? L.point(0, map.getSize().y * 0.22) : L.point(196, 0);
      const alvo = map.unproject(map.project([e.lat, e.lng], z).add(off), z);
      map.flyTo(alvo, z, { duration: 0.7 });
    }
  }, [cat]);

  // Vindo de uma tarefa ("Ver no mapa"): seleciona e voa até o equipamento.
  useEffect(() => {
    if (!focusEquip?.id) return;
    const e = equipamentos.find(x => x.id === focusEquip.id);
    if (e) setTimeout(() => select(e), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEquip, equipamentos.length]);

  // ── mapa: cria uma vez ──
  useEffect(() => {
    const map = createSatelliteMap(mapElRef.current, T, { zoomControl: false });
    map.setView(PLANT_CENTER, 16);
    pinsLayerRef.current = L.layerGroup().addTo(map);
    overlayLayerRef.current = L.layerGroup().addTo(map);
    map.on("click", ev => {
      const a = addingRef.current;
      if (a) {
        if (a.move) onUpdateEquipamento?.(a.id, { lat: ev.latlng.lat, lng: ev.latlng.lng });
        else onAddEquipamento({ ...a, lat: ev.latlng.lat, lng: ev.latlng.lng });
        addingRef.current = null;
        setAdding(null);
        return;
      }
      setSelKey(null);
    });
    map.on("zoomend", () => setZoom(map.getZoom()));
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(mapElRef.current);
    const raf = requestAnimationFrame(() => map.invalidateSize());
    return () => { ro.disconnect(); cancelAnimationFrame(raf); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enquadra a planta toda — descontando o que fica coberto pela busca (em
  // cima), pelo painel (direita, desktop) ou pela gaveta (embaixo, celular).
  const fitPad = useCallback(() => (isMobile()
    ? { paddingTopLeft: [24, 110], paddingBottomRight: [24, 96] }
    : { paddingTopLeft: [40, 100], paddingBottomRight: [panelOpen ? 400 : 70, 40] }), [panelOpen]);
  const recentrar = useCallback(() => {
    const map = mapRef.current;
    if (!map || !equipamentos.length) return;
    const b = L.latLngBounds(equipamentos.map(e => [e.lat, e.lng]));
    map.flyToBounds(b, { ...fitPad(), duration: 0.6 });
  }, [equipamentos, fitPad]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !equipamentos.length) return;
    const b = L.latLngBounds(equipamentos.map(e => [e.lat, e.lng]));
    map.fitBounds(b, { ...fitPad(), animate: false });
    labelZoomRef.current = Math.min(map.getZoom() + 1, SAT_MAX_ZOOM);
    map.setMaxBounds(b.pad(0.8));
    map.setMinZoom(Math.max(13, map.getZoom() - 2));
    setZoom(map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipamentos.length]);

  // ── pinos + agrupamento ──
  useEffect(() => {
    const map = mapRef.current, layer = pinsLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current = new Map();
    const alerta = (e) => layers.ocorrencias && comAberta.has(e.id);
    const fora = (e) => layers.alcance && e.tipo === "totem" && (nearest.get(keyOf(e))?.d ?? Infinity) > raio;
    const agrupar = layers.agrupar && zoom < SAT_MAX_ZOOM;
    const soltos = visible.filter(e => keyOf(e) === selKey);
    const resto = visible.filter(e => keyOf(e) !== selKey);
    const groups = agrupar ? clusterize(map, resto, CLUSTER_PX) : resto.map(e => [e]);
    soltos.forEach(e => groups.push([e]));
    const antes = shownRef.current, agora = new Set();
    const novo = (id) => { agora.add(id); return antes.has(id) ? "" : " in"; };

    groups.forEach(g => {
      if (g.length === 1) {
        const e = g[0], k = keyOf(e);
        const info = EQUIP_TIPO[e.tipo] || EQUIP_TIPO.outro;
        const cls = ["nm2-pin" + novo(k), k === selKey ? "sel" : "", alerta(e) ? "alert" : "", fora(e) ? "far" : ""].join(" ");
        const m = L.marker([e.lat, e.lng], {
          icon: L.divIcon({ className: "", html: `<div class="${cls}" style="--c:${info.color}">${TIPO_ICON[e.tipo] || TIPO_ICON.outro}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
          riseOnHover: true, zIndexOffset: k === selKey ? 1000 : alerta(e) ? 500 : 0,
        });
        m.on("click", ev => { L.DomEvent.stopPropagation(ev); select(e, { fly: false }); });
        m.bindTooltip(e.name, { permanent: true, direction: TIPO_LABEL_DIR[e.tipo] || "right", offset: [12, 0], className: "nm-map-tooltip" });
        m.addTo(layer);
        markersRef.current.set(k, m);
      } else {
        const counts = {};
        g.forEach(e => { counts[e.tipo] = (counts[e.tipo] || 0) + 1; });
        const dots = Object.entries(counts).map(([t, n]) => `<i style="background:${(EQUIP_TIPO[t] || EQUIP_TIPO.outro).color}" title="${n}"></i>`).join("");
        const temAlerta = g.some(alerta);
        const size = g.length >= 10 ? 46 : 40;
        const lat = g.reduce((s, e) => s + e.lat, 0) / g.length, lng = g.reduce((s, e) => s + e.lng, 0) / g.length;
        const m = L.marker([lat, lng], {
          icon: L.divIcon({ className: "", html: `<div class="nm2-cluster${novo("c" + g.map(keyOf).sort().join(","))}${temAlerta ? " alert" : ""}" style="width:${size}px;height:${size}px"><b>${g.length}</b><span>${dots}</span></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
          zIndexOffset: 200,
        });
        m.on("click", ev => {
          L.DomEvent.stopPropagation(ev);
          const b = L.latLngBounds(g.map(e => [e.lat, e.lng]));
          const alvo = Math.min(SAT_MAX_ZOOM, map.getZoom() + 3);
          const pad = fitPad();
          map.flyToBounds(b, { ...pad, maxZoom: alvo, duration: 0.6 });
        });
        m.addTo(layer);
      }
    });

    shownRef.current = agora;
    if (layers.nomes) declutterLabels(map, markersRef.current, { selectedKey: selKey, zoomThreshold: labelZoomRef.current });
    else markersRef.current.forEach((m, k) => { if (k === selKey) m.openTooltip(); else m.closeTooltip(); });
  }, [visible, selKey, zoom, layers, comAberta, nearest, raio, select, fitPad]);

  // ── alcance e ligações ──
  useEffect(() => {
    const layer = overlayLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (layers.alcance) {
      equipamentos.filter(e => e.tipo === "amplimax").forEach(a => {
        L.circle([a.lat, a.lng], { radius: raio, color: "#3b82f6", weight: 1.5, opacity: .7, dashArray: "4 4", fillColor: "#3b82f6", fillOpacity: .08, interactive: false }).addTo(layer);
      });
    }
    if (layers.ligacoes) {
      visible.filter(e => e.tipo === "totem").forEach(e => {
        const n = nearest.get(keyOf(e));
        if (!n) return;
        const ok = n.d <= raio;
        L.polyline([[e.lat, e.lng], [n.amp.lat, n.amp.lng]], { color: ok ? "#22c55e" : "#f97316", weight: 2, opacity: .9, dashArray: ok ? null : "5 5", interactive: false }).addTo(layer);
      });
    }
  }, [layers.alcance, layers.ligacoes, raio, equipamentos, visible, nearest]);

  useEffect(() => {
    addingRef.current = adding;
    if (mapElRef.current) mapElRef.current.style.cursor = adding ? "crosshair" : "";
  }, [adding]);

  const toggleTipo = (t) => setTipos(p => { const n = new Set(p); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const exportCSV = () => {
    const rows = [["Nome", "Tipo", "Área", "Categorias", "Lado A MAC", "Lado A IP", "Lado B MAC", "Lado B IP", "Chip", "Latitude", "Longitude"],
      ...visible.map(e => {
        const ld = (l) => (e.dados?.lados || []).find(x => x.lado === l) || {};
        return [e.name, (EQUIP_TIPO[e.tipo] || EQUIP_TIPO.outro).label, e.area, (e.categorias || []).map(c => CATEGORIAS[c]?.short).join(" + "), ld("A").mac || "", ld("A").ip || "", ld("B").mac || "", ld("B").ip || "", e.dados?.chip || "", e.lat, e.lng];
      })];
    dlCSV(`equipamentos_rede_cba_${Date.now()}.csv`, rows);
    showToast?.(`${visible.length} equipamento(s) exportado(s)`);
  };

  const camadasAtivas = Object.entries(layers).filter(([k, v]) => v !== LAYERS_DEFAULT[k]).length;
  const tiposPresentes = TIPO_ORDER.filter(t => equipamentos.some(e => e.tipo === t));
  const chip = (on, color) => ({
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
    border: `1px solid ${on ? color : "rgba(255,255,255,.18)"}`, background: on ? `${color}` : "rgba(15,17,26,.72)", color: on ? "#fff" : "#cbd5e1",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 2px 8px rgba(0,0,0,.25)", transition: "background 160ms ease,border-color 160ms ease,transform 160ms ease",
  });
  const fab = { width: 40, height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,.18)", background: "rgba(15,17,26,.78)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", boxShadow: "0 4px 14px rgba(0,0,0,.3)", position: "relative" };

  const panelProps = {
    T, equipamentos, visible, sel, keyOf, select, nearest, raio, layers, foraDoAlcance, comAberta, ocorrencias, mudarStatus,
    onNovaOcorrencia: (e) => setFormOcorr(e), tasks, onCreateTask, onOpenTask, currentUser, showToast,
    onEdit: (e) => setForm({ modo: "editar", equip: e }),
    onMove: (e) => { setAdding({ id: e.id, move: true, name: e.name }); showToast?.("Toque no mapa na posição nova", "info"); },
    onRemove: (e) => { onRemoveEquipamento(e.id, e.name); setSelKey(null); },
    onClose: () => setSelKey(null),
    onExport: exportCSV,
  };

  return (
    <div ref={wrapRef} className="nm2-wrap" style={{ position: "relative", width: "100%", height: "calc(100dvh - 120px)", minHeight: 440, borderRadius: 16, overflow: "hidden", border: `1px solid ${adding ? T.accent : T.border}`, background: T.input }}>
      <style>{`
        ${satelliteMapCss(T, "nm-map")}
        .nm-map-tooltip{font-size:11px;font-weight:700;padding:3px 7px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3)}
        .nm2-pin{width:30px;height:30px;border-radius:50%;background:var(--c);border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.45);transition:transform 200ms cubic-bezier(.34,1.56,.64,1);cursor:pointer;position:relative}
        .nm2-pin.in,.nm2-cluster.in{animation:nm2-in 320ms cubic-bezier(.34,1.56,.64,1) both}
        .nm2-pin:hover{transform:scale(1.15)}
        .nm2-pin.sel{transform:scale(1.3);box-shadow:0 0 0 4px rgba(255,255,255,.45),0 6px 18px rgba(0,0,0,.5)}
        .nm2-pin.far{border-color:#f97316}
        .nm2-pin.alert::after{content:"";position:absolute;inset:-7px;border-radius:50%;border:3px solid #ef4444;animation:nm2-pulse 1.4s ease-out infinite}
        .nm2-cluster{border-radius:50%;background:rgba(15,17,26,.88);border:2.5px solid #fff;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,.5);cursor:pointer;transition:transform 180ms ease;position:relative}
        .nm2-cluster:hover{transform:scale(1.12)}
        .nm2-cluster b{font-size:14px;line-height:1}
        .nm2-cluster span{display:flex;gap:2px;margin-top:3px}
        .nm2-cluster i{width:6px;height:6px;border-radius:50%}
        .nm2-cluster.alert::after{content:"";position:absolute;inset:-7px;border-radius:50%;border:3px solid #ef4444;animation:nm2-pulse 1.4s ease-out infinite}
        @keyframes nm2-in{from{opacity:0;transform:scale(.4)}to{opacity:1}}
        @keyframes nm2-pulse{0%{opacity:.9;transform:scale(.85)}100%{opacity:0;transform:scale(1.5)}}
        .nm2-top{position:absolute;top:12px;left:12px;right:64px;z-index:600;display:flex;flex-direction:column;gap:8px;pointer-events:none}
        .nm2-top>*{pointer-events:auto}
        .nm2-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
        .nm2-chips::-webkit-scrollbar{display:none}
        .nm2-panel{position:absolute;top:12px;right:12px;bottom:12px;width:360px;z-index:650;background:${T.panel};border:1px solid ${T.border};border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;transition:transform 300ms cubic-bezier(.2,.8,.2,1),opacity 200ms ease}
        .nm2-panel.closed{transform:translateX(calc(100% + 24px));opacity:0;pointer-events:none}
        .nm2-has-panel .nm2-top{right:436px}
        .nm2-fabs{position:absolute;top:12px;z-index:640;display:flex;flex-direction:column;gap:8px;transition:right 300ms cubic-bezier(.2,.8,.2,1)}
        .nm2-layers{position:absolute;z-index:700;width:290px;background:${T.panel};border:1px solid ${T.border};border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,.45);padding:12px;animation:nm2-pop 220ms cubic-bezier(.34,1.4,.64,1) both}
        @keyframes nm2-pop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}
        .nm2-switch{width:36px;height:21px;border-radius:999px;background:${T.panelAlt2};border:1px solid ${T.border};position:relative;flex-shrink:0;transition:background 180ms ease}
        .nm2-switch::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform 220ms cubic-bezier(.34,1.56,.64,1)}
        .nm2-switch.on{background:${T.accent};border-color:${T.accent}}
        .nm2-switch.on::after{transform:translateX(15px)}
        .nm-map .leaflet-control-zoom{border:none!important;box-shadow:0 4px 14px rgba(0,0,0,.3)!important;border-radius:12px!important;overflow:hidden;margin:0 0 12px 12px!important}
        .nm-map .leaflet-control-zoom a{width:36px!important;height:36px!important;line-height:36px!important}
        @media (max-width:760px){
          .nm2-wrap{height:calc(100dvh - 170px)!important;border-radius:14px!important}
          .nm2-panel{top:auto;left:0;right:0;bottom:0;width:auto;border-radius:18px 18px 0 0;transition:height 320ms cubic-bezier(.2,.8,.2,1)}
          .nm2-panel.closed{transform:none;opacity:1;pointer-events:auto}
          .nm2-top,.nm2-has-panel .nm2-top{right:12px}
          .nm-map .leaflet-control-zoom{display:none}
          .nm2-fabs{right:12px!important;top:104px!important}
          .nm2-layers{right:12px!important;left:12px;width:auto!important;top:104px!important}
          .nm-map .leaflet-bottom{bottom:96px;z-index:500}
        }
      `}</style>

      <div className={panelOpen ? "nm2-has-panel" : ""} style={{ position: "absolute", inset: 0 }}>
        <div ref={mapElRef} className="nm-map" style={{ position: "absolute", inset: 0 }} />

        {/* busca + filtros */}
        <div className="nm2-top">
          <div style={{ position: "relative", maxWidth: 440, zIndex: 2 }}>
            <Search size={15} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none", zIndex: 1 }} />
            <input
              value={search} onChange={e => { setSearch(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Buscar equipamento, área, MAC ou IP…"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 36px 11px 38px", borderRadius: 12, border: "1px solid rgba(255,255,255,.18)", background: "rgba(15,17,26,.82)", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: "0 4px 14px rgba(0,0,0,.3)" }}
            />
            {search && <button onClick={() => setSearch("")} aria-label="Limpar busca" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", padding: 4 }}><X size={15} /></button>}
            {searchOpen && search.trim() && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 12px 30px rgba(0,0,0,.4)", maxHeight: 300, overflowY: "auto", animation: "nm2-pop 200ms ease both" }}>
                {searchMatches.length === 0 && <div style={{ padding: "12px 14px", fontSize: 12, color: T.textFaint }}>Nada encontrado.</div>}
                {searchMatches.map(e => {
                  const info = EQUIP_TIPO[e.tipo] || EQUIP_TIPO.outro;
                  return (
                    <button key={keyOf(e)} onMouseDown={ev => ev.preventDefault()} onClick={() => { select(e); setSearch(""); setSearchOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", background: "none", border: "none", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                      <span style={{ width: 24, height: 24, borderRadius: "50%", background: info.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: TIPO_ICON[e.tipo] || TIPO_ICON.outro }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                        <span style={{ fontSize: 11, color: T.textFaint }}>{info.label} · {e.area}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="nm2-chips">
            {[["todas", "Todos", "#64748b"], ["veicular", CATEGORIAS.veicular.short, CATEGORIAS.veicular.color], ["materiais", CATEGORIAS.materiais.short, CATEGORIAS.materiais.color]].map(([k, l, c]) => (
              <button key={k} onClick={() => setCat(k)} className="tk-chip-btn" style={chip(cat === k, c)} title={k === "todas" ? "Todos os equipamentos" : `Só totens de ${CATEGORIAS[k].label.toLowerCase()}`}>{l}</button>
            ))}
            <span style={{ width: 1, background: "rgba(255,255,255,.2)", margin: "4px 2px", flexShrink: 0 }} />
            {tiposPresentes.map(t => {
              const info = EQUIP_TIPO[t] || EQUIP_TIPO.outro, on = tipos.has(t);
              return (
                <button key={t} onClick={() => toggleTipo(t)} className="tk-chip-btn" style={{ ...chip(on, info.color), opacity: on ? 1 : .75 }}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: on ? "rgba(255,255,255,.25)" : info.color, display: "flex", alignItems: "center", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: TIPO_ICON[t].replace('width="16" height="16"', 'width="10" height="10"') }} />
                  {info.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* botões flutuantes */}
        <div className="nm2-fabs" style={{ right: panelOpen ? 384 : 12 }}>
          <button onClick={() => setShowLayers(s => !s)} title="Camadas" aria-label="Camadas" style={{ ...fab, background: showLayers ? T.accent : fab.background }}>
            <Layers size={18} />
            {camadasAtivas > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: T.accent, border: "2px solid #fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{camadasAtivas}</span>}
          </button>
          <div style={{ display: "flex", flexDirection: "column", borderRadius: 12, overflow: "hidden", boxShadow: fab.boxShadow }}>
            <button onClick={() => mapRef.current?.zoomIn()} title="Aproximar" aria-label="Aproximar" style={{ ...fab, borderRadius: 0, boxShadow: "none", borderBottom: "none" }}><Plus size={19} /></button>
            <button onClick={() => mapRef.current?.zoomOut()} title="Afastar" aria-label="Afastar" style={{ ...fab, borderRadius: 0, boxShadow: "none" }}><Minus size={19} /></button>
          </div>
          <button onClick={recentrar} title="Ver a planta toda" aria-label="Ver a planta toda" style={fab}><Crosshair size={18} /></button>
          <button onClick={() => setForm({ modo: "novo" })} title="Adicionar equipamento" aria-label="Adicionar equipamento" style={fab}><MapPinPlus size={18} /></button>
          <button onClick={exportCSV} title="Exportar planilha (CSV)" aria-label="Exportar CSV" style={fab}><Download size={17} /></button>
          {onOpenCadastros && <button onClick={onOpenCadastros} title="Cadastros (locais e categorias)" aria-label="Cadastros" style={fab}><Tags size={17} /></button>}
        </div>

        {showLayers && (
          <>
            <div onClick={() => setShowLayers(false)} style={{ position: "absolute", inset: 0, zIndex: 690 }} />
            <div className="nm2-layers" style={{ top: 12, right: (panelOpen ? 384 : 12) + 50 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <b style={{ fontSize: 13, color: T.textBright, flex: 1 }}>Camadas</b>
                <button onClick={() => { Object.entries(LAYERS_DEFAULT).forEach(([k, v]) => setLayer(k, v)); }} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Padrão</button>
                <button onClick={() => { ["nomes", "alcance", "ligacoes", "ocorrencias"].forEach(k => setLayer(k, false)); }} style={{ background: "none", border: "none", color: T.accent, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Deixar limpo</button>
              </div>
              {LAYER_INFO.map(([k, l, d]) => (
                <div key={k}>
                  <button onClick={() => setLayer(k, !layers[k])} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 2px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.text }}>{l}</span>
                      <span style={{ fontSize: 11, color: T.textFaint }}>{d}</span>
                    </span>
                    <span className={`nm2-switch${layers[k] ? " on" : ""}`} />
                  </button>
                  {k === "alcance" && (layers.alcance || layers.ligacoes) && (
                    <div style={{ padding: "2px 2px 8px", display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="range" min={30} max={300} step={10} value={raio} onChange={e => setRaio(Number(e.target.value))} style={{ flex: 1, accentColor: T.accent }} aria-label="Raio do alcance" />
                      <b style={{ fontSize: 12, color: T.textBright, width: 48, textAlign: "right" }}>{raio} m</b>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {adding && (
          <div style={{ position: "absolute", left: "50%", bottom: 90, transform: "translateX(-50%)", zIndex: 700, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px 10px 16px", borderRadius: 999, background: T.accent, color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,.4)", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", animation: "nm2-pop 220ms ease both" }}>
            Toque no mapa para posicionar “{adding.name}”
            <button onClick={() => setAdding(null)} style={{ background: "rgba(255,255,255,.22)", border: "none", color: "#fff", borderRadius: 999, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>Cancelar</button>
          </div>
        )}

        {/* painel (desktop) / gaveta (celular) */}
        <div className={`nm2-panel${panelOpen ? "" : " closed"}`} style={{ height: undefined }} data-sheet={sheet}>
          <style>{`@media (max-width:760px){.nm2-panel[data-sheet="min"]{height:96px}.nm2-panel[data-sheet="mid"]{height:52%}.nm2-panel[data-sheet="max"]{height:88%}}`}</style>
          <button className="nm2-sheet-handle" onClick={() => setSheet(s => (s === "min" ? "mid" : s === "mid" ? "max" : "min"))} aria-label="Abrir ou fechar painel"
            style={{ display: "none", width: "100%", padding: "8px 0 2px", background: "none", border: "none", cursor: "pointer", flexDirection: "column", alignItems: "center", gap: 2, color: T.textFaint }}>
            <span style={{ width: 40, height: 4, borderRadius: 2, background: T.border }} />
            {sheet === "max" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <style>{`@media (max-width:760px){.nm2-sheet-handle{display:flex!important}.nm2-desk-close{display:none!important}}`}</style>
          <SidePanel {...panelProps} onHidePanel={() => setPanelOpen(false)} compact={sheet === "min"} onExpand={() => setSheet("mid")} />
        </div>
        {!panelOpen && (
          <button className="nm2-desk-close" onClick={() => setPanelOpen(true)} style={{ ...fab, position: "absolute", right: 12, bottom: 100, width: "auto", padding: "0 14px", gap: 6, fontSize: 12, fontWeight: 700, fontFamily: "inherit", zIndex: 640 }}>Painel</button>
        )}
      </div>

      {formOcorr && <OcorrenciaForm T={T} equipamento={formOcorr} onSave={salvarOcorrencia} onClose={() => setFormOcorr(null)} />}
      {form && (
        <EquipForm
          T={T} inp={inp} ghost={ghost} modo={form.modo} equip={form.equip} areas={[...new Set(equipamentos.map(e => e.area))].sort()}
          onClose={() => setForm(null)}
          onSave={(dados) => {
            if (form.modo === "novo") { setAdding(dados); showToast?.("Agora toque no mapa onde ele fica", "info"); }
            else onUpdateEquipamento?.(form.equip.id, dados);
            setForm(null);
          }}
        />
      )}
    </div>
  );
}
