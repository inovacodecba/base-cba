// Mapa de Equipamentos de Rede — totens, repetidores Amplimax, impressoras e
// caixas de baixa, importados do Google My Maps do usuário ("Equipamentos e
// alcançe do amplimax"). Usa Leaflet + imagens de satélite do Esri World
// Imagery (gratuito, sem chave de API, sem conta/billing — só atribuição),
// carregadas ao vivo do provedor a cada acesso. Diferente de embutir um
// print/tile estático do Google (o que evitamos por direitos autorais e
// pelos termos de uso do Google Maps), aqui o mapa é sempre buscado na hora,
// exatamente como qualquer site que mostra "o mapa de verdade" deve fazer —
// só os pinos (nome, tipo, posição) são nossos.
import { useState, useMemo, useRef, useEffect } from "react";
import { X, Plus, ExternalLink, MapPin, Search, Download, FileSpreadsheet } from "lucide-react";
import L from "leaflet";
import { Overlay } from "../common.jsx";
import { makeStyleHelpers } from "../../theme.js";
import { EQUIP_TIPO } from "../../constants.js";
import { dlCSV } from "../../utils.js";
import { createSatelliteMap, satelliteMapCss, declutterLabels, PLANT_CENTER } from "./satelliteMap.js";

const TIPO_ORDER = ["totem", "amplimax", "impressora", "caixa_baixa", "outro"];

// Direção do rótulo por tipo de equipamento — um totem e o Amplimax que
// atende ele costumam ficar a poucos metros um do outro (às vezes menos de
// 5m, por design da instalação), próximos demais pra qualquer zoom separar
// os dois na tela. Em vez de os dois brigarem pelo mesmo lado do pino (o
// que fazia um dos dois nunca aparecer, mesmo no zoom máximo), cada tipo
// estica o rótulo pra um lado diferente — assim, mesmo colados no mapa,
// dá pra ler o nome dos dois ao mesmo tempo na maioria dos casos.
const TIPO_LABEL_DIR = { totem: "right", amplimax: "left", impressora: "top", caixa_baixa: "bottom", outro: "right" };

// A partir de qual zoom os rótulos com o nome do equipamento aparecem — de
// longe só as cores, ao aproximar já dá pra ler o nome. Com ~87 pontos
// (alguns bem próximos entre si) mostrar tudo sempre vira uma poluição
// ilegível, por isso o rótulo só entra em jogo perto o suficiente (ver
// `zoomThreshold` em `declutterLabels`, satelliteMap.js).
//
// BUG corrigido (2x): esse valor já foi um número fixo (18, depois 16)
// chutado com base no tamanho físico da planta — e as duas vezes ficou
// ERRADO, porque o zoom em que o mapa efetivamente abre (resultado de
// `fitBounds` enquadrando os ~87 pontos, ver efeito abaixo) depende da
// dispersão real dos pontos e do tamanho do container, não de uma conta de
// régua. Nas duas vezes o threshold acabou ficando ACIMA do zoom de
// abertura, e nenhum rótulo aparecia na tela inicial — exatamente o sintoma
// reportado duas vezes.
//
// Em vez de adivinhar mais um número fixo, o threshold agora É o próprio
// zoom que `fitBounds` calcula na abertura (guardado em `labelThresholdRef`
// assim que o mapa enquadra os pontos, `null` até lá = sem corte, não
// esconde nada por falta de referência). Isso garante por construção que a
// tela inicial já mostra os rótulos que não colidem, e continua se ajustando
// sozinho se o conjunto de equipamentos mudar (mais pontos, planta maior
// etc.) sem precisar chutar de novo.

function markerStyle(color, selected) {
  return {
    radius: selected ? 10 : 7,
    color: "#fff",
    weight: selected ? 3 : 1.5,
    fillColor: color,
    fillOpacity: 1,
  };
}

