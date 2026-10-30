// Painel lateral do Mapa v2 (desktop) / gaveta de baixo (celular):
//  • sem nada selecionado: Visão geral (números + lista por área) e Ocorrências;
//  • com um equipamento selecionado: a ficha dele (MAC/IP, Amplimax mais
//    próximo, ocorrências e tarefas ligadas).
// Também o formulário de novo/editar equipamento (EquipForm).
import { useState, useMemo } from "react";
import { X, Copy, Check, ExternalLink, Pencil, Move, Trash2, AlertTriangle, CheckCircle2, ChevronRight, ChevronDown, ListTodo, Radio, PanelRightClose, Download, Crosshair, RotateCcw } from "lucide-react";
import { Overlay } from "../common.jsx";
import { makeStyleHelpers } from "../../theme.js";
import { EQUIP_TIPO, TASK_STATUS } from "../../constants.js";
import { TIPO_ICON, fmtDist, CATEGORIAS } from "./mapUtils.js";
import { OcorrenciasDoEquipamento } from "./Ocorrencias.jsx";

const fmtData = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtPrazo = (p) => (p ? `${p.slice(8, 10)}/${p.slice(5, 7)}` : "");
const statusDot = { a_fazer: "#eab308", em_andamento: "#3b82f6", concluido: "#22c55e" };

