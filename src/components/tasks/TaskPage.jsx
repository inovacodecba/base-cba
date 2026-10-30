// Página da tarefa "estilo Notion" (10/2026) — pedido do usuário a partir de
// um print do Notion: clicar numa tarefa abre uma página inteira (título
// grande, propriedades em linhas, texto, checklist, subtarefas, anexos,
// comentários e histórico) no lugar do modal pequeno de antes.
//
// Tudo salva sozinho, sem botão "Salvar": selects/datas salvam na hora,
// textos ao sair do campo (blur). O histórico vem do trigger
// `tarefas_log_historico` no banco (ninguém escreve nele pelo app), então
// depois de cada mudança só recarregamos a lista.
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ArrowLeft, Users, Loader, Flag, CalendarDays, Tag, FolderKanban, CornerLeftUp, UserPen, AlignLeft, ListChecks,
  ListTree, Paperclip, MessageSquare, History, Trash2, Plus, X, FileText, Send, ChevronDown, ChevronRight, ClipboardCheck, MapPin,
} from "lucide-react";
import { makeStyleHelpers } from "../../theme.js";
import { TASK_STATUS, TASK_PRIORITY } from "../../constants.js";
import {
  COLS, PRIORITIES, TeamMultiSelect, AvatarStack, ProgressBar, StatusPill, dueInfo, fmtDate, fmtDateFull, fmtDateTime,
  childrenOf, descendantIds, statusColor, projectColor,
} from "./taskUi.jsx";

const MAX_FILE_MB = 20;

// Textarea que cresce sozinha com o conteúdo (igual ao Notion).
function AutoTextarea({ value, onChange, onBlur, style, placeholder, className, onKeyDown, autoFocus }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref} rows={1} value={value} placeholder={placeholder} className={className} autoFocus={autoFocus}
      onChange={e => onChange(e.target.value)} onBlur={onBlur} onKeyDown={onKeyDown}
      style={{ resize: "none", overflow: "hidden", fontFamily: "inherit", ...style }}
    />
  );
}

