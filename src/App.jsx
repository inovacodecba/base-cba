import { useState, useEffect, useMemo } from "react";
import {
  Moon, Sun, ArrowUp, ArrowDown, ArrowLeftRight, ArrowUpDown, AlertTriangle,
  Download, Circle, Pencil, Trash2,
} from "lucide-react";

const SUPABASE_URL = "https://aayayeytzaflbipqppwt.supabase.co";
const SUPABASE_KEY = "sb_publishable__G4Ir20rpp9rC0qg-b5tpg_bU8ToqI-";

const sb = async (path, method = "GET", body = null) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": method === "POST" ? "return=representation" : method === "PATCH" ? "return=representation" : "",
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const mk = (s, l, q) => ({ sector: s, local: l, qty: q });
const INITIAL_ITEMS = [
  { name: "Leitores", status: "operacional", min_stock: 2, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 4)] },
  { name: "Kits de chaves", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 2)] },
  { name: "Kits de chave de boca", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 2)] },
  { name: "Kits de parafusos com arruelas e porcas", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 2)] },
  { name: "Kits união horizontal", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 2), mk("Armário", "", 1)] },
  { name: "Maletas de ferramentas", status: "operacional", min_stock: 2, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 3)] },
  { name: "Impressoras Zebra ZD220", status: "operacional", min_stock: 5, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 23)] },
  { name: "Tablet", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 1)] },
  { name: "Leitor RFID de mão", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 1)] },
  { name: "Ribbon", status: "estoque", min_stock: 3, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 1)] },
  { name: "Fita crepe", status: "estoque", min_stock: 2, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 1)] },
  { name: "Roteador D-Link", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 1)] },
  { name: "Bolsa de cintura (pochete)", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 1)] },
  { name: "Luva de corte", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 1)] },
  { name: "Módulos RFID padrão menor", status: "defeito parcial", min_stock: 2, qty_in_use: 0, qty_defect: 2, responsavel: "", rfid_tag: "", locations: [mk("Escritório", "", 3)] },
  { name: "Pochete", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Roteador queimado", status: "defeito", min_stock: 0, qty_in_use: 0, qty_defect: 1, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Fontes queimadas", status: "defeito", min_stock: 0, qty_in_use: 0, qty_defect: 4, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 4)] },
  { name: "Parafusadeira", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Fonte 12V", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Extensão", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Filtros de linha", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 5)] },
  { name: "Kit espelho caixa 1/4", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Kit presilha metal", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Etiquetadora", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Martelos", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 2)] },
  { name: "Cable tester", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Fonte 24V", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Capa de impressora", status: "estoque", min_stock: 2, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 2)] },
  { name: "Capa de etiqueta", status: "estoque", min_stock: 2, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 3)] },
  { name: "Aplicador tagfix", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Borracha para suporte", status: "estoque", min_stock: 20, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 100)] },
  { name: "Cones", status: "operacional", min_stock: 5, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 10)] },
  { name: "Módulos", status: "verificar", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 2)] },
  { name: "Fontes de impressora", status: "operacional", min_stock: 2, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 4)] },
  { name: "Modems", status: "verificar", min_stock: 5, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 30)] },
  { name: "Fontes de carregador", status: "verificar", min_stock: 5, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 20)] },
  { name: "Fechadura NFC", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Caixas totem", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 3)] },
  { name: "Celulares", status: "verificar", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 3)] },
  { name: "Faixas refletivas", status: "estoque", min_stock: 20, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 100)] },
  { name: "Adaptador internacional", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 1)] },
  { name: "Caixas Steck", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 5)] },
  { name: "Leitores totem", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 4)] },
  { name: "Cabos de rede", status: "operacional", min_stock: 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Armário", "", 4)] },
  { name: "Totens (somente com antena)", status: "verificar", min_stock: 0, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: "", locations: [mk("Central de Reparos", "", 5)] },
];

const SECTORS = ["Escritório", "Armário", "Central de Reparos"];
const TIPOS_E = ["compra", "devolução", "reparo", "retorno"];
const TIPOS_S = ["manutenção", "instalação", "consumo", "descarte", "defeito"];
const ADMIN = "Francisco Rufino";
const TEAM0 = ["Rodrigo Júnior", "Francisco Rufino", "Lucas Davi", "Alisson Mendonça", "Lucas Dias", "Thiago Santana"];
const DAY = 86400000;
const SC = {
  operacional: { label: "Operacional", dot: "#22c55e" },
  estoque: { label: "Estoque", dot: "#eab308" },
  "em uso": { label: "Em Uso", dot: "#3b82f6" },
  verificar: { label: "Verificar", dot: "#f97316" },
  "defeito parcial": { label: "Def. Parcial", dot: "#ef4444" },
  defeito: { label: "Defeito", dot: "#ef4444" },
};

const ts = () => new Date().toLocaleString("pt-BR");
const fd = s => s?.split(", ")[0] ?? "";
const tot = it => (it.locations || []).reduce((s, l) => s + l.qty, 0);
const isLow = it => tot(it) <= it.min_stock && it.status !== "defeito";