export function NetworkMap({ T, equipamentos, onAddEquipamento, onRemoveEquipamento, showToast }) {
  const { btn, ghost, inp } = makeStyleHelpers(T);
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map()); // _i -> L.CircleMarker
  const addingRef = useRef(null); // mirror de `adding` para o listener de clique do mapa
  const recomputeLabelsRef = useRef(() => {}); // sempre aponta pra versão mais atual (fecha sobre `selected`)
  const labelThresholdRef = useRef(null); // zoom da tela inicial (setado por fitBounds) — ver comentário acima

  const [tiposAtivos, setTiposAtivos] = useState(() => new Set(TIPO_ORDER));
  const [areaFiltro, setAreaFiltro] = useState("Todas");
  const [selected, setSelected] = useState(null); // índice em `equipamentos`
  const [adding, setAdding] = useState(null); // { name, tipo, area } aguardando clique no mapa
  const [addForm, setAddForm] = useState({ name: "", tipo: "amplimax", area: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAreaSummary, setShowAreaSummary] = useState(false);
  const [search, setSearch] = useState("");
  // Controla a visibilidade do dropdown de resultados de forma independente
  // do foco real do DOM: depois de escolher um resultado o campo continua
  // focado (não perde o foco do navegador), então um "onFocus" novo nunca
  // dispararia de novo — se a visibilidade dependesse só de onFocus/onBlur,
  // o dropdown ficaria travado fechado na próxima busca. Por isso reabre
  // explicitamente a cada tecla digitada (onChange), não só ao focar.
  const [searchOpen, setSearchOpen] = useState(false);

  const areas = useMemo(() => [...new Set(equipamentos.map(e => e.area))].sort(), [equipamentos]);

  // Quantidade de cada tipo de equipamento por área — respondendo direto
  // "quantas impressoras tem na Fundição 1" sem precisar contar pino por
  // pino no mapa (útil justamente quando os rótulos ficam apertados demais
  // pra ler todos de uma vez num cluster denso).
  const areaSummary = useMemo(() => {
    const byArea = new Map();
    equipamentos.forEach(e => {
      if (!byArea.has(e.area)) byArea.set(e.area, {});
      const counts = byArea.get(e.area);
      counts[e.tipo] = (counts[e.tipo] || 0) + 1;
    });
    return [...byArea.entries()]
      .map(([area, counts]) => ({ area, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => a.area.localeCompare(b.area));
  }, [equipamentos]);
  const tiposPresentes = useMemo(() => TIPO_ORDER.filter(t => equipamentos.some(e => e.tipo === t)), [equipamentos]);

  const visible = equipamentos
    .map((e, i) => ({ ...e, _i: i }))
    .filter(e => tiposAtivos.has(e.tipo) && (areaFiltro === "Todas" || e.area === areaFiltro));

  // Busca por nome — varre TODOS os equipamentos (ignora os filtros de
  // tipo/área ativos), porque o objetivo é achar um ponto específico entre
  // os ~87 mesmo que ele esteja escondido pelo filtro no momento.
  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return equipamentos
      .map((e, i) => ({ ...e, _i: i }))
      .filter(e => e.name.toLowerCase().includes(q) || e.area.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, equipamentos]);

  const toggleTipo = tipo => setTiposAtivos(p => {
    const next = new Set(p);
    next.has(tipo) ? next.delete(tipo) : next.add(tipo);
    return next;
  });

  // Seleciona um resultado da busca: garante que ele fica visível (liga o
  // tipo dele se estava desmarcado, tira o filtro de área se ele não bater),
  // dá um "voo" até a posição já num zoom que mostra o rótulo, e seleciona —
  // mesmo comportamento de clicar direto no pino.
  const focusEquipamento = e => {
    setTiposAtivos(p => (p.has(e.tipo) ? p : new Set(p).add(e.tipo)));
    setAreaFiltro(prev => (prev === "Todas" || prev === e.area ? prev : "Todas"));
    setSelected(e._i);
    setSearch("");
    setSearchOpen(false);
    const map = mapRef.current;
    if (map) map.flyTo([e.lat, e.lng], Math.max(map.getZoom(), labelThresholdRef.current ?? map.getZoom()), { duration: 0.6 });
  };

  const exportCSV = () => {
    const rows = [
      ["Nome", "Tipo", "Área", "Latitude", "Longitude"],
      ...visible.map(e => [e.name, (EQUIP_TIPO[e.tipo] || EQUIP_TIPO.outro).label, e.area, e.lat, e.lng]),
    ];
    dlCSV(`equipamentos_rede_cba_${Date.now()}.csv`, rows);
    showToast && showToast(`${visible.length} equipamento(s) exportado(s)`);
  };

  // Inicializa o mapa uma única vez.
  useEffect(() => {
    const map = createSatelliteMap(mapElRef.current, T);
    map.setView(PLANT_CENTER, 16);
    map.on("click", e => {
      if (!addingRef.current) return;
      onAddEquipamento({ ...addingRef.current, lat: e.latlng.lat, lng: e.latlng.lng });
      addingRef.current = null;
      setAdding(null);
    });
    // Rótulos só aparecem de perto, e só quando não colidem com outro já
    // mostrado — reavalia a cada zoom (a distância em pixels entre dois
    // pontos muda com o zoom, então quem cabia pode deixar de caber e vice-versa).
    map.on("zoomend", () => recomputeLabelsRef.current());
    mapRef.current = map;

    // O Leaflet só mede o tamanho do container na hora de inicializar. Se o
    // layout ainda não tiver estabilizado nesse momento (flex, fontes
    // carregando) ou se o container mudar de tamanho depois por qualquer
    // motivo (barra de botões acima ganhando/perdendo altura, sidebar
    // recolhendo, rotação do celular), o mapa guarda um tamanho interno
    // desatualizado — os tiles ficam cortados ou vazam pra fora dos cantos
    // arredondados ("dimensão estranha, comendo borda"). Um ResizeObserver
    // corrige isso sempre que o tamanho real do elemento mudar de verdade,
    // não só no resize da janela inteira (que é o único caso que o listener
    // antigo cobria).
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(mapElRef.current);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    const raf = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enquadra todos os equipamentos e trava a navegação nessa região — não dá
  // pra "se perder" arrastando o mapa pro resto do mundo, nem dar zoom-out
  // além do necessário pra ver a planta inteira.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || equipamentos.length === 0) return;
    const bounds = L.latLngBounds(equipamentos.map(e => [e.lat, e.lng]));
    map.fitBounds(bounds, { padding: [32, 32] });
    // Zoom em que a tela abre de fato — vira a referência pro corte de
    // rótulos (ver comentário de `labelThresholdRef` acima): nunca fica
    // "impossível de alcançar" porque é medido, não chutado.
    labelThresholdRef.current = map.getZoom();
    const lockedBounds = bounds.pad(0.6);
    map.setMaxBounds(lockedBounds);
    map.setMinZoom(Math.max(13, map.getZoom() - 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipamentos.length]);

  // Sincroniza os marcadores com `visible` (filtros + seleção).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set();
    visible.forEach(e => {
      seen.add(e._i);
      const info = EQUIP_TIPO[e.tipo] || EQUIP_TIPO.outro;
      const isSelected = selected === e._i;
      let marker = markersRef.current.get(e._i);
      if (!marker) {
        marker = L.circleMarker([e.lat, e.lng], markerStyle(info.color, isSelected));
        marker.on("click", ev => { L.DomEvent.stopPropagation(ev); setSelected(e._i); });
        // Tooltip permanente (não reage a hover — quem abre/fecha é a gente,
        // via recomputeLabels, pra evitar textos sobrepostos em clusters densos).
        // Direção fixa por tipo (ver `TIPO_LABEL_DIR`) — não muda depois de
        // criado porque o tipo do equipamento não muda.
        marker.bindTooltip(e.name, { permanent: true, direction: TIPO_LABEL_DIR[e.tipo] || "right", offset: [8, 0], className: "nm-map-tooltip" });
        marker.addTo(map);
        markersRef.current.set(e._i, marker);
      } else {
        marker.setStyle(markerStyle(info.color, isSelected));
      }
    });
    // remove marcadores que saíram do filtro
    for (const [i, marker] of markersRef.current) {
      if (!seen.has(i)) { marker.remove(); markersRef.current.delete(i); }
    }

    // Rótulos sem sobreposição: abaixo do zoom mínimo nenhum aparece; daí pra
    // cima, o selecionado tem prioridade e os demais só entram se não
    // colidirem (em pixels de tela) com um já aceito.
    recomputeLabelsRef.current = () => declutterLabels(map, markersRef.current, { selectedKey: selected, zoomThreshold: labelThresholdRef.current });
    recomputeLabelsRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map(e => `${e._i}:${e.tipo}`).join(","), selected]);

  // Cursor de "posicionando" e sincronização da ref usada pelo listener de clique.
  useEffect(() => {
    addingRef.current = adding;
    const el = mapElRef.current;
    if (el) el.style.cursor = adding ? "crosshair" : "";
  }, [adding]);

  const startAdd = () => {
    if (!addForm.name.trim() || !addForm.area.trim()) return;
    setAdding({ name: addForm.name.trim(), tipo: addForm.tipo, area: addForm.area.trim() });
    setShowAddForm(false);
  };

  const sel = selected != null ? equipamentos[selected] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`
        ${satelliteMapCss(T, "nm-map")}
        @media (max-width:640px){ .nm-map-canvas{ height:460px!important; } }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: T.textMuted }}>
          {visible.length} de {equipamentos.length} equipamentos visíveis. Posição real (GPS) sobre imagem de satélite.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setShowAreaSummary(true)} style={{ ...ghost(), display: "flex", alignItems: "center", gap: 5 }}>
            <FileSpreadsheet size={13} /> Resumo por área
          </button>
          <button onClick={exportCSV} disabled={visible.length === 0} style={{ ...ghost(), display: "flex", alignItems: "center", gap: 5, opacity: visible.length === 0 ? .5 : 1 }}>
            <Download size={13} /> Exportar CSV
          </button>
          <button onClick={() => setShowAddForm(true)} style={{ ...ghost(), display: "flex", alignItems: "center", gap: 5 }}>
            <Plus size={13} /> Adicionar equipamento
          </button>
        </div>
      </div>

      {/* Busca por nome/área — acha um ponto específico entre os ~87 sem
          precisar navegar/dar zoom manualmente; ao escolher um resultado o
          mapa "voa" até ele e já seleciona, mesmo se estiver fora do filtro
          de tipo/área ativo no momento. */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.textFaint, pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder="Buscar equipamento por nome ou área..."
            style={{ ...inp({ marginBottom: 0 }), paddingLeft: 30 }}
          />
        </div>
        {searchOpen && search.trim() && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 500,
            background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,.25)", maxHeight: 260, overflowY: "auto",
          }}>
            {searchMatches.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 12, color: T.textFaint }}>Nenhum equipamento encontrado.</div>
            )}
            {searchMatches.map(e => {
              const info = EQUIP_TIPO[e.tipo] || EQUIP_TIPO.outro;
              return (
                <button key={e._i} onMouseDown={ev => ev.preventDefault()} onClick={() => focusEquipamento(e)} style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "none",
                  border: "none", borderBottom: `1px solid ${T.border}`, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: info.color, flexShrink: 0 }} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
                    <div style={{ fontSize: 10.5, color: T.textFaint }}>{info.label} · {e.area}</div>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Legenda / filtro por tipo */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TIPO_ORDER.filter(t => equipamentos.some(e => e.tipo === t)).map(tipo => {
          const info = EQUIP_TIPO[tipo] || EQUIP_TIPO.outro;
          const active = tiposAtivos.has(tipo);
          const count = equipamentos.filter(e => e.tipo === tipo).length;
          return (
            <button key={tipo} onClick={() => toggleTipo(tipo)} style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6,
              border: `1px solid ${active ? info.color : T.border}`, background: active ? `${info.color}18` : T.panel,
              color: active ? info.color : T.textFaint, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: info.color, flexShrink: 0, opacity: active ? 1 : .4 }} />
              {info.label} <span style={{ opacity: .7 }}>({count})</span>
            </button>
          );
        })}
        <select value={areaFiltro} onChange={e => setAreaFiltro(e.target.value)} style={{ ...inp({ width: "auto", marginBottom: 0 }), fontSize: 11, padding: "5px 8px" }}>
          <option value="Todas">Todas as áreas</option>
          {areas.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>

      {adding && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 14px", borderRadius: 7, background: `${T.accent}14`, border: `1px solid ${T.accent}40` }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>Clique no mapa para posicionar "{adding.name}"</span>
          <button onClick={() => setAdding(null)} style={ghost()}>Cancelar</button>
        </div>
      )}

      <div
        ref={mapElRef}
        className="nm-map nm-map-canvas"
        style={{
          position: "relative", width: "100%", height: 640, borderRadius: 10,
          border: `1px solid ${adding ? T.accent : T.border}`, overflow: "hidden", background: T.input,
        }}
      />

      {sel && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 14px", borderRadius: 8, background: T.panelAlt, border: `1px solid ${T.border}` }}>
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: (EQUIP_TIPO[sel.tipo] || EQUIP_TIPO.outro).color, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel.name}</div>
              <div style={{ fontSize: 10.5, color: T.textFaint }}>{(EQUIP_TIPO[sel.tipo] || EQUIP_TIPO.outro).label} · {sel.area}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <a href={`https://www.google.com/maps?q=${sel.lat},${sel.lng}`} target="_blank" rel="noopener noreferrer" style={{ ...ghost(), display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none" }}>
              <ExternalLink size={12} /> Ver GPS
            </a>
            {sel.id != null && (
              <button onClick={() => { onRemoveEquipamento(sel.id, sel.name); setSelected(null); }} style={{ ...ghost(), color: "#ef4444", borderColor: "#ef444440" }}>Remover</button>
            )}
            <button onClick={() => setSelected(null)} aria-label="Fechar" style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 4 }}><X size={16} /></button>
          </div>
        </div>
      )}

      {showAddForm && (
        <Overlay T={T} onClose={() => setShowAddForm(false)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.textBright }}>Adicionar equipamento</h3>
            <button onClick={() => setShowAddForm(false)} aria-label="Fechar" style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 4 }}><X size={18} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome (ex.: totem113/114 - L2000 - Porta 5)" style={inp()} />
            <select value={addForm.tipo} onChange={e => setAddForm(p => ({ ...p, tipo: e.target.value }))} style={inp()}>
              {TIPO_ORDER.map(t => <option key={t} value={t}>{(EQUIP_TIPO[t] || EQUIP_TIPO.outro).label}</option>)}
            </select>
            <input value={addForm.area} onChange={e => setAddForm(p => ({ ...p, area: e.target.value }))} placeholder="Área (ex.: Fundição 1, TP, Vias...)" style={inp()} list="network-areas" />
            <datalist id="network-areas">{areas.map(a => <option key={a} value={a} />)}</datalist>
            <button onClick={startAdd} style={{ ...btn(T.accent), marginTop: 4 }}>Posicionar no mapa</button>
          </div>
        </Overlay>
      )}

      {showAreaSummary && (
        <Overlay T={T} onClose={() => setShowAreaSummary(false)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.textBright }}>Resumo por área</h3>
            <button onClick={() => setShowAreaSummary(false)} aria-label="Fechar" style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 4 }}><X size={18} /></button>
          </div>
          <div style={{ fontSize: 11.5, color: T.textFaint, marginBottom: 12 }}>Quantidade de cada tipo de equipamento cadastrado em cada área do Mapa.</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 10px 6px 0", color: T.textFaint, fontWeight: 600, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>Área</th>
                  {tiposPresentes.map(t => (
                    <th key={t} style={{ textAlign: "center", padding: "6px 10px", color: (EQUIP_TIPO[t] || EQUIP_TIPO.outro).color, fontWeight: 700, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                      {(EQUIP_TIPO[t] || EQUIP_TIPO.outro).label}
                    </th>
                  ))}
                  <th style={{ textAlign: "center", padding: "6px 0 6px 10px", color: T.textFaint, fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {areaSummary.map(row => (
                  <tr key={row.area}>
                    <td style={{ padding: "7px 10px 7px 0", color: T.textBright, fontWeight: 600, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{row.area}</td>
                    {tiposPresentes.map(t => (
                      <td key={t} style={{ textAlign: "center", padding: "7px 10px", color: row.counts[t] ? T.text : T.textFaint, borderBottom: `1px solid ${T.border}` }}>
                        {row.counts[t] || "–"}
                      </td>
                    ))}
                    <td style={{ textAlign: "center", padding: "7px 0 7px 10px", color: T.textBright, fontWeight: 700, borderBottom: `1px solid ${T.border}` }}>{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Overlay>
      )}

      {equipamentos.length === 0 && (
        <div style={{ textAlign: "center", padding: 24, fontSize: 12, color: T.textFaint, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <MapPin size={20} /> Nenhum equipamento cadastrado ainda.
        </div>
      )}
    </div>
  );
}
