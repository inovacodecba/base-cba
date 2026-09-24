// Sub-aba "Treinamentos" (dentro de "Documentos"): controle de
// validade de documentos por colaborador — ASO, Ficha de Entrega de EPI,
// treinamentos de segurança do trabalho na CBA etc. Substitui a planilha
// externa "MATRIZ DOCUMENTAL" que a equipe usava no Google Sheets.
//
// Regra de visibilidade (igual em espírito à privacidade de pastas): cada
// colaborador só vê os PRÓPRIOS documentos; o admin (Francisco) vê todo
// mundo, navegando por perfil (mesmo padrão de cartões usado na aba
// "Pastas"). Só o admin cria/edita/exclui — é informação de RH/compliance,
// não algo que cada colaborador deveria poder alterar sobre si mesmo.
//
// ⚠️ Mesma ressalva de segurança do resto da aba Documentos: essa
// separação por colaborador é uma checagem de INTERFACE. O RLS do Supabase
// continua aberto (mesmo modelo do resto do app hoje).
import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, Search, X, Download } from "lucide-react";
import { Overlay } from "../common.jsx";
import { makeStyleHelpers } from "../../theme.js";
import { dlCSV } from "../../utils.js";
import { docStatus, formatDateBR } from "./helpers.js";

const emptyForm = (colaborador = "") => ({
  colaborador, documento: "", data_emissao: "", data_vencimento: "", observacoes: "",
});

// "Válido"/"Vence em Xd"/"Vencido"/"Sem vencimento" → categoria fixa, pra
// usar nos filtros rápidos (o rótulo de "Vence em Xd" muda o número todo dia,
// não dá pra comparar direto com o filtro selecionado).
const statusCategory = (dataVencimento) => {
  const s = docStatus(dataVencimento);
  if (s.label === "Vencido") return "vencido";
  if (s.label === "Sem vencimento") return "sem";
  if (s.dias != null && s.dias <= 30) return "vence";
  return "valido";
};

const STATUS_FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "valido", label: "Válidos" },
  { key: "vence", label: "Vence em breve" },
  { key: "vencido", label: "Vencidos" },
];

const exportRows = (list) => [
  ["Colaborador", "Documento", "Data de Emissão", "Data de Vencimento", "Status", "Observações"],
  ...list.map(d => [d.colaborador, d.documento, formatDateBR(d.data_emissao), formatDateBR(d.data_vencimento), docStatus(d.data_vencimento).label, d.observacoes || ""]),
];