function TipoBadge({ tipo, size = 34 }) {
  const info = EQUIP_TIPO[tipo] || EQUIP_TIPO.outro;
  const svg = (TIPO_ICON[tipo] || TIPO_ICON.outro).replace('width="16" height="16"', `width="${Math.round(size * .5)}" height="${Math.round(size * .5)}"`);
  return <span style={{ width: size, height: size, borderRadius: "50%", background: info.color, border: "2px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function CopyBtn({ T, value, label }) {
  const [ok, setOk] = useState(false);
  if (!value) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1300); } catch { /* sem permissão de área de transferência */ }
  };
  return (
    <button onClick={copy} title={`Copiar ${label}`} aria-label={`Copiar ${label}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: ok ? "#22c55e22" : "transparent", border: `1px solid ${ok ? "#22c55e" : T.border}`, color: ok ? "#22c55e" : T.textMuted, borderRadius: 7, padding: "3px 7px", cursor: "pointer", fontSize: 10.5, fontWeight: 700, fontFamily: "inherit", transition: "all 160ms ease", flexShrink: 0 }}>
      {ok ? <Check size={11} /> : <Copy size={11} />}{ok ? "Copiado" : "Copiar"}
    </button>
  );
}

function Section({ T, title, icon: Icon, right, children }) {
  return (
    <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.borderSoft}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        {Icon && <Icon size={14} style={{ color: T.textMuted }} />}
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: T.textMuted }}>{title}</span>
        <span style={{ marginLeft: "auto" }}>{right}</span>
      </div>
      {children}
    </div>
  );
}

export function SidePanel(p) {
  return p.sel ? <Ficha {...p} /> : <Geral {...p} />;
}

// ── ficha do equipamento ──────────────────────────────────────────────────
function Ficha({ T, sel, equipamentos, keyOf, select, nearest, raio, ocorrencias, mudarStatus, onNovaOcorrencia, tasks, onCreateTask, onOpenTask, currentUser, showToast, onEdit, onMove, onRemove, onClose, compact, onExpand }) {
  const { ghost, inp, btn } = makeStyleHelpers(T);
  const info = EQUIP_TIPO[sel.tipo] || EQUIP_TIPO.outro;
  const lados = sel.dados?.lados || [];
  const n = sel.tipo === "totem" ? nearest.get(keyOf(sel)) : null;
  const atendidos = useMemo(() => sel.tipo !== "amplimax" ? [] : equipamentos
    .filter(e => e.tipo === "totem" && nearest.get(keyOf(e))?.amp === sel)
    .map(e => ({ e, d: nearest.get(keyOf(e)).d }))
    .sort((a, b) => a.d - b.d), [sel, equipamentos, nearest, keyOf]);
  const minhasOcorr = ocorrencias.filter(o => o.equipamento_id === sel.id);
  const abertas = minhasOcorr.filter(o => o.status === "aberta").length;
  const minhasTarefas = tasks.filter(t => t.equipamento_id != null && t.equipamento_id === sel.id)
    .sort((a, b) => (a.status === "concluido") - (b.status === "concluido") || (a.prazo || "9").localeCompare(b.prazo || "9"));
  const [novaTarefa, setNovaTarefa] = useState("");

  const criarTarefa = async (titulo, descricao = "") => {
    const t = (titulo || "").trim();
    if (!t || !onCreateTask) return;
    const saved = await onCreateTask({ titulo: t, descricao, responsaveis: currentUser ? [currentUser] : [], prazo: null, categoria: null, prioridade: "media", parent_id: null, projeto_id: null, equipamento_id: sel.id }, { silent: true });
    if (saved) showToast?.("Tarefa criada e ligada ao equipamento");
    setNovaTarefa("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ padding: "14px 16px 12px", display: "flex", gap: 12, alignItems: "flex-start" }} onClick={compact ? onExpand : undefined}>
        <TipoBadge tipo={sel.tipo} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: T.textBright, lineHeight: 1.25, wordBreak: "break-word" }}>{sel.name}</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{info.label} · {sel.area}</div>
        </div>
        <button onClick={onClose} aria-label="Fechar ficha" style={{ background: T.panelAlt, border: "none", color: T.textMuted, cursor: "pointer", width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
      </div>
      <div style={{ padding: "0 16px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(sel.categorias || []).map(c => <span key={c} style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: CATEGORIAS[c]?.color, borderRadius: 999, padding: "3px 9px" }}>{CATEGORIAS[c]?.short}</span>)}
        <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "3px 9px", color: abertas ? "#fff" : "#16a34a", background: abertas ? "#ef4444" : "#22c55e1f" }}>
          {abertas ? `${abertas} ocorrência${abertas > 1 ? "s" : ""} aberta${abertas > 1 ? "s" : ""}` : "Sem ocorrências"}
        </span>
      </div>

      <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        {(lados.length > 0 || sel.dados?.chip) && (
          <Section T={T} title="Identificação" icon={Radio}>
            {lados.map(l => (
              <div key={l.lado} style={{ display: "grid", gridTemplateColumns: "54px minmax(0,1fr)", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px dashed ${T.borderSoft}` }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: T.textMuted }}>Lado {l.lado}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: T.textFaint, width: 24 }}>MAC</span>
                    <code style={{ fontSize: 12, fontWeight: 700, color: l.mac ? T.text : T.textFaint, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{l.mac || l.obs || "—"}</code>
                    <CopyBtn T={T} value={l.mac} label="MAC" />
                  </div>
                  {l.ip && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: T.textFaint, width: 24 }}>IP</span>
                      <code style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1 }}>final .{l.ip}</code>
                      <CopyBtn T={T} value={l.ip} label="IP" />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sel.dados?.chip && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: T.textMuted, width: 54 }}>Chip</span>
                <code style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1 }}>{sel.dados.chip}</code>
                <CopyBtn T={T} value={sel.dados.chip} label="chip" />
              </div>
            )}
          </Section>
        )}

        {n && (
          <Section T={T} title="Conexão">
            <button onClick={() => select(n.amp)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", borderRadius: 10, border: `1px solid ${n.d <= raio ? "#22c55e55" : "#f9731655"}`, background: n.d <= raio ? "#22c55e12" : "#f9731612", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <TipoBadge tipo="amplimax" size={26} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.amp.name}</span>
                <span style={{ fontSize: 11, color: n.d <= raio ? "#16a34a" : "#ea580c", fontWeight: 700 }}>Amplimax mais próximo · {fmtDist(n.d)} {n.d <= raio ? "· dentro do alcance" : `· fora do alcance (${raio} m)`}</span>
              </span>
              <ChevronRight size={15} style={{ color: T.textFaint }} />
            </button>
          </Section>
        )}

        {sel.tipo === "amplimax" && (
          <Section T={T} title={`Totens mais perto deste Amplimax · ${atendidos.length}`}>
            {atendidos.length === 0 && <div style={{ fontSize: 12, color: T.textFaint }}>Nenhum totem tem este Amplimax como o mais próximo.</div>}
            {atendidos.map(({ e, d }) => (
              <button key={keyOf(e)} onClick={() => select(e)} className="tk-row" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 4px", border: "none", background: "transparent", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: d <= raio ? "#22c55e" : "#f97316", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                <span style={{ fontSize: 11, color: T.textFaint, fontWeight: 700 }}>{fmtDist(d)}</span>
              </button>
            ))}
          </Section>
        )}

        {sel.id != null && (
          <div style={{ padding: "4px 16px 12px", borderTop: `1px solid ${T.borderSoft}` }}>
            <OcorrenciasDoEquipamento T={T} lista={minhasOcorr} onStatus={mudarStatus} onNova={() => onNovaOcorrencia(sel)}
              onTarefa={onCreateTask ? (o) => criarTarefa(`${o.tipo} — ${sel.name}`, o.descricao || "") : undefined} />
          </div>
        )}

        {sel.id != null && onCreateTask && (
          <Section T={T} title={`Tarefas · ${minhasTarefas.filter(t => t.status !== "concluido").length} em aberto`} icon={ListTodo}>
            {minhasTarefas.map(t => (
              <button key={t.id} onClick={() => onOpenTask?.(t.id)} className="tk-row" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 4px", border: "none", background: "transparent", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <span title={TASK_STATUS[t.status]?.label} style={{ width: 8, height: 8, borderRadius: "50%", background: statusDot[t.status] || T.textFaint, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: t.status === "concluido" ? T.textFaint : T.text, textDecoration: t.status === "concluido" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titulo}</span>
                {t.prazo && t.status !== "concluido" && <span style={{ fontSize: 11, color: T.textFaint, fontWeight: 700 }}>{fmtPrazo(t.prazo)}</span>}
                <ChevronRight size={14} style={{ color: T.textFaint }} />
              </button>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input value={novaTarefa} onChange={e => setNovaTarefa(e.target.value)} onKeyDown={e => { if (e.key === "Enter") criarTarefa(novaTarefa); }} placeholder={`+ Nova tarefa para este ${info.label.toLowerCase()}`} style={inp({ fontSize: 12.5, padding: "8px 10px" })} />
              {novaTarefa.trim() && <button onClick={() => criarTarefa(novaTarefa)} style={{ ...btn(T.accent), flexShrink: 0 }}>Criar</button>}
            </div>
          </Section>
        )}

        <Section T={T} title="Ações">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <a href={`https://www.google.com/maps?q=${sel.lat},${sel.lng}`} target="_blank" rel="noopener noreferrer" style={{ ...ghost(), display: "flex", alignItems: "center", justifyContent: "center", gap: 5, textDecoration: "none", padding: "8px" }}><ExternalLink size={13} /> Google Maps</a>
            {sel.id != null && <button onClick={() => onEdit(sel)} style={{ ...ghost(), display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px" }}><Pencil size={13} /> Editar</button>}
            {sel.id != null && <button onClick={() => onMove(sel)} style={{ ...ghost(), display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px" }}><Move size={13} /> Mudar posição</button>}
            {sel.id != null && <button onClick={() => onRemove(sel)} style={{ ...ghost(), display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", color: "#ef4444", borderColor: "#ef444440" }}><Trash2 size={13} /> Remover</button>}
          </div>
          <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 8 }}>GPS: {sel.lat.toFixed(6)}, {sel.lng.toFixed(6)}</div>
        </Section>
      </div>
    </div>
  );
}

// ── visão geral + ocorrências ─────────────────────────────────────────────
function Geral({ T, equipamentos, visible, keyOf, select, layers, foraDoAlcance, comAberta, ocorrencias, mudarStatus, raio, onHidePanel, onExport, compact, onExpand }) {
  const [tab, setTab] = useState("geral");
  const [abertas, setAbertas] = useState(() => new Set());
  const porArea = useMemo(() => {
    const m = new Map();
    visible.forEach(e => { if (!m.has(e.area)) m.set(e.area, []); m.get(e.area).push(e); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([area, list]) => [area, list.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.name.localeCompare(b.name, "pt-BR"))]);
  }, [visible]);
  const nAbertas = ocorrencias.filter(o => o.status === "aberta").length;
  const byId = useMemo(() => new Map(equipamentos.filter(e => e.id != null).map(e => [e.id, e])), [equipamentos]);
  const toggleArea = (a) => setAbertas(s => { const n = new Set(s); if (n.has(a)) n.delete(a); else n.add(a); return n; });
  const mostraAlcance = layers.alcance || layers.ligacoes;
  const stat = (v, l, c, onClick) => (
    <button onClick={onClick} disabled={!onClick} style={{ flex: 1, minWidth: 0, textAlign: "left", background: T.panelAlt, border: `1px solid ${c ? `${c}44` : T.border}`, borderRadius: 12, padding: "10px 12px", cursor: onClick ? "pointer" : "default", fontFamily: "inherit" }}>
      <b style={{ display: "block", fontSize: 20, fontWeight: 800, color: c || T.textBright, lineHeight: 1 }}>{v}</b>
      <span style={{ fontSize: 10.5, color: T.textMuted }}>{l}</span>
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", gap: 8 }} onClick={compact ? onExpand : undefined}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.textBright }}>Equipamentos</div>
          <div style={{ fontSize: 11.5, color: T.textMuted }}>{visible.length} de {equipamentos.length} no mapa{nAbertas ? ` · ${nAbertas} ocorrência${nAbertas > 1 ? "s" : ""} aberta${nAbertas > 1 ? "s" : ""}` : ""}</div>
        </div>
        <button className="nm2-desk-close" onClick={onHidePanel} title="Esconder painel" aria-label="Esconder painel" style={{ background: T.panelAlt, border: "none", color: T.textMuted, cursor: "pointer", width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}><PanelRightClose size={16} /></button>
      </div>
      <div style={{ display: "flex", gap: 4, margin: "0 16px 10px", background: T.panelAlt, borderRadius: 10, padding: 3 }}>
        {[["geral", "Visão geral"], ["ocorr", `Ocorrências${nAbertas ? ` (${nAbertas})` : ""}`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: tab === k ? T.panel : "transparent", boxShadow: tab === k ? "0 1px 4px rgba(0,0,0,.2)" : "none", color: tab === k ? T.textBright : T.textMuted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 160ms ease" }}>{l}</button>
        ))}
      </div>

      <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        {tab === "geral" ? (
          <>
            <div style={{ display: "flex", gap: 8, padding: "0 16px 12px" }}>
              {stat(equipamentos.filter(e => e.tipo === "totem").reduce((s, e) => s + (/\d{2,3}\s*\/\s*\d{2,3}/.test(e.name) ? 2 : 1), 0), "totens instalados")}
              {stat(nAbertas, "ocorrências abertas", nAbertas ? "#ef4444" : null, nAbertas ? () => setTab("ocorr") : null)}
              {mostraAlcance && stat(foraDoAlcance.length, `totens fora de ${raio} m`, foraDoAlcance.length ? "#f97316" : "#22c55e", foraDoAlcance.length ? () => setAbertas(new Set(["__fora"])) : null)}
            </div>
            {mostraAlcance && foraDoAlcance.length > 0 && abertas.has("__fora") && (
              <div style={{ margin: "0 16px 12px", padding: 10, borderRadius: 10, background: "#f9731612", border: "1px solid #f9731640" }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "#ea580c", marginBottom: 4 }}>Totens longe de um Amplimax</div>
                {foraDoAlcance.map(e => (
                  <button key={keyOf(e)} onClick={() => select(e)} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "4px 0", fontSize: 12, color: T.text, cursor: "pointer", fontFamily: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>• {e.name}</button>
                ))}
              </div>
            )}
            {porArea.map(([area, list]) => {
              const open = abertas.has(area);
              const counts = {};
              list.forEach(e => { counts[e.tipo] = (counts[e.tipo] || 0) + 1; });
              const temAlerta = list.some(e => comAberta.has(e.id));
              return (
                <div key={area} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                  <button onClick={() => toggleArea(area)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    {open ? <ChevronDown size={15} style={{ color: T.textMuted }} /> : <ChevronRight size={15} style={{ color: T.textMuted }} />}
                    <span style={{ fontSize: 13, fontWeight: 800, color: T.textBright, flex: 1 }}>{area}</span>
                    {temAlerta && <AlertTriangle size={13} color="#ef4444" />}
                    <span style={{ display: "flex", gap: 3 }}>
                      {Object.entries(counts).map(([t, n]) => <span key={t} title={`${n} ${(EQUIP_TIPO[t] || EQUIP_TIPO.outro).label}`} style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: (EQUIP_TIPO[t] || EQUIP_TIPO.outro).color, borderRadius: 6, padding: "1px 5px" }}>{n}</span>)}
                    </span>
                  </button>
                  {open && (
                    <div style={{ padding: "0 10px 8px 30px", animation: "nm2-pop 200ms ease both" }}>
                      {list.map(e => (
                        <button key={keyOf(e)} onClick={() => select(e)} className="tk-row" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 6px", border: "none", background: "transparent", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                          <TipoBadge tipo={e.tipo} size={20} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                          {comAberta.has(e.id) && <AlertTriangle size={12} color="#ef4444" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.borderSoft}` }}>
              <button onClick={onExport} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}><Download size={14} /> Exportar planilha do que está no mapa</button>
            </div>
          </>
        ) : (
          <OcorrList T={T} ocorrencias={ocorrencias} byId={byId} select={select} mudarStatus={mudarStatus} />
        )}
      </div>
    </div>
  );
}

function OcorrList({ T, ocorrencias, byId, select, mudarStatus }) {
  const { sbtn } = makeStyleHelpers(T);
  const [filtro, setFiltro] = useState("aberta");
  const lista = ocorrencias.filter(o => filtro === "todas" || o.status === filtro);
  return (
    <div style={{ padding: "0 16px 14px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[["aberta", "Abertas"], ["resolvida", "Resolvidas"], ["todas", "Todas"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${filtro === k ? T.accent : T.border}`, background: filtro === k ? `${T.accent}18` : "transparent", color: filtro === k ? T.accent : T.textMuted }}>{l}</button>
        ))}
      </div>
      {lista.length === 0 && <div style={{ fontSize: 12, color: T.textFaint, padding: "8px 0" }}>{filtro === "aberta" ? "Nenhuma ocorrência aberta. Para registrar, toque num equipamento." : "Nada por aqui."}</div>}
      {lista.map(o => {
        const e = byId.get(o.equipamento_id);
        const resolvida = o.status === "resolvida";
        return (
          <div key={o.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: `1px solid ${T.borderSoft}`, opacity: resolvida ? .7 : 1 }}>
            {resolvida ? <CheckCircle2 size={15} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e?.name || "Equipamento removido"}</div>
              <div style={{ fontSize: 12.5, color: resolvida ? T.textMuted : "#ef4444", fontWeight: 700 }}>{o.tipo}</div>
              {o.descricao && <div style={{ fontSize: 12, color: T.textMuted }}>{o.descricao}</div>}
              <div style={{ fontSize: 10.5, color: T.textFaint }}>{o.criado_por} · {fmtData(o.created_at)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
              {e && <button onClick={() => select(e)} style={{ ...sbtn(T.accent), display: "inline-flex", alignItems: "center", gap: 4 }}><Crosshair size={12} /> Ver</button>}
              {resolvida
                ? <button onClick={() => mudarStatus(o, "aberta")} style={{ ...sbtn(T.textMuted), display: "inline-flex", alignItems: "center", gap: 4 }}><RotateCcw size={12} /> Reabrir</button>
                : <button onClick={() => mudarStatus(o, "resolvida")} style={{ ...sbtn("#16a34a"), display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} /> Resolver</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── novo / editar equipamento ─────────────────────────────────────────────
export function EquipForm({ T, inp, modo, equip, areas, onClose, onSave }) {
  const { btn, ghost } = makeStyleHelpers(T);
  const ladoDe = (l) => (equip?.dados?.lados || []).find(x => x.lado === l) || {};
  const [f, setF] = useState(() => ({
    name: equip?.name || "", tipo: equip?.tipo || "totem", area: equip?.area || "",
    categorias: equip?.categorias || [], chip: equip?.dados?.chip || "",
    aMac: ladoDe("A").mac || "", aIp: ladoDe("A").ip || "", bMac: ladoDe("B").mac || "", bIp: ladoDe("B").ip || "",
  }));
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
  const lbl = (c) => <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: .6 }}>{c}</div>;
  const toggleCat = (c) => setF(p => ({ ...p, categorias: p.categorias.includes(c) ? p.categorias.filter(x => x !== c) : [...p.categorias, c] }));
  const salvar = () => {
    if (!f.name.trim() || !f.area.trim()) return;
    const lados = [];
    if (f.aMac.trim() || f.aIp.trim()) lados.push({ lado: "A", ...(f.aMac.trim() && { mac: f.aMac.trim().toUpperCase() }), ...(f.aIp.trim() && { ip: f.aIp.trim() }) });
    if (f.bMac.trim() || f.bIp.trim()) lados.push({ lado: "B", ...(f.bMac.trim() && { mac: f.bMac.trim().toUpperCase() }), ...(f.bIp.trim() && { ip: f.bIp.trim() }) });
    const dados = { ...(equip?.dados || {}) };
    if (lados.length) dados.lados = lados; else delete dados.lados;
    if (f.chip.trim()) dados.chip = f.chip.trim(); else delete dados.chip;
    onSave({ name: f.name.trim(), tipo: f.tipo, area: f.area.trim(), categorias: f.tipo === "totem" ? f.categorias : [], dados });
  };
  return (
    <Overlay T={T} onClose={onClose}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: T.textBright }}>{modo === "novo" ? "Adicionar equipamento" : "Editar equipamento"}</h3>
      {lbl("Nome *")}
      <input autoFocus value={f.name} onChange={set("name")} placeholder="ex.: totem113/114 - L2000 - Porta 5" style={inp({ marginBottom: 10 })} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>{lbl("Tipo")}<select value={f.tipo} onChange={set("tipo")} style={inp()}>{Object.entries(EQUIP_TIPO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div>{lbl("Área *")}<input value={f.area} onChange={set("area")} list="nm2-areas" placeholder="ex.: Fundição 2" style={inp()} /><datalist id="nm2-areas">{areas.map(a => <option key={a} value={a} />)}</datalist></div>
      </div>
      {f.tipo === "totem" && (
        <>
          {lbl("Categoria")}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {Object.entries(CATEGORIAS).map(([k, c]) => {
              const on = f.categorias.includes(k);
              return <button key={k} type="button" onClick={() => toggleCat(k)} style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${on ? c.color : T.border}`, background: on ? `${c.color}22` : "transparent", color: on ? c.color : T.textMuted }}>{on ? "✓ " : ""}{c.label}</button>;
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 8, marginBottom: 6 }}>
            <div>{lbl("Lado A · MAC")}<input value={f.aMac} onChange={set("aMac")} placeholder="1C89B729E748" style={inp({ fontFamily: "monospace" })} /></div>
            <div>{lbl("Lado A · IP final")}<input value={f.aIp} onChange={set("aIp")} placeholder="25" inputMode="numeric" style={inp()} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>{lbl("Lado B · MAC")}<input value={f.bMac} onChange={set("bMac")} placeholder="58EA68182E68" style={inp({ fontFamily: "monospace" })} /></div>
            <div>{lbl("Lado B · IP final")}<input value={f.bIp} onChange={set("bIp")} placeholder="26" inputMode="numeric" style={inp()} /></div>
          </div>
        </>
      )}
      {lbl("Chip (opcional)")}
      <input value={f.chip} onChange={set("chip")} placeholder="Número do chip, se tiver" style={inp({ marginBottom: 4 })} />
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={onClose} style={{ ...ghost(), borderRadius: 999 }}>Cancelar</button>
        <button onClick={salvar} disabled={!f.name.trim() || !f.area.trim()} style={{ ...btn(T.accent), flex: 1, borderRadius: 999, padding: 10, opacity: f.name.trim() && f.area.trim() ? 1 : .5 }}>{modo === "novo" ? "Continuar: posicionar no mapa" : "Salvar"}</button>
      </div>
    </Overlay>
  );
}
