// Aba "Documentos" — repositório de arquivos da empresa (veículos, contratos,
// notas fiscais etc.), organizado em pastas com subpastas, ao estilo de um
// explorador de arquivos, mas com o visual consistente do resto do app.
// Toda a lógica de CRUD/Storage fica no App.jsx (mesmo padrão
// container/presentational já usado em todo o projeto) — este componente só
// recebe dados prontos + callbacks.
import { useState, useMemo, useRef, useEffect } from "react";
import {
  Folder, FolderPlus, FolderOpen, Upload, Search, Pencil, Trash2, Download,
  Eye, X, ChevronRight, ChevronLeft, Home, Lock, Unlock, Users, Workflow,
} from "lucide-react";
import { Overlay } from "../common.jsx";
import { makeStyleHelpers } from "../../theme.js";
import { fileKind, formatBytes, isPreviewable, isImageFile } from "./helpers.js";
import { ColaboradorDocs } from "./ColaboradorDocs.jsx";

// Tipo de dado custom usado no drag-and-drop interno (mover documento entre
// pastas) — distingue de um arrastar-de-fora (arquivos do sistema
// operacional, que chegam em `e.dataTransfer.files`).
const DRAG_DOC_TYPE = "application/x-doc-id";

// Três tamanhos de card pra grade de pastas/arquivos — "P" é o tamanho
// original, "M" e "G" aumentam ícone/miniatura, texto e respiro do card na
// mesma proporção. Guardado por navegador (não por usuário) em localStorage,
// já que é preferência de exibição, não dado do negócio.
const CARD_SIZE_STORAGE_KEY = "cba_docs_card_size";
const SIZE_PRESETS = {
  small: { key: "small", label: "P", title: "Pequeno", grid: 148, mobileGrid: 110, thumb: 52, icon: 30, pad: "14px 12px 10px", name: 11.5 },
  medium: { key: "medium", label: "M", title: "Médio", grid: 180, mobileGrid: 132, thumb: 68, icon: 37, pad: "17px 14px 12px", name: 12.5 },
  large: { key: "large", label: "G", title: "Grande", grid: 218, mobileGrid: 158, thumb: 86, icon: 46, pad: "20px 16px 14px", name: 13.5 },
};

