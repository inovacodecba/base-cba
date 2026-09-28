// Ocorrências dos equipamentos do Mapa (28/09/2026) — ex.: "Sem Amplimax",
// "Totem caído". Tabela equipamento_ocorrencias no Supabase. Cada ocorrência
// fica "aberta" até alguém marcar como resolvida; quem registrou/resolveu
// vem do login (preenchido pelo banco, não pelo navegador).
//
// O painel da lista fica embaixo do mapa e começa FECHADO — o usuário pediu
// que não aparecesse o tempo todo, só quando quiser ver.
import { useState, useMemo } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Crosshair, RotateCcw, X, Plus } from "lucide-react";
import { Overlay } from "../common.jsx";
import { makeStyleHelpers } from "../../theme.js";
import { EQUIP_TIPO } from "../../constants.js";

export const OCORR_TIPOS = ["Sem Amplimax", "Totem caído", "Sem energia", "Sem rede / sinal", "Danificado", "Outro"];
const COR = "#ef4444";

const fmtData = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Formulário de nova ocorrência (abre em cima do mapa).
export function OcorrenciaForm({ T, equipamento, onSave, onClose }) {
  const { inp, btn, ghost } = makeStyleHelpers(T);
  const [tipo, setTipo] = useState("");
  const [outro, setOutro] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const tipoFinal = tipo === "Outro" ? outro.trim() : tipo;

  const salvar = async () => {
    if (!tipoFinal) return;
    setSalvando(true);
    const ok = await onSave({ equipamento_id: equipamento.id, tipo: tipoFinal, descricao: descricao.trim() || null });
    setSalvando(false);
    if (ok) onClose();
  };

  return (
    <Overlay T={T} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.textBright }}>Registrar ocorrência</h3>
        <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 4 }}><X size={18} /></button>
      </div>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 14 }}>{equipamento.name} · {equipamento.area}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 6 }}>O que aconteceu?</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
        {OCORR_TIPOS.map(t => {
          const sel = tipo === t;
          return (
            <button key={t} onClick={() => setTipo(t)} style={{
              padding: "10px 8px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
              border: `1.5px solid ${sel ? COR : T.border}`, background: sel ? `${COR}18` : T.panelAlt, color: sel ? T.textBright : T.text,
            }}>{t}</button>
          );
        })}
      </div>
      {tipo === "Outro" && (
        <input autoFocus value={outro} onChange={e => setOutro(e.target.value)} maxLength={60} placeholder="Qual o problema?" style={inp({ marginTop: 8 })} />
      )}
      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, margin: "12px 0 6px" }}>Observação <span style={{ fontWeight: 400, color: T.textFaint }}>(opcional)</span></div>
      <textarea value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={500} rows={3} placeholder="Ex.: poste derrubado pela empilhadeira" style={inp({ resize: "vertical" })} />
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button disabled={!tipoFinal || salvando} onClick={salvar} style={{ ...btn(COR, "#fff"), flex: 1, padding: "10px", opacity: !tipoFinal || salvando ? .5 : 1 }}>
          {salvando ? "Salvando…" : "Registrar"}
        </button>
        <button onClick={onClose} style={ghost()}>Cancelar</button>
      </div>
    </Overlay>
  );
}

// Lista das ocorrências de UM equipamento (painel do equipamento selecionado).
export function OcorrenciasDoEquipamento({ T, lista, onStatus, onNova }) {
  const { sbtn } = makeStyleHelpers(T);
  const abertas = lista.filter(o => o.status === "aberta");
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: abertas.length ? 8 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: abertas.length ? COR : T.textMuted }}>
          {abertas.length ? `${abertas.length} ocorrência${abertas.length > 1 ? "s" : ""} aberta${abertas.length > 1 ? "s" : ""}` : "Nenhuma ocorrência aberta"}
        </span>
        <button onClick={onNova} style={{ ...sbtn(COR), marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}><Plus size={12} /> Registrar ocorrência</button>
      </div>
      {abertas.map(o => (
        <div key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderTop: `1px solid ${T.borderSoft}` }}>
          <AlertTriangle size={14} color={COR} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{o.tipo}</div>
            {o.descricao && <div style={{ fontSize: 12, color: T.textMuted }}>{o.descricao}</div>}
            <div style={{ fontSize: 10.5, color: T.textFaint }}>{o.criado_por} · {fmtData(o.created_at)}</div>
          </div>
          <button onClick={() => onStatus(o, "resolvida")} style={{ ...sbtn("#16a34a"), display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}><CheckCircle2 size={12} /> Resolver</button>
        </div>
      ))}
    </div>
  );
}