function Prop({ icon: Icon, label, children }) {
  return (
    <div className="tk-prop">
      <div className="tk-prop-label"><Icon size={15} strokeWidth={1.9} style={{ flexShrink: 0 }} /> {label}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Section({ T, icon: Icon, title, right, children }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${T.borderSoft}` }}>
        <Icon size={15} strokeWidth={2} style={{ color: T.textMuted }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.textBright }}>{title}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
      </div>
      {children}
    </div>
  );
}

// Uma linha do histórico em português ("Rodrigo mudou o status de A Fazer para Concluído").
function describeHistory(h) {
  const st = (v) => TASK_STATUS[v]?.label || v;
  const pr = (v) => TASK_PRIORITY[v]?.label || v;
  const or = (v, fb) => (v == null || v === "" ? fb : v);
  switch (h.campo) {
    case "criou": return "criou a tarefa";
    case "titulo": return `renomeou de "${or(h.de, "—")}" para "${or(h.para, "—")}"`;
    case "status": return `mudou o status de ${st(h.de)} para ${st(h.para)}`;
    case "prioridade": return `mudou a prioridade de ${pr(h.de)} para ${pr(h.para)}`;
    case "inicio": return h.para ? `colocou na linha do tempo a partir de ${fmtDateFull(h.para)}` : "tirou da linha do tempo";
    case "prazo": return `mudou o prazo de ${h.de ? fmtDateFull(h.de) : "sem prazo"} para ${h.para ? fmtDateFull(h.para) : "sem prazo"}`;
    case "responsaveis": return `mudou os responsáveis para ${or(h.para, "ninguém")}`;
    case "categoria": return `mudou a categoria para ${or(h.para, "nenhuma")}`;
    case "projeto": return `mudou o projeto para ${or(h.para, "nenhum")}`;
    case "principal": return h.para ? `virou subtarefa de "${h.para}"` : "deixou de ser subtarefa";
    case "descricao": return "editou a descrição";
    case "checklist": return `checklist: ${or(h.de, "0/0")} → ${or(h.para, "0/0")}`;
    case "anexo+": return `anexou ${or(h.para, "um arquivo")}`;
    case "anexo-": return `removeu o anexo ${or(h.de, "")}`;
    default: return `alterou ${h.campo}`;
  }
}

const isImage = (a) => (a.tipo || "").startsWith("image/");
const fmtSize = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function TaskPage({ T, task, tasks, projects, team, currentUser, myUid, isAdmin, api, showToast, onOpenTask, onOpenProject, onBack, equipamentos = [], onOpenEquip }) {
  const { inp, btn, ghost } = makeStyleHelpers(T);
  const ghostInp = (ex = {}) => inp({ padding: "7px 8px", fontSize: 13, ...ex });

  // Campos de texto ficam em estado local e só salvam no blur.
  const [titulo, setTitulo] = useState(task.titulo);
  const [descricao, setDescricao] = useState(task.descricao || "");
  const [categoria, setCategoria] = useState(task.categoria || "");
  useEffect(() => { setTitulo(task.titulo); setDescricao(task.descricao || ""); setCategoria(task.categoria || ""); }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [comments, setComments] = useState(null);
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [newCheck, setNewCheck] = useState("");
  const [newSub, setNewSub] = useState("");
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef(null);

  // `api` é recriado a cada render do App — guardado num ref pra que os
  // efeitos abaixo só rodem quando muda a tarefa aberta (senão recarregaria
  // comentários/histórico sem parar).
  const apiRef = useRef(api);
  apiRef.current = api;

  const reloadHistory = useCallback(async () => {
    try { setHistory(await apiRef.current.loadHistory(task.id)); } catch { /* histórico é secundário: não trava a página */ }
  }, [task.id]);

  useEffect(() => {
    let alive = true;
    setComments(null); setHistory(null);
    apiRef.current.loadComments(task.id).then(r => alive && setComments(r)).catch(() => alive && setComments([]));
    apiRef.current.loadHistory(task.id).then(r => alive && setHistory(r)).catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, [task.id]);

  const save = async (patch) => {
    const ok = await api.updateTask(task.id, patch, { silent: true });
    if (ok) reloadHistory();
    return ok;
  };

  const projectsById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);
  const project = task.projeto_id ? projectsById[task.projeto_id] : null;
  const parent = task.parent_id ? tasks.find(t => t.id === task.parent_id) : null;
  const subs = useMemo(() => childrenOf(tasks, task.id).sort((a, b) => (a.criado_em_iso || "").localeCompare(b.criado_em_iso || "")), [tasks, task.id]);
  const blockedParents = useMemo(() => descendantIds(tasks, task.id), [tasks, task.id]);
  const parentOptions = tasks.filter(t => t.id !== task.id && !blockedParents.has(t.id)).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  const categoriesUsed = useMemo(() => Array.from(new Set(tasks.map(t => t.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [tasks]);
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const anexos = Array.isArray(task.anexos) ? task.anexos : [];
  const due = dueInfo(task.prazo, T, task.status);

  // ── checklist ──
  const addCheck = () => {
    const texto = newCheck.trim();
    if (!texto) return;
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
    save({ checklist: [...checklist, { id, texto, feito: false }] });
    setNewCheck("");
  };
  const toggleCheck = (id) => save({ checklist: checklist.map(i => i.id === id ? { ...i, feito: !i.feito } : i) });
  const removeCheck = (id) => save({ checklist: checklist.filter(i => i.id !== id) });

  // ── subtarefas ──
  const addSub = async () => {
    const t = newSub.trim();
    if (!t) return;
    setNewSub("");
    await api.createTask({ titulo: t, descricao: "", responsaveis: currentUser ? [currentUser] : [], prazo: null, categoria: task.categoria || null, prioridade: "media", parent_id: task.id, projeto_id: task.projeto_id || null }, { silent: true });
  };

  // ── anexos ──
  const onFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const tooBig = files.filter(f => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig.length) showToast(`Arquivo acima de ${MAX_FILE_MB} MB: ${tooBig.map(f => f.name).join(", ")}`, "err");
    const ok = files.filter(f => f.size <= MAX_FILE_MB * 1024 * 1024);
    if (!ok.length) return;
    setUploading(ok.length);
    const added = [];
    for (const f of ok) {
      try { added.push(await api.uploadAnexo(task.id, f)); } catch (e) { showToast(`Erro ao enviar ${f.name}: ${e.message}`, "err"); }
      setUploading(n => n - 1);
    }
    if (added.length) {
      // Lê a lista mais atual (outro upload pode ter terminado no meio).
      const current = Array.isArray(tasks.find(t => t.id === task.id)?.anexos) ? tasks.find(t => t.id === task.id).anexos : anexos;
      await save({ anexos: [...current, ...added] });
      showToast(added.length === 1 ? "Arquivo anexado" : `${added.length} arquivos anexados`);
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const removeAnexo = async (a) => {
    if (!window.confirm(`Remover o anexo "${a.nome}"?`)) return;
    const ok = await save({ anexos: anexos.filter(x => x.path !== a.path) });
    if (ok) api.removeAnexoFile(a.path).catch(() => {});
  };

  // ── comentários ──
  const sendComment = async () => {
    const texto = newComment.trim();
    if (!texto || sendingComment) return;
    setSendingComment(true);
    try {
      const c = await api.addComment(task.id, texto);
      setComments(p => [...(p || []), c]);
      setNewComment("");
    } catch (e) {
      showToast(`Erro ao comentar: ${e.message}`, "err");
    }
    setSendingComment(false);
  };
  const removeComment = async (c) => {
    if (!window.confirm("Apagar este comentário?")) return;
    try {
      await api.deleteComment(c.id);
      setComments(p => p.filter(x => x.id !== c.id));
    } catch (e) {
      showToast(`Erro ao apagar comentário: ${e.message}`, "err");
    }
  };

  const sectionCount = (n, d) => <span style={{ fontSize: 11, fontWeight: 700, color: T.textFaint }}>{d != null ? `${d}/${n}` : n}</span>;

  return (
    <div className="tk-page" style={{ maxWidth: 820, width: "100%", margin: "0 auto", paddingBottom: 40 }}>
      {/* barra do topo: voltar + caminho (breadcrumb) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <button onClick={onBack} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px" }}>
          <ArrowLeft size={14} /> Tarefas
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textFaint, minWidth: 0, flex: 1, overflow: "hidden" }}>
          {project && <>
            <button onClick={() => onOpenProject(project.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: T.textMuted, fontFamily: "inherit", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{project.nome}</button>
            <span>/</span>
          </>}
          {parent && <>
            <button onClick={() => onOpenTask(parent.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: T.textMuted, fontFamily: "inherit", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{parent.titulo}</button>
            <span>/</span>
          </>}
          <span style={{ color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.titulo}</span>
        </div>
        <button onClick={() => api.deleteTask(task, onBack)} title="Excluir tarefa" className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, color: "#ef4444", borderColor: "#ef444430", display: "flex", alignItems: "center", gap: 6, padding: "7px 12px" }}>
          <Trash2 size={13} /> Excluir
        </button>
      </div>

      {/* ícone + título grande */}
      <div style={{ width: 52, height: 52, borderRadius: 12, background: `${statusColor(T, task.status)}1c`, color: statusColor(T, task.status), display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <ClipboardCheck size={28} strokeWidth={1.8} />
      </div>
      <AutoTextarea
        value={titulo}
        onChange={setTitulo}
        onBlur={() => {
          const t = titulo.trim();
          if (!t) { setTitulo(task.titulo); return showToast("O título não pode ficar vazio", "err"); }
          if (t !== task.titulo) save({ titulo: t });
        }}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        className="tk-ghost-input"
        style={{ width: "100%", fontSize: 28, fontWeight: 800, lineHeight: 1.2, color: T.textBright, border: "1px solid transparent", borderRadius: 8, padding: "4px 6px", marginLeft: -6, outline: "none" }}
      />

      {/* propriedades */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 14 }}>
        <Prop icon={Users} label="Responsáveis">
          <TeamMultiSelect T={T} team={team} value={task.responsaveis || []} onChange={(v) => save({ responsaveis: v })} inp={ghostInp} style={{ background: "transparent", borderColor: "transparent" }} />
        </Prop>
        <Prop icon={Loader} label="Status">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusPill T={T} status={task.status} />
            <select value={task.status} onChange={e => save({ status: e.target.value })} className="tk-ghost-input" style={ghostInp({ width: "auto", flex: 1, minWidth: 0 })} aria-label="Status">
              {COLS.map(c => <option key={c} value={c}>{TASK_STATUS[c].label}</option>)}
            </select>
          </div>
        </Prop>
        <Prop icon={Flag} label="Prioridade">
          <select value={task.prioridade || "media"} onChange={e => save({ prioridade: e.target.value })} className="tk-ghost-input" style={ghostInp()} aria-label="Prioridade">
            {PRIORITIES.map(p => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
          </select>
        </Prop>
        <Prop icon={CalendarDays} label="Prazo">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="date" value={task.prazo || ""} onChange={e => save({ prazo: e.target.value || null })} className="tk-ghost-input" style={ghostInp({ width: "auto", flex: 1, minWidth: 0 })} aria-label="Prazo" />
            {task.prazo && due.full && <span style={{ fontSize: 10.5, fontWeight: 700, color: due.color, whiteSpace: "nowrap" }}>{due.label}</span>}
          </div>
        </Prop>
        <Prop icon={Tag} label="Categoria">
          <input
            value={categoria} onChange={e => setCategoria(e.target.value)} list="tk-page-cat"
            onBlur={() => { const c = categoria.trim() || null; if (c !== (task.categoria || null)) save({ categoria: c }); }}
            placeholder="Vazio" className="tk-ghost-input" style={ghostInp()}
          />
          <datalist id="tk-page-cat">{categoriesUsed.map(c => <option key={c} value={c} />)}</datalist>
        </Prop>
        <Prop icon={FolderKanban} label="Projeto">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {project && <span style={{ width: 9, height: 9, borderRadius: 3, background: projectColor(project), flexShrink: 0 }} />}
            <select value={task.projeto_id || ""} onChange={e => save({ projeto_id: e.target.value ? Number(e.target.value) : null })} className="tk-ghost-input" style={ghostInp({ flex: 1, minWidth: 0, color: project ? T.text : T.textFaint })} aria-label="Projeto">
              <option value="">Vazio</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </Prop>
        <Prop icon={MapPin} label="Equipamento">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <select value={task.equipamento_id || ""} onChange={e => save({ equipamento_id: e.target.value ? Number(e.target.value) : null })} className="tk-ghost-input" style={ghostInp({ flex: 1, minWidth: 0, color: task.equipamento_id ? T.text : T.textFaint })} aria-label="Equipamento">
              <option value="">Vazio</option>
              {[...equipamentos].filter(e => e.id != null).sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name)).map(e => <option key={e.id} value={e.id}>{e.area} · {e.name}</option>)}
            </select>
            {task.equipamento_id && onOpenEquip && <button onClick={() => onOpenEquip(task.equipamento_id)} title="Ver no mapa" className="tk-nav-btn" style={{ ...ghost(), padding: "5px 9px", display: "flex", alignItems: "center", gap: 4, fontSize: 11.5 }}><MapPin size={13} /> Mapa</button>}
          </div>
        </Prop>
        <Prop icon={CornerLeftUp} label="Tarefa principal">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <select value={task.parent_id || ""} onChange={e => save({ parent_id: e.target.value ? Number(e.target.value) : null })} className="tk-ghost-input" style={ghostInp({ flex: 1, minWidth: 0, color: parent ? T.text : T.textFaint })} aria-label="Tarefa principal">
              <option value="">Vazio</option>
              {parentOptions.map(t => <option key={t.id} value={t.id}>{t.titulo}</option>)}
            </select>
            {parent && <button onClick={() => onOpenTask(parent.id)} title="Abrir tarefa principal" className="tk-nav-btn" style={{ ...ghost(), padding: "5px 8px", display: "flex" }}><ChevronRight size={14} /></button>}
          </div>
        </Prop>
        <Prop icon={UserPen} label="Criado por">
          <div style={{ fontSize: 13, color: T.textMuted, padding: "7px 8px" }}>{task.criado_por || "—"}{task.criado_em_iso ? ` · ${fmtDateTime(task.criado_em_iso)}` : ""}</div>
        </Prop>
      </div>

      {/* descrição / resumo */}
      <Section T={T} icon={AlignLeft} title="Descrição">
        <AutoTextarea
          value={descricao} onChange={setDescricao}
          onBlur={() => { if (descricao.trim() !== (task.descricao || "").trim()) save({ descricao: descricao.trim() }); }}
          placeholder="Escreva os detalhes da tarefa…"
          className="tk-ghost-input"
          style={{ width: "100%", minHeight: 60, fontSize: 13.5, lineHeight: 1.55, color: T.text, border: "1px solid transparent", borderRadius: 8, padding: "8px 8px", outline: "none" }}
        />
      </Section>

      {/* checklist */}
      <Section T={T} icon={ListChecks} title="Checklist" right={checklist.length > 0 && sectionCount(checklist.length, checklist.filter(i => i.feito).length)}>
        {checklist.length > 0 && <div style={{ display: "flex", marginBottom: 8 }}><ProgressBar T={T} done={checklist.filter(i => i.feito).length} total={checklist.length} color={statusColor(T, "concluido")} /></div>}
        {checklist.map(i => (
          <div key={i.id} className="tk-row tk-item-in" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px", borderRadius: 6 }}>
            <input type="checkbox" className="tk-check" checked={!!i.feito} onChange={() => toggleCheck(i.id)} aria-label={i.texto} />
            <span style={{ flex: 1, fontSize: 13, wordBreak: "break-word" }}><span className={`tk-done-text${i.feito ? " done" : ""}`} style={{ color: i.feito ? T.textFaint : T.text }}>{i.texto}</span></span>
            <button onClick={() => removeCheck(i.id)} aria-label="Remover item" style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 4, display: "flex" }}><X size={14} /></button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input value={newCheck} onChange={e => setNewCheck(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addCheck(); }} placeholder="+ Adicionar item" style={inp({ fontSize: 13, padding: "8px 10px" })} />
          {newCheck.trim() && <button onClick={addCheck} style={{ ...btn(T.accent), flexShrink: 0 }}>Adicionar</button>}
        </div>
      </Section>

      {/* subtarefas */}
      <Section T={T} icon={ListTree} title="Subtarefas" right={subs.length > 0 && sectionCount(subs.length, subs.filter(s => s.status === "concluido").length)}>
        {subs.length > 0 && <div style={{ display: "flex", marginBottom: 8 }}><ProgressBar T={T} done={subs.filter(s => s.status === "concluido").length} total={subs.length} color={statusColor(T, "concluido")} /></div>}
        {subs.map(s => {
          const d = dueInfo(s.prazo, T, s.status);
          const done = s.status === "concluido";
          return (
            <div key={s.id} className="tk-row tk-item-in" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px", borderRadius: 6 }}>
              <input type="checkbox" className="tk-check" checked={done} onChange={() => api.updateStatus(s.id, done ? "a_fazer" : "concluido")} aria-label={`Concluir ${s.titulo}`} />
              <button onClick={() => onOpenTask(s.id)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: done ? T.textFaint : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color 220ms ease" }}><span className={`tk-done-text${done ? " done" : ""}`}>{s.titulo}</span></button>
              <AvatarStack T={T} names={s.responsaveis || []} size={17} />
              {s.prazo && !done && <span style={{ fontSize: 10.5, fontWeight: 700, color: d.color, whiteSpace: "nowrap" }}>{d.days != null && d.days > 2 ? fmtDate(s.prazo) : d.label}</span>}
              <span title={TASK_STATUS[s.status]?.label} style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(T, s.status), flexShrink: 0 }} />
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addSub(); }} placeholder="+ Nova subtarefa" style={inp({ fontSize: 13, padding: "8px 10px" })} />
          {newSub.trim() && <button onClick={addSub} style={{ ...btn(T.accent), flexShrink: 0 }}>Criar</button>}
        </div>
      </Section>

      {/* anexos */}
      <Section
        T={T} icon={Paperclip} title="Anexos"
        right={<>
          {anexos.length > 0 && sectionCount(anexos.length)}
          <button onClick={() => fileRef.current?.click()} disabled={uploading > 0} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", fontSize: 11.5 }}>
            <Plus size={13} /> {uploading > 0 ? `Enviando ${uploading}…` : "Anexar"}
          </button>
        </>}
      >
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={e => onFiles(e.target.files)} style={{ display: "none" }} />
        {anexos.length === 0 && <div style={{ fontSize: 12, color: T.textFaint, padding: "4px 6px" }}>Nenhum arquivo. Use "Anexar" para mandar fotos ou PDF (até {MAX_FILE_MB} MB).</div>}
        {anexos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {anexos.map(a => (
              <div key={a.path} style={{ position: "relative", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", background: T.input }}>
                <a href={api.anexoUrl(a.path)} target="_blank" rel="noopener noreferrer" style={{ display: "block", textDecoration: "none", color: T.text }}>
                  {isImage(a)
                    ? <img src={api.anexoUrl(a.path)} alt={a.nome} loading="lazy" style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />
                    : <div style={{ height: 96, display: "flex", alignItems: "center", justifyContent: "center", color: T.textFaint }}><FileText size={30} strokeWidth={1.5} /></div>}
                  <div style={{ padding: "6px 8px" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.nome}>{a.nome}</div>
                    <div style={{ fontSize: 10, color: T.textFaint }}>{a.tamanho ? fmtSize(a.tamanho) : ""}{a.por ? ` · ${a.por}` : ""}</div>
                  </div>
                </a>
                <button onClick={() => removeAnexo(a)} aria-label={`Remover ${a.nome}`} style={{ position: "absolute", top: 5, right: 5, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,.55)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* comentários */}
      <Section T={T} icon={MessageSquare} title="Comentários" right={comments && comments.length > 0 && sectionCount(comments.length)}>
        {comments === null && <div style={{ fontSize: 12, color: T.textFaint, padding: 6 }}>Carregando…</div>}
        {comments && comments.length === 0 && <div style={{ fontSize: 12, color: T.textFaint, padding: "4px 6px" }}>Nenhum comentário ainda.</div>}
        {comments && comments.map(c => (
          <div key={c.id} className="tk-item-in" style={{ display: "flex", gap: 10, padding: "8px 6px" }}>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: `${T.accent}22`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(c.autor || "?").trim().slice(0, 1).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.textBright }}>{c.autor}</span>
                <span style={{ fontSize: 10.5, color: T.textFaint }}>{fmtDateTime(c.criado_em)}</span>
                {(c.autor_uid === myUid || isAdmin) && (
                  <button onClick={() => removeComment(c)} aria-label="Apagar comentário" style={{ marginLeft: "auto", background: "none", border: "none", color: T.textFaint, cursor: "pointer", padding: 2, display: "flex" }}><Trash2 size={12} /></button>
                )}
              </div>
              <div style={{ fontSize: 13, color: T.text, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2 }}>{c.texto}</div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginTop: 6 }}>
          <AutoTextarea
            value={newComment} onChange={setNewComment}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendComment(); }}
            placeholder="Escreva um comentário…"
            style={{ ...inp({ fontSize: 13, padding: "9px 10px" }), minHeight: 38 }}
          />
          <button onClick={sendComment} disabled={!newComment.trim() || sendingComment} aria-label="Enviar comentário" style={{ ...btn(T.accent), padding: "9px 12px", display: "flex", alignItems: "center", opacity: newComment.trim() ? 1 : .5, flexShrink: 0 }}><Send size={15} /></button>
        </div>
      </Section>

      {/* histórico */}
      <Section
        T={T} icon={History} title="Histórico"
        right={<button onClick={() => setShowHistory(s => !s)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
          {showHistory ? "Esconder" : `Mostrar${history ? ` (${history.length})` : ""}`} <ChevronDown size={13} style={{ transform: showHistory ? "rotate(180deg)" : "none", transition: "transform 120ms ease" }} />
        </button>}
      >
        <div className={`tk-collapse${showHistory ? " open" : ""}`}><div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {history === null && <div style={{ fontSize: 12, color: T.textFaint, padding: 6 }}>Carregando…</div>}
            {history && history.length === 0 && <div style={{ fontSize: 12, color: T.textFaint, padding: 6 }}>Sem registros ainda (o histórico começou em 14/10/2026).</div>}
            {history && [...history].reverse().map(h => (
              <div key={h.id} style={{ display: "flex", gap: 10, padding: "6px 6px", fontSize: 12, color: T.textMuted, borderLeft: `2px solid ${T.borderSoft}`, marginLeft: 6 }}>
                <span style={{ color: T.textFaint, whiteSpace: "nowrap", fontSize: 11 }}>{fmtDateTime(h.criado_em)}</span>
                <span><b style={{ color: T.text }}>{h.autor}</b> {describeHistory(h)}</span>
              </div>
            ))}
          </div>
        </div></div>
      </Section>
    </div>
  );
}