export function Documentos({
  T, folders, documents, currentUser, ADMIN, isAdmin, team,
  onCreateFolder, onRenameFolder, onDeleteFolder, onToggleFolderPrivacy,
  onUploadFiles, onRenameDocument, onDeleteDocument, onMoveDocument,
  onBulkMoveDocuments, onBulkDelete,
  getDocUrl, colaboradorDocs, onCreateColaboradorDoc, onUpdateColaboradorDoc, onDeleteColaboradorDoc,
  jumpSignal, showToast,
}) {
  const { inp, btn, ghost, sbtn } = makeStyleHelpers(T);
  const [section, setSection] = useState("pastas"); // "pastas" | "treinamentos" | "processos"

  // Permite abrir a aba já numa sub-aba específica (ex.: clique num alerta de
  // treinamento vencendo no Dashboard) sem precisar levantar `section` pro
  // App.jsx — só reage quando `jumpSignal` muda (token novo a cada clique).
  useEffect(() => {
    if (jumpSignal?.section) setSection(jumpSignal.section);
  }, [jumpSignal]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [profileView, setProfileView] = useState(null); // nome do usuário sendo visualizado via "Perfis" (só admin)
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [dragOverTarget, setDragOverTarget] = useState(null); // id da pasta (ou "root") sendo sobrevoada ao arrastar um documento
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderPrivate, setNewFolderPrivate] = useState(false);
  const [renaming, setRenaming] = useState(null); // { kind: "folder"|"doc", id, value }
  const [preview, setPreview] = useState(null); // documento em visualização
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [cardSize, setCardSize] = useState(() => {
    try { return SIZE_PRESETS[localStorage.getItem(CARD_SIZE_STORAGE_KEY)] ? localStorage.getItem(CARD_SIZE_STORAGE_KEY) : "small"; } catch { return "small"; }
  });
  const sizePreset = SIZE_PRESETS[cardSize];
  useEffect(() => { try { localStorage.setItem(CARD_SIZE_STORAGE_KEY, cardSize); } catch { /* localStorage indisponível (modo privado etc.) — só não persiste a preferência */ } }, [cardSize]);

  // Seleção múltipla (checkbox em cada card) — pra ações em lote (mover,
  // excluir). Mesmo padrão já usado na aba Inventário (`selectedIds` lá).
  // Guarda pastas e documentos em sets separados porque só documento pode
  // ser movido em massa hoje (não existe endpoint pra mover pasta).
  const [selectedFolders, setSelectedFolders] = useState(() => new Set());
  const [selectedDocs, setSelectedDocs] = useState(() => new Set());
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const selectedCount = selectedFolders.size + selectedDocs.size;
  const clearSelection = () => { setSelectedFolders(new Set()); setSelectedDocs(new Set()); };
  const toggleFolderSel = (id) => setSelectedFolders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleDocSel = (id) => setSelectedDocs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Troca de pasta/aba muda o que está visível na grade — a seleção some
  // junto, senão o usuário voltaria pra outra pasta e a barra "N
  // selecionados" continuaria lá se referindo a itens que nem aparecem mais.
  useEffect(() => { clearSelection(); }, [currentFolderId, section]);
  // Se um item selecionado for excluído por outra via (ex.: outra aba/pessoa,
  // ou a própria exclusão em lote), tira ele da seleção automaticamente —
  // evita a barra mostrar uma contagem que inclui itens que não existem mais.
  useEffect(() => {
    setSelectedFolders(prev => { const n = new Set([...prev].filter(id => folders.some(f => f.id === id))); return n.size === prev.size ? prev : n; });
    setSelectedDocs(prev => { const n = new Set([...prev].filter(id => documents.some(d => d.id === id))); return n.size === prev.size ? prev : n; });
  }, [folders, documents]);

  // Rede de segurança contra o "tracejado grudado": se o usuário soltar (ou
  // cancelar arrastando pra fora da janela) em qualquer lugar da página, os
  // dois indicadores de drag são zerados. Sem isso, um drop que é capturado
  // por um alvo mais específico (ex.: soltar em cima de uma pasta) nunca
  // chegava ao contêiner externo, e o aviso "solte aqui" ficava preso na tela.
  useEffect(() => {
    const reset = () => { setDragOver(false); setDragOverTarget(null); };
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    return () => { window.removeEventListener("dragend", reset); window.removeEventListener("drop", reset); };
  }, []);

  const path = useMemo(() => {
    const p = [];
    let cur = currentFolderId;
    while (cur != null) {
      const f = folders.find(x => x.id === cur);
      if (!f) break;
      p.unshift(f);
      cur = f.parent_id;
    }
    return p;
  }, [currentFolderId, folders]);

  // Uma pasta privada só aparece pra quem criou ou pro admin — pra todo
  // mundo mais, ela simplesmente não existe na listagem (nem o nome
  // aparece). Isso vale em qualquer profundidade, não só na raiz: uma
  // subpasta privada dentro de uma pasta pública continua escondida dos
  // outros mesmo que eles consigam entrar na pasta pai.
  const folderVisible = (f) => isAdmin || !f.is_private || f.created_by === currentUser;

  // A aba "Processos" reaproveita 100% do explorador de Pastas — não é um
  // componente separado. A única pasta com `is_processos_root=true` (criada
  // pela migração) é o "teto" de toda a árvore de Processos: ao clicar na
  // aba, navegamos direto pra dentro dela, então daí em diante tudo (criar
  // subpasta, upload, drag-drop, privacidade) já funciona sem nenhum código
  // extra, porque passa a ser só uma pasta normal como qualquer outra.
  // `undefined` (não `null`) enquanto `folders` ainda não carregou ou a
  // migração `supabase_migration_documents_processos.sql` não foi rodada.
  const processosRoot = useMemo(() => folders.find(f => f.is_processos_root), [folders]);

  const searching = search.trim().length > 0;
  const childFolders = useMemo(() => {
    // A pasta-raiz de Processos nunca aparece como card em lugar nenhum —
    // ela é só o "teto" técnico da árvore, não algo que o usuário deveria
    // poder renomear/excluir pela grade normal de pastas.
    let list = folders.filter(f => f.parent_id === currentFolderId && !f.is_processos_root);
    if (!isAdmin) list = list.filter(folderVisible);
    else if (currentFolderId === null && profileView) list = list.filter(f => f.created_by === profileView);
    return list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [folders, currentFolderId, isAdmin, currentUser, profileView]);
  const childDocs = useMemo(() => {
    let list = documents.filter(d => d.folder_id === currentFolderId);
    // Documentos soltos na raiz (sem pasta) não têm como ser marcados
    // privados — só uma pasta pode ser privada — então na raiz "de verdade"
    // eles aparecem pra todo mundo; dentro de "Perfil: Fulano" mostramos só
    // os que aquela pessoa enviou, pra visão fazer sentido como "o que é
    // dela". Documentos dentro de uma pasta já herdam a visibilidade da
    // pasta (se ela não aparece na lista acima, não dá nem pra entrar nela).
    if (isAdmin && currentFolderId === null && profileView) list = list.filter(d => d.uploaded_by === profileView);
    return list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [documents, currentFolderId, isAdmin, profileView]);

  // Usada só na busca global (que varre todas as pastas) — sem isso, o campo
  // de busca seria um jeito de burlar a privacidade das pastas, encontrando
  // pelo nome um documento que está dentro de uma pasta privada de outra
  // pessoa mesmo sem poder navegar até lá.
  const isDocVisible = (doc) => {
    if (isAdmin) return true;
    if (doc.folder_id == null) return true;
    let cur = doc.folder_id;
    while (cur != null) {
      const f = folders.find(x => x.id === cur);
      if (!f) break;
      if (f.is_private && f.created_by !== currentUser) return false;
      cur = f.parent_id;
    }
    return true;
  };
  // Sobe a cadeia de pastas até achar a raiz de Processos ou a raiz de
  // verdade (sem pasta) — usado pra a busca de cada aba só varrer a própria
  // árvore, e não misturar resultado de Processos dentro de Pastas (ou
  // vice-versa), o que quebraria a separação que a aba deveria dar.
  const belongsToProcessos = (folderId) => {
    let cur = folderId;
    while (cur != null) {
      const f = folders.find(x => x.id === cur);
      if (!f) break;
      if (f.is_processos_root) return true;
      cur = f.parent_id;
    }
    return false;
  };
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const q = search.trim().toLowerCase();
    return documents.filter(d => d.name.toLowerCase().includes(q) && isDocVisible(d) && belongsToProcessos(d.folder_id) === (section === "processos"));
  }, [documents, search, searching, folders, isAdmin, currentUser, section]);

  // Lista de pessoas com pelo menos uma pasta/documento próprio — vira os
  // "cartões de perfil" que só o admin vê na raiz de Pastas, pra poder abrir
  // o espaço de qualquer pessoa (inclusive as pastas privadas dela) sem
  // misturar tudo numa lista só. Só considera a árvore de Pastas — quem só
  // colaborou dentro de Processos não deveria ganhar um cartão aqui, já que
  // "Perfis" é uma feature específica da aba Pastas.
  const profileUsers = useMemo(() => {
    if (!isAdmin) return [];
    const names = new Set();
    folders.forEach(f => { if (f.created_by && f.created_by !== ADMIN && !f.is_processos_root && !belongsToProcessos(f.parent_id)) names.add(f.created_by); });
    documents.forEach(d => { if (d.uploaded_by && d.uploaded_by !== ADMIN && !belongsToProcessos(d.folder_id)) names.add(d.uploaded_by); });
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [folders, documents, isAdmin]);

  const folderLabel = (folderId) => {
    if (folderId == null) return "Documentos";
    const chain = [];
    let cur = folderId;
    while (cur != null) {
      const f = folders.find(x => x.id === cur);
      if (!f) break;
      chain.unshift(f.name);
      cur = f.parent_id;
    }
    return chain.length ? chain.join(" / ") : "Documentos";
  };

  // Excluir é a única ação "perigosa" restrita — qualquer usuário logado pode
  // criar pastas, enviar e renomear, mas só quem enviou/criou (ou o admin)
  // pode apagar ou trocar a privacidade. É uma checagem só de interface
  // (mesmo modelo do resto do app hoje) — não substitui uma regra de acesso
  // real no banco. IMPORTANTE: o mesmo vale pra privacidade em si — como as
  // regras de acesso do Supabase hoje são abertas (ver revisão do site),
  // marcar uma pasta como "privada" esconde ela da INTERFACE pras outras
  // pessoas, mas não impede alguém com acesso técnico à API de vê-la
  // diretamente. Não é uma proteção de verdade contra alguém mal
  // intencionado, só evita que o time normal esbarre no que não é dela.
  const canManage = (ownerName) => isAdmin || ownerName === currentUser;

  const handleFiles = async (fileList, folderId = currentFolderId) => {
    if (!fileList || !fileList.length) return;
    setUploading(true);
    await onUploadFiles(fileList, folderId);
    setUploading(false);
  };

  const openDoc = (doc) => {
    if (isPreviewable(doc.mime_type, doc.name)) setPreview(doc);
    else window.open(getDocUrl(doc.storage_path), "_blank", "noopener");
  };

  const goBack = () => {
    if (currentFolderId == null) { setProfileView(null); return; }
    const parentId = path.length > 1 ? path[path.length - 2].id : null;
    setCurrentFolderId(parentId);
    // Saindo pela raiz de verdade (parentId null) — inclusive de dentro da
    // raiz de Processos, cujo "pai" no dado é null — volta pra aba Pastas,
    // que é a raiz compartilhada das duas árvores. Em navegação normal
    // dentro de Pastas isso já era "pastas", então não muda nada ali.
    if (parentId == null) setSection("pastas");
  };

  // Handlers de drop reaproveitados tanto pelos cards de pasta quanto pelo
  // breadcrumb — aceita tanto um documento arrastado de dentro do app (move
  // de pasta) quanto arquivos arrastados do sistema operacional (envia
  // direto pra dentro daquele destino, sem precisar abrir a pasta antes).
  const dropTargetHandlers = (targetFolderId) => ({
    onDragOver: e => {
      if (e.dataTransfer.types.includes(DRAG_DOC_TYPE) || e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        setDragOverTarget(targetFolderId ?? "root");
      }
    },
    onDragLeave: () => setDragOverTarget(t => (t === (targetFolderId ?? "root") ? null : t)),
    onDrop: e => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(null);
      setDragOver(false);
      const docId = e.dataTransfer.getData(DRAG_DOC_TYPE);
      if (docId) {
        const doc = documents.find(x => String(x.id) === docId);
        if (doc && doc.folder_id !== targetFolderId) onMoveDocument(doc.id, targetFolderId);
        return;
      }
      if (e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files, targetFolderId);
    },
  });

  const cardStyle = {
    position: "relative", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8,
    padding: sizePreset.pad, display: "flex", flexDirection: "column", alignItems: "center",
    gap: 6, cursor: "pointer", textAlign: "center", minWidth: 0,
  };
  const selectedCardStyle = { borderColor: T.accent, background: `${T.accent}0c` };

  const showBack = currentFolderId != null || profileView;
  const hasItemsHere = childFolders.length > 0 || childDocs.length > 0;
  const allVisibleSelected = hasItemsHere && childFolders.every(f => selectedFolders.has(f.id)) && childDocs.every(d => selectedDocs.has(d.id));
  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) { clearSelection(); return; }
    setSelectedFolders(new Set(childFolders.map(f => f.id)));
    setSelectedDocs(new Set(childDocs.map(d => d.id)));
  };
  const handleBulkDelete = () => onBulkDelete([...selectedFolders], [...selectedDocs]);
  const handleBulkMove = (targetFolderId) => {
    onBulkMoveDocuments([...selectedDocs], targetFolderId);
    setMoveModalOpen(false);
    clearSelection();
  };

  return (
    <div>
      <style>{`
        .doc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${sizePreset.grid}px,1fr));gap:10px}
        .doc-card{transition:border-color 150ms ease,transform 150ms ease}
        .doc-card:hover{border-color:${T.accent}!important;transform:translateY(-1px)}
        .doc-profile-pill{transition:border-color 150ms ease,transform 150ms ease}
        .doc-profile-pill:hover{border-color:${T.accent}!important;transform:translateY(-1px)}
        .doc-actions{position:absolute;top:6px;right:6px;display:flex;gap:3px;opacity:0;transition:opacity 150ms ease}
        .doc-card:hover .doc-actions{opacity:1}
        .doc-check{position:absolute;top:6px;left:6px;width:15px;height:15px;cursor:pointer;accent-color:${T.accent};z-index:2}
        .doc-name{font-size:${sizePreset.name}px;color:${T.text};word-break:break-word;line-height:1.3;max-height:2.6em;overflow:hidden}
        .doc-drop-hint{position:absolute;inset:0;border:2px dashed ${T.accent};border-radius:10px;background:${T.accent}0c;display:flex;align-items:center;justify-content:center;color:${T.accent};font-weight:700;font-size:13px;z-index:5;pointer-events:none}
        @media(max-width:640px){.doc-grid{grid-template-columns:repeat(auto-fill,minmax(${sizePreset.mobileGrid}px,1fr))}}
      `}</style>

      {/* alterna entre "Pastas" (arquivos), "Treinamentos" (ASO, EPI, treinamentos por colaborador) e "Processos" (fluxogramas/procedimentos) */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 10 }}>
        <button onClick={() => { setSection("pastas"); setCurrentFolderId(null); setProfileView(null); }} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
          fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
          background: section === "pastas" ? `${T.accent}18` : "transparent", color: section === "pastas" ? T.accent : T.textMuted,
        }}><FolderOpen size={14} /> Pastas</button>
        <button onClick={() => setSection("treinamentos")} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
          fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
          background: section === "treinamentos" ? `${T.accent}18` : "transparent", color: section === "treinamentos" ? T.accent : T.textMuted,
        }}><Users size={14} /> Treinamentos</button>
        <button onClick={() => { setSection("processos"); setCurrentFolderId(processosRoot?.id ?? null); setProfileView(null); }} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
          fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
          background: section === "processos" ? `${T.accent}18` : "transparent", color: section === "processos" ? T.accent : T.textMuted,
        }}><Workflow size={14} /> Processos</button>
      </div>

      {section === "treinamentos" && (
        <ColaboradorDocs
          T={T} docs={colaboradorDocs} team={team} currentUser={currentUser} ADMIN={ADMIN} isAdmin={isAdmin}
          onCreate={onCreateColaboradorDoc} onUpdate={onUpdateColaboradorDoc} onDelete={onDeleteColaboradorDoc}
          showToast={showToast}
        />
      )}

      {section === "processos" && !processosRoot && (
        <EmptyState T={T} text="A aba Processos ainda não foi ativada neste banco. Rode a migração supabase_migration_documents_processos.sql no Supabase (SQL Editor) e recarregue a página." />
      )}

      {(section === "pastas" || (section === "processos" && processosRoot)) && <>
      {/* cabeçalho: voltar + breadcrumb + busca + ações */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: T.textMuted, flexWrap: "wrap", minWidth: 0 }}>
          {showBack && (
            <button onClick={goBack} aria-label="Voltar para a pasta anterior" title="Voltar" style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 5,
              border: `1px solid ${T.border}`, background: T.panelAlt, color: T.textMuted, cursor: "pointer", marginRight: 2, flexShrink: 0,
            }}><ChevronLeft size={14} /></button>
          )}
          <button
            onClick={() => { setCurrentFolderId(null); setProfileView(null); setSection("pastas"); }} aria-label="Ir para a pasta raiz de Documentos"
            {...dropTargetHandlers(null)}
            style={{
              display: "flex", alignItems: "center", gap: 5, borderRadius: 5, padding: "3px 5px", fontFamily: "inherit", cursor: "pointer",
              background: dragOverTarget === "root" ? `${T.accent}22` : "none", border: dragOverTarget === "root" ? `1px dashed ${T.accent}` : "1px solid transparent",
              color: currentFolderId == null && !profileView ? T.textBright : T.textMuted, fontWeight: currentFolderId == null && !profileView ? 700 : 500, fontSize: 12.5,
            }}>
            <Home size={13} /> Documentos
          </button>
          {profileView && (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <ChevronRight size={12} style={{ color: T.textFaint, flexShrink: 0 }} />
              <button onClick={() => setCurrentFolderId(null)} style={{ background: "none", border: "none", borderRadius: 5, padding: "3px 5px", fontFamily: "inherit", cursor: "pointer", color: currentFolderId == null ? T.textBright : T.textMuted, fontWeight: currentFolderId == null ? 700 : 500, fontSize: 12.5 }}>
                Perfil: {profileView}
              </button>
            </span>
          )}
          {path.map((f, i) => (
            <span key={f.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <ChevronRight size={12} style={{ color: T.textFaint, flexShrink: 0 }} />
              <button
                onClick={() => setCurrentFolderId(f.id)} aria-label={`Ir para a pasta ${f.name}`}
                {...dropTargetHandlers(f.id)}
                style={{
                  borderRadius: 5, padding: "3px 5px", fontFamily: "inherit", cursor: "pointer",
                  background: dragOverTarget === f.id ? `${T.accent}22` : "none", border: dragOverTarget === f.id ? `1px dashed ${T.accent}` : "1px solid transparent",
                  color: i === path.length - 1 ? T.textBright : T.textMuted, fontWeight: i === path.length - 1 ? 700 : 500, fontSize: 12.5,
                }}>
                {f.name}
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: T.textFaint, pointerEvents: "none" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar documento..." style={{ width: 180, padding: "7px 10px 7px 28px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.input, color: T.text, fontSize: 12, outline: "none", fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden", flexShrink: 0 }} role="group" aria-label="Tamanho dos ícones">
            {Object.values(SIZE_PRESETS).map(sp => (
              <button
                key={sp.key} onClick={() => setCardSize(sp.key)} title={sp.title} aria-label={sp.title} aria-pressed={cardSize === sp.key}
                style={{
                  width: 26, height: 28, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                  background: cardSize === sp.key ? T.accent : T.panelAlt, color: cardSize === sp.key ? "#fff" : T.textMuted,
                  borderLeft: sp.key === "small" ? "none" : `1px solid ${T.border}`,
                }}
              >{sp.label}</button>
            ))}
          </div>
          <button onClick={() => { setNewFolderPrivate(false); setNewFolderOpen(true); }} style={{ ...ghost(), display: "flex", alignItems: "center", gap: 6 }}><FolderPlus size={14} /> Nova pasta</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ ...btn(T.accent), display: "flex", alignItems: "center", gap: 6, opacity: uploading ? .6 : 1 }}>
            <Upload size={14} /> {uploading ? "Enviando..." : "Enviar arquivo"}
          </button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
        </div>
      </div>

      {/* resultado de busca (varre todas as pastas visíveis, não só a atual) */}
      {searching ? (
        <div>
          <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 8 }}>{searchResults.length} resultado(s) para "{search}"</div>
          {searchResults.length === 0 ? (
            <EmptyState T={T} text="Nenhum documento encontrado." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {searchResults.map(d => (
                <DocRow
                  key={d.id} T={T} doc={d} folderLabel={folderLabel(d.folder_id)} getDocUrl={getDocUrl}
                  onOpen={() => openDoc(d)}
                  onDownload={() => window.open(getDocUrl(d.storage_path, d.name), "_blank")}
                  canManage={canManage(d.uploaded_by)}
                  onRename={() => setRenaming({ kind: "doc", id: d.id, value: d.name })}
                  onDelete={() => onDeleteDocument(d)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{ position: "relative" }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        >
          {dragOver && <div className="doc-drop-hint">Solte aqui para enviar</div>}

          {/* "Perfis" — só o admin vê, só na raiz de verdade (fora de qualquer pasta e fora de um perfil já aberto).
              Fica numa caixa com borda + fundo levemente diferente e uma linha divisória embaixo, pra ficar
              visualmente óbvio que é uma seção separada — sem isso, uma pasta pública normal (ex.: "treinamento
              nr12") aparecia logo abaixo do cartão de alguém e parecia pertencer àquela pessoa, quando na
              verdade não tem nenhuma relação (é só uma pasta pública comum, visível pra todo mundo). */}
          {isAdmin && currentFolderId === null && !profileView && profileUsers.length > 0 && (
            <div style={{ marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Perfis da equipe</div>
              <div style={{ fontSize: 10.5, color: T.textFaint, marginBottom: 10 }}>Clique num nome pra ver só as pastas e arquivos daquela pessoa.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {profileUsers.map(name => (
                  <button
                    key={name}
                    className="doc-profile-pill"
                    onClick={() => setProfileView(name)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, background: T.panel,
                      border: `1px solid ${T.border}`, borderRadius: 999, padding: "6px 14px 6px 6px",
                      cursor: "pointer", color: T.text, fontSize: 12.5, fontWeight: 600,
                    }}
                  >
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: `${T.accent}22`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{name.slice(0, 1)}</span>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* label só aparece quando a seção "Perfis" também está visível, pra deixar claro que o que vem
              a seguir é outra coisa — pastas/arquivos públicos comuns, não ligados a nenhum perfil específico */}
          {isAdmin && currentFolderId === null && !profileView && profileUsers.length > 0 && (childFolders.length > 0 || childDocs.length > 0) && (
            <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 10 }}>Pastas e arquivos públicos (de todo mundo)</div>
          )}

          {hasItemsHere && (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textFaint, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" aria-label="Selecionar todos os itens desta pasta" style={{ accentColor: T.accent, cursor: "pointer" }} checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                Selecionar todos
              </label>
              {childFolders.length > 0 && childDocs.length > 0 && (
                <div style={{ fontSize: 10.5, color: T.textFaint }}>Dica: arraste um arquivo até uma pasta (ou até "Documentos" no topo) para movê-lo.</div>
              )}
            </div>
          )}

          {selectedCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${T.accent}12`, border: `1px solid ${T.accent}40`, borderRadius: 8, padding: "9px 14px", marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>{selectedCount} {selectedCount === 1 ? "selecionado" : "selecionados"}</span>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                <button
                  onClick={() => selectedDocs.size > 0 && setMoveModalOpen(true)}
                  disabled={selectedDocs.size === 0}
                  title={selectedFolders.size > 0 ? "Pastas ainda não podem ser movidas em lote — desmarque as pastas para mover só os arquivos selecionados" : undefined}
                  style={{ ...sbtn("#8b5cf6"), opacity: selectedDocs.size === 0 ? .45 : 1, cursor: selectedDocs.size === 0 ? "not-allowed" : "pointer" }}
                >Mover{selectedDocs.size > 0 ? ` (${selectedDocs.size})` : ""}</button>
                <button onClick={handleBulkDelete} style={sbtn("#ef4444")}>Excluir</button>
                <button onClick={clearSelection} style={ghost()}>Cancelar</button>
              </div>
            </div>
          )}
          {childFolders.length === 0 && childDocs.length === 0 ? (
            (isAdmin && currentFolderId === null && !profileView && profileUsers.length > 0) ? null : (
              <EmptyState T={T} text="Nenhum documento nesta pasta ainda. Envie um arquivo ou crie uma pasta pra começar." />
            )
          ) : (
            <div className="doc-grid">
              {childFolders.map(f => (
                <div
                  key={`f${f.id}`} className="doc-card"
                  style={{
                    ...cardStyle,
                    ...(selectedFolders.has(f.id) ? selectedCardStyle : {}),
                    ...(dragOverTarget === f.id ? { border: `1px dashed ${T.accent}`, background: `${T.accent}14` } : {}),
                  }}
                  onClick={() => renaming?.kind === "folder" && renaming.id === f.id ? null : setCurrentFolderId(f.id)}
                  {...dropTargetHandlers(f.id)}
                >
                  <input
                    type="checkbox" className="doc-check" aria-label={`Selecionar ${f.name}`}
                    checked={selectedFolders.has(f.id)} onClick={e => e.stopPropagation()} onChange={() => toggleFolderSel(f.id)}
                  />
                  <div className="doc-actions" onClick={e => e.stopPropagation()}>
                    {canManage(f.created_by) && <IconBtn T={T} onClick={() => onToggleFolderPrivacy(f)} title={f.is_private ? "Tornar pública" : "Tornar privada"}>{f.is_private ? <Unlock size={12} /> : <Lock size={12} />}</IconBtn>}
                    <IconBtn T={T} onClick={() => setRenaming({ kind: "folder", id: f.id, value: f.name })} title="Renomear"><Pencil size={12} /></IconBtn>
                    {canManage(f.created_by) && <IconBtn T={T} onClick={() => onDeleteFolder(f)} title="Excluir" danger><Trash2 size={12} /></IconBtn>}
                  </div>
                  <div style={{ position: "relative" }}>
                    <Folder size={sizePreset.icon} color="#eab308" fill="#eab30822" strokeWidth={1.6} />
                    {f.is_private && <Lock size={11} strokeWidth={2.5} color={T.textFaint} style={{ position: "absolute", right: -4, bottom: -2, background: T.panel, borderRadius: "50%", padding: 1 }} />}
                  </div>
                  {renaming?.kind === "folder" && renaming.id === f.id ? (
                    <RenameInput T={T} value={renaming.value} onChange={v => setRenaming(r => ({ ...r, value: v }))} onSave={() => { if (renaming.value.trim() && renaming.value.trim() !== f.name) onRenameFolder(f.id, renaming.value); setRenaming(null); }} onCancel={() => setRenaming(null)} />
                  ) : (
                    <span className="doc-name">{f.name}</span>
                  )}
                  <span style={{ fontSize: 9.5, color: T.textFaint }}>
                    {folders.filter(x => x.parent_id === f.id).length + documents.filter(x => x.folder_id === f.id).length} item(ns){f.is_private ? " · privada" : ""}
                  </span>
                </div>
              ))}
              {childDocs.map(d => {
                return (
                  <div
                    key={`d${d.id}`} className="doc-card"
                    style={{ ...cardStyle, ...(selectedDocs.has(d.id) ? selectedCardStyle : {}) }}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData(DRAG_DOC_TYPE, String(d.id)); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => renaming?.kind === "doc" && renaming.id === d.id ? null : openDoc(d)}
                  >
                    <input
                      type="checkbox" className="doc-check" aria-label={`Selecionar ${d.name}`}
                      checked={selectedDocs.has(d.id)} onClick={e => e.stopPropagation()} onChange={() => toggleDocSel(d.id)}
                    />
                    <div className="doc-actions" onClick={e => e.stopPropagation()}>
                      <IconBtn T={T} onClick={() => openDoc(d)} title="Visualizar"><Eye size={12} /></IconBtn>
                      <IconBtn T={T} onClick={() => window.open(getDocUrl(d.storage_path, d.name), "_blank")} title="Baixar"><Download size={12} /></IconBtn>
                      <IconBtn T={T} onClick={() => setRenaming({ kind: "doc", id: d.id, value: d.name })} title="Renomear"><Pencil size={12} /></IconBtn>
                      {canManage(d.uploaded_by) && <IconBtn T={T} onClick={() => onDeleteDocument(d)} title="Excluir" danger><Trash2 size={12} /></IconBtn>}
                    </div>
                    <DocThumb T={T} doc={d} getDocUrl={getDocUrl} size={sizePreset.thumb} />
                    {renaming?.kind === "doc" && renaming.id === d.id ? (
                      <RenameInput T={T} value={renaming.value} onChange={v => setRenaming(r => ({ ...r, value: v }))} onSave={() => { if (renaming.value.trim() && renaming.value.trim() !== d.name) onRenameDocument(d.id, renaming.value); setRenaming(null); }} onCancel={() => setRenaming(null)} />
                    ) : (
                      <span className="doc-name">{d.name}</span>
                    )}
                    <span style={{ fontSize: 9.5, color: T.textFaint }}>{formatBytes(d.file_size)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </>}

      {/* modal: nova pasta */}
      {newFolderOpen && (
        <Overlay T={T} onClose={() => setNewFolderOpen(false)}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: T.textBright }}>Nova pasta</h3>
          <input
            autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            placeholder="Nome da pasta" style={inp({ marginBottom: 14 })}
            onKeyDown={e => { if (e.key === "Enter" && newFolderName.trim()) { onCreateFolder(newFolderName, currentFolderId, newFolderPrivate); setNewFolderName(""); setNewFolderOpen(false); } }}
          />
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Quem pode ver esta pasta?</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button onClick={() => setNewFolderPrivate(false)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 7,
              border: `1px solid ${!newFolderPrivate ? T.accent : T.border}`, background: !newFolderPrivate ? `${T.accent}14` : "transparent",
              color: !newFolderPrivate ? T.accent : T.textMuted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}><Unlock size={13} /> Pública (todo mundo vê)</button>
            <button onClick={() => setNewFolderPrivate(true)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 7,
              border: `1px solid ${newFolderPrivate ? T.accent : T.border}`, background: newFolderPrivate ? `${T.accent}14` : "transparent",
              color: newFolderPrivate ? T.accent : T.textMuted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}><Lock size={13} /> Privada (só eu e o admin)</button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => setNewFolderOpen(false)} style={ghost()}>Cancelar</button>
            <button onClick={() => { if (newFolderName.trim()) { onCreateFolder(newFolderName, currentFolderId, newFolderPrivate); setNewFolderName(""); setNewFolderOpen(false); } }} style={btn(T.accent)}>Criar</button>
          </div>
        </Overlay>
      )}

      {/* modal: preview de imagem/pdf */}
      {preview && (
        <Overlay T={T} wide onClose={() => setPreview(null)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.name}</h3>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => window.open(getDocUrl(preview.storage_path, preview.name), "_blank")} style={{ ...ghost(), display: "flex", alignItems: "center", gap: 5 }}><Download size={13} /> Baixar</button>
              <button onClick={() => setPreview(null)} aria-label="Fechar" style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 4 }}><X size={18} /></button>
            </div>
          </div>
          {(preview.mime_type || "").startsWith("image/") ? (
            <img src={getDocUrl(preview.storage_path)} alt={preview.name} style={{ maxWidth: "100%", maxHeight: "70vh", display: "block", margin: "0 auto", borderRadius: 6 }} />
          ) : (
            <iframe title={preview.name} src={getDocUrl(preview.storage_path)} style={{ width: "100%", height: "70vh", border: "none", borderRadius: 6 }} />
          )}
        </Overlay>
      )}

      {/* modal: escolher pasta de destino pra mover os arquivos selecionados em lote */}
      {moveModalOpen && (
        <MoveDocsModal
          T={T} ghost={ghost}
          folders={folders} folderVisible={folderVisible} belongsToProcessos={belongsToProcessos} folderLabel={folderLabel}
          section={section} processosRoot={processosRoot}
          count={selectedDocs.size}
          onMove={handleBulkMove}
          onClose={() => setMoveModalOpen(false)}
        />
      )}
    </div>
  );
}

// Modal simples de "mover para..." usado pela seleção em lote — lista as
// pastas visíveis da mesma árvore (Pastas ou Processos, conforme a aba
// aberta) como uma lista indentada por profundidade, sem precisar navegar
// pasta por pasta como no explorador principal. Ordenar pelo caminho
// completo (breadcrumb) já agrupa filhos logo abaixo do pai visualmente,
// sem precisar montar uma árvore de verdade pra isso.
function MoveDocsModal({ T, ghost, folders, folderVisible, belongsToProcessos, folderLabel, section, processosRoot, count, onMove, onClose }) {
  const rootId = section === "processos" ? (processosRoot?.id ?? null) : null;
  const rootLabel = section === "processos" ? "Processos (raiz)" : "Documentos (raiz)";
  const options = folders
    .filter(f => !f.is_processos_root && folderVisible(f) && belongsToProcessos(f.id) === (section === "processos"))
    .map(f => {
      let depth = 0, cur = f.parent_id;
      while (cur != null) { const p = folders.find(x => x.id === cur); if (!p || p.is_processos_root) break; depth++; cur = p.parent_id; }
      return { id: f.id, name: f.name, depth, label: folderLabel(f.id) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const rowStyle = depth => ({
    display: "flex", alignItems: "center", gap: 7, width: "100%", textAlign: "left", background: "none",
    border: "none", borderRadius: 6, padding: "8px 10px", paddingLeft: 10 + depth * 18, cursor: "pointer",
    fontFamily: "inherit", fontSize: 12.5, color: T.text,
  });

  return (
    <Overlay T={T} onClose={onClose}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: T.textBright }}>Mover {count} {count === 1 ? "arquivo" : "arquivos"} para...</h3>
      <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 12 }}>Escolha a pasta de destino.</div>
      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, marginBottom: 14, border: `1px solid ${T.border}`, borderRadius: 7, padding: 4 }}>
        <button onClick={() => onMove(rootId)} style={rowStyle(0)} onMouseEnter={e => e.currentTarget.style.background = `${T.accent}14`} onMouseLeave={e => e.currentTarget.style.background = "none"}>
          <Home size={13} color={T.textFaint} /> {rootLabel}
        </button>
        {options.map(f => (
          <button key={f.id} onClick={() => onMove(f.id)} style={rowStyle(f.depth)} onMouseEnter={e => e.currentTarget.style.background = `${T.accent}14`} onMouseLeave={e => e.currentTarget.style.background = "none"}>
            <Folder size={13} color="#eab308" /> {f.name}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={ghost()}>Cancelar</button>
      </div>
    </Overlay>
  );
}

function EmptyState({ T, text }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "50px 20px", color: T.textFaint, textAlign: "center" }}>
      <FolderOpen size={34} strokeWidth={1.4} />
      <span style={{ fontSize: 12.5, maxWidth: 320 }}>{text}</span>
    </div>
  );
}

// Prévia real do documento (em vez de só um ícone genérico + nome) quando
// dá pra mostrar uma: usa a miniatura leve gerada no upload
// (`doc.thumbnail_path`, ver helpers.js `makeThumbnail`) quando existir, ou
// cai pra mostrar a própria foto original se o documento é imagem mas foi
// enviado antes dessa miniatura existir (compatível com fotos antigas, só
// sem o ganho de performance). Documentos que não são imagem (PDF, planilha
// etc.) continuam mostrando o ícone por tipo de arquivo, igual antes — gerar
// uma miniatura da primeira página de um PDF exigiria uma biblioteca de
// renderização própria (pdf.js), que ainda não faz parte do projeto.
function DocThumb({ T, doc, getDocUrl, size = 44, radius = 8 }) {
  const [broken, setBroken] = useState(false);
  const { icon: Icon, color } = fileKind(doc.mime_type, doc.name);
  const src = doc.thumbnail_path
    ? getDocUrl(doc.thumbnail_path)
    : (isImageFile(doc.mime_type, doc.name) ? getDocUrl(doc.storage_path) : null);
  if (src && !broken) {
    return (
      <img
        src={src} alt="" loading="lazy" onError={() => setBroken(true)}
        style={{ width: size, height: size, objectFit: "cover", borderRadius: radius, border: `1px solid ${T.border}`, background: T.input, flexShrink: 0 }}
      />
    );
  }
  return <Icon size={size >= 40 ? Math.round(size * 0.56) : 18} color={color} strokeWidth={1.6} />;
}

function IconBtn({ T, onClick, title, children, danger }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{
      width: 22, height: 22, borderRadius: 5, border: `1px solid ${T.border}`, background: T.panel,
      color: danger ? "#ef4444" : T.textMuted, display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", flexShrink: 0, boxShadow: "0 1px 4px rgba(0,0,0,.25)",
    }}>{children}</button>
  );
}

function RenameInput({ T, value, onChange, onSave, onCancel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, width: "100%" }} onClick={e => e.stopPropagation()}>
      <input
        autoFocus value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
        onBlur={onSave}
        style={{ width: "100%", fontSize: 11.5, padding: "3px 5px", borderRadius: 4, border: `1px solid ${T.accent}`, background: T.input, color: T.text, outline: "none", fontFamily: "inherit", textAlign: "center" }}
      />
    </div>
  );
}

function DocRow({ T, doc, folderLabel, getDocUrl, onOpen, onDownload, canManage, onRename, onDelete }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 7, padding: "9px 12px" }}>
      <div style={{ flexShrink: 0, cursor: "pointer" }} onClick={onOpen}><DocThumb T={T} doc={doc} getDocUrl={getDocUrl} size={32} radius={6} /></div>
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onOpen}>
        <div style={{ fontSize: 12, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
        <div style={{ fontSize: 10, color: T.textFaint }}>{folderLabel} · {formatBytes(doc.file_size)}</div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <IconBtn T={T} onClick={onOpen} title="Visualizar"><Eye size={12} /></IconBtn>
        <IconBtn T={T} onClick={onDownload} title="Baixar"><Download size={12} /></IconBtn>
        <IconBtn T={T} onClick={onRename} title="Renomear"><Pencil size={12} /></IconBtn>
        {canManage && <IconBtn T={T} onClick={onDelete} title="Excluir" danger><Trash2 size={12} /></IconBtn>}
      </div>
    </div>
  );
}
