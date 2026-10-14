// Projetos (10/2026, "estilo Notion"): agrupam tarefas e mostram o % feito.
// Tabela própria `projetos` (ver supabase_migration_tarefas_notion.sql);
// a tarefa aponta pro projeto em `tarefas.projeto_id`. Excluir um projeto
// NÃO apaga as tarefas — elas só ficam sem projeto (on delete set null).
import { useState, useEffect, useMemo } from "react";
import { Plus, ArrowLeft, Trash2, FolderKanban, CheckCircle2, AlertTriangle, ListTodo } from "lucide-react";
import { Overlay } from "../common.jsx";
import { makeStyleHelpers } from "../../theme.js";
import { TASK_STATUS } from "../../constants.js";
import { COLS, CAT_TAG_PALETTE, ProgressBar, AvatarStack, PriorityBadge, dueInfo, statusColor, projectColor, priorityOrder, EmptyState, pillStyle } from "./taskUi.jsx";

export const PROJECT_STATUS = {
  ativo: { label: "Ativo", color: "#3b82f6" },
  pausado: { label: "Pausado", color: "#eab308" },
  concluido: { label: "Concluído", color: "#22c55e" },
};

function projectStats(project, tasks) {
  const list = tasks.filter(t => t.projeto_id === project.id);
  const done = list.filter(t => t.status === "concluido").length;
  const late = list.filter(t => t.status !== "concluido" && dueInfo(t.prazo, { isLight: true }, t.status).days < 0).length;
  const people = Array.from(new Set(list.flatMap(t => t.responsaveis || [])));
  return { list, total: list.length, done, open: list.length - done, late, people };
}

// Modal de criar projeto (editar é direto na página do projeto).
export function ProjectModal({ T, onClose, onSave }) {
  const { inp, btn } = makeStyleHelpers(T);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState(CAT_TAG_PALETTE[0]);
  const lbl = (c) => <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: .6 }}>{c}</div>;
  return (
    <Overlay T={T} onClose={onClose}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: T.textBright }}>Novo Projeto</h3>
      {lbl("Nome *")}
      <input autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Gestão e Estruturação do Grupo" style={inp({ marginBottom: 10 })} />
      {lbl("Descrição")}
      <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} placeholder="Objetivo do projeto (opcional)" style={{ ...inp({ marginBottom: 10 }), resize: "vertical" }} />
      {lbl("Cor")}
      <ColorPicker value={cor} onChange={setCor} />
      <button
        onClick={() => { if (!nome.trim()) return; onSave({ nome: nome.trim(), descricao: descricao.trim() || null, cor }); }}
        disabled={!nome.trim()}
        className="tk-pill-btn"
        style={{ ...btn(T.accent), borderRadius: 999, width: "100%", padding: 10, marginTop: 14, opacity: nome.trim() ? 1 : .5 }}
      >Criar projeto</button>
    </Overlay>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {CAT_TAG_PALETTE.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={`Cor ${c}`} style={{ width: 26, height: 26, borderRadius: 8, background: c, border: value === c ? "3px solid #fff" : "3px solid transparent", boxShadow: value === c ? `0 0 0 2px ${c}` : "none", cursor: "pointer" }} />
      ))}
    </div>
  );
}