function toCSV(rows) {
  return rows.map(r => r.map(c => { const s = String(c ?? ""); return /["\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
}
function dlCSV(name, rows) {
  const blob = new Blob(["\ufeff" + toCSV(rows)], { type: "text/csv;charset=utf-8;sep=;" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export default function App() {
  const [items, setItems] = useState([]);
  const [movs, setMovs] = useState([]);
  const [team, setTeam] = useState([]);
  const [users, setUsers] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [view, setView] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({});
  const [editForm, setEditForm] = useState({});
  const [itemDraft, setItemDraft] = useState({});
  const [addItem, setAddItem] = useState({ name: "", qty: 0, sector: "Escritório", status: "operacional", min_stock: 1, rfid_tag: "" });
  const [batchForm, setBatchForm] = useState({ dir: "saida", tipo: "", obs: "" });
  const [batchQtys, setBatchQtys] = useState({});
  const [theme, setTheme] = useState("dark");
  const [newMember, setNewMember] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ name: "", password: "", confirm: "" });
  const [loginErr, setLoginErr] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const [invSector, setInvSector] = useState("Todos");
  const [invLocal, setInvLocal] = useState("");
  const [invStatus, setInvStatus] = useState("todos");
  const [invSort, setInvSort] = useState({ col: "nome", dir: "asc" });
  const [movDir, setMovDir] = useState("todos");
  const [movTipo, setMovTipo] = useState("todos");
  const [movResp, setMovResp] = useState("todos");
  const [movSearch, setMovSearch] = useState("");
  const [movFrom, setMovFrom] = useState("");
  const [movTo, setMovTo] = useState("");
  const [movSort, setMovSort] = useState("recente");

  // ── load from Supabase ────────────────────────────────────────────────────
  useEffect(() => {
    const savedTheme = localStorage.getItem("inv-theme");
    if (savedTheme) setTheme(savedTheme);
    const savedUser = localStorage.getItem("inv-user");
    if (savedUser) setCurrentUser(savedUser);
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [dbItems, dbMovs, dbTeam, dbUsers] = await Promise.all([
        sb("items?order=id.asc"),
        sb("movimentacoes?order=id.desc"),
        sb("team?order=name.asc"),
        sb("users_app?order=name.asc"),
      ]);
      setItems(dbItems || []);
      setMovs(dbMovs || []);
      if (dbTeam && dbTeam.length > 0) setTeam(dbTeam.map(r => r.name));
      else setTeam(TEAM0);
      const usersObj = {};
      (dbUsers || []).forEach(u => { usersObj[u.name] = u.password; });
      setUsers(usersObj);

      setLoaded(true);
    } catch (e) {
      setDbError(e.message);
      setLoaded(true);
    }
  };

  const seedDB = async (teamList) => {
    // inserir equipe
    const teamExists = await sb("team?order=name.asc");
    if (!teamExists || teamExists.length === 0) {
      await sb("team", "POST", teamList.map(n => ({ name: n })));
    }
    // inserir itens em lotes de 10
    for (let i = 0; i < INITIAL_ITEMS.length; i += 10) {
      await sb("items", "POST", INITIAL_ITEMS.slice(i, i + 10));
    }
  };

  useEffect(() => { localStorage.setItem("inv-theme", theme); }, [theme]);
  useEffect(() => { if (currentUser) localStorage.setItem("inv-user", currentUser); else localStorage.removeItem("inv-user"); }, [currentUser]);

  // ── tema ──────────────────────────────────────────────────────────────────
  const T = theme === "light" ? {
    bg: "#f1f2f5", panel: "#ffffff", panelAlt: "rgba(0,0,0,.04)", panelAlt2: "rgba(0,0,0,.06)",
    input: "#f8f9fb", text: "#111318", textBright: "#000", textMuted: "#555b6e", textDim: "#737b8c",
    textFaint: "#9299a8", textGhost: "#bcc0ca", border: "rgba(0,0,0,.1)", borderSoft: "rgba(0,0,0,.06)",
    hover: "rgba(0,0,0,.04)", overlay: "rgba(0,0,0,.4)", scrollbar: "#c5c8d0", accent: "#2563eb",
    shadow: "0 1px 3px rgba(0,0,0,.08)", th: "rgba(0,0,0,.03)", rowHover: "rgba(37,99,235,.04)"
  } : {
    bg: "#0c0d12", panel: "#14151d", panelAlt: "rgba(255,255,255,.04)", panelAlt2: "rgba(255,255,255,.06)",
    input: "#0a0b10", text: "#d8dae8", textBright: "#eceef8", textMuted: "#8086a0", textDim: "#5c6278",
    textFaint: "#3e4458", textGhost: "#2a2e40", border: "rgba(255,255,255,.08)", borderSoft: "rgba(255,255,255,.04)",
    hover: "rgba(255,255,255,.04)", overlay: "rgba(0,0,0,.7)", scrollbar: "#2a2e40", accent: "#4f86f7",
    shadow: "none", th: "rgba(255,255,255,.02)", rowHover: "rgba(79,134,247,.05)"
  };

  const inp = (ex = {}) => ({ width: "100%", padding: "7px 10px", borderRadius: 5, border: `1px solid ${T.border}`, fontSize: 12, background: T.input, color: T.text, outline: "none", display: "block", fontFamily: "inherit", ...ex });
  const btn = (bg, tx = "#fff") => ({ background: bg, border: "none", color: tx, padding: "6px 13px", borderRadius: 5, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" });
  const ghost = () => ({ ...btn(T.panelAlt, T.text), border: `1px solid ${T.border}` });
  const sbtn = (c) => ({ background: `${c}14`, border: `1px solid ${c}28`, color: c, padding: "4px 9px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });
  const rowBtn = () => ({ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.textFaint, cursor: "pointer" });
  const rowBtnHover = (c) => ({
    onMouseEnter: e => { e.currentTarget.style.background = `${c}14`; e.currentTarget.style.color = c; e.currentTarget.style.borderColor = `${c}40`; },
    onMouseLeave: e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textFaint; e.currentTarget.style.borderColor = T.border; },
  });
  const mT = { margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: T.textBright };
  const lbl = (children) => <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: .6 }}>{children}</div>;

  const Overlay = ({ onClose, children, wide }) => (
    <div style={{ position: "fixed", inset: 0, background: T.overlay, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.panel, borderRadius: 10, padding: "20px 22px 24px", width: "100%", maxWidth: wide ? 640 : 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.5)" }}>
        {children}
      </div>
    </div>
  );
  const StatusDot = ({ s }) => {
    const sc = SC[s] || SC.operacional;
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: T.textMuted }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc.dot, flexShrink: 0, display: "inline-block" }} />
      {sc.label}
    </span>;
  };
  const SortTh = ({ col, label, align }) => {
    const active = invSort.col === col;
    const Icon = active ? (invSort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return <th onClick={() => setInvSort(p => p.col === col ? { col, dir: p.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" })}
      style={{ padding: "9px 12px", textAlign: align || "left", fontSize: 10, fontWeight: 700, color: active ? T.accent : T.textFaint, textTransform: "uppercase", letterSpacing: .7, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", background: T.th, borderBottom: `1px solid ${T.border}` }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{label}<Icon size={11} strokeWidth={2.5} style={{ opacity: active ? 1 : .35 }} /></span>
    </th>;
  };
  const DirIcon = ({ dir, size = 12 }) => dir === "entrada" ? <ArrowUp size={size} strokeWidth={2.5} /> : dir === "transferencia" ? <ArrowLeftRight size={size} strokeWidth={2.5} /> : dir === "status" ? <Circle size={size - 4} fill="currentColor" /> : <ArrowDown size={size} strokeWidth={2.5} />;

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800); };
  const askConfirm = (message, onConfirm) => setConfirm({ message, onConfirm });

  // ── auth ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    const { name, password, confirm: c } = loginForm;
    if (!name) return setLoginErr("Selecione seu nome");
    if (!password) return setLoginErr("Digite a senha");
    const ex = users[name];
    if (ex === undefined) {
      if (password.length < 4) return setLoginErr("Mínimo de 4 caracteres");
      if (password !== c) return setLoginErr("As senhas não coincidem");
      await sb("users_app", "POST", { name, password });
      setUsers(p => ({ ...p, [name]: password }));
    } else {
      if (ex !== password) return setLoginErr("Senha incorreta");
    }
    setCurrentUser(name);
    setLoginForm({ name: "", password: "", confirm: "" });
    setLoginErr("");
  };
  const handleLogout = () => askConfirm("Deseja sair?", () => setCurrentUser(null));

  const addMember = async () => {
    const name = newMember.trim();
    if (!name) return showToast("Digite um nome", "err");
    if (team.includes(name)) return showToast("Já está na equipe", "err");
    await sb("team", "POST", { name });
    setTeam(p => [...p, name]);
    setNewMember("");
    showToast(`"${name}" adicionado`);
  };
  const removeMember = name => askConfirm(`Remover ${name} da equipe?`, async () => {
    await sb(`team?name=eq.${encodeURIComponent(name)}`, "DELETE");
    await sb(`users_app?name=eq.${encodeURIComponent(name)}`, "DELETE");
    setTeam(p => p.filter(n => n !== name));
    setUsers(p => { const n = { ...p }; delete n[name]; return n; });
    showToast(`"${name}" removido`, "warn");
  });

  // ── forecast ──────────────────────────────────────────────────────────────
  const forecast = item => {
    const cutoff = new Date(Date.now() - 30 * DAY).toISOString();
    const out = movs.filter(m => m.item_id === item.id && m.dir === "saida" && m.date_iso && m.date_iso >= cutoff).reduce((s, m) => s + m.qty, 0);
    if (!out) return null;
    const avg = out / 30;
    return { avg, days: avg > 0 ? Math.max(0, Math.floor((tot(item) - item.min_stock) / avg)) : null };
  };

  // ── derived ───────────────────────────────────────────────────────────────
  const critItems = items.filter(isLow);
  const defItems = items.filter(i => ["defeito", "defeito parcial"].includes(i.status));
  const verItems = items.filter(i => i.status === "verificar");
  const totalAll = items.reduce((s, i) => s + tot(i), 0);
  const localMap = {};
  items.forEach(it => (it.locations || []).forEach(l => {
    if (!l.local || !l.qty) return;
    if (!localMap[l.local]) localMap[l.local] = { local: l.local, sector: l.sector, qty: 0 };
    localMap[l.local].qty += l.qty;
  }));
  const localList = Object.values(localMap).sort((a, b) => b.qty - a.qty);

  // ── exports ───────────────────────────────────────────────────────────────
  const exportItems = () => {
    const rows = [["ID", "Nome", "Setor", "Sublocal", "Quantidade", "Status", "Estoque Mínimo", "Responsável", "Tag RFID"]];
    items.forEach(i => (i.locations.length ? i.locations : [{ sector: "", local: "", qty: 0 }]).forEach(l => rows.push([i.id, i.name, l.sector, l.local, l.qty, SC[i.status]?.label || i.status, i.min_stock, i.responsavel, i.rfid_tag || ""])));
    dlCSV(`inventario_cba_${Date.now()}.csv`, rows); showToast("Inventário exportado");
  };
  const exportMovs = () => { dlCSV(`movimentacoes_cba_${Date.now()}.csv`, [["Data", "Direção", "Tipo", "Item", "Quantidade", "Responsável", "Local/Destino", "Observação"], ...movs.map(m => [m.date_str, m.dir, m.tipo, m.item_name, m.qty, m.resp, m.dest, m.obs])]); showToast("Exportado"); };
  const exportCompras = () => {
    const l = items.filter(i => isLow(i) || ["defeito", "defeito parcial"].includes(i.status));
    if (!l.length) return showToast("Nenhum item crítico", "err");
    dlCSV(`compras_cba_${Date.now()}.csv`, [["Item", "Status", "Qtd Atual", "Estoque Mínimo", "Déficit", "Locais"], ...l.map(i => { const t = tot(i); return [i.name, SC[i.status]?.label || i.status, t, i.min_stock, Math.max(0, i.min_stock - t), (i.locations || []).map(l => `${l.sector}${l.local ? " (" + l.local + ")" : ""}: ${l.qty}`).join("; ")]; })]);
    showToast("Lista de compras exportada");
  };

  // ── submitMov ─────────────────────────────────────────────────────────────
  const submitMov = async () => {
    const { dir, qty, obs } = form; const n = parseInt(qty) || 0;
    if (!n) return showToast("Informe a quantidade", "err");
    const item = items.find(i => i.id === modal.item.id);

    if (dir === "transferencia") {
      const { locId, destLocId, destSector, destLocal } = form;
      if (!locId) return showToast("Selecione a origem", "err");
      const origem = item.locations.find(l => String(l.lid) === String(locId));
      if (!origem) return showToast("Origem inválida", "err");
      if (n > origem.qty) return showToast("Qtd insuficiente na origem", "err");
      let dSector, dLocal, dLid = null;
      if (destLocId === "__new__") { if (!destSector) return showToast("Selecione o setor de destino", "err"); dSector = destSector; dLocal = destLocal || ""; }
      else if (destLocId) { const dl = item.locations.find(l => String(l.lid) === String(destLocId)); if (!dl) return showToast("Destino inválido", "err"); dSector = dl.sector; dLocal = dl.local; dLid = dl.lid; }
      else return showToast("Selecione o destino", "err");
      let locs = item.locations.map(l => String(l.lid) === String(origem.lid) ? { ...l, qty: l.qty - n } : l).filter(l => l.qty > 0);
      if (dLid != null) locs = locs.map(l => String(l.lid) === String(dLid) ? { ...l, qty: l.qty + n } : l);
      else { const ex = locs.find(l => l.sector === dSector && (l.local || "") === (dLocal || "")); if (ex) locs = locs.map(l => l === ex ? { ...l, qty: l.qty + n } : l); else locs.push({ lid: Math.max(0, ...item.locations.map(l => l.lid), 0) + 1, sector: dSector, local: dLocal, qty: n }); }
      await sb(`items?id=eq.${item.id}`, "PATCH", { locations: locs, responsavel: currentUser });
      const on = `${origem.sector}${origem.local ? " · " + origem.local : ""}`;
      const dn = `${dSector}${dLocal ? " · " + dLocal : ""}`;
      const mov = { id: Date.now(), dir: "transferencia", tipo: "transferência", item_id: item.id, item_name: item.name, qty: n, resp: currentUser, dest: `${on} → ${dn}`, obs: obs || "", date_str: ts(), date_iso: new Date().toISOString() };
      await sb("movimentacoes", "POST", mov);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, locations: locs, responsavel: currentUser } : i));
      setMovs(p => [mov, ...p]);
      showToast("Transferência registrada"); setModal(null); setForm({}); return;
    }

    const { tipo, locId, newSector, newLocal } = form;
    if (!tipo) return showToast("Selecione o tipo", "err");
    if (!locId) return showToast("Selecione o local", "err");
    let locName = "", newLocs;
    if (dir === "saida") {
      const loc = item.locations.find(l => String(l.lid) === String(locId));
      if (!loc) return showToast("Local inválido", "err");
      if (n > loc.qty) return showToast("Qtd insuficiente", "err");
      locName = `${loc.sector}${loc.local ? " · " + loc.local : ""}`;
      newLocs = item.locations.map(l => String(l.lid) === String(locId) ? { ...l, qty: Math.max(0, l.qty - n) } : l).filter(l => l.qty > 0);
    } else {
      if (locId === "__new__") { if (!newSector) return showToast("Selecione o setor", "err"); locName = `${newSector}${newLocal ? " · " + newLocal : ""}`; newLocs = [...item.locations, { lid: Math.max(0, ...item.locations.map(l => l.lid), 0) + 1, sector: newSector, local: newLocal || "", qty: n }]; }
      else { const loc = item.locations.find(l => String(l.lid) === String(locId)); if (!loc) return showToast("Local inválido", "err"); locName = `${loc.sector}${loc.local ? " · " + loc.local : ""}`; newLocs = item.locations.map(l => String(l.lid) === String(locId) ? { ...l, qty: l.qty + n } : l); }
    }
    let ns = item.status; if (tipo === "defeito") ns = "defeito"; if (tipo === "reparo") ns = "operacional";
    await sb(`items?id=eq.${item.id}`, "PATCH", { locations: newLocs, status: ns, responsavel: currentUser });
    const mov = { id: Date.now(), dir, tipo, item_id: item.id, item_name: item.name, qty: n, resp: currentUser, dest: locName, obs: obs || "", date_str: ts(), date_iso: new Date().toISOString() };
    await sb("movimentacoes", "POST", mov);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, locations: newLocs, status: ns, responsavel: currentUser } : i));
    setMovs(p => [mov, ...p]);
    showToast(dir === "entrada" ? "Entrada registrada" : "Saída registrada"); setModal(null); setForm({});
  };

  const submitBatch = async () => {
    const { dir, tipo, obs } = batchForm; if (!tipo) return showToast("Selecione o tipo", "err");
    const entries = Object.entries(batchQtys).filter(([, q]) => parseInt(q) > 0);
    if (!entries.length) return showToast("Informe ao menos uma quantidade", "err");
    let created = [], skipped = [];
    const updatedItems = [...items];
    for (const [id0, q0] of entries) {
      const id = parseInt(id0), n = parseInt(q0);
      const idx = updatedItems.findIndex(i => i.id === id);
      if (idx === -1) continue;
      const it = updatedItems[idx];
      let locs = [...it.locations];
      if (dir === "saida") {
        const av = locs.reduce((s, l) => s + l.qty, 0);
        if (n > av) { skipped.push(it.name); continue; }
        let rem = n;
        locs = [...locs].sort((a, b) => b.qty - a.qty).map(l => { if (!rem) return l; const tk = Math.min(l.qty, rem); rem -= tk; return { ...l, qty: l.qty - tk }; }).filter(l => l.qty > 0);
      } else {
        if (!locs.length) locs = [{ lid: 1, sector: SECTORS[0], local: "", qty: n }];
        else locs = locs.map((l, i) => i === 0 ? { ...l, qty: l.qty + n } : l);
      }
      const ns = tipo === "defeito" ? "defeito" : tipo === "reparo" ? "operacional" : it.status;
      await sb(`items?id=eq.${id}`, "PATCH", { locations: locs, status: ns, responsavel: currentUser });
      updatedItems[idx] = { ...it, locations: locs, status: ns, responsavel: currentUser };
      const mov = { id: Date.now() + id, dir, tipo, item_id: id, item_name: it.name, qty: n, resp: currentUser, dest: "lote", obs: obs || "", date_str: ts(), date_iso: new Date().toISOString() };
      await sb("movimentacoes", "POST", mov);
      created.push(mov);
    }
    if (created.length) {
      setItems(updatedItems);
      setMovs(p => [...created, ...p]);
      showToast(`${created.length} movimentação(ões)${skipped.length ? " · " + skipped.length + " ignorada(s)" : ""}`, skipped.length ? "warn" : "ok");
      setModal(null); setBatchQtys({}); setBatchForm({ dir: "saida", tipo: "", obs: "" });
    } else showToast("Estoque insuficiente em todos os itens", "err");
  };

  const submitEditMov = async () => {
    const { tipo, resp, dest, obs } = editForm;
    if (!tipo || !resp) return showToast("Preencha todos os campos", "err");
    await sb(`movimentacoes?id=eq.${modal.original.id}`, "PATCH", { tipo, resp, dest: dest || "—", obs: obs || "", edited: true, edited_at: ts(), edited_by: currentUser });
    setMovs(prev => prev.map(m => m.id === modal.original.id ? { ...m, tipo, resp, dest: dest || "—", obs: obs || "", edited: true, edited_at: ts(), edited_by: currentUser } : m));
    showToast("Atualizado"); setModal(null); setEditForm({});
  };

  const deleteMov = () => askConfirm("Excluir esta movimentação? O estoque NÃO será revertido.", async () => {
    await sb(`movimentacoes?id=eq.${modal.original.id}`, "DELETE");
    setMovs(prev => prev.filter(m => m.id !== modal.original.id));
    showToast("Excluído", "warn"); setModal(null); setEditForm({});
  });

  const submitAdd = async () => {
    if (!addItem.name.trim()) return;
    const ni = { name: addItem.name, status: addItem.status, min_stock: +addItem.min_stock || 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: addItem.rfid_tag || "", locations: [{ lid: 1, sector: addItem.sector, local: "", qty: +addItem.qty || 0 }] };
    const created = await sb("items", "POST", ni);
    const newItem = Array.isArray(created) ? created[0] : created;
    const mov = { id: Date.now(), dir: "entrada", tipo: "compra", item_id: newItem.id, item_name: newItem.name, qty: newItem.locations[0].qty, resp: currentUser, dest: addItem.sector, obs: "Cadastro inicial", date_str: ts(), date_iso: new Date().toISOString() };
    await sb("movimentacoes", "POST", mov);
    setItems(p => [...p, newItem]);
    setMovs(p => [mov, ...p]);
    showToast(`"${newItem.name}" adicionado`); setModal(null);
    setAddItem({ name: "", qty: 0, sector: "Escritório", status: "operacional", min_stock: 1, rfid_tag: "" });
  };

  const deleteItem = id => askConfirm("Remover este item?", async () => {
    await sb(`items?id=eq.${id}`, "DELETE");
    setItems(p => p.filter(i => i.id !== id));
    showToast("Item removido", "warn"); setModal(null);
  });

  const updateStatus = async (id, st) => {
    const name = items.find(i => i.id === id)?.name || "";
    await sb(`items?id=eq.${id}`, "PATCH", { status: st });
    const mov = { id: Date.now(), dir: "status", tipo: "status", item_id: id, item_name: name, qty: 0, resp: currentUser, dest: "—", obs: `Status → ${SC[st]?.label || st}`, date_str: ts(), date_iso: new Date().toISOString() };
    await sb("movimentacoes", "POST", mov);
    setItems(p => p.map(i => i.id === id ? { ...i, status: st } : i));
    setMovs(p => [mov, ...p]);
    showToast("Status atualizado");
    setModal(m => m ? { ...m, item: { ...m.item, status: st } } : m);
  };

  const submitEditItem = async () => {
    if (!itemDraft.name?.trim()) return showToast("Nome obrigatório", "err");
    const cl = (itemDraft.locations || []).map(l => ({ ...l, qty: Math.max(0, parseInt(l.qty) || 0) }));
    await sb(`items?id=eq.${itemDraft.id}`, "PATCH", { name: itemDraft.name, min_stock: parseInt(itemDraft.min_stock) || 1, rfid_tag: itemDraft.rfid_tag || "", locations: cl });
    setItems(prev => prev.map(i => i.id === itemDraft.id ? { ...i, name: itemDraft.name, min_stock: parseInt(itemDraft.min_stock) || 1, rfid_tag: itemDraft.rfid_tag || "", locations: cl } : i));
    showToast("Item atualizado"); setModal(null); setItemDraft({});
  };

  // ── filtered + sorted ─────────────────────────────────────────────────────
  const filtInv = items.filter(it => {
    const locs = it.locations || [];
    if (invSector !== "Todos" && !locs.some(l => l.sector === invSector && l.qty > 0)) return false;
    if (invLocal && !locs.some(l => l.qty > 0 && l.local === invLocal)) return false;
    if (invStatus === "baixo" && !isLow(it)) return false;
    else if (invStatus !== "todos" && invStatus !== "baixo" && it.status !== invStatus) return false;
    if (invSearch && !it.name.toLowerCase().includes(invSearch.toLowerCase())) return false;
    return true;
  });
  const sortedInv = useMemo(() => {
    const arr = [...filtInv]; const { col, dir } = invSort; const d = dir === "asc" ? 1 : -1;
    if (col === "nome") return arr.sort((a, b) => d * a.name.localeCompare(b.name, "pt"));
    if (col === "qty") return arr.sort((a, b) => d * (tot(a) - tot(b)));
    if (col === "min") return arr.sort((a, b) => d * (a.min_stock - b.min_stock));
    if (col === "status") return arr.sort((a, b) => d * a.status.localeCompare(b.status));
    if (col === "critico") return arr.sort((a, b) => { const x = isLow(a) ? -1 : 1, y = isLow(b) ? -1 : 1; return x - y || tot(a) - tot(b); });
    return arr;
  }, [filtInv, invSort]);

  const tiposAtivos = movDir === "entrada" ? TIPOS_E : movDir === "saida" ? TIPOS_S : movDir === "transferencia" ? ["transferência"] : [...TIPOS_E, ...TIPOS_S, "transferência"];
  const filtMovs = movs.filter(m => {
    if (movDir !== "todos" && m.dir !== movDir) return false;
    if (movTipo !== "todos" && m.tipo !== movTipo) return false;
    if (movResp !== "todos" && m.resp !== movResp) return false;
    if (movSearch && !m.item_name?.toLowerCase().includes(movSearch.toLowerCase()) && !m.resp?.toLowerCase().includes(movSearch.toLowerCase())) return false;
    if (movFrom) { const d = m.date_iso?.slice(0, 10); if (!d || d < movFrom) return false; }
    if (movTo) { const d = m.date_iso?.slice(0, 10); if (!d || d > movTo) return false; }
    return true;
  });
  const sortedMovs = useMemo(() => {
    const arr = [...filtMovs];
    if (movSort === "antigo") return arr.reverse();
    if (movSort === "maior-qty") return arr.sort((a, b) => b.qty - a.qty);
    if (movSort === "menor-qty") return arr.sort((a, b) => a.qty - b.qty);
    return arr;
  }, [filtMovs, movSort]);

  // ── loading / error ───────────────────────────────────────────────────────
  if (!loaded || seeding) return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0c0d12", color: "#8086a0", fontFamily: "'DM Sans',sans-serif", fontSize: 13, gap: 10 }}>
      <div style={{ width: 32, height: 32, border: "3px solid #4f86f720", borderTop: "3px solid #4f86f7", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {seeding ? "Populando banco de dados pela primeira vez..." : "Carregando..."}
    </div>
  );

  if (dbError) return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", alignItems: "center", justifyContent: "center", background: "#0c0d12", color: "#ef4444", fontFamily: "'DM Sans',sans-serif", fontSize: 13, gap: 10, padding: 20, textAlign: "center" }}>
      <AlertTriangle size={28} strokeWidth={1.75} />
      <div style={{ fontWeight: 700 }}>Erro ao conectar ao banco</div>
      <div style={{ color: "#8086a0", fontSize: 11, maxWidth: 400 }}>{dbError}</div>
      <button onClick={loadAll} style={{ marginTop: 10, background: "#4f86f7", border: "none", color: "#fff", padding: "8px 16px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit" }}>Tentar novamente</button>
    </div>
  );

  if (!currentUser) return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ position: "fixed", top: 16, right: 16, width: 34, height: 34, borderRadius: 6, border: `1px solid ${T.border}`, background: T.panel, color: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
      </button>
      <div style={{ background: T.panel, borderRadius: 8, padding: "32px 28px", width: "100%", maxWidth: 360, border: `1px solid ${T.border}` }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: T.textFaint, fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Inovacode</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.textBright }}>Inventário CBA</div>
        </div>
        {lbl("Quem é você?")}
        <select value={loginForm.name} onChange={e => { setLoginForm(p => ({ ...p, name: e.target.value, password: "", confirm: "" })); setLoginErr(""); }} style={inp()}>
          <option value="">Selecione seu nome</option>
          {team.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {loginForm.name && <>
          {lbl(users[loginForm.name] === undefined ? "Criar senha (primeiro acesso)" : "Senha")}
          <input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} style={inp({ marginBottom: 8 })} placeholder="••••••" onKeyDown={e => e.key === "Enter" && !( users[loginForm.name] === undefined) && handleLogin()} />
          {users[loginForm.name] === undefined && <><input type="password" value={loginForm.confirm} onChange={e => setLoginForm(p => ({ ...p, confirm: e.target.value }))} style={inp({ marginBottom: 8 })} placeholder="Confirmar senha" onKeyDown={e => e.key === "Enter" && handleLogin()} /></>}
        </>}
        {loginErr && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{loginErr}</div>}
        <button onClick={handleLogin} style={{ ...btn(T.accent), width: "100%", padding: "10px", fontSize: 13, marginTop: 4 }}>
          {loginForm.name && users[loginForm.name] === undefined ? "Criar senha e entrar" : "Entrar"}
        </button>
        <div style={{ fontSize: 9, color: T.textFaint, marginTop: 14, textAlign: "center" }}>Dados sincronizados em tempo real.</div>
      </div>
    </div>
  );

  // ── MAIN ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: T.bg, minHeight: "100vh", color: T.text, fontSize: 13 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:${T.scrollbar};border-radius:3px}
        select option{background:${T.panel};color:${T.text}}
        input::placeholder{color:${T.textFaint}}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        tr.inv-row:hover td{background:${T.rowHover}}
        tr.inv-row td{transition:background .1s}
        @media(max-width:920px){
          .mob-grid{grid-template-columns:1fr 1fr!important}
          .hdr-inner{height:auto!important;flex-wrap:wrap!important;padding:8px 0!important;gap:6px!important}
          .inv-flt,.mov-flt{grid-template-columns:1fr 1fr!important}
          .inv-panel{overflow-x:auto!important}
          .inv-panel table{min-width:560px!important}
          .dash-panels{grid-template-columns:1fr!important}
        }
        @media(max-width:500px){
          .mob-grid,.inv-flt,.mov-flt{grid-template-columns:1fr!important}
        }
      `}</style>

      {toast && <div style={{ position: "fixed", top: 60, right: 16, zIndex: 9999, background: toast.type === "ok" ? "#16a34a" : toast.type === "err" ? "#dc2626" : "#d97706", color: "#fff", padding: "9px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,.4)", maxWidth: 320 }}>{toast.msg}</div>}

      {confirm && <Overlay onClose={() => setConfirm(null)}>
        <p style={{ fontSize: 13, color: T.text, marginBottom: 18, lineHeight: 1.6 }}>{confirm.message}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setConfirm(null)} style={{ ...ghost(), flex: 1 }}>Cancelar</button>
          <button onClick={() => { const f = confirm.onConfirm; setConfirm(null); f(); }} style={{ ...btn("#dc2626"), flex: 1 }}>Confirmar</button>
        </div>
      </Overlay>}

      {/* HEADER */}
      <div style={{ borderBottom: `1px solid ${T.border}`, background: T.panel, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 20px" }}>
          <div className="hdr-inner" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 52, gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontSize: 9, letterSpacing: 3, color: T.textFaint, fontWeight: 700, textTransform: "uppercase" }}>Inovacode</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.textBright, marginLeft: 10 }}>Inventário CBA</span>
              </div>
              <div style={{ display: "flex" }}>
                {[["dashboard", "Visão Geral"], ["inventario", "Inventário"], ["movimentacoes", "Movimentações"]].map(([v, l]) => (
                  <button key={v} onClick={() => setView(v)} style={{ padding: "16px 14px", border: "none", fontSize: 12, fontWeight: view === v ? 700 : 500, cursor: "pointer", background: "transparent", color: view === v ? T.textBright : T.textMuted, borderBottom: view === v ? `2px solid ${T.accent}` : "2px solid transparent" }}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
              <button onClick={() => setModal({ type: "add" })} style={btn(T.accent)}>+ Novo Item</button>
              <button onClick={() => { setBatchQtys({}); setModal({ type: "batch" }); }} style={ghost()}>Lote</button>
              <button onClick={() => setModal({ type: "reports" })} style={ghost()}>Relatórios</button>
              <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ ...ghost(), padding: "6px 8px", display: "flex", alignItems: "center" }}>{theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}</button>
              <button onClick={() => { if (currentUser === ADMIN) setModal({ type: "team" }); }} style={{ fontSize: 11, color: T.textMuted, background: "none", padding: "4px 2px", fontWeight: 600, border: "none", cursor: currentUser === ADMIN ? "pointer" : "default" }}>
                {currentUser}{currentUser === ADMIN ? <span style={{ color: T.textFaint, fontWeight: 500 }}> · admin</span> : ""}
              </button>
              <button onClick={handleLogout} style={{ ...ghost(), padding: "5px 8px", color: T.textFaint }}>Sair</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "20px 20px 60px" }}>

        {/* DASHBOARD */}
        {view === "dashboard" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }} className="mob-grid">
            {[
              { l: "Total em estoque", v: totalAll, sub: `${items.length} tipos`, c: T.accent },
              { l: "Estoque baixo", v: critItems.length, sub: critItems.length ? "Reposição necessária" : "Tudo no limite", c: "#eab308", fn: () => { setInvStatus("baixo"); setView("inventario"); } },
              { l: "Com defeito", v: defItems.length, sub: defItems.length ? "Requer atenção" : "Nenhum problema", c: "#ef4444", fn: () => { setInvStatus("defeito"); setView("inventario"); } },
              { l: "A verificar", v: verItems.length, sub: verItems.length ? "Verificação pendente" : "Tudo verificado", c: "#f97316", fn: () => { setInvStatus("verificar"); setView("inventario"); } },
            ].map((k, i) => (
              <div key={i} onClick={k.fn} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 16px", cursor: k.fn ? "pointer" : "default", boxShadow: T.shadow }} onMouseEnter={e => k.fn && (e.currentTarget.style.borderColor = T.accent)} onMouseLeave={e => k.fn && (e.currentTarget.style.borderColor = T.border)}>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>{k.l}</div>
                <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: k.c, lineHeight: 1, marginBottom: 4 }}>{k.v}</div>
                <div style={{ fontSize: 11, color: T.textFaint }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="dash-panels" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.textBright }}>Movimentações recentes</span>
                <button onClick={() => setView("movimentacoes")} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Ver todas</button>
              </div>
              {movs.length === 0 && <div style={{ padding: "24px 16px", fontSize: 12, color: T.textFaint, textAlign: "center" }}>Nenhuma movimentação registrada.</div>}
              {movs.slice(0, 10).map(m => {
                const isIn = m.dir === "entrada", isTr = m.dir === "transferencia", isSt = m.dir === "status";
                const mc = isIn ? "#22c55e" : isTr ? "#8b5cf6" : isSt ? T.textFaint : "#ef4444";
                return (
                  <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${T.borderSoft}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${mc}15`, color: mc }}>
                      <DirIcon dir={m.dir} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.item_name}</div>
                      <div style={{ fontSize: 10, color: T.textFaint }}>{m.resp} · {m.tipo}</div>
                    </div>
                    <div style={{ fontSize: 10, color: T.textFaint, whiteSpace: "nowrap", textAlign: "right" }}>
                      {m.qty > 0 && <span style={{ fontFamily: "'DM Mono',monospace", color: mc, fontWeight: 600, marginRight: 6 }}>{isIn ? "+" : isTr ? "" : "-"}{m.qty}</span>}
                      {fd(m.date_str)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}><span style={{ fontSize: 12, fontWeight: 700, color: T.textBright }}>Estoque por setor</span></div>
                {["Escritório", "Armário", "Central de Reparos"].map(sec => {
                  const sTotal = items.reduce((s, it) => s + (it.locations || []).filter(l => l.sector === sec).reduce((a, l) => a + l.qty, 0), 0);
                  const tipos = new Set(items.filter(it => (it.locations || []).some(l => l.sector === sec && l.qty > 0)).map(i => i.id)).size;
                  return (
                    <div key={sec} onClick={() => { setInvSector(sec); setView("inventario"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = T.hover} onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: T.text }}>{sec}</div>
                        <div style={{ fontSize: 10, color: T.textFaint }}>{tipos} tipos</div>
                      </div>
                      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: T.textBright }}>{sTotal}</div>
                    </div>
                  );
                })}
              </div>
              {(critItems.length > 0 || verItems.length > 0) && <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}><span style={{ fontSize: 12, fontWeight: 700, color: T.textBright }}>Ações necessárias</span></div>
                {critItems.slice(0, 4).map(i => (
                  <div key={i.id} onClick={() => { setInvSearch(i.name); setView("inventario"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = T.hover} onMouseLeave={e => e.currentTarget.style.background = ""}>
                    <div style={{ fontSize: 11, color: T.text }}><span style={{ color: "#eab308", marginRight: 6 }}>—</span>{i.name}</div>
                    <span style={{ fontSize: 10, color: "#eab308", fontFamily: "'DM Mono',monospace" }}>{tot(i)}/{i.min_stock}</span>
                  </div>
                ))}
                {verItems.slice(0, 3).map(i => (
                  <div key={i.id} onClick={() => { setInvSearch(i.name); setView("inventario"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = T.hover} onMouseLeave={e => e.currentTarget.style.background = ""}>
                    <div style={{ fontSize: 11, color: T.text }}><span style={{ color: "#f97316", marginRight: 6 }}>—</span>{i.name}</div>
                    <span style={{ fontSize: 10, color: "#f97316" }}>verificar</span>
                  </div>
                ))}
              </div>}
            </div>
          </div>
        </>}

        {/* INVENTÁRIO */}
        {view === "inventario" && <>
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
            <div className="inv-flt" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <input placeholder="Buscar item..." value={invSearch} onChange={e => setInvSearch(e.target.value)} style={inp({ marginBottom: 0 })} />
              <select value={invSector} onChange={e => setInvSector(e.target.value)} style={inp({ marginBottom: 0 })}>
                <option value="Todos">Todos os setores</option>
                {SECTORS.map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={invStatus} onChange={e => setInvStatus(e.target.value)} style={inp({ marginBottom: 0 })}>
                <option value="todos">Todos os status</option>
                <option value="operacional">Operacional</option>
                <option value="estoque">Estoque</option>
                <option value="em uso">Em Uso</option>
                <option value="verificar">Verificar</option>
                <option value="defeito parcial">Defeito Parcial</option>
                <option value="defeito">Defeito</option>
                <option value="baixo">Estoque Baixo</option>
              </select>
              <select value={invLocal} onChange={e => setInvLocal(e.target.value)} style={inp({ marginBottom: 0 })}>
                <option value="">Todos os sublocais</option>
                {localList.map(l => <option key={l.local} value={l.local}>{l.local} — {l.sector} ({l.qty})</option>)}
              </select>
              <select value={`${invSort.col}:${invSort.dir}`} onChange={e => { const [col, dir] = e.target.value.split(":"); setInvSort({ col, dir }); }} style={inp({ marginBottom: 0 })}>
                <option value="nome:asc">Nome A → Z</option>
                <option value="nome:desc">Nome Z → A</option>
                <option value="qty:desc">Maior quantidade</option>
                <option value="qty:asc">Menor quantidade</option>
                <option value="critico:asc">Críticos primeiro</option>
                <option value="status:asc">Por status</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T.textFaint }}><b style={{ color: T.text }}>{sortedInv.length}</b> itens</span>
              {(invSearch || invSector !== "Todos" || invLocal || invStatus !== "todos") && <button onClick={() => { setInvSearch(""); setInvSector("Todos"); setInvLocal(""); setInvStatus("todos"); }} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Limpar filtros</button>}
            </div>
          </div>

          <div className="inv-panel" style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <SortTh col="nome" label="Nome" />
                  <th style={{ padding: "9px 12px", fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .7, background: T.th, borderBottom: `1px solid ${T.border}` }}>Locais</th>
                  <SortTh col="status" label="Status" />
                  <SortTh col="qty" label="Qtd" align="right" />
                  <SortTh col="min" label="Mín" align="right" />
                  <th style={{ padding: "9px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .7, background: T.th, borderBottom: `1px solid ${T.border}` }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedInv.map(item => {
                  const t = tot(item), low = isLow(item);
                  return (
                    <tr key={item.id} className="inv-row" onClick={() => setModal({ type: "detail", item })} style={{ cursor: "pointer", borderBottom: `1px solid ${T.borderSoft}` }}>
                      <td style={{ padding: "10px 12px", maxWidth: 220 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                        {item.rfid_tag && <div style={{ fontSize: 10, color: T.textFaint, fontFamily: "'DM Mono',monospace" }}>{item.rfid_tag}</div>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(item.locations || []).map((l, i) => (
                            <span key={i} style={{ fontSize: 10, background: T.panelAlt, border: `1px solid ${T.borderSoft}`, padding: "2px 6px", borderRadius: 3, color: T.textMuted, whiteSpace: "nowrap" }}>
                              {l.sector}{l.local ? " / " + l.local : ""}: {l.qty}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <StatusDot s={item.status} />
                        {low && <span style={{ fontSize: 9, color: "#eab308", fontWeight: 700, marginLeft: 6, background: "rgba(234,179,8,.12)", padding: "1px 5px", borderRadius: 3 }}>baixo</span>}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 14, fontWeight: 700, color: low ? "#eab308" : T.textBright }}>{t}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "'DM Mono',monospace", fontSize: 12, color: T.textFaint }}>{item.min_stock}</td>
                      <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button title="Entrada" onClick={() => { setModal({ type: "mov", item, dir: "entrada" }); setForm({ dir: "entrada" }); }} style={rowBtn()} {...rowBtnHover("#22c55e")}><ArrowUp size={13} strokeWidth={2.25} /></button>
                          <button title="Saída" onClick={() => { setModal({ type: "mov", item, dir: "saida" }); setForm({ dir: "saida" }); }} style={rowBtn()} {...rowBtnHover("#ef4444")}><ArrowDown size={13} strokeWidth={2.25} /></button>
                          <button title="Transferir" onClick={() => { setModal({ type: "mov", item, dir: "transferencia" }); setForm({ dir: "transferencia" }); }} style={rowBtn()} {...rowBtnHover("#8b5cf6")}><ArrowLeftRight size={13} strokeWidth={2.25} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {sortedInv.length === 0 && <tr><td colSpan={6} style={{ padding: "40px", textAlign: "center", color: T.textFaint, fontSize: 12 }}>Nenhum item encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        </>}

        {/* MOVIMENTAÇÕES */}
        {view === "movimentacoes" && <>
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
            <div className="mov-flt" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <input placeholder="Buscar item ou responsável..." value={movSearch} onChange={e => setMovSearch(e.target.value)} style={inp({ marginBottom: 0 })} />
              <select value={movDir} onChange={e => { setMovDir(e.target.value); setMovTipo("todos"); }} style={inp({ marginBottom: 0 })}>
                <option value="todos">Todas as direções</option>
                <option value="entrada">Entradas</option>
                <option value="saida">Saídas</option>
                <option value="transferencia">Transferências</option>
              </select>
              <select value={movTipo} onChange={e => setMovTipo(e.target.value)} style={inp({ marginBottom: 0 })}>
                <option value="todos">Todos os tipos</option>
                {tiposAtivos.map(t => <option key={t}>{t}</option>)}
              </select>
              <select value={movResp} onChange={e => setMovResp(e.target.value)} style={inp({ marginBottom: 0 })}>
                <option value="todos">Todos responsáveis</option>
                {team.map(r => <option key={r}>{r}</option>)}
              </select>
              <select value={movSort} onChange={e => setMovSort(e.target.value)} style={inp({ marginBottom: 0 })}>
                <option value="recente">Mais recente</option>
                <option value="antigo">Mais antigo</option>
                <option value="maior-qty">Maior quantidade</option>
                <option value="menor-qty">Menor quantidade</option>
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <input type="date" value={movFrom} onChange={e => setMovFrom(e.target.value)} style={inp({ marginBottom: 0 })} />
              <input type="date" value={movTo} onChange={e => setMovTo(e.target.value)} style={inp({ marginBottom: 0 })} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: T.textFaint }}><b style={{ color: T.text }}>{sortedMovs.length}</b> registros</span>
              {(movSearch || movDir !== "todos" || movTipo !== "todos" || movResp !== "todos" || movFrom || movTo) && <button onClick={() => { setMovSearch(""); setMovDir("todos"); setMovTipo("todos"); setMovResp("todos"); setMovFrom(""); setMovTo(""); }} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Limpar filtros</button>}
            </div>
          </div>

          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
            {sortedMovs.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: T.textFaint, fontSize: 12 }}>Nenhuma movimentação encontrada.</div>}
            {sortedMovs.map(m => {
              const isIn = m.dir === "entrada", isTr = m.dir === "transferencia", isSt = m.dir === "status";
              const mc = isIn ? "#22c55e" : isTr ? "#8b5cf6" : isSt ? T.textFaint : "#ef4444";
              return (
                <div key={m.id} style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${T.borderSoft}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", background: `${mc}14`, color: mc, flexShrink: 0 }}>
                    <DirIcon dir={m.dir} size={14} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: T.text }}>{m.item_name}</div>
                    <span style={{ fontSize: 9, background: T.panelAlt, border: `1px solid ${T.borderSoft}`, padding: "1px 6px", borderRadius: 3, color: T.textDim, textTransform: "uppercase", letterSpacing: .4, fontWeight: 600 }}>{m.tipo}</span>
                    {m.edited && <span style={{ fontSize: 9, color: "#8b5cf6", marginLeft: 6 }}>editado</span>}
                  </div>
                  <div style={{ minWidth: 0, fontSize: 11, color: T.textMuted }}>
                    <div style={{ color: T.text, fontWeight: 500 }}>{m.resp}</div>
                    <div style={{ color: T.textFaint }}>{m.dest && m.dest !== "—" && m.dest}{m.obs && " · " + m.obs}</div>
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {m.qty > 0 && <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, fontWeight: 700, color: mc }}>{isIn ? "+" : isTr ? "" : "-"}{m.qty}</div>}
                    <div style={{ fontSize: 10, color: T.textFaint }}>{fd(m.date_str)}</div>
                  </div>
                  <div>{!isSt && <button onClick={() => { setEditForm({ id: m.id, dir: m.dir, tipo: m.tipo, qty: m.qty, resp: m.resp, dest: m.dest === "—" ? "" : m.dest, obs: m.obs }); setModal({ type: "editMov", original: m }); }} style={sbtn(T.accent)}>Editar</button>}</div>
                </div>
              );
            })}
          </div>
        </>}
      </div>

      {/* MODAIS */}
      {modal?.type === "team" && currentUser === ADMIN && (
        <Overlay onClose={() => setModal(null)} wide>
          <h3 style={mT}>Gerenciar Equipe</h3>
          <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 16 }}>Alterações são sincronizadas para toda a equipe.</p>
          {lbl("Adicionar membro")}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input value={newMember} onChange={e => setNewMember(e.target.value)} placeholder="Nome completo" style={inp({ marginBottom: 0, flex: 1 })} onKeyDown={e => e.key === "Enter" && addMember()} />
            <button onClick={addMember} style={btn(T.accent)}>Adicionar</button>
          </div>
          {lbl(`Equipe (${team.length})`)}
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {team.map(name => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 10px", background: T.panelAlt, borderRadius: 5, marginBottom: 4 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text }}>
                  {name}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: users[name] !== undefined ? "#22c55e" : T.textFaint }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: users[name] !== undefined ? "#22c55e" : T.textGhost, display: "inline-block" }} />
                    {users[name] !== undefined ? "ativo" : "aguardando"}
                  </span>
                </div>
                {name !== ADMIN && <button onClick={() => removeMember(name)} style={sbtn("#ef4444")}>Remover</button>}
              </div>
            ))}
          </div>
        </Overlay>
      )}

      {modal?.type === "reports" && (
        <Overlay onClose={() => setModal(null)}>
          <h3 style={{ ...mT, marginBottom: 14 }}>Relatórios CSV</h3>
          {[
            { label: "Inventário completo", sub: "Todos os itens e locais", fn: exportItems, c: T.accent },
            { label: "Todas as movimentações", sub: "Histórico completo", fn: exportMovs, c: T.textMuted },
            { label: "Lista de compras", sub: "Estoque baixo + itens com defeito", fn: exportCompras, c: "#eab308" },
          ].map((r, i) => (
            <button key={i} onClick={r.fn} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", background: T.panelAlt, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", marginBottom: 6, fontFamily: "inherit", textAlign: "left" }} onMouseEnter={e => e.currentTarget.style.borderColor = r.c} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.textBright }}>{r.label}</div>
                <div style={{ fontSize: 10, color: T.textFaint }}>{r.sub}</div>
              </div>
              <Download size={15} style={{ color: r.c }} />
            </button>
          ))}
        </Overlay>
      )}

      {modal?.type === "mov" && (
        <Overlay onClose={() => { setModal(null); setForm({}); }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={mT}>{form.dir === "entrada" ? "Registrar Entrada" : form.dir === "saida" ? "Registrar Saída" : "Transferir Estoque"}</h3>
              <div style={{ fontSize: 11, color: T.textMuted }}>{modal.item.name} — total: <b style={{ color: T.text }}>{tot(modal.item)}</b></div>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              {[["entrada", "Entrada", "#22c55e"], ["saida", "Saída", "#ef4444"], ["transferencia", "Transferir", "#8b5cf6"]].map(([d, l, c]) => (
                <button key={d} onClick={() => setForm({ dir: d })} style={{ ...sbtn(c), background: form.dir === d ? c : `${c}14`, color: form.dir === d ? "#fff" : c }}>{l}</button>
              ))}
            </div>
          </div>

          {form.dir !== "transferencia" ? (
            <>
              {lbl("Local *")}
              <select value={form.locId || ""} onChange={e => setForm(p => ({ ...p, locId: e.target.value }))} style={inp()}>
                <option value="">Selecione</option>
                {modal.item.locations.map((l, i) => <option key={i} value={l.lid || i}>{l.sector}{l.local ? " · " + l.local : ""} (disp. {l.qty})</option>)}
                {form.dir === "entrada" && <option value="__new__">+ Novo local</option>}
              </select>
              {form.dir === "entrada" && form.locId === "__new__" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>{lbl("Setor *")}<select value={form.newSector || ""} onChange={e => setForm(p => ({ ...p, newSector: e.target.value }))} style={inp()}><option value="">Selecione</option>{SECTORS.map(s => <option key={s}>{s}</option>)}</select></div>
                <div>{lbl("Sublocal")}<input value={form.newLocal || ""} onChange={e => setForm(p => ({ ...p, newLocal: e.target.value }))} placeholder="ex: Bancada 1" style={inp()} /></div>
              </div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>{lbl("Tipo *")}<select value={form.tipo || ""} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} style={inp()}><option value="">Selecione</option>{(form.dir === "entrada" ? TIPOS_E : TIPOS_S).map(t => <option key={t}>{t}</option>)}</select></div>
                <div>{lbl("Responsável")}<div style={{ ...inp(), color: T.textMuted }}>{currentUser}</div></div>
              </div>
            </>
          ) : (
            <>
              {lbl("Origem *")}
              <select value={form.locId || ""} onChange={e => setForm(p => ({ ...p, locId: e.target.value, destLocId: "", destSector: "", destLocal: "" }))} style={inp()}>
                <option value="">Selecione a origem</option>
                {modal.item.locations.map((l, i) => <option key={i} value={l.lid || i}>{l.sector}{l.local ? " · " + l.local : ""} (disp. {l.qty})</option>)}
              </select>
              {lbl("Destino *")}
              <select value={form.destLocId || ""} onChange={e => setForm(p => ({ ...p, destLocId: e.target.value }))} style={inp()} disabled={!form.locId}>
                <option value="">{form.locId ? "Selecione o destino" : "Selecione a origem primeiro"}</option>
                {modal.item.locations.filter((l, i) => String(l.lid || i) !== String(form.locId)).map((l, i) => <option key={i} value={l.lid || i}>{l.sector}{l.local ? " · " + l.local : ""} (atual {l.qty})</option>)}
                <option value="__new__">+ Novo local</option>
              </select>
              {form.destLocId === "__new__" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div>{lbl("Setor destino *")}<select value={form.destSector || ""} onChange={e => setForm(p => ({ ...p, destSector: e.target.value }))} style={inp()}><option value="">Selecione</option>{SECTORS.map(s => <option key={s}>{s}</option>)}</select></div>
                <div>{lbl("Sublocal")}<input value={form.destLocal || ""} onChange={e => setForm(p => ({ ...p, destLocal: e.target.value }))} placeholder="ex: Bancada 1" style={inp()} /></div>
              </div>}
            </>
          )}

          {lbl("Quantidade *")}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <button onClick={() => setForm(p => ({ ...p, qty: Math.max(1, (parseInt(p.qty) || 1) - 1) }))} style={{ width: 34, height: 34, borderRadius: 5, border: `1px solid ${T.border}`, background: T.panelAlt, color: T.text, fontSize: 16, cursor: "pointer" }}>−</button>
            <input type="number" value={form.qty || ""} onChange={e => setForm(p => ({ ...p, qty: e.target.value }))} placeholder="0" style={{ ...inp(), textAlign: "center", fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono',monospace", flex: 1, marginBottom: 0, height: 34 }} />
            <button onClick={() => setForm(p => ({ ...p, qty: (parseInt(p.qty) || 0) + 1 }))} style={{ width: 34, height: 34, borderRadius: 5, border: `1px solid ${T.border}`, background: T.panelAlt, color: T.text, fontSize: 16, cursor: "pointer" }}>+</button>
          </div>
          {lbl("Observação")}
          <input value={form.obs || ""} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} placeholder="Detalhe opcional" style={inp({ marginBottom: 14 })} />
          <button onClick={submitMov} style={{ ...btn(form.dir === "entrada" ? "#22c55e" : form.dir === "saida" ? "#ef4444" : "#8b5cf6"), width: "100%", padding: "11px", fontSize: 13 }}>
            Confirmar {form.dir === "entrada" ? "Entrada" : form.dir === "saida" ? "Saída" : "Transferência"}
          </button>
        </Overlay>
      )}

      {modal?.type === "batch" && (
        <Overlay onClose={() => { setModal(null); setBatchQtys({}); }} wide>
          <h3 style={{ ...mT, marginBottom: 14 }}>Movimentação em Lote</h3>
          <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
            {["entrada", "saida"].map(d => (
              <button key={d} onClick={() => setBatchForm(p => ({ ...p, dir: d, tipo: "" }))} style={{ ...sbtn(d === "entrada" ? "#22c55e" : "#ef4444"), background: batchForm.dir === d ? (d === "entrada" ? "#22c55e" : "#ef4444") : "transparent", color: batchForm.dir === d ? "#fff" : d === "entrada" ? "#22c55e" : "#ef4444" }}>{d === "entrada" ? "Entrada" : "Saída"}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>{lbl("Tipo *")}<select value={batchForm.tipo} onChange={e => setBatchForm(p => ({ ...p, tipo: e.target.value }))} style={inp()}><option value="">Selecione</option>{(batchForm.dir === "entrada" ? TIPOS_E : TIPOS_S).map(t => <option key={t}>{t}</option>)}</select></div>
            <div>{lbl("Observação")}<input value={batchForm.obs} onChange={e => setBatchForm(p => ({ ...p, obs: e.target.value }))} style={inp()} /></div>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 5, marginBottom: 12 }}>
            {items.map((it, i) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderBottom: i < items.length - 1 ? `1px solid ${T.borderSoft}` : "none" }}>
                <div style={{ flex: 1, fontSize: 12, color: T.text }}>{it.name}<span style={{ color: T.textFaint, fontSize: 10, marginLeft: 6 }}>({tot(it)} disp.)</span></div>
                <input type="number" min="0" placeholder="0" value={batchQtys[it.id] || ""} onChange={e => setBatchQtys(p => ({ ...p, [it.id]: e.target.value }))} style={{ width: 70, ...inp({ marginBottom: 0, textAlign: "center" }) }} />
              </div>
            ))}
          </div>
          <button onClick={submitBatch} style={{ ...btn(batchForm.dir === "entrada" ? "#22c55e" : "#ef4444"), width: "100%", padding: "11px", fontSize: 13 }}>Confirmar Lote</button>
        </Overlay>
      )}

      {modal?.type === "editMov" && (
        <Overlay onClose={() => { setModal(null); setEditForm({}); }}>
          <h3 style={{ ...mT, marginBottom: 4 }}>Editar Movimentação</h3>
          <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 14 }}>{modal.original.item_name} · {modal.original.date_str}</p>
          <div style={{ padding: "8px 10px", background: "rgba(234,179,8,.08)", border: "1px solid rgba(234,179,8,.2)", borderRadius: 5, marginBottom: 12, fontSize: 11, color: "#ca8a04" }}>Quantidade e item não podem ser editados. Editado por {currentUser}.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>{lbl("Tipo *")}{editForm.dir === "transferencia" ? <div style={{ ...inp(), color: T.textMuted }}>Transferência</div> : <select value={editForm.tipo || ""} onChange={e => setEditForm(p => ({ ...p, tipo: e.target.value }))} style={inp()}><option value="">Selecione</option>{(editForm.dir === "entrada" ? TIPOS_E : TIPOS_S).map(t => <option key={t}>{t}</option>)}</select>}</div>
            <div>{lbl("Responsável *")}<select value={editForm.resp || ""} onChange={e => setEditForm(p => ({ ...p, resp: e.target.value }))} style={inp()}><option value="">Selecione</option>{team.map(r => <option key={r}>{r}</option>)}</select></div>
            <div style={{ gridColumn: "1/-1" }}>{lbl("Local/Destino")}<input value={editForm.dest || ""} onChange={e => setEditForm(p => ({ ...p, dest: e.target.value }))} style={inp()} /></div>
          </div>
          {lbl("Observação")}<input value={editForm.obs || ""} onChange={e => setEditForm(p => ({ ...p, obs: e.target.value }))} style={inp({ marginBottom: 14 })} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={deleteMov} style={{ ...sbtn("#ef4444"), padding: "9px 14px" }}>Excluir</button>
            <button onClick={submitEditMov} style={{ ...btn(T.accent), flex: 1, padding: "11px", fontSize: 13 }}>Salvar</button>
          </div>
        </Overlay>
      )}

      {modal?.type === "detail" && (() => {
        const item = modal.item; const iMovs = movs.filter(m => m.item_id === item.id); const fc = forecast(item);
        return (
          <Overlay onClose={() => setModal(null)} wide>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div><h3 style={mT}>{item.name}</h3><StatusDot s={item.status} />{item.rfid_tag && <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: T.textFaint, marginLeft: 10 }}>{item.rfid_tag}</span>}</div>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 26, fontWeight: 700, color: isLow(item) ? "#eab308" : T.textBright }}>{tot(item)}</div>
            </div>
            {lbl("Locais")}
            <div style={{ marginBottom: 12 }}>
              {(item.locations || []).map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: T.panelAlt, borderRadius: 5, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: T.text }}>{l.sector}{l.local ? " · " + l.local : ""}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: T.textBright }}>{l.qty}</span>
                </div>
              ))}
            </div>
            {fc && <div style={{ padding: "7px 10px", background: `${T.accent}10`, border: `1px solid ${T.accent}20`, borderRadius: 5, fontSize: 11, color: T.textMuted, marginBottom: 12 }}>Consumo médio: <b>{fc.avg.toFixed(2)}/dia</b> — reposição estimada em <b>~{fc.days} dias</b></div>}
            {lbl("Alterar status")}
            <select value={item.status} onChange={e => updateStatus(item.id, e.target.value)} style={inp({ marginBottom: 12 })}>
              {Object.entries(SC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {lbl(`Histórico (${iMovs.length})`)}
            <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 14 }}>
              {iMovs.length === 0 && <div style={{ fontSize: 11, color: T.textFaint }}>Sem movimentações.</div>}
              {iMovs.map(m => (
                <div key={m.id} style={{ padding: "6px 0", borderBottom: `1px solid ${T.borderSoft}`, fontSize: 11, display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ display: "inline-flex", alignItems: "baseline", gap: 1, color: m.dir === "entrada" ? "#22c55e" : m.dir === "transferencia" ? "#8b5cf6" : m.dir === "saida" ? "#ef4444" : T.textFaint, fontWeight: 700, minWidth: 30, fontFamily: "'DM Mono',monospace" }}>{m.dir === "transferencia" ? <ArrowLeftRight size={11} strokeWidth={2.5} /> : m.dir === "entrada" ? "+" : m.dir === "saida" ? "-" : ""}{m.qty || ""}</span>
                  <span style={{ color: T.textMuted }}>{m.tipo}</span>
                  <span style={{ color: T.textFaint }}>· {m.resp}</span>
                  {m.obs && <span style={{ color: T.textFaint, fontStyle: "italic" }}>— {m.obs}</span>}
                  <span style={{ marginLeft: "auto", color: T.textGhost, whiteSpace: "nowrap" }}>{fd(m.date_str)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button onClick={() => { setModal({ type: "mov", item, dir: "entrada" }); setForm({ dir: "entrada" }); }} style={{ ...sbtn("#22c55e"), flex: 1, padding: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><ArrowUp size={12} strokeWidth={2.5} /> Entrada</button>
              <button onClick={() => { setModal({ type: "mov", item, dir: "saida" }); setForm({ dir: "saida" }); }} style={{ ...sbtn("#ef4444"), flex: 1, padding: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><ArrowDown size={12} strokeWidth={2.5} /> Saída</button>
              <button onClick={() => { setModal({ type: "mov", item, dir: "transferencia" }); setForm({ dir: "transferencia" }); }} style={{ ...sbtn("#8b5cf6"), flex: 1, padding: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><ArrowLeftRight size={12} strokeWidth={2.5} /> Transferir</button>
              <button onClick={() => { setItemDraft({ ...item, locations: (item.locations || []).map(l => ({ ...l })) }); setModal({ type: "editItem", original: item }); }} style={{ ...ghost(), flex: 1, padding: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><Pencil size={12} strokeWidth={2.25} /> Editar</button>
            </div>
            <button onClick={() => deleteItem(item.id)} style={{ width: "100%", padding: "7px", borderRadius: 5, border: `1px solid rgba(239,68,68,.3)`, background: "transparent", color: "#ef4444", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}><Trash2 size={12} strokeWidth={2.25} /> Remover item</button>
          </Overlay>
        );
      })()}

      {modal?.type === "editItem" && (
        <Overlay onClose={() => { setModal(null); setItemDraft({}); }} wide>
          <h3 style={{ ...mT, marginBottom: 14 }}>Editar Item</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ gridColumn: "1/-1" }}>{lbl("Nome *")}<input value={itemDraft.name || ""} onChange={e => setItemDraft(p => ({ ...p, name: e.target.value }))} style={inp()} /></div>
            <div>{lbl("Estoque mínimo")}<input type="number" value={itemDraft.min_stock || 0} onChange={e => setItemDraft(p => ({ ...p, min_stock: e.target.value }))} style={inp()} /></div>
            <div>{lbl("Tag RFID / EPC")}<input value={itemDraft.rfid_tag || ""} onChange={e => setItemDraft(p => ({ ...p, rfid_tag: e.target.value }))} style={inp({ fontFamily: "'DM Mono',monospace" })} /></div>
          </div>
          {lbl("Locais")}
          {(itemDraft.locations || []).map((loc, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 70px 32px", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <select value={loc.sector} onChange={e => { const v = e.target.value; setItemDraft(p => ({ ...p, locations: p.locations.map((l, i) => i === idx ? { ...l, sector: v } : l) })); }} style={inp({ marginBottom: 0, fontSize: 11 })}>{SECTORS.map(s => <option key={s}>{s}</option>)}</select>
              <input value={loc.local} placeholder="Sublocal" onChange={e => { const v = e.target.value; setItemDraft(p => ({ ...p, locations: p.locations.map((l, i) => i === idx ? { ...l, local: v } : l) })); }} style={inp({ marginBottom: 0, fontSize: 11 })} />
              <input type="number" value={loc.qty} onChange={e => { const v = parseInt(e.target.value) || 0; setItemDraft(p => ({ ...p, locations: p.locations.map((l, i) => i === idx ? { ...l, qty: v } : l) })); }} style={inp({ marginBottom: 0, fontSize: 11, textAlign: "center" })} />
              <button onClick={() => setItemDraft(p => ({ ...p, locations: p.locations.filter((_, i) => i !== idx) }))} style={{ ...sbtn("#ef4444"), height: 32, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>
            </div>
          ))}
          <button onClick={() => setItemDraft(p => ({ ...p, locations: [...(p.locations || []), { lid: Date.now(), sector: SECTORS[0], local: "", qty: 0 }] }))} style={{ ...ghost(), marginBottom: 12, fontSize: 11 }}>+ Adicionar local</button>
          <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 12 }}>Total: <b style={{ color: T.text }}>{(itemDraft.locations || []).reduce((s, l) => s + (parseInt(l.qty) || 0), 0)}</b> unidades</div>
          <button onClick={submitEditItem} style={{ ...btn(T.accent), width: "100%", padding: "11px", fontSize: 13 }}>Salvar alterações</button>
        </Overlay>
      )}

      {modal?.type === "add" && (
        <Overlay onClose={() => setModal(null)}>
          <h3 style={{ ...mT, marginBottom: 14 }}>Novo Item</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ gridColumn: "1/-1" }}>{lbl("Nome *")}<input value={addItem.name} onChange={e => setAddItem(p => ({ ...p, name: e.target.value }))} placeholder="Nome do equipamento" style={inp()} /></div>
            <div>{lbl("Qtd. inicial")}<input type="number" value={addItem.qty} onChange={e => setAddItem(p => ({ ...p, qty: e.target.value }))} style={inp()} /></div>
            <div>{lbl("Estoque mínimo")}<input type="number" value={addItem.min_stock} onChange={e => setAddItem(p => ({ ...p, min_stock: e.target.value }))} style={inp()} /></div>
            <div>{lbl("Setor inicial")}<select value={addItem.sector} onChange={e => setAddItem(p => ({ ...p, sector: e.target.value }))} style={inp()}>{SECTORS.map(s => <option key={s}>{s}</option>)}</select></div>
            <div>{lbl("Status")}<select value={addItem.status} onChange={e => setAddItem(p => ({ ...p, status: e.target.value }))} style={inp()}>{Object.entries(SC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div style={{ gridColumn: "1/-1" }}>{lbl("Tag RFID / EPC (opcional)")}<input value={addItem.rfid_tag} onChange={e => setAddItem(p => ({ ...p, rfid_tag: e.target.value }))} placeholder="E2801170..." style={inp({ fontFamily: "'DM Mono',monospace" })} /></div>
          </div>
          <button onClick={submitAdd} style={{ ...btn(T.accent), width: "100%", padding: "11px", fontSize: 13, marginTop: 8 }}>Adicionar ao inventário</button>
        </Overlay>
      )}
    </div>
  );
}