export function ColaboradorDocs({ T, docs, team, currentUser, isAdmin, onCreate, onUpdate, onDelete, showToast }) {
  const { inp, btn, ghost } = makeStyleHelpers(T);
  const [profileView, setProfileView] = useState(isAdmin ? null : currentUser);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [modal, setModal] = useState(null); // { mode: "new"|"edit", form, id? }

  const people = useMemo(() => {
    const names = new Set();
    docs.forEach(d => names.add(d.colaborador));
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [docs]);

  const visiblePerson = isAdmin ? profileView : currentUser;

  const personDocs = useMemo(() => {
    if (!visiblePerson) return [];
    let list = docs.filter(d => d.colaborador === visiblePerson);
    if (statusFilter !== "todos") list = list.filter(d => statusCategory(d.data_vencimento) === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d => d.documento.toLowerCase().includes(q));
    }
    const rank = (d) => {
      const s = docStatus(d.data_vencimento);
      if (s.label === "Vencido") return 0;
      if (s.dias != null && s.dias <= 30) return 1;
      if (s.label === "Sem vencimento") return 3;
      return 2;
    };
    return [...list].sort((a, b) => rank(a) - rank(b) || (a.data_vencimento || "9999-99-99").localeCompare(b.data_vencimento || "9999-99-99"));
  }, [docs, visiblePerson, search, statusFilter]);

  const allVencidos = useMemo(() => docs.filter(d => statusCategory(d.data_vencimento) === "vencido"), [docs]);
  const exportVencidos = () => {
    if (!allVencidos.length) return showToast("Nenhum documento vencido no momento", "warn");
    dlCSV(`treinamentos_vencidos_cba_${Date.now()}.csv`, exportRows(allVencidos));
    showToast(`${allVencidos.length} documento(s) vencido(s) exportado(s)`);
  };
  const exportPerson = () => {
    if (!personDocs.length) return showToast("Nada pra exportar com esse filtro", "warn");
    dlCSV(`documentos_${visiblePerson.replace(/\s+/g, "_")}_${Date.now()}.csv`, exportRows(personDocs));
    showToast("Exportado");
  };

  const openNew = () => setModal({ mode: "new", form: emptyForm(visiblePerson || "") });
  const openEdit = (d) => setModal({ mode: "edit", id: d.id, form: { colaborador: d.colaborador, documento: d.documento, data_emissao: d.data_emissao || "", data_vencimento: d.data_vencimento || "", observacoes: d.observacoes || "" } });

  const saveModal = () => {
    const { colaborador, documento, data_emissao, data_vencimento, observacoes } = modal.form;
    if (!colaborador.trim()) return showToast("Selecione o colaborador", "err");
    if (!documento.trim()) return showToast("Digite o nome do documento", "err");
    const payload = {
      colaborador: colaborador.trim(), documento: documento.trim(),
      data_emissao: data_emissao || null, data_vencimento: data_vencimento || null,
      observacoes: observacoes.trim() || null,
    };
    if (modal.mode === "new") onCreate(payload);
    else onUpdate(modal.id, payload);
    setModal(null);
  };

  const setForm = (patch) => setModal(m => ({ ...m, form: { ...m.form, ...patch } }));

  return (
    <div>
      <style>{`
        .cd-pill{display:flex;align-items:center;gap:8px;background:${T.panel};border:1px solid ${T.border};border-radius:999px;padding:6px 14px 6px 6px;cursor:pointer;color:${T.text};font-size:12.5px;font-weight:600;transition:border-color 150ms ease,transform 150ms ease}
        .cd-pill:hover{border-color:${T.accent}!important;transform:translateY(-1px)}
        .cd-row{display:grid;grid-template-columns:1.6fr .8fr .8fr .9fr 1.2fr auto;gap:10px;align-items:center;padding:9px 10px;border-radius:7px;border:1px solid ${T.border};background:${T.panel}}
        .cd-row:hover .cd-actions{opacity:1}
        .cd-actions{opacity:0;transition:opacity 150ms ease;display:flex;gap:4px}
        @media(max-width:760px){.cd-row{grid-template-columns:1fr;gap:4px}}
      `}</style>

      {isAdmin && !profileView && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5 }}>Selecione um colaborador</div>
            {allVencidos.length > 0 && (
              <button onClick={exportVencidos} style={{ ...ghost(), display: "flex", alignItems: "center", gap: 6, color: "#ef4444", borderColor: "#ef444440" }}>
                <Download size={13} /> Exportar vencidos ({allVencidos.length})
              </button>
            )}
          </div>
          {people.length === 0 ? (
            <EmptyState T={T} text='Nenhum documento cadastrado ainda. Clique em "Adicionar documento" pra começar.' onAdd={openNew} />
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {people.map(name => {
                const nDocs = docs.filter(d => d.colaborador === name);
                const vencido = nDocs.some(d => docStatus(d.data_vencimento).label === "Vencido");
                return (
                  <button key={name} className="cd-pill" onClick={() => setProfileView(name)}>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: `${T.accent}22`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{name.slice(0, 1)}</span>
                    {name}
                    {vencido && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} title="Tem documento vencido" />}
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={openNew} style={{ ...ghost(), display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Adicionar documento</button>
        </div>
      )}

      {visiblePerson && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {isAdmin && (
                <button onClick={() => setProfileView(null)} aria-label="Voltar para colaboradores" style={{ ...ghost(), display: "flex", alignItems: "center", gap: 4, padding: "6px 10px" }}>
                  <ChevronLeft size={14} />
                </button>
              )}
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.textBright }}>{visiblePerson}{!isAdmin && <span style={{ color: T.textFaint, fontWeight: 500 }}> (você)</span>}</h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: T.textFaint }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar documento..." style={{ width: 170, padding: "7px 10px 7px 28px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.input, color: T.text, fontSize: 12, outline: "none", fontFamily: "inherit" }} />
              </div>
              <button onClick={exportPerson} aria-label="Exportar CSV" title="Exportar CSV" style={{ ...ghost(), display: "flex", alignItems: "center", gap: 6, padding: "7px 10px" }}><Download size={13} /></button>
              {isAdmin && <button onClick={openNew} style={{ ...btn(T.accent), display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Adicionar</button>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {STATUS_FILTERS.map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
                padding: "5px 12px", borderRadius: 999, border: `1px solid ${statusFilter === f.key ? T.accent : T.border}`,
                background: statusFilter === f.key ? `${T.accent}18` : "transparent", color: statusFilter === f.key ? T.accent : T.textMuted,
                fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>{f.label}</button>
            ))}
          </div>

          {personDocs.length === 0 ? (
            <EmptyState T={T} text={
              statusFilter !== "todos" || search.trim() ? "Nenhum documento encontrado com esse filtro."
              : isAdmin ? `Nenhum documento cadastrado pra ${visiblePerson} ainda.`
              : "Nenhum documento cadastrado ainda. Fale com o admin se algo estiver faltando."
            } />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="cd-row" style={{ border: "none", background: "none", padding: "0 10px", color: T.textFaint, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4 }}>
                <span>Documento</span><span>Emissão</span><span>Vencimento</span><span>Status</span><span>Observações</span><span />
              </div>
              {personDocs.map(d => {
                const s = docStatus(d.data_vencimento);
                return (
                  <div key={d.id} className="cd-row">
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{d.documento}</span>
                    <span style={{ fontSize: 11.5, color: T.textMuted }}>{formatDateBR(d.data_emissao)}</span>
                    <span style={{ fontSize: 11.5, color: T.textMuted }}>{formatDateBR(d.data_vencimento)}</span>
                    <span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: s.color, background: s.bg, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{s.label}</span>
                    </span>
                    <span style={{ fontSize: 11, color: T.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.observacoes || ""}>{d.observacoes || "—"}</span>
                    {isAdmin ? (
                      <span className="cd-actions">
                        <button onClick={() => openEdit(d)} aria-label="Editar" style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.textFaint, cursor: "pointer" }}><Pencil size={12} /></button>
                        <button onClick={() => onDelete(d)} aria-label="Excluir" style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.textFaint, cursor: "pointer" }}><Trash2 size={12} /></button>
                      </span>
                    ) : <span />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modal && (
        <Overlay T={T} onClose={() => setModal(null)}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: T.textBright }}>{modal.mode === "new" ? "Adicionar documento" : "Editar documento"}</h3>

          <label style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, marginBottom: 4, display: "block" }}>Colaborador</label>
          <select value={modal.form.colaborador} onChange={e => setForm({ colaborador: e.target.value })} style={inp({ marginBottom: 12 })}>
            <option value="">Selecione...</option>
            {team.map(name => <option key={name} value={name}>{name}</option>)}
          </select>

          <label style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, marginBottom: 4, display: "block" }}>Documento</label>
          <input autoFocus value={modal.form.documento} onChange={e => setForm({ documento: e.target.value })} placeholder="Ex.: ASO, Trabalho em Altura - CBA..." style={inp({ marginBottom: 12 })} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, marginBottom: 4, display: "block" }}>Data de emissão</label>
              <input type="date" value={modal.form.data_emissao} onChange={e => setForm({ data_emissao: e.target.value })} style={inp()} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, marginBottom: 4, display: "block" }}>Data de vencimento</label>
              <input type="date" value={modal.form.data_vencimento} onChange={e => setForm({ data_vencimento: e.target.value })} style={inp()} />
            </div>
          </div>

          <label style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, marginBottom: 4, display: "block" }}>Observações (opcional)</label>
          <textarea value={modal.form.observacoes} onChange={e => setForm({ observacoes: e.target.value })} rows={2} style={{ ...inp({ marginBottom: 16 }), resize: "vertical", fontFamily: "inherit" }} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            {modal.mode === "edit" ? (
              <button onClick={() => { onDelete({ id: modal.id, documento: modal.form.documento, colaborador: modal.form.colaborador }); setModal(null); }} style={{ ...ghost(), color: "#ef4444", borderColor: "#ef444440" }}>Excluir</button>
            ) : <span />}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setModal(null)} style={ghost()}>Cancelar</button>
              <button onClick={saveModal} style={btn(T.accent)}>Salvar</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function EmptyState({ T, text, onAdd }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 20px", color: T.textFaint, textAlign: "center" }}>
      <span style={{ fontSize: 12.5, maxWidth: 340 }}>{text}</span>
    </div>
  );
}