export function ProjetosView({ T, projects, tasks, onOpenProject, onNew }) {
  const { btn } = makeStyleHelpers(T);
  const order = { ativo: 0, pausado: 1, concluido: 2 };
  const sorted = [...projects].sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <div className="tk-view" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {projects.length === 0 && (
        <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12 }}>
          <EmptyState T={T} icon={FolderKanban}>Nenhum projeto ainda. Projetos juntam várias tarefas e mostram quanto já foi feito.</EmptyState>
          <div style={{ display: "flex", justifyContent: "center", paddingBottom: 20 }}>
            <button onClick={onNew} className="tk-pill-btn" style={{ ...btn(T.accent), borderRadius: 999, display: "flex", alignItems: "center", gap: 6, padding: "9px 16px" }}><Plus size={14} /> Novo Projeto</button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {sorted.map((p, i) => {
          const s = projectStats(p, tasks);
          const c = projectColor(p);
          const st = PROJECT_STATUS[p.status] || PROJECT_STATUS.ativo;
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
          return (
            <button
              key={p.id}
              onClick={() => onOpenProject(p.id)}
              className="tk-card"
              style={{ animationDelay: `${Math.min(i * 40, 240)}ms`, textAlign: "left", fontFamily: "inherit", cursor: "pointer", background: T.panel, border: `1px solid ${T.border}`, borderTop: `4px solid ${c}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10, opacity: p.status === "concluido" ? .75 : 1 }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: T.textBright, wordBreak: "break-word" }}>{p.nome}</span>
                <span style={pillStyle(st.color)}>{st.label}</span>
              </div>
              {p.descricao && <div style={{ fontSize: 11.5, color: T.textMuted, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.descricao}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ProgressBar T={T} done={s.done} total={s.total} color={c} />
                <span style={{ fontSize: 11.5, fontWeight: 800, color: T.text }}>{pct}%</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: T.textMuted, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><ListTodo size={12} /> {s.open} em aberto</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} /> {s.done}/{s.total}</span>
                {s.late > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#ef4444", fontWeight: 700 }}><AlertTriangle size={12} /> {s.late} atrasada(s)</span>}
                <span style={{ marginLeft: "auto" }}><AvatarStack T={T} names={s.people} size={20} /></span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProjetoPage({ T, project, tasks, onBack, onOpenTask, onUpdate, onDelete, onCreateTask, currentUser }) {
  const { inp, ghost, btn } = makeStyleHelpers(T);
  const [nome, setNome] = useState(project.nome);
  const [descricao, setDescricao] = useState(project.descricao || "");
  const [newTask, setNewTask] = useState("");
  useEffect(() => { setNome(project.nome); setDescricao(project.descricao || ""); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = useMemo(() => projectStats(project, tasks), [project, tasks]);
  const c = projectColor(project);
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const byStatus = COLS.map(col => ({
    col,
    list: s.list.filter(t => t.status === col).sort((a, b) => priorityOrder(b) - priorityOrder(a) || (a.prazo || "9999").localeCompare(b.prazo || "9999")),
  }));

  const addTask = () => {
    const t = newTask.trim();
    if (!t) return;
    setNewTask("");
    onCreateTask({ titulo: t, descricao: "", responsaveis: currentUser ? [currentUser] : [], prazo: null, categoria: null, prioridade: "media", projeto_id: project.id, parent_id: null }, { silent: true });
  };

  return (
    <div className="tk-view" style={{ maxWidth: 820, width: "100%", margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <button onClick={onBack} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px" }}><ArrowLeft size={14} /> Projetos</button>
        <span style={{ flex: 1 }} />
        <button onClick={() => onDelete(project, onBack)} className="tk-pill-btn" style={{ ...ghost(), borderRadius: 999, color: "#ef4444", borderColor: "#ef444430", display: "flex", alignItems: "center", gap: 6, padding: "7px 12px" }}><Trash2 size={13} /> Excluir projeto</button>
      </div>

      <div style={{ width: 52, height: 52, borderRadius: 12, background: `${c}22`, color: c, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}><FolderKanban size={28} strokeWidth={1.8} /></div>
      <input
        value={nome} onChange={e => setNome(e.target.value)}
        onBlur={() => { const n = nome.trim(); if (!n) return setNome(project.nome); if (n !== project.nome) onUpdate(project.id, { nome: n }); }}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="tk-ghost-input"
        style={{ width: "100%", fontSize: 28, fontWeight: 800, color: T.textBright, border: "1px solid transparent", borderRadius: 8, padding: "4px 6px", marginLeft: -6, outline: "none", fontFamily: "inherit" }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
        <div className="tk-prop">
          <div className="tk-prop-label">Status</div>
          <select value={project.status} onChange={e => onUpdate(project.id, { status: e.target.value })} className="tk-ghost-input" style={inp({ fontSize: 13 })}>
            {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="tk-prop">
          <div className="tk-prop-label">Cor</div>
          <ColorPicker value={c} onChange={(cor) => onUpdate(project.id, { cor })} />
        </div>
        <div className="tk-prop">
          <div className="tk-prop-label">Progresso</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ProgressBar T={T} done={s.done} total={s.total} color={c} height={8} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: T.text, whiteSpace: "nowrap" }}>{pct}% · {s.done}/{s.total}</span>
          </div>
        </div>
        <div className="tk-prop">
          <div className="tk-prop-label">Pessoas</div>
          <div style={{ fontSize: 12.5, color: s.people.length ? T.text : T.textFaint }}>{s.people.length ? s.people.join(", ") : "—"}</div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textBright, marginBottom: 6 }}>Descrição</div>
        <textarea
          value={descricao} onChange={e => setDescricao(e.target.value)}
          onBlur={() => { if (descricao.trim() !== (project.descricao || "")) onUpdate(project.id, { descricao: descricao.trim() || null }); }}
          rows={3} placeholder="Objetivo do projeto…" className="tk-ghost-input"
          style={{ width: "100%", fontSize: 13.5, lineHeight: 1.5, color: T.text, border: "1px solid transparent", borderRadius: 8, padding: 8, outline: "none", resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textBright, marginBottom: 8 }}>Tarefas do projeto</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addTask(); }} placeholder="+ Nova tarefa neste projeto" style={inp({ fontSize: 13, padding: "8px 10px" })} />
          {newTask.trim() && <button onClick={addTask} style={{ ...btn(T.accent), flexShrink: 0 }}>Criar</button>}
        </div>
        {byStatus.map(({ col, list }) => list.length > 0 && (
          <div key={col} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(T, col) }} /> {TASK_STATUS[col].label} · {list.length}
            </div>
            {list.map(t => {
              const d = dueInfo(t.prazo, T, t.status);
              return (
                <button key={t.id} onClick={() => onOpenTask(t.id)} className="tk-row" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 6px", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: t.status === "concluido" ? T.textFaint : T.text, textDecoration: t.status === "concluido" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.parent_id ? "↳ " : ""}{t.titulo}</span>
                  <AvatarStack T={T} names={t.responsaveis || []} size={17} />
                  {(t.prioridade === "alta" || t.prioridade === "urgente") && <PriorityBadge T={T} prioridade={t.prioridade} compact />}
                  {t.prazo && t.status !== "concluido" && <span style={{ fontSize: 10.5, fontWeight: 700, color: d.color, whiteSpace: "nowrap" }}>{d.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
        {s.total === 0 && <div style={{ fontSize: 12, color: T.textFaint }}>Nenhuma tarefa ainda. Crie acima ou escolha este projeto na página de uma tarefa.</div>}
      </div>
    </div>
  );
}