// Painel "Ocorrências" embaixo do mapa — começa fechado.
export function OcorrenciasPanel({ T, ocorrencias, equipById, destacar, setDestacar, onStatus, onFocus }) {
  const { sbtn } = makeStyleHelpers(T);
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState("aberta"); // aberta | resolvida | todas
  const abertas = ocorrencias.filter(o => o.status === "aberta").length;
  const lista = useMemo(() => ocorrencias.filter(o => filtro === "todas" || o.status === filtro), [ocorrencias, filtro]);

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
      <button onClick={() => setAberto(a => !a)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        {aberto ? <ChevronDown size={16} color={T.textMuted} /> : <ChevronRight size={16} color={T.textMuted} />}
        <AlertTriangle size={16} color={abertas ? COR : T.textFaint} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.textBright }}>Ocorrências dos equipamentos</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: abertas ? "#fff" : T.textFaint, background: abertas ? COR : T.panelAlt2, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>{abertas} aberta{abertas === 1 ? "" : "s"}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.textFaint }}>{aberto ? "ocultar" : "ver"}</span>
      </button>

      {aberto && (
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {[["aberta", "Abertas"], ["resolvida", "Resolvidas"], ["todas", "Todas"]].map(([k, l]) => (
              <button key={k} onClick={() => setFiltro(k)} style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${filtro === k ? T.accent : T.border}`, background: filtro === k ? `${T.accent}18` : "transparent", color: filtro === k ? T.accent : T.textMuted,
              }}>{l}</button>
            ))}
            <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.textMuted, cursor: "pointer" }}>
              <input type="checkbox" checked={destacar} onChange={e => setDestacar(e.target.checked)} /> Destacar no mapa
            </label>
          </div>

          {lista.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textFaint, padding: "6px 0" }}>
              {filtro === "aberta" ? "Nenhuma ocorrência aberta. Para registrar, toque em um equipamento no mapa." : "Nada por aqui."}
            </div>
          ) : lista.map(o => {
            const e = equipById.get(o.equipamento_id);
            const info = e ? (EQUIP_TIPO[e.tipo] || EQUIP_TIPO.outro) : EQUIP_TIPO.outro;
            const resolvida = o.status === "resolvida";
            return (
              <div key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderTop: `1px solid ${T.borderSoft}`, opacity: resolvida ? .7 : 1 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: info.color, flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e?.name || "Equipamento removido"}</div>
                  <div style={{ fontSize: 12.5, color: resolvida ? T.textMuted : COR, fontWeight: 600 }}>
                    {resolvida ? <CheckCircle2 size={12} color="#16a34a" style={{ verticalAlign: -2, marginRight: 4 }} /> : null}{o.tipo}
                  </div>
                  {o.descricao && <div style={{ fontSize: 12, color: T.textMuted }}>{o.descricao}</div>}
                  <div style={{ fontSize: 10.5, color: T.textFaint }}>
                    {e?.area ? `${e.area} · ` : ""}{o.criado_por} · {fmtData(o.created_at)}
                    {resolvida && o.resolvido_em ? ` · resolvida por ${o.resolvido_por} em ${fmtData(o.resolvido_em)}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                  {e && <button onClick={() => onFocus(e)} style={{ ...sbtn(T.accent), display: "inline-flex", alignItems: "center", gap: 4 }}><Crosshair size={12} /> Ver</button>}
                  {resolvida
                    ? <button onClick={() => onStatus(o, "aberta")} style={{ ...sbtn(T.textMuted), display: "inline-flex", alignItems: "center", gap: 4 }}><RotateCcw size={12} /> Reabrir</button>
                    : <button onClick={() => onStatus(o, "resolvida")} style={{ ...sbtn("#16a34a"), display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} /> Resolver</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
