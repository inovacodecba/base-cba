import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import {
  Moon, Sun, ArrowUp, ArrowDown, ArrowLeftRight, AlertTriangle,
  Download, Pencil, Trash2, CheckCircle2, XCircle, Info, X, MapPin, Tags,
  FileText, Layers, Boxes,
} from "lucide-react";

import { getTheme, makeStyleHelpers } from "./theme.js";
import { SECTORS0, SECTOR_PALETTE, EQUIPAMENTOS0, CATEGORIES0, CAT_COLOR, CAT_PALETTE, TIPOS_E, TIPOS_S, ADMIN, TEAM0, SC, DAY, VIEW_TITLES } from "./constants.js";
import { ts, fd, tot, isLow, dlCSV, fmtBRL } from "./utils.js";
import { Overlay, CategoryBadge, StatusDot, SortTh, DirIcon } from "./components/common.jsx";
import { Sidebar, TopBar, MobileTopBar, MobileBottomNav, MoreSheet, navigate as navigateTo } from "./components/layout/Navigation.jsx";
import { Dashboard } from "./components/dashboard/Dashboard.jsx";
import { Documentos } from "./components/documents/Documentos.jsx";
import { Tarefas } from "./components/tasks/Tarefas.jsx";
import { docStatus, isImageFile, makeThumbnail } from "./components/documents/helpers.js";
import { Configuracoes } from "./components/settings/Configuracoes.jsx";

// Mapa carregado sob demanda (otimização de carregamento, 04/2026): é o único
// lugar do app que importa `leaflet` (~150KB minificado antes de gzip) — sem
// isso, todo mundo que só abre o Dashboard ou o Inventário no celular baixava
// o Leaflet inteiro sem nunca usar. Com `lazy()`, o Vite separa o Mapa (e o
// Leaflet) num chunk próprio, baixado só quando o usuário realmente clica em
// "Mapa" — o resto do app (login, Dashboard, Inventário, que é a tela mais
// usada no dia a dia) carrega mais rápido, especialmente em rede móvel.
const NetworkMap = lazy(() => import("./components/map/NetworkMap.jsx").then(m => ({ default: m.NetworkMap })));

const SUPABASE_URL = "https://aayayeytzaflbipqppwt.supabase.co";
const SUPABASE_KEY = "sb_publishable__G4Ir20rpp9rC0qg-b5tpg_bU8ToqI-";
const EDGE_LOGIN_URL = `${SUPABASE_URL}/functions/v1/session-login`;

// ── Sessão real do Supabase Auth ────────────────────────────────────────────
// Desde a migração de segurança de 17/08/2026: o login (handleLogin, mais
// abaixo) não confere mais a senha direto pelo navegador — ele chama a Edge
// Function "session-login", que confere a senha do mesmo jeito de sempre e
// devolve um token de sessão de verdade. Esse token é o que passa a ir no
// cabeçalho Authorization de toda chamada à API (em vez da chave pública
// fixa), pra que as regras de acesso do banco (RLS) consigam saber de
// verdade quem está logado. Guardado fora do React porque sb()/
// sbStorageUpload()/sbStorageDelete() são funções soltas, não componentes.
// Persistido em localStorage só pra sobreviver a um F5 — é um token de
// sessão (como qualquer app com login usa), não é a senha de ninguém.
let authSession = JSON.parse(localStorage.getItem("inv-session") || "null");

const saveSession = (s) => {
  authSession = s;
  if (s) localStorage.setItem("inv-session", JSON.stringify(s));
  else localStorage.removeItem("inv-session");
};

const refreshSession = async () => {
  if (!authSession?.refresh_token) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: authSession.refresh_token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at });
    return true;
  } catch {
    return false;
  }
};

// Antes do login (ou se a sessão nunca foi criada), cai pra chave pública —
// mesmo comportamento de sempre. Depois do login, usa o token da pessoa.
const authHeader = () => `Bearer ${authSession?.access_token || SUPABASE_KEY}`;

// Lê o app_metadata.is_admin gravado no token pela Edge Function
// session-login — permite que o front-end saiba de verdade quem é admin
// (RLS já valida isso de verdade no banco; isso aqui é só pra decidir o que
// MOSTRAR na tela, não é nenhuma checagem de segurança por si só). Um JWT
// tem 3 partes separadas por ponto; a do meio é só base64 (não é segredo,
// não precisa de chave nenhuma pra ler — qualquer um com o token já
// conseguiria ver isso mesmo sem esse helper).
const decodeIsAdmin = (token) => {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return !!(JSON.parse(json)?.app_metadata?.is_admin);
  } catch {
    return false;
  }
};

const sb = async (path, method = "GET", body = null, _retried = false) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": authHeader(),
      "Content-Type": "application/json",
      "Prefer": method === "POST" ? "return=representation" : method === "PATCH" ? "return=representation" : "",
    },
    body: body ? JSON.stringify(body) : null,
  });
  // Token expirado (sessão dura ~1h): tenta renovar com o refresh_token uma
  // vez e repete a chamada, sem precisar deslogar a pessoa no meio do uso.
  if (res.status === 401 && !_retried && authSession) {
    const refreshed = await refreshSession();
    if (refreshed) return sb(path, method, body, true);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

// ── Supabase Storage (aba "Documentos") ────────────────────────────────────
// A API REST comum (`sb`, acima) só fala com /rest/v1 (tabelas). Upload/
// remoção de arquivo em si usa a API de Storage, que é um endpoint separado —
// helpers minúsculos, sem SDK extra, no mesmo espírito do `sb()` existente.
const DOCS_BUCKET = "documentos-cba";

const sbStorageUpload = async (path, file) => {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${DOCS_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": authHeader(),
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!res.ok) throw new Error(await res.text());
};

const sbStorageDelete = async (paths) => {
  if (!paths || !paths.length) return;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${DOCS_BUCKET}`, {
    method: "DELETE",
    headers: { "apikey": SUPABASE_KEY, "Authorization": authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(await res.text());
};

// Bucket público (ver supabase_migration_documents.sql) — o link direto já
// serve o arquivo, sem precisar gerar URL assinada a cada acesso. `download`
// opcional força o navegador a baixar em vez de abrir inline (usa o parâmetro
// nativo do Storage do Supabase para isso).
const docPublicUrl = (path, download) =>
  `${SUPABASE_URL}/storage/v1/object/public/${DOCS_BUCKET}/${path}${download ? `?download=${encodeURIComponent(download)}` : ""}`;

// Gera um nome de arquivo único e seguro para o Storage (evita colisão entre
// dois uploads com o mesmo nome, e caracteres que a API de Storage rejeita).
const uniqueStoragePath = (folderId, fileName) => {
  const uid = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${folderId ?? "raiz"}/${uid}-${safeName}`;
};

// IDs de todas as pastas dentro de `startId` (incluindo ela mesma) — usado
// pra saber o que precisa ser apagado junto ao excluir uma pasta com
// conteúdo (subpastas em cascata).
const collectDescendantFolderIds = (startId, allFolders) => {
  const ids = [startId];
  let frontier = [startId];
  while (frontier.length) {
    const next = allFolders.filter(f => frontier.includes(f.parent_id)).map(f => f.id);
    ids.push(...next);
    frontier = next;
  }
  return ids;
};

export default function App() {
  const [items, setItems] = useState([]);
  const [movs, setMovs] = useState([]);
  const [team, setTeam] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [newSectorName, setNewSectorName] = useState("");
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [docFolders, setDocFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [colaboradorDocs, setColaboradorDocs] = useState([]);
  const [docsJump, setDocsJump] = useState(null); // sinal pra abrir "Documentos" já na sub-aba "Treinamentos" (ex.: clique num alerta de treinamento vencendo)
  const [tasks, setTasks] = useState([]); // aba "Tarefas" (quadro Kanban simplificado)
  const [equipamentos, setEquipamentos] = useState([]);
  const [activeLogins, setActiveLogins] = useState(new Set());
  const [hasPassword, setHasPassword] = useState(null); // null = não verificado, true/false = já verificado via RPC
  const [checkingUser, setCheckingUser] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [view, setView] = useState("dashboard");
  const [invTab, setInvTab] = useState("inventario"); // aba ativa dentro da mega-view "inventario": "inventario" | "movimentacoes"
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({});
  const [editForm, setEditForm] = useState({});
  const [itemDraft, setItemDraft] = useState({});
  const [addItem, setAddItem] = useState({ name: "", qty: 0, sector: "Escritório", condicao: "operacional", min_stock: 1, rfid_tag: "", categoria: CATEGORIES0[0], valor_estimado: "" });
  const [batchForm, setBatchForm] = useState({ dir: "saida", tipo: "", obs: "" });
  const [batchQtys, setBatchQtys] = useState({});
  const [batchSearch, setBatchSearch] = useState("");
  const [theme, setTheme] = useState("dark");
  const [accentKey, setAccentKey] = useState("blue");
  const [newMember, setNewMember] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  // Fonte real de "é admin?" — vem do token de sessão (que a Edge Function
  // session-login preenche a partir de team.is_admin no banco), não mais de
  // comparar o nome com uma constante fixa no código. Isso passa a valer
  // mesmo se outra pessoa além de Francisco Rufino virar admin no futuro.
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: "", password: "", confirm: "" });
  const [loginErr, setLoginErr] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const [invCategoria, setInvCategoria] = useState("Todas");
  const [invSector, setInvSector] = useState("Todos");
  const [invLocal, setInvLocal] = useState("");
  const [invStatus, setInvStatus] = useState("todos");
  const [invSort, setInvSort] = useState({ col: "nome", dir: "asc" });
  // Paginação do Inventário (Fase 3 do checklist) — só corta a RENDERIZAÇÃO
  // da tabela/cards, não o fetch: com ~76 itens hoje, o gargalo real é
  // rolar uma lista grande, não a chamada ao Supabase (`loadAll()` já traz
  // tudo de uma vez, e isso está OK nessa escala — decisão consciente,
  // mesmo espírito de "sem virtualização de listas" já registrado antes).
  const [invPage, setInvPage] = useState(1);
  const INV_PAGE_SIZE = 25;
  const [movDir, setMovDir] = useState("todos");
  const [movTipo, setMovTipo] = useState("todos");
  const [movResp, setMovResp] = useState("todos");
  const [movSearch, setMovSearch] = useState("");
  const [movFrom, setMovFrom] = useState("");
  const [movTo, setMovTo] = useState("");
  const [movSort, setMovSort] = useState("recente");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reportFilter, setReportFilter] = useState({ categorias: [], setores: [] });
  const [exportingKey, setExportingKey] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkModal, setBulkModal] = useState(null);
  const [bulkForm, setBulkForm] = useState({});

  // ── load from Supabase ────────────────────────────────────────────────────
  // Segurança: só busca os dados da empresa (itens, equipe, movimentações...)
  // se já existir uma sessão de fato autenticada salva. Antes dessa mudança,
  // loadAll() rodava sempre, mesmo antes do login — a tela de login escondia
  // isso visualmente, mas as respostas (incluindo a lista de nomes da
  // equipe) já tinham sido baixadas e ficavam visíveis na aba Rede do
  // navegador pra qualquer um, sem precisar de senha nenhuma.
  useEffect(() => {
    const savedTheme = localStorage.getItem("inv-theme");
    if (savedTheme) setTheme(savedTheme);
    const savedAccent = localStorage.getItem("inv-accent");
    if (savedAccent) setAccentKey(savedAccent);
    const savedUser = localStorage.getItem("inv-user");
    if (savedUser && authSession?.access_token) {
      setCurrentUser(savedUser);
      setIsAdminUser(decodeIsAdmin(authSession.access_token));
      loadAll();
    } else {
      localStorage.removeItem("inv-user");
      setLoaded(true);
    }
  }, []);

  const loadAll = async () => {
    try {
      const [dbItems, dbMovs, dbTeam, dbSectors, dbEquip, dbCategories, dbDocFolders, dbDocuments, dbColabDocs, dbTasks] = await Promise.all([
        sb("items?order=id.asc"),
        sb("movimentacoes?order=id.desc"),
        sb("team?order=name.asc"),
        sb("sectors?order=is_base.desc,name.asc").catch(() => null), // tabela pode não existir ainda (migração não rodada)
        sb("equipamentos_rede?order=area.asc,name.asc").catch(() => null), // idem
        sb("categories?order=name.asc").catch(() => null), // idem
        sb("doc_folders?order=name.asc").catch(() => null), // idem (aba Documentos)
        sb("documents?order=created_at.desc").catch(() => null), // idem
        sb("colaborador_docs?order=colaborador.asc,data_vencimento.asc").catch(() => null), // idem (Documentos > Treinamentos)
        sb("tarefas?order=id.desc").catch(() => null), // idem (aba Tarefas)
      ]);
      // Nota: categoria NÃO é normalizada para "Diversos" aqui — o valor bruto
      // (incluindo null/vazio) é preservado para permitir o filtro "Sem categoria".
      // A exibição usa `item.categoria || "Diversos"` em todos os pontos da UI.
      const normLoc = (its) => (its || []).map(it => ({
        ...it,
        locations: (it.locations || []).map((l, i) => ({ ...l, lid: l.lid ?? i + 1 })),
      }));
      setItems(normLoc(dbItems));
      setMovs(dbMovs || []);
      if (dbTeam && dbTeam.length > 0) setTeam(dbTeam.map(r => r.name));
      else setTeam(TEAM0);
      if (dbSectors && dbSectors.length > 0) setSectors(dbSectors);
      // Fallback (tabela ainda não existe/vazia): os 3 locais originais são
      // todos partes do almoxarifado (base), por isso entram como is_base=true.
      else setSectors(SECTORS0.map(name => ({ name, is_base: true })));
      setEquipamentos(dbEquip && dbEquip.length > 0 ? dbEquip : EQUIPAMENTOS0);
      if (dbCategories && dbCategories.length > 0) setCategories(dbCategories);
      // Fallback (tabela ainda não existe/vazia): as 6 categorias originais.
      else setCategories(CATEGORIES0.map(name => ({ name })));
      // Documentos não têm fallback local (não há "documentos padrão") — se a
      // migração ainda não rodou, a aba simplesmente começa vazia.
      setDocFolders(dbDocFolders || []);
      setDocuments(dbDocuments || []);
      setColaboradorDocs(dbColabDocs || []);
      setTasks(dbTasks || []);
      setLoaded(true);
    } catch (e) {
      setDbError(e.message);
      setLoaded(true);
    }
  };

  useEffect(() => { localStorage.setItem("inv-theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("inv-accent", accentKey); }, [accentKey]);
  useEffect(() => { if (currentUser) localStorage.setItem("inv-user", currentUser); else localStorage.removeItem("inv-user"); }, [currentUser]);

  // ── atalhos de teclado globais ───────────────────────────────────────────
  // Ctrl/Cmd+K → foco na pesquisa · Ctrl/Cmd+N → novo item ·
  // Ctrl/Cmd+M → nova movimentação (em lote, não exige item pré-selecionado) ·
  // Esc → fecha modal/sheet aberto. Só ativos com usuário logado.
  useEffect(() => {
    if (!currentUser) return;
    const onKeyDown = e => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        document.getElementById("global-search-input")?.focus();
        return;
      }
      if (mod && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setModal({ type: "add" });
        return;
      }
      if (mod && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        setBatchQtys({});
        setBatchSearch("");
        setModal({ type: "batch" });
        return;
      }
      if (e.key === "Escape") {
        if (mobileMenuOpen) { setMobileMenuOpen(false); return; }
        if (bulkModal) { setBulkModal(null); setBulkForm({}); return; }
        if (modal) { setModal(null); setForm({}); setBatchQtys({}); setBatchSearch(""); setEditForm({}); setItemDraft({}); return; }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentUser, modal, bulkModal, mobileMenuOpen]);

  // showToast precisa ser declarado ANTES de qualquer hook que o referencie
  // no array de dependências (como o useEffect de logout por inatividade
  // logo abaixo) — const não é hoisted como function declaration, então
  // usá-lo antes desta linha quebra com "Cannot access 'showToast' before
  // initialization" em TODO render (bug real de ordem no código, não do
  // bundler/minificador — encontrado e corrigido em 31/08/2026).
  const showToast = useCallback((msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2800); }, []);

  // ── logout automático por inatividade ───────────────────────────────────
  // Mitiga o risco de manter o token de sessão em localStorage (cookie
  // HttpOnly não é viável aqui — o site é hospedagem estática no GitHub
  // Pages, sem servidor próprio pra emitir cookie): depois de um tempo sem
  // nenhuma interação, a sessão é encerrada sozinha, então um token
  // eventualmente vazado ou um dispositivo esquecido logado tem uma janela
  // de validade limitada, não permanece útil indefinidamente.
  useEffect(() => {
    if (!currentUser) return;
    const IDLE_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 horas sem interação
    let idleTimer;
    const onIdleTimeout = () => {
      saveSession(null);
      setCurrentUser(null);
      setIsAdminUser(false);
      setView("dashboard");
      showToast("Sessão encerrada por inatividade — faça login de novo", "warn");
    };
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(onIdleTimeout, IDLE_LIMIT_MS);
    };
    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach(ev => window.addEventListener(ev, resetIdleTimer, { passive: true }));
    resetIdleTimer();
    return () => {
      clearTimeout(idleTimer);
      activityEvents.forEach(ev => window.removeEventListener(ev, resetIdleTimer));
    };
  }, [currentUser, showToast]);

  // ── tema ──────────────────────────────────────────────────────────────────
  // T (tokens de cor) e os helpers de estilo (inp/btn/ghost/...) agora vêm de
  // src/theme.js — mesmos valores de antes, só centralizados para reuso pelos
  // componentes de layout/dashboard.
  // useMemo aqui não é só micro-otimização: getTheme() cria um objeto novo a
  // cada chamada, e sem memoizar por `theme`, T mudaria de referência em todo
  // render — quebrando qualquer React.memo() downstream que dependa de T
  // permanecer igual quando o tema não muda (ex.: Dashboard).
  const T = useMemo(() => getTheme(theme, accentKey), [theme, accentKey]);
  const { inp, btn, ghost, sbtn, rowBtn, rowBtnHover, mT } = makeStyleHelpers(T);
  const lbl = (children) => <div style={{ fontSize: 10, fontWeight: 700, color: T.textFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: .6 }}>{children}</div>;

  const askConfirm = (message, onConfirm) => setConfirm({ message, onConfirm });

  // Handlers estáveis (useCallback) passados ao Dashboard: como ele só
  // depende de setState "identity-stable" do React, não têm dependências
  // reais — existem para que a referência não mude a cada render do App e
  // o React.memo() do Dashboard consiga, de fato, evitar recomputar seus
  // dados derivados quando nada relevante mudou.
  const openAddItemModal = useCallback(() => setModal({ type: "add" }), []);
  const openBatchModal = useCallback(() => { setBatchQtys({}); setBatchSearch(""); setModal({ type: "batch" }); }, []);
  const openReportsModal = useCallback(() => setModal({ type: "reports" }), []);
  const resolveAttentionItem = useCallback((i, kind) => {
    if (kind === "baixo") { setModal({ type: "mov", item: i, dir: "entrada" }); setForm({ dir: "entrada" }); }
    else { setModal({ type: "detail", item: i }); }
  }, []);

  // ── auth ──────────────────────────────────────────────────────────────────
  // Segurança: a tabela users_app não é mais legível pelo cliente (RLS bloqueia
  // SELECT direto). Toda verificação/criação de senha passa pelas funções RPC
  // user_has_password / verify_login / register_login, que fazem hash+salt no
  // Postgres (SECURITY DEFINER) — a senha em claro nunca fica salva ou é
  // comparada no navegador. Ver migration.sql.
  const checkUserOnSelect = async (name) => {
    setHasPassword(null);
    if (!name) return;
    setCheckingUser(true);
    try {
      const res = await sb("rpc/user_has_password", "POST", { p_name: name });
      setHasPassword(!!res);
    } catch {
      setLoginErr("Não foi possível verificar o usuário. Tente novamente.");
    } finally {
      setCheckingUser(false);
    }
  };

  // Desde 17/08/2026: a confirmação da senha em si acontece dentro da Edge
  // Function "session-login" (reaproveita register_login/verify_login lá
  // dentro, sem mudar essa lógica) — o navegador não chama mais essas RPCs
  // direto. O que volta pra cá, além do ok/erro, é o token de sessão real.
  const handleLogin = async () => {
    const name = loginForm.name.trim();
    const { password, confirm: c } = loginForm;
    if (!name) return setLoginErr("Digite seu nome");
    if (!password) return setLoginErr("Digite a senha");
    if (hasPassword === null) return setLoginErr("Aguarde a verificação do usuário...");
    if (hasPassword === false) {
      if (password.length < 10) return setLoginErr("Mínimo de 10 caracteres");
      if (password !== c) return setLoginErr("As senhas não coincidem");
    }
    try {
      const res = await fetch(EDGE_LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password, confirm: c, mode: hasPassword === false ? "register" : "login" }),
      });
      const data = await res.json();
      if (!data.ok) return setLoginErr(data.error || "Erro ao autenticar. Tente novamente.");
      saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at });
      setIsAdminUser(!!data.user?.is_admin);
    } catch {
      return setLoginErr("Erro ao autenticar. Tente novamente.");
    }
    setCurrentUser(name);
    setLoginForm({ name: "", password: "", confirm: "" });
    setHasPassword(null);
    setLoginErr("");
    setView("dashboard"); // sempre entra pela Visão Geral, nunca herda a tela do usuário anterior
    // Só agora — com a sessão já autenticada — busca os dados da empresa.
    // setLoaded(false) faz o skeleton de carregamento aparecer por um
    // instante em vez de mostrar a tela principal já "vazia" por um piscar.
    setLoaded(false);
    loadAll();
  };
  const handleLogout = () => askConfirm("Deseja sair?", () => {
    saveSession(null);
    setCurrentUser(null);
    setIsAdminUser(false);
    setView("dashboard"); // evita herdar a tela (ex.: Configurações) pro próximo login na mesma aba
  });

  // Troca de senha (aba "Configurações"). Não existe uma RPC dedicada de
  // "trocar senha" no Supabase (só as 5 documentadas no topo do arquivo) —
  // em vez de criar uma função nova sem saber como o hash foi implementado
  // do lado do banco (risco real de travar login de todo mundo se o esquema
  // de hash não bater), reaproveitamos as RPCs que já existem e já
  // funcionam: confirma a senha atual (verify_login), libera o usuário pra
  // cadastrar uma nova (delete_login) e cadastra a nova senha (register_login,
  // a mesma função usada no primeiro acesso). Resultado idêntico a uma troca
  // de senha de verdade, sem depender de nenhuma função nova no banco.
  const changePassword = async (oldPassword, newPassword) => {
    try {
      const ok = await sb("rpc/verify_login", "POST", { p_name: currentUser, p_password: oldPassword });
      if (!ok) { showToast("Senha atual incorreta", "err"); return false; }
      await sb("rpc/delete_login", "POST", { p_name: currentUser });
      const created = await sb("rpc/register_login", "POST", { p_name: currentUser, p_password: newPassword });
      if (!created) { showToast("Não foi possível concluir — tente novamente ou faça login de novo com uma senha nova.", "err"); return false; }
      showToast("Senha alterada com sucesso");
      return true;
    } catch (e) {
      showToast(`Erro ao trocar senha: ${e.message}`, "err");
      return false;
    }
  };

  const loadActiveLogins = async () => {
    try {
      const res = await sb("rpc/list_active_logins", "POST", {});
      setActiveLogins(new Set((res || []).map(r => r.name)));
    } catch { /* não bloqueia a tela de equipe se falhar */ }
  };

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
    await sb("rpc/delete_login", "POST", { p_name: name });
    setTeam(p => p.filter(n => n !== name));
    showToast(`"${name}" removido`, "warn");
  });

  // ── locais (setores) ─────────────────────────────────────────────────────
  // Nomes simples para popular os <select>/filtros por todo o app (o valor
  // gravado em item.locations[].sector sempre foi uma string, isso não muda).
  // Memoizado por `sectors` (não recriar array a cada render) para poder ser
  // usado com segurança como dependência de efeito abaixo.
  const sectorNames = useMemo(() => sectors.map(s => s.name), [sectors]);
  // Se o setor padrão do formulário de "Novo Item" (definido uma vez no
  // useState inicial) deixar de existir — porque um admin renomeou ou
  // removeu aquele local em "Locais" — realinha para o primeiro disponível,
  // em vez de deixar o formulário com um valor que não existe mais no select.
  useEffect(() => {
    if (sectorNames.length && !sectorNames.includes(addItem.sector)) {
      setAddItem(p => ({ ...p, sector: sectorNames[0] }));
    }
  }, [sectorNames]);
  // "Base" (âmbar) = local dentro do almoxarifado; os demais recebem cores
  // cíclicas da paleta, só para diferenciar visualmente as áreas externas
  // entre si nos gráficos/chips — não há um significado especial na cor em si.
  const sectorColor = name => {
    const base = sectors.find(s => s.name === name);
    if (base?.is_base) return "#f59e0b";
    const idx = Math.max(0, sectorNames.indexOf(name));
    return SECTOR_PALETTE[idx % SECTOR_PALETTE.length];
  };

  const addSector = async () => {
    const name = newSectorName.trim();
    if (!name) return showToast("Digite o nome do local", "err");
    if (sectorNames.includes(name)) return showToast("Esse local já existe", "err");
    const [row] = await sb("sectors", "POST", { name, is_base: false }) || [];
    setSectors(p => [...p, row || { name, is_base: false }]);
    setNewSectorName("");
    showToast(`"${name}" adicionado`);
  };
  const removeSector = name => {
    if (sectorNames.length <= 1) return showToast("Precisa existir ao menos um local cadastrado", "err");
    const emUso = items.filter(i => (i.locations || []).some(l => l.sector === name)).length;
    const msg = emUso > 0
      ? `${emUso} ${emUso === 1 ? "item usa" : "itens usam"} "${name}" como local. Remover mesmo assim? Os itens continuarão mostrando esse local até serem movidos.`
      : `Remover "${name}" da lista de locais?`;
    askConfirm(msg, async () => {
      await sb(`sectors?name=eq.${encodeURIComponent(name)}`, "DELETE");
      setSectors(p => p.filter(s => s.name !== name));
      showToast(`"${name}" removido`, "warn");
    });
  };
  // Marca/desmarca um local como "Base" (dentro do almoxarifado). Não é
  // exclusivo — vários locais podem estar dentro do almoxarifado ao mesmo
  // tempo (ex.: Escritório, Armário e Central de Reparos já são todos base).
  const toggleSectorBase = async name => {
    const current = sectors.find(s => s.name === name);
    const next = !current?.is_base;
    await sb(`sectors?name=eq.${encodeURIComponent(name)}`, "PATCH", { is_base: next });
    setSectors(p => p.map(s => s.name === name ? { ...s, is_base: next } : s));
  };

  // ── categorias ────────────────────────────────────────────────────────────
  // Mesmo padrão de "Locais": lista dinâmica salva no Supabase (tabela
  // `categories`) em vez de constante fixa, gerenciável pela equipe em
  // "Categorias". Memoizado por `categories` pelo mesmo motivo de sectorNames.
  const categoryNames = useMemo(() => categories.map(c => c.name), [categories]);
  // Mesma realinhamento de sectorNames acima, agora para o select de categoria
  // do formulário "Novo Item".
  useEffect(() => {
    if (categoryNames.length && !categoryNames.includes(addItem.categoria)) {
      setAddItem(p => ({ ...p, categoria: categoryNames[0] }));
    }
  }, [categoryNames]);
  // Categorias originais mantêm a cor conhecida da equipe (CAT_COLOR);
  // categorias novas recebem cor cíclica de CAT_PALETTE — mesmo esquema que
  // sectorColor usa para locais externos.
  const catColor = name => {
    if (CAT_COLOR[name]) return CAT_COLOR[name];
    const idx = Math.max(0, categoryNames.indexOf(name));
    return CAT_PALETTE[idx % CAT_PALETTE.length];
  };
  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return showToast("Digite o nome da categoria", "err");
    if (categoryNames.includes(name)) return showToast("Essa categoria já existe", "err");
    const [row] = await sb("categories", "POST", { name }) || [];
    setCategories(p => [...p, row || { name }]);
    setNewCategoryName("");
    showToast(`"${name}" adicionada`);
  };
  const removeCategory = name => {
    if (categoryNames.length <= 1) return showToast("Precisa existir ao menos uma categoria cadastrada", "err");
    const emUso = items.filter(i => (i.categoria || "Diversos") === name).length;
    const msg = emUso > 0
      ? `${emUso} ${emUso === 1 ? "item usa" : "itens usam"} a categoria "${name}". Remover mesmo assim? Os itens continuarão mostrando essa categoria até serem editados.`
      : `Remover a categoria "${name}"?`;
    askConfirm(msg, async () => {
      await sb(`categories?name=eq.${encodeURIComponent(name)}`, "DELETE");
      setCategories(p => p.filter(c => c.name !== name));
      showToast(`"${name}" removida`, "warn");
    });
  };

  // ── documentos (aba "Documentos") ───────────────────────────────────────
  // Pastas com subpastas + arquivos no Supabase Storage. Qualquer usuário
  // logado pode criar pasta, enviar e renomear; excluir fica restrito a quem
  // enviou/criou ou ao admin (checagem de interface — mesmo modelo de
  // segurança do resto do app hoje, não é uma regra real do banco).
  const createDocFolder = async (name, parentId, isPrivate) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return showToast("Digite o nome da pasta", "err");
    try {
      const [row] = await sb("doc_folders", "POST", { name: trimmed, parent_id: parentId ?? null, created_by: currentUser, is_private: !!isPrivate }) || [];
      setDocFolders(p => [...p, row || { id: `tmp-${Date.now()}`, name: trimmed, parent_id: parentId ?? null, created_by: currentUser, is_private: !!isPrivate, created_at: new Date().toISOString() }]);
      showToast(`Pasta "${trimmed}" criada${isPrivate ? " (privada)" : ""}`);
    } catch (e) {
      showToast(`Erro ao criar pasta (rode a migração do Supabase se ainda não rodou): ${e.message}`, "err");
    }
  };
  const renameDocFolder = async (id, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    try {
      await sb(`doc_folders?id=eq.${id}`, "PATCH", { name: trimmed });
      setDocFolders(p => p.map(f => f.id === id ? { ...f, name: trimmed } : f));
    } catch (e) {
      showToast(`Erro ao renomear pasta: ${e.message}`, "err");
    }
  };
  // Alterna pública/privada — só quem criou a pasta (ou o admin) tem o botão
  // visível na interface. Ver nota de segurança em Documentos.jsx: isso
  // esconde a pasta da INTERFACE pras outras pessoas, mas não é uma barreira
  // real no banco (RLS ainda está aberto hoje, igual ao resto do app).
  const toggleFolderPrivacy = async (folder) => {
    const next = !folder.is_private;
    try {
      await sb(`doc_folders?id=eq.${folder.id}`, "PATCH", { is_private: next });
      setDocFolders(p => p.map(f => f.id === folder.id ? { ...f, is_private: next } : f));
      showToast(next ? `"${folder.name}" agora é privada` : `"${folder.name}" agora é pública`);
    } catch (e) {
      showToast(`Erro ao alterar privacidade: ${e.message}`, "err");
    }
  };
  const deleteDocFolder = (folder) => {
    const descIds = collectDescendantFolderIds(folder.id, docFolders);
    const affectedDocs = documents.filter(d => descIds.includes(d.folder_id));
    const subCount = descIds.length - 1;
    const parts = [];
    if (subCount > 0) parts.push(`${subCount} subpasta${subCount === 1 ? "" : "s"}`);
    if (affectedDocs.length > 0) parts.push(`${affectedDocs.length} arquivo${affectedDocs.length === 1 ? "" : "s"}`);
    const msg = parts.length
      ? `Essa pasta tem ${parts.join(" e ")} dentro. Excluir tudo junto? Essa ação não pode ser desfeita.`
      : `Excluir a pasta "${folder.name}"?`;
    askConfirm(msg, async () => {
      try {
        if (affectedDocs.length > 0) await sbStorageDelete(affectedDocs.flatMap(d => d.thumbnail_path ? [d.storage_path, d.thumbnail_path] : [d.storage_path]));
        await sb(`doc_folders?id=eq.${folder.id}`, "DELETE"); // FK on delete cascade remove subpastas + registros de documentos no banco
        setDocFolders(p => p.filter(f => !descIds.includes(f.id)));
        setDocuments(p => p.filter(d => !descIds.includes(d.folder_id)));
        showToast(`"${folder.name}" excluída`, "warn");
      } catch (e) {
        showToast(`Erro ao excluir pasta: ${e.message}`, "err");
      }
    });
  };
  const uploadDocuments = async (fileList, folderId) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    let ok = 0, fail = 0;
    for (const file of files) {
      try {
        const path = uniqueStoragePath(folderId, file.name);
        await sbStorageUpload(path, file);

        // Foto (jpg/png/etc.) ganha uma miniatura leve pra grade da aba
        // Documentos não precisar baixar a imagem inteira só pra mostrar um
        // quadradinho de preview (ver comentário de `makeThumbnail`). Se a
        // geração falhar por qualquer motivo (formato exótico, navegador
        // antigo), o upload do arquivo original já feito acima continua
        // valendo — só não ganha miniatura, cai pra mostrar a foto cheia.
        let thumbnailPath = null;
        if (isImageFile(file.type, file.name)) {
          try {
            const thumbBlob = await makeThumbnail(file);
            if (thumbBlob) {
              thumbnailPath = `${path}.thumb.jpg`;
              await sbStorageUpload(thumbnailPath, thumbBlob);
            }
          } catch { /* miniatura é só um extra de performance — nunca deve derrubar o upload */ }
        }

        const payload = {
          name: file.name, folder_id: folderId ?? null, storage_path: path,
          file_size: file.size, mime_type: file.type || null, uploaded_by: currentUser,
        };
        let row;
        try {
          [row] = await sb("documents", "POST", thumbnailPath ? { ...payload, thumbnail_path: thumbnailPath } : payload) || [];
        } catch (e) {
          // Coluna thumbnail_path pode ainda não existir (migração
          // supabase_migration_documents_thumbnails.sql não rodada) — refaz
          // sem ela em vez de derrubar o upload inteiro.
          if (!thumbnailPath) throw e;
          [row] = await sb("documents", "POST", payload) || [];
        }
        setDocuments(p => [...p, row || { id: `tmp-${path}`, name: file.name, folder_id: folderId ?? null, storage_path: path, file_size: file.size, mime_type: file.type, uploaded_by: currentUser, thumbnail_path: thumbnailPath, created_at: new Date().toISOString() }]);
        ok++;
      } catch {
        fail++;
      }
    }
    if (ok) showToast(`${ok} ${ok === 1 ? "arquivo enviado" : "arquivos enviados"}`);
    if (fail) showToast(`${fail} ${fail === 1 ? "arquivo falhou" : "arquivos falharam"} ao enviar (rode a migração do Supabase se ainda não rodou)`, "err");
  };
  const renameDocument = async (id, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    try {
      await sb(`documents?id=eq.${id}`, "PATCH", { name: trimmed });
      setDocuments(p => p.map(d => d.id === id ? { ...d, name: trimmed } : d));
    } catch (e) {
      showToast(`Erro ao renomear: ${e.message}`, "err");
    }
  };
  const deleteDocument = (doc) => askConfirm(`Excluir "${doc.name}"? Essa ação não pode ser desfeita.`, async () => {
    try {
      await sbStorageDelete(doc.thumbnail_path ? [doc.storage_path, doc.thumbnail_path] : [doc.storage_path]);
      await sb(`documents?id=eq.${doc.id}`, "DELETE");
      setDocuments(p => p.filter(d => d.id !== doc.id));
      showToast(`"${doc.name}" excluído`, "warn");
    } catch (e) {
      showToast(`Erro ao excluir: ${e.message}`, "err");
    }
  });
  // Mover um documento pra outra pasta (arrastar-e-soltar na aba Documentos).
  // Só troca `folder_id` — o arquivo em si não se move dentro do Storage,
  // só a organização lógica muda, então é uma operação leve e instantânea.
  const moveDocument = async (docId, targetFolderId) => {
    try {
      await sb(`documents?id=eq.${docId}`, "PATCH", { folder_id: targetFolderId ?? null });
      setDocuments(p => p.map(d => d.id === docId ? { ...d, folder_id: targetFolderId ?? null } : d));
    } catch (e) {
      showToast(`Erro ao mover documento: ${e.message}`, "err");
    }
  };
  // Versão em lote de moveDocument — usada pela seleção múltipla da grade
  // (checkbox em cada card + barra "N selecionados"). Só documentos podem ser
  // movidos em massa: não existe (ainda) um endpoint pra mover pasta pra
  // dentro de outra, então pastas selecionadas são ignoradas pelo chamador.
  const bulkMoveDocuments = async (docIds, targetFolderId) => {
    if (!docIds || !docIds.length) return;
    try {
      await sb(`documents?id=in.(${docIds.join(",")})`, "PATCH", { folder_id: targetFolderId ?? null });
      setDocuments(p => p.map(d => docIds.includes(d.id) ? { ...d, folder_id: targetFolderId ?? null } : d));
      showToast(`${docIds.length} ${docIds.length === 1 ? "arquivo movido" : "arquivos movidos"}`);
    } catch (e) {
      showToast(`Erro ao mover arquivos: ${e.message}`, "err");
    }
  };
  // Exclusão em lote — mesmo princípio de deleteDocFolder (expande cada pasta
  // selecionada pras suas subpastas + documentos, via collectDescendantFolderIds)
  // mas com uma única confirmação cobrindo tudo, em vez de uma por item.
  const bulkDeleteDocItems = (folderIds, docIds) => {
    if ((!folderIds || !folderIds.length) && (!docIds || !docIds.length)) return;
    let allFolderIds = [];
    (folderIds || []).forEach(fid => { allFolderIds.push(...collectDescendantFolderIds(fid, docFolders)); });
    allFolderIds = [...new Set(allFolderIds)];
    const cascadedDocs = documents.filter(d => allFolderIds.includes(d.folder_id));
    const directDocs = documents.filter(d => (docIds || []).includes(d.id));
    const affectedDocsMap = new Map();
    [...cascadedDocs, ...directDocs].forEach(d => affectedDocsMap.set(d.id, d));
    const affectedDocs = [...affectedDocsMap.values()];
    const totalFolders = allFolderIds.length;
    const totalDocs = affectedDocs.length;
    const parts = [];
    if (totalFolders > 0) parts.push(`${totalFolders} pasta${totalFolders === 1 ? "" : "s"}`);
    if (totalDocs > 0) parts.push(`${totalDocs} arquivo${totalDocs === 1 ? "" : "s"}`);
    const label = parts.join(" e ") || "os itens selecionados";
    askConfirm(`Excluir ${label}? Essa ação não pode ser desfeita.`, async () => {
      try {
        if (affectedDocs.length > 0) await sbStorageDelete(affectedDocs.flatMap(d => d.thumbnail_path ? [d.storage_path, d.thumbnail_path] : [d.storage_path]));
        if (allFolderIds.length > 0) await sb(`doc_folders?id=in.(${allFolderIds.join(",")})`, "DELETE"); // cascade no banco já remove os documentos das pastas apagadas
        const directOnlyIds = directDocs.filter(d => !allFolderIds.includes(d.folder_id)).map(d => d.id); // evita tentar apagar de novo o que o cascade acima já removeu
        if (directOnlyIds.length > 0) await sb(`documents?id=in.(${directOnlyIds.join(",")})`, "DELETE");
        setDocFolders(p => p.filter(f => !allFolderIds.includes(f.id)));
        setDocuments(p => p.filter(d => !affectedDocsMap.has(d.id)));
        showToast(`${label} excluído(s)`, "warn");
      } catch (e) {
        showToast(`Erro ao excluir: ${e.message}`, "err");
      }
    });
  };

  // ── Treinamentos (sub-aba de "Documentos") ──────────────────────────────
  // Controle de validade de documentos por colaborador (ASO, EPI, treinamentos
  // de segurança etc.) — substitui a planilha externa que a equipe usava.
  // Cada registro só aparece pro colaborador dono dele e pro admin (mesmo
  // princípio de "dado próprio" já usado no resto do app); criar/editar/
  // excluir fica restrito ao admin, dado o caráter de compliance/RH dessa
  // informação (checagem de interface, mesmo modelo de segurança do resto
  // do app — não é uma regra real do banco, RLS continua aberto).
  const createColaboradorDoc = async (data) => {
    try {
      const [row] = await sb("colaborador_docs", "POST", { ...data, created_by: currentUser }) || [];
      setColaboradorDocs(p => [...p, row || { id: `tmp-${Date.now()}`, ...data, created_by: currentUser, created_at: new Date().toISOString() }]);
      showToast(`"${data.documento}" adicionado`);
    } catch (e) {
      showToast(`Erro ao salvar (rode a migração do Supabase se ainda não rodou): ${e.message}`, "err");
    }
  };
  const updateColaboradorDoc = async (id, data) => {
    try {
      await sb(`colaborador_docs?id=eq.${id}`, "PATCH", data);
      setColaboradorDocs(p => p.map(d => d.id === id ? { ...d, ...data } : d));
      showToast("Documento atualizado");
    } catch (e) {
      showToast(`Erro ao atualizar: ${e.message}`, "err");
    }
  };
  const deleteColaboradorDoc = (doc) => askConfirm(`Excluir "${doc.documento}" de ${doc.colaborador}?`, async () => {
    try {
      await sb(`colaborador_docs?id=eq.${doc.id}`, "DELETE");
      setColaboradorDocs(p => p.filter(d => d.id !== doc.id));
      showToast(`"${doc.documento}" excluído`, "warn");
    } catch (e) {
      showToast(`Erro ao excluir: ${e.message}`, "err");
    }
  });

  // ── equipamentos de rede (Mapa > Equipamentos) ──────────────────────────
  // Importados uma vez do Google My Maps do usuário (KML). Diferente de
  // `items`, não têm quantidade/estoque — são instalações fixas (posição
  // GPS real), então o CRUD aqui é só nome/tipo/área/posição.
  const addEquipamento = async ({ name, tipo, area, lat, lng }) => {
    try {
      const [row] = await sb("equipamentos_rede", "POST", { name, tipo, area, lat, lng }) || [];
      setEquipamentos(p => [...p, row || { name, tipo, area, lat, lng }]);
      showToast(`"${name}" adicionado ao mapa`);
    } catch {
      // Tabela ainda não existe (migração não rodada) — adiciona só localmente
      // pra não travar a experiência, mas avisa que não persiste.
      setEquipamentos(p => [...p, { name, tipo, area, lat, lng }]);
      showToast(`"${name}" adicionado (rode a migração do Supabase para salvar de verdade)`, "warn");
    }
  };
  const removeEquipamento = (id, name) => askConfirm(`Remover "${name}" do mapa?`, async () => {
    await sb(`equipamentos_rede?id=eq.${id}`, "DELETE");
    setEquipamentos(p => p.filter(e => e.id !== id));
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
  const defItems = items.filter(i => ["defeito", "defeito parcial"].includes(i.condicao));
  const verItems = items.filter(i => i.condicao === "verificar");

  // Alerta de treinamentos (ASO/EPI/treinamentos "Documentos > Treinamentos")
  // vencendo em até 30 dias, ou já vencidos. Mesma visibilidade da sub-aba:
  // cada colaborador só vê os próprios, o admin vê todo mundo. Status nunca
  // é armazenado — recalculado aqui a partir de "data_vencimento" (docStatus),
  // igual ao resto da aba Treinamentos.
  const trainingAlerts = useMemo(() => {
    const visible = isAdminUser ? colaboradorDocs : colaboradorDocs.filter(d => d.colaborador === currentUser);
    return visible.filter(d => {
      if (!d.data_vencimento) return false;
      const { dias } = docStatus(d.data_vencimento);
      return dias != null && dias <= 30;
    });
  }, [colaboradorDocs, currentUser]);

  const openTreinamentos = () => { setDocsJump({ section: "treinamentos", token: Date.now() }); setView("documentos"); };
  const localMap = {};
  items.forEach(it => (it.locations || []).forEach(l => {
    if (!l.local || !l.qty) return;
    if (!localMap[l.local]) localMap[l.local] = { local: l.local, sector: l.sector, qty: 0 };
    localMap[l.local].qty += l.qty;
  }));
  const localList = Object.values(localMap).sort((a, b) => b.qty - a.qty);
  const catCounts = categoryNames.reduce((acc, c) => {
    const its = items.filter(i => (i.categoria || "Diversos") === c);
    acc[c] = { items: its.length, qty: its.reduce((s, i) => s + tot(i), 0) };
    return acc;
  }, {});

  // ── filtros rápidos do Inventário ────────────────────────────────────────
  const QUICK_FILTERS = [
    { key: "todos", label: "Todos" },
    { key: "baixo", label: "Estoque baixo", color: "#eab308" },
    { key: "defeituosos", label: "Defeituosos", color: "#ef4444" },
    { key: "uso-parcial", label: "Em uso", color: "#3b82f6" },
    { key: "sem-local", label: "Sem localização", color: "#f97316" },
    { key: "sem-categoria", label: "Sem categoria", color: "#8b5cf6" },
  ];
  const qfCounts = {
    todos: items.length,
    baixo: items.filter(isLow).length,
    defeituosos: items.filter(i => ["defeito", "defeito parcial"].includes(i.condicao)).length,
    // Disponibilidade (`qty_in_use` > 0), independente da condição do item —
    // ex.: item "operacional" mas com 3 das 10 unidades emprestadas. Ver
    // também o badge azul "X em uso" na linha do item e `disponibilidade()`
    // em utils.js.
    "uso-parcial": items.filter(i => (i.qty_in_use || 0) > 0).length,
    "sem-local": items.filter(i => !(i.locations || []).length).length,
    "sem-categoria": items.filter(i => !i.categoria).length,
  };

  // ── exports ───────────────────────────────────────────────────────────────
  const exportItems = () => {
    const rows = [["ID", "Código", "Nome", "Categoria", "Setor", "Sublocal", "Quantidade", "Status", "Estoque Mínimo", "Responsável", "Tag RFID", "Valor Estimado (R$)"]];
    items.forEach(i => (i.locations.length ? i.locations : [{ sector: "", local: "", qty: 0 }]).forEach(l => rows.push([i.id, i.sku || "", i.name, i.categoria || "Diversos", l.sector, l.local, l.qty, SC[i.condicao]?.label || i.condicao, i.min_stock, i.responsavel, i.rfid_tag || "", i.valor_estimado ?? ""])));
    dlCSV(`inventario_cba_${Date.now()}.csv`, rows); showToast("Inventário exportado");
  };
  const exportMovs = () => { dlCSV(`movimentacoes_cba_${Date.now()}.csv`, [["Data", "Direção", "Tipo", "Item", "Quantidade", "Responsável", "Local/Destino", "Observação"], ...movs.map(m => [m.date_str, m.dir, m.tipo, m.item_name, m.qty, m.resp, m.dest, m.obs])]); showToast("Exportado"); };
  const exportItemsCustom = (cats, secs) => {
    const filtered = items.filter(i => {
      const catv = i.categoria || "Diversos";
      if (cats.length && !cats.includes(catv)) return false;
      if (secs.length && !(i.locations || []).some(l => secs.includes(l.sector))) return false;
      return true;
    });
    if (!filtered.length) return showToast("Nenhum item encontrado com esse filtro", "err");
    const rows = [["ID", "Código", "Nome", "Categoria", "Setor", "Sublocal", "Quantidade", "Status", "Estoque Mínimo", "Responsável", "Tag RFID", "Valor Estimado (R$)"]];
    filtered.forEach(i => (i.locations.length ? i.locations : [{ sector: "", local: "", qty: 0 }]).forEach(l => rows.push([i.id, i.sku || "", i.name, i.categoria || "Diversos", l.sector, l.local, l.qty, SC[i.condicao]?.label || i.condicao, i.min_stock, i.responsavel, i.rfid_tag || "", i.valor_estimado ?? ""])));
    const slug = cats.length ? cats.map(c => c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "")).join("-") : "personalizado";
    dlCSV(`inventario_${slug}_${Date.now()}.csv`, rows);
    showToast(`Relatório exportado (${filtered.length} ${filtered.length === 1 ? "item" : "itens"})`);
  };
  const exportCompras = () => {
    const l = items.filter(i => isLow(i) || ["defeito", "defeito parcial"].includes(i.condicao));
    if (!l.length) return showToast("Nenhum item crítico", "err");
    dlCSV(`compras_cba_${Date.now()}.csv`, [["Código", "Item", "Status", "Qtd Atual", "Estoque Mínimo", "Déficit", "Locais"], ...l.map(i => { const t = tot(i); return [i.sku || "", i.name, SC[i.condicao]?.label || i.condicao, t, i.min_stock, Math.max(0, i.min_stock - t), (i.locations || []).map(l => `${l.sector}${l.local ? " (" + l.local + ")" : ""}: ${l.qty}`).join("; ")]; })]);
    showToast("Lista de compras exportada");
  };
  // Roda a geração do CSV só depois do próximo repaint, para garantir que o
  // indicador de carregamento apareça antes do trabalho síncrono (montar
  // linhas, gerar o Blob) — sem atraso artificial, só ordem de execução correta.
  const runExport = (key, fn) => {
    setExportingKey(key);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { fn(); } finally { setExportingKey(null); }
    }));
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
    let locName = "", newLocs, qtyInUse = item.qty_in_use || 0;
    // "Em uso" e "Devolução" são espelho um do outro e NÃO mexem em
    // `locations` — a unidade não sai fisicamente de lugar nenhum, só passa
    // a estar marcada como em uso (`qty_in_use`, sempre um subconjunto da
    // quantidade total do item — mesma regra do clamp em "editar item").
    // Continuam pedindo um local no formulário só pra aparecer no
    // histórico (`dest`), não é de onde a quantidade é retirada/somada.
    if (tipo === "em uso") {
      const loc = item.locations.find(l => String(l.lid) === String(locId));
      if (!loc) return showToast("Local inválido", "err");
      const disponivel = tot(item) - qtyInUse;
      if (n > disponivel) return showToast(`Só ${disponivel} disponível para uso — o resto já está em uso`, "err");
      locName = `${loc.sector}${loc.local ? " · " + loc.local : ""}`;
      newLocs = item.locations;
      qtyInUse += n;
    } else if (tipo === "devolução") {
      if (locId === "__new__") return showToast("Selecione um local existente para devolução", "err");
      const loc = item.locations.find(l => String(l.lid) === String(locId));
      if (!loc) return showToast("Local inválido", "err");
      if (n > qtyInUse) return showToast(`Só ${qtyInUse} em uso — não é possível devolver mais que isso`, "err");
      locName = `${loc.sector}${loc.local ? " · " + loc.local : ""}`;
      newLocs = item.locations;
      qtyInUse -= n;
    } else if (dir === "saida") {
      const loc = item.locations.find(l => String(l.lid) === String(locId));
      if (!loc) return showToast("Local inválido", "err");
      if (n > loc.qty) return showToast("Qtd insuficiente", "err");
      locName = `${loc.sector}${loc.local ? " · " + loc.local : ""}`;
      newLocs = item.locations.map(l => String(l.lid) === String(locId) ? { ...l, qty: Math.max(0, l.qty - n) } : l).filter(l => l.qty > 0);
    } else {
      if (locId === "__new__") { if (!newSector) return showToast("Selecione o setor", "err"); locName = `${newSector}${newLocal ? " · " + newLocal : ""}`; newLocs = [...item.locations, { lid: Math.max(0, ...item.locations.map(l => l.lid), 0) + 1, sector: newSector, local: newLocal || "", qty: n }]; }
      else { const loc = item.locations.find(l => String(l.lid) === String(locId)); if (!loc) return showToast("Local inválido", "err"); locName = `${loc.sector}${loc.local ? " · " + loc.local : ""}`; newLocs = item.locations.map(l => String(l.lid) === String(locId) ? { ...l, qty: l.qty + n } : l); }
    }
    // Condição só muda para tipos que descrevem o estado físico do
    // equipamento ("defeito"/"reparo"). "Em uso" NÃO é mais uma condição
    // (ver constants.js) — é disponibilidade, calculada a partir de
    // qty_in_use, editado no detalhe do item. Por isso não altera `ns` aqui.
    let ns = item.condicao; if (tipo === "defeito") ns = "defeito"; if (tipo === "reparo") ns = "operacional";
    await sb(`items?id=eq.${item.id}`, "PATCH", { locations: newLocs, condicao: ns, qty_in_use: qtyInUse, responsavel: currentUser });
    const mov = { id: Date.now(), dir, tipo, item_id: item.id, item_name: item.name, qty: n, resp: currentUser, dest: locName, obs: obs || "", date_str: ts(), date_iso: new Date().toISOString() };
    await sb("movimentacoes", "POST", mov);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, locations: newLocs, condicao: ns, qty_in_use: qtyInUse, responsavel: currentUser } : i));
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
      let locs = [...it.locations], qtyInUse = it.qty_in_use || 0;
      // Mesmo espelho "Em uso"/"Devolução" do submitMov — não mexe em
      // `locations`, só na quantidade marcada como em uso.
      if (tipo === "em uso") {
        const disponivel = tot(it) - qtyInUse;
        if (n > disponivel) { skipped.push(it.name); continue; }
        qtyInUse += n;
      } else if (tipo === "devolução") {
        if (n > qtyInUse) { skipped.push(it.name); continue; }
        qtyInUse -= n;
      } else if (dir === "saida") {
        const av = locs.reduce((s, l) => s + l.qty, 0);
        if (n > av) { skipped.push(it.name); continue; }
        let rem = n;
        locs = [...locs].sort((a, b) => b.qty - a.qty).map(l => { if (!rem) return l; const tk = Math.min(l.qty, rem); rem -= tk; return { ...l, qty: l.qty - tk }; }).filter(l => l.qty > 0);
      } else {
        if (!locs.length) locs = [{ lid: 1, sector: sectorNames[0], local: "", qty: n }];
        else locs = locs.map((l, i) => i === 0 ? { ...l, qty: l.qty + n } : l);
      }
      const ns = tipo === "defeito" ? "defeito" : tipo === "reparo" ? "operacional" : it.condicao;
      await sb(`items?id=eq.${id}`, "PATCH", { locations: locs, condicao: ns, qty_in_use: qtyInUse, responsavel: currentUser });
      updatedItems[idx] = { ...it, locations: locs, condicao: ns, qty_in_use: qtyInUse, responsavel: currentUser };
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
    const ni = { name: addItem.name, categoria: addItem.categoria || "Diversos", condicao: addItem.condicao, min_stock: +addItem.min_stock || 1, qty_in_use: 0, qty_defect: 0, responsavel: "", rfid_tag: addItem.rfid_tag || "", valor_estimado: addItem.valor_estimado !== "" ? Math.max(0, parseFloat(addItem.valor_estimado)) || null : null, locations: [{ lid: 1, sector: addItem.sector, local: "", qty: +addItem.qty || 0 }] };
    const created = await sb("items", "POST", ni);
    const newItem = Array.isArray(created) ? created[0] : created;
    const mov = { id: Date.now(), dir: "entrada", tipo: "compra", item_id: newItem.id, item_name: newItem.name, qty: newItem.locations[0].qty, resp: currentUser, dest: addItem.sector, obs: "Cadastro inicial", date_str: ts(), date_iso: new Date().toISOString() };
    await sb("movimentacoes", "POST", mov);
    setItems(p => [...p, newItem]);
    setMovs(p => [mov, ...p]);
    showToast(`"${newItem.name}" adicionado`); setModal(null);
    setAddItem({ name: "", qty: 0, sector: "Escritório", condicao: "operacional", min_stock: 1, rfid_tag: "", categoria: categoryNames[0] || CATEGORIES0[0], valor_estimado: "" });
  };

  const deleteItem = id => askConfirm("Remover este item?", async () => {
    await sb(`items?id=eq.${id}`, "DELETE");
    setItems(p => p.filter(i => i.id !== id));
    showToast("Item removido", "warn"); setModal(null);
  });

  // ── ações em lote (Inventário) ───────────────────────────────────────────
  const toggleSelect = id => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAllVisible = visibleIds => setSelectedIds(prev => {
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => prev.has(id));
    const n = new Set(prev);
    visibleIds.forEach(id => allSelected ? n.delete(id) : n.add(id));
    return n;
  });
  const closeBulkModal = () => { setBulkModal(null); setBulkForm({}); };

  const bulkDelete = () => {
    const n = selectedIds.size;
    askConfirm(`Remover ${n} ${n === 1 ? "item selecionado" : "itens selecionados"}? Essa ação não pode ser desfeita.`, async () => {
      await Promise.all([...selectedIds].map(id => sb(`items?id=eq.${id}`, "DELETE")));
      setItems(prev => prev.filter(i => !selectedIds.has(i.id)));
      showToast(`${n} ${n === 1 ? "item removido" : "itens removidos"}`, "warn");
      setSelectedIds(new Set());
    });
  };

  const bulkEdit = async () => {
    const patch = {};
    if (bulkForm.categoria) patch.categoria = bulkForm.categoria;
    if (bulkForm.condicao) patch.condicao = bulkForm.condicao;
    if (!Object.keys(patch).length) return showToast("Escolha ao menos um campo para alterar", "err");
    const ids = [...selectedIds];
    await Promise.all(ids.map(id => sb(`items?id=eq.${id}`, "PATCH", patch)));
    setItems(prev => prev.map(i => selectedIds.has(i.id) ? { ...i, ...patch } : i));
    showToast(`${ids.length} ${ids.length === 1 ? "item atualizado" : "itens atualizados"}`);
    closeBulkModal(); setSelectedIds(new Set());
  };

  const bulkMove = async () => {
    const { sector, local } = bulkForm;
    if (!sector) return showToast("Escolha o setor de destino", "err");
    const targets = items.filter(i => selectedIds.has(i.id) && tot(i) > 0);
    if (!targets.length) return showToast("Nenhum item selecionado tem quantidade para mover", "err");
    const base = Date.now();
    const updates = await Promise.all(targets.map(async (item, idx) => {
      const qtyTotal = tot(item);
      const newLocations = [{ lid: base + idx, sector, local: local || "", qty: qtyTotal }];
      await sb(`items?id=eq.${item.id}`, "PATCH", { locations: newLocations });
      const mov = { id: base + idx + 1_000_000, dir: "transferencia", tipo: "transferência em lote", item_id: item.id, item_name: item.name, qty: qtyTotal, resp: currentUser, dest: `${sector}${local ? " / " + local : ""}`, obs: "Movimentação em lote", date_str: ts(), date_iso: new Date().toISOString() };
      await sb("movimentacoes", "POST", mov);
      return { id: item.id, locations: newLocations, mov };
    }));
    setItems(prev => prev.map(i => { const u = updates.find(x => x.id === i.id); return u ? { ...i, locations: u.locations } : i; }));
    setMovs(prev => [...updates.map(u => u.mov), ...prev]);
    showToast(`${updates.length} ${updates.length === 1 ? "item movido" : "itens movidos"} para ${sector}`);
    closeBulkModal(); setSelectedIds(new Set());
  };

  const updateStatus = async (id, st) => {
    const name = items.find(i => i.id === id)?.name || "";
    await sb(`items?id=eq.${id}`, "PATCH", { condicao: st });
    const mov = { id: Date.now(), dir: "status", tipo: "status", item_id: id, item_name: name, qty: 0, resp: currentUser, dest: "—", obs: `Condição → ${SC[st]?.label || st}`, date_str: ts(), date_iso: new Date().toISOString() };
    await sb("movimentacoes", "POST", mov);
    setItems(p => p.map(i => i.id === id ? { ...i, condicao: st } : i));
    setMovs(p => [mov, ...p]);
    showToast("Condição atualizada");
    setModal(m => m ? { ...m, item: { ...m.item, condicao: st } } : m);
  };

  const submitEditItem = async () => {
    if (!itemDraft.name?.trim()) return showToast("Nome obrigatório", "err");
    const cl = (itemDraft.locations || []).map(l => ({ ...l, qty: Math.max(0, parseInt(l.qty) || 0) }));
    const totQty = cl.reduce((s, l) => s + l.qty, 0);
    const qtyInUse = Math.min(totQty, Math.max(0, parseInt(itemDraft.qty_in_use) || 0));
    const catv = itemDraft.categoria || "Diversos";
    const valorEst = itemDraft.valor_estimado !== "" && itemDraft.valor_estimado != null ? Math.max(0, parseFloat(itemDraft.valor_estimado)) || null : null;
    await sb(`items?id=eq.${itemDraft.id}`, "PATCH", { name: itemDraft.name, categoria: catv, min_stock: parseInt(itemDraft.min_stock) || 1, rfid_tag: itemDraft.rfid_tag || "", locations: cl, qty_in_use: qtyInUse, valor_estimado: valorEst });
    setItems(prev => prev.map(i => i.id === itemDraft.id ? { ...i, name: itemDraft.name, categoria: catv, min_stock: parseInt(itemDraft.min_stock) || 1, rfid_tag: itemDraft.rfid_tag || "", locations: cl, qty_in_use: qtyInUse, valor_estimado: valorEst } : i));
    showToast("Item atualizado"); setModal(null); setItemDraft({});
  };

  // ── tarefas (aba "Tarefas") ──────────────────────────────────────────────
  // Quadro Kanban simplificado (tipo Trello interno, a pedido do usuário).
  // Mesmo modelo de segurança/permissão de items e movimentações: qualquer
  // pessoa logada pode criar e atribuir tarefa pra qualquer colega — sem
  // checagem extra de "dono" na interface nem no banco (RLS já documentado
  // na migração `create_tarefas_table`).
  const createTask = async (payload) => {
    const row = { ...payload, criado_por: currentUser, status: "a_fazer", criado_em_str: ts(), criado_em_iso: new Date().toISOString(), updated_at: new Date().toISOString() };
    try {
      const [saved] = await sb("tarefas", "POST", row) || [];
      setTasks(p => [saved || { ...row, id: `tmp-${Date.now()}` }, ...p]);
      showToast("Tarefa criada");
    } catch (e) {
      showToast(`Erro ao criar tarefa: ${e.message}`, "err");
    }
  };
  const updateTask = async (id, patch) => {
    const body = { ...patch, updated_at: new Date().toISOString() };
    try {
      await sb(`tarefas?id=eq.${id}`, "PATCH", body);
      setTasks(p => p.map(t => t.id === id ? { ...t, ...body } : t));
      showToast("Tarefa atualizada");
    } catch (e) {
      showToast(`Erro ao atualizar tarefa: ${e.message}`, "err");
    }
  };
  // Atalho usado pelo arrastar-e-soltar e pelas setinhas ‹ › do card — só
  // muda o status, sem abrir modal, pra trocar de coluna ser instantâneo.
  const updateTaskStatus = async (id, status) => {
    const prev = tasks.find(t => t.id === id)?.status;
    if (prev === status) return;
    setTasks(p => p.map(t => t.id === id ? { ...t, status } : t)); // otimista: resposta visual imediata ao soltar o card
    try {
      await sb(`tarefas?id=eq.${id}`, "PATCH", { status, updated_at: new Date().toISOString() });
    } catch (e) {
      setTasks(p => p.map(t => t.id === id ? { ...t, status: prev } : t)); // desfaz se o servidor recusar
      showToast(`Erro ao mover tarefa: ${e.message}`, "err");
    }
  };
  const deleteTask = (task) => {
    askConfirm(`Excluir a tarefa "${task.titulo}"?`, async () => {
      try {
        await sb(`tarefas?id=eq.${task.id}`, "DELETE");
        setTasks(p => p.filter(t => t.id !== task.id));
        showToast(`"${task.titulo}" excluída`, "warn");
      } catch (e) {
        showToast(`Erro ao excluir tarefa: ${e.message}`, "err");
      }
    });
  };
  // Badge vermelho na sidebar/menu (só minhas tarefas em aberto — status
  // diferente de "concluído") — o alerta visual pedido pelo usuário, sem
  // misturar com o sino de alertas de estoque (assunto diferente). Uma
  // tarefa pode ter vários responsáveis (`responsaveis`); cada um conta
  // pro próprio badge, não só um "principal".
  const myOpenTasks = tasks.filter(t => (t.responsaveis || []).includes(currentUser) && t.status !== "concluido").length;

  // ── filtered + sorted ─────────────────────────────────────────────────────
  // filtInv/filtMovs memoizados: sem isso, cada render criava um array novo
  // e o useMemo de sortedInv/sortedMovs nunca "acertava" a comparação de
  // dependências (referência sempre diferente), recalculando à toa a cada
  // digitação em qualquer campo do app — inclusive fora destas telas.
  const filtInv = useMemo(() => items.filter(it => {
    const locs = it.locations || [];
    if (invCategoria !== "Todas" && (it.categoria || "Diversos") !== invCategoria) return false;
    if (invSector !== "Todos" && !locs.some(l => l.sector === invSector && l.qty > 0)) return false;
    if (invLocal && !locs.some(l => l.qty > 0 && l.local === invLocal)) return false;
    if (invStatus === "baixo") { if (!isLow(it)) return false; }
    else if (invStatus === "defeituosos") { if (!["defeito", "defeito parcial"].includes(it.condicao)) return false; }
    else if (invStatus === "uso-parcial") { if (!((it.qty_in_use || 0) > 0)) return false; }
    else if (invStatus === "sem-local") { if (locs.length) return false; }
    else if (invStatus === "sem-categoria") { if (it.categoria) return false; }
    else if (invStatus !== "todos") { if (it.condicao !== invStatus) return false; }
    if (invSearch && !it.name.toLowerCase().includes(invSearch.toLowerCase()) && !it.sku?.toLowerCase().includes(invSearch.toLowerCase())) return false;
    return true;
  }), [items, invCategoria, invSector, invLocal, invStatus, invSearch]);
  const sortedInv = useMemo(() => {
    const arr = [...filtInv]; const { col, dir } = invSort; const d = dir === "asc" ? 1 : -1;
    if (col === "nome") return arr.sort((a, b) => d * a.name.localeCompare(b.name, "pt"));
    if (col === "qty") return arr.sort((a, b) => d * (tot(a) - tot(b)));
    if (col === "min") return arr.sort((a, b) => d * (a.min_stock - b.min_stock));
    if (col === "condicao") return arr.sort((a, b) => d * a.condicao.localeCompare(b.condicao));
    if (col === "critico") return arr.sort((a, b) => { const x = isLow(a) ? -1 : 1, y = isLow(b) ? -1 : 1; return x - y || tot(a) - tot(b); });
    return arr;
  }, [filtInv, invSort]);
  const invPageCount = Math.max(1, Math.ceil(sortedInv.length / INV_PAGE_SIZE));
  const invPageClamped = Math.min(invPage, invPageCount);
  const pagedInv = useMemo(() => sortedInv.slice((invPageClamped - 1) * INV_PAGE_SIZE, invPageClamped * INV_PAGE_SIZE), [sortedInv, invPageClamped]);
  // Volta pra página 1 sempre que o FILTRO muda (busca/categoria/setor/status)
  // — mudar só a ordenação mantém a página atual, comportamento mais previsível.
  useEffect(() => { setInvPage(1); }, [invCategoria, invSector, invLocal, invStatus, invSearch]);

  const tiposAtivos = movDir === "entrada" ? TIPOS_E : movDir === "saida" ? TIPOS_S : movDir === "transferencia" ? ["transferência"] : [...TIPOS_E, ...TIPOS_S, "transferência"];
  const filtMovs = useMemo(() => movs.filter(m => {
    if (movDir !== "todos" && m.dir !== movDir) return false;
    if (movTipo !== "todos" && m.tipo !== movTipo) return false;
    if (movResp !== "todos" && m.resp !== movResp) return false;
    if (movSearch && !m.item_name?.toLowerCase().includes(movSearch.toLowerCase()) && !m.resp?.toLowerCase().includes(movSearch.toLowerCase())) return false;
    if (movFrom) { const d = m.date_iso?.slice(0, 10); if (!d || d < movFrom) return false; }
    if (movTo) { const d = m.date_iso?.slice(0, 10); if (!d || d > movTo) return false; }
    return true;
  }), [movs, movDir, movTipo, movResp, movSearch, movFrom, movTo]);
  const sortedMovs = useMemo(() => {
    const arr = [...filtMovs];
    if (movSort === "antigo") return arr.reverse();
    if (movSort === "maior-qty") return arr.sort((a, b) => b.qty - a.qty);
    if (movSort === "menor-qty") return arr.sort((a, b) => a.qty - b.qty);
    return arr;
  }, [filtMovs, movSort]);

  // ── loading / error ───────────────────────────────────────────────────────
  // Skeleton em vez de um spinner solto: reduz a sensação de espera e já
  // sugere o formato da tela que vai aparecer (sidebar + KPIs + painéis).
  if (!loaded) return (
    <div style={{ display: "flex", height: "100vh", background: "#0c0d12", fontFamily: "'DM Sans',sans-serif", overflow: "hidden" }}>
      <style>{`
        @keyframes skel-pulse{0%,100%{opacity:.55}50%{opacity:1}}
        .skel{background:#1a1c26;border-radius:8px;animation:skel-pulse 1.4s ease-in-out infinite}
      `}</style>
      <div style={{ width: 226, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,.06)", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="skel" style={{ width: 120, height: 14, marginBottom: 18 }} />
        <div className="skel" style={{ width: "100%", height: 34, borderRadius: 7, marginBottom: 10 }} />
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="skel" style={{ width: `${85 - i * 4}%`, height: 12, marginBottom: 4 }} />)}
      </div>
      <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div className="skel" style={{ width: 160, height: 18, marginBottom: 6 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="skel" style={{ height: 84 }} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="skel" style={{ height: 220 }} />
          <div className="skel" style={{ height: 220 }} />
        </div>
      </div>
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
          <div style={{ fontSize: 20, fontWeight: 700, color: T.textBright }}>Base de Dados</div>
        </div>
        {lbl("Quem é você?")}
        {/* Campo de texto livre, não mais um <select> com a lista de todos
            os nomes da equipe visível antes do login — evita que qualquer
            visitante veja quem trabalha aqui só de abrir a tela. */}
        <input
          type="text"
          autoComplete="username"
          value={loginForm.name}
          onChange={e => { const v = e.target.value; setLoginForm(p => ({ ...p, name: v, password: "", confirm: "" })); setLoginErr(""); setHasPassword(null); }}
          onBlur={e => checkUserOnSelect(e.target.value.trim())}
          onKeyDown={e => e.key === "Enter" && checkUserOnSelect(e.target.value.trim())}
          style={inp({ marginBottom: 8 })}
          placeholder="Seu nome completo"
        />
        {loginForm.name.trim() && !checkingUser && hasPassword !== null && <>
          {lbl(hasPassword === false ? "Criar senha (primeiro acesso)" : "Senha")}
          <input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} style={inp({ marginBottom: 8 })} placeholder="••••••" onKeyDown={e => e.key === "Enter" && hasPassword === true && handleLogin()} />
          {hasPassword === false && <>
            <input type="password" value={loginForm.confirm} onChange={e => setLoginForm(p => ({ ...p, confirm: e.target.value }))} style={inp({ marginBottom: 4 })} placeholder="Confirmar senha" onKeyDown={e => e.key === "Enter" && handleLogin()} />
            <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 8 }}>Mínimo de 10 caracteres.</div>
          </>}
        </>}
        {loginForm.name.trim() && checkingUser && <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 8 }}>Verificando...</div>}
        {loginErr && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{loginErr}</div>}
        <button disabled={checkingUser} onClick={handleLogin} style={{ ...btn(T.accent), width: "100%", padding: "10px", fontSize: 13, marginTop: 4, opacity: checkingUser ? .6 : 1 }}>
          {loginForm.name && hasPassword === false ? "Criar senha e entrar" : "Entrar"}
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
        .inv-cards{display:none}

        /* ── microinterações / acessibilidade ────────────────────────────── */
        /* Transição curta e consistente (spec pede 150–250ms) para os
           estados de hover mais comuns, sem sobrescrever transições mais
           específicas já definidas inline em componentes pontuais. */
        button,a,.stat-tile,.mov-card{transition:background 180ms ease,border-color 180ms ease,color 180ms ease,transform 180ms ease,box-shadow 180ms ease}
        button:disabled{cursor:default}
        /* Anel de foco visível só para navegação por teclado (não aparece em
           clique de mouse) — contraste alto o suficiente sobre fundo claro
           ou escuro, sem depender da paleta de cores do tema. */
        :focus-visible{outline:2px solid ${T.accent};outline-offset:2px;border-radius:4px}
        input:focus-visible,select:focus-visible,textarea:focus-visible{outline-offset:0}

        /* ── layout: sidebar (desktop) x barra inferior (mobile) ────────── */
        .main-content{margin-left:226px;min-height:100vh;display:flex;flex-direction:column}
        .mobile-topbar{display:none}
        .mobile-bottom-nav{display:none}
        @media(max-width:960px){
          .sidebar-desktop{display:none!important}
          .topbar-desktop{display:none!important}
          .main-content{margin-left:0}
          .mobile-topbar{display:flex!important}
          .mobile-bottom-nav{display:block!important}
          .content-inner{padding-bottom:78px!important}
        }

        /* ── dashboard: grids responsivos ────────────────────────────────── */
        .mob-grid-5{grid-template-columns:repeat(5,1fr)}
        .mob-grid-3{grid-template-columns:repeat(3,1fr)}
        .dash-donuts{grid-template-columns:repeat(3,1fr)}
        .dash-panels{grid-template-columns:1fr 1fr}
        .quick-actions{grid-template-columns:repeat(5,1fr)}
        /* Quadro "Tarefas": 3 colunas lado a lado no desktop; empilha em 1
           coluna no celular (cada coluna já rola internamente por si — ver
           maxHeight no Tarefas.jsx — então empilhar não gera uma tela
           infinita, só uma abaixo da outra). */
        .tasks-board{grid-template-columns:repeat(3,1fr)}
        /* Linha de tarefa na visão "Por Pessoa" — hover neutro (funciona
           igual em tema claro/escuro sem precisar passar cor por variável
           CSS). */
        .task-person-row:hover{background:rgba(127,127,127,.10)}
        @media(max-width:1180px){
          .mob-grid-5{grid-template-columns:repeat(3,1fr)}
          .dash-donuts{grid-template-columns:1fr}
        }
        @media(max-width:920px){
          .dash-panels{grid-template-columns:1fr!important}
          .inv-flt,.mov-flt{grid-template-columns:1fr 1fr!important}
          .inv-panel{overflow-x:auto!important}
          .inv-panel table{min-width:560px!important}
        }
        @media(max-width:760px){
          .tasks-board{grid-template-columns:1fr!important}
        }
        @media(max-width:900px){
          .quick-actions{grid-template-columns:repeat(3,1fr)}
        }
        @media(max-width:640px){
          .inv-panel{display:none!important}
          .inv-cards{display:block!important}
          .mob-grid-5{grid-template-columns:repeat(2,1fr)}
          .mob-grid-3{grid-template-columns:1fr}
        }
        @media(max-width:500px){
          .inv-flt,.mov-flt{grid-template-columns:1fr!important}
          .quick-actions{grid-template-columns:repeat(2,1fr)}
        }
        @media(max-width:420px){
          .mob-grid-5{grid-template-columns:1fr}
        }
      `}</style>

      {toast && (() => {
        const TOAST_STYLE = {
          ok: { bg: "#16a34a", Icon: CheckCircle2 },
          err: { bg: "#dc2626", Icon: XCircle },
          warn: { bg: "#d97706", Icon: AlertTriangle },
          info: { bg: "#2563eb", Icon: Info },
        };
        const { bg, Icon } = TOAST_STYLE[toast.type] || TOAST_STYLE.info;
        return (
          <div role="status" aria-live="polite" style={{ position: "fixed", top: 60, right: 16, zIndex: 9999, display: "flex", alignItems: "center", gap: 8, background: bg, color: "#fff", padding: "9px 10px 9px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,.4)", maxWidth: 320, animation: "toast-in 200ms ease" }}>
            <style>{`@keyframes toast-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}`}</style>
            <Icon size={15} strokeWidth={2.25} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{toast.msg}</span>
            <button onClick={() => setToast(null)} aria-label="Fechar aviso" style={{ background: "rgba(255,255,255,.18)", border: "none", color: "#fff", width: 20, height: 20, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "background 150ms ease" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.3)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.18)"}>
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
        );
      })()}

      {/* NAVEGAÇÃO */}
      <Sidebar
        T={T}
        view={view}
        currentUser={currentUser}
        ADMIN={ADMIN}
        isAdmin={isAdminUser}
        theme={theme}
        setTheme={setTheme}
        onNavigate={(item) => navigateTo(item, { setView, setModal, setBatchQtys, setBatchSearch, setInvTab, showToast })}
        onNewItem={openAddItemModal}
        onOpenTeam={() => { if (isAdminUser) { setModal({ type: "team" }); loadActiveLogins(); } }}
        onLogout={handleLogout}
        taskBadge={myOpenTasks}
      />
      <MobileTopBar
        T={T}
        currentUser={currentUser}
        alertCount={critItems.length + defItems.length + verItems.length + trainingAlerts.length}
        onAlertClick={() => setView("dashboard")}
        onMenu={() => setMobileMenuOpen(true)}
      />

      <div className="main-content">
        <TopBar
          T={T}
          title={VIEW_TITLES[view] || "Base de Dados"}
          search={invSearch}
          onSearch={setInvSearch}
          onSearchSubmit={() => setView("inventario")}
          alertCount={critItems.length + defItems.length + verItems.length + trainingAlerts.length}
          onAlertClick={() => setView("dashboard")}
          theme={theme}
          setTheme={setTheme}
        />

        <div className="content-inner" style={{ maxWidth: 1300, margin: "0 auto", padding: "20px 20px 40px" }}>

          {/* DASHBOARD */}
          {view === "dashboard" && (
            <Dashboard
              T={T}
              items={items}
              movs={movs}
              sectorNames={sectorNames}
              sectorColor={sectorColor}
              categoryNames={categoryNames}
              catColor={catColor}
              setView={setView}
              setInvStatus={setInvStatus}
              setInvCategoria={setInvCategoria}
              setInvSector={setInvSector}
              setInvSearch={setInvSearch}
              onNewItem={openAddItemModal}
              onOpenBatch={openBatchModal}
              onOpenReports={openReportsModal}
              onResolve={resolveAttentionItem}
              trainingAlerts={trainingAlerts}
              currentUser={currentUser}
              ADMIN={ADMIN}
              isAdmin={isAdminUser}
              onOpenTreinamentos={openTreinamentos}
              showToast={showToast}
            />
          )}

          {/* MAPA */}
          {view === "mapa" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <button onClick={() => setModal({ type: "cadastros", tab: "locais" })} style={{ ...ghost(), display: "flex", alignItems: "center", gap: 6 }}>
                  <Tags size={13} /> Cadastros
                </button>
              </div>
              <Suspense fallback={
                <div style={{ height: 640, borderRadius: 10, border: `1px solid ${T.border}`, background: T.input, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.textFaint }}>
                  Carregando mapa…
                </div>
              }>
                <NetworkMap
                  T={T}
                  equipamentos={equipamentos}
                  onAddEquipamento={addEquipamento}
                  onRemoveEquipamento={removeEquipamento}
                  showToast={showToast}
                />
              </Suspense>
            </>
          )}

          {/* TAREFAS */}
          {view === "tarefas" && (
            <Tarefas
              T={T}
              tasks={tasks}
              team={team}
              currentUser={currentUser}
              onCreate={createTask}
              onUpdate={updateTask}
              onUpdateStatus={updateTaskStatus}
              onDelete={deleteTask}
              showToast={showToast}
            />
          )}

          {/* DOCUMENTOS */}
          {view === "documentos" && (
            <Documentos
              T={T}
              folders={docFolders}
              documents={documents}
              currentUser={currentUser}
              ADMIN={ADMIN}
              isAdmin={isAdminUser}
              team={team}
              onCreateFolder={createDocFolder}
              onRenameFolder={renameDocFolder}
              onDeleteFolder={deleteDocFolder}
              onToggleFolderPrivacy={toggleFolderPrivacy}
              onUploadFiles={uploadDocuments}
              onRenameDocument={renameDocument}
              onDeleteDocument={deleteDocument}
              onMoveDocument={moveDocument}
              onBulkMoveDocuments={bulkMoveDocuments}
              onBulkDelete={bulkDeleteDocItems}
              getDocUrl={docPublicUrl}
              colaboradorDocs={colaboradorDocs}
              onCreateColaboradorDoc={createColaboradorDoc}
              onUpdateColaboradorDoc={updateColaboradorDoc}
              onDeleteColaboradorDoc={deleteColaboradorDoc}
              jumpSignal={docsJump}
              showToast={showToast}
            />
          )}

          {/* CONFIGURAÇÕES */}
          {view === "configuracoes" && (
            <Configuracoes
              T={T}
              theme={theme}
              setTheme={setTheme}
              accentKey={accentKey}
              setAccentKey={setAccentKey}
              currentUser={currentUser}
              ADMIN={ADMIN}
              isAdmin={isAdminUser}
              onOpenTeam={() => { if (isAdminUser) { setModal({ type: "team" }); loadActiveLogins(); } }}
              onChangePassword={changePassword}
            />
          )}

          {/* INVENTÁRIO — mega-view com 2 abas internas: "Inventário" e
              "Movimentações". Fundidas a pedido do usuário pra reduzir o
              menu principal ("veja oq fica legal, mas quero uma redução,
              nao quero que suma as funcionalidade") — Movimentações continua
              1 toque de distância no celular via atalho fixo na barra
              inferior (ver `desktopHidden`/`tab` em NAV_ITEMS), só deixou de
              ter uma entrada própria na sidebar do desktop. */}
        {view === "inventario" && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setInvTab("inventario")} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
                background: invTab === "inventario" ? `${T.accent}18` : "transparent", color: invTab === "inventario" ? T.accent : T.textMuted,
              }}><Boxes size={14} /> Base de Dados</button>
              <button onClick={() => setInvTab("movimentacoes")} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
                background: invTab === "movimentacoes" ? `${T.accent}18` : "transparent", color: invTab === "movimentacoes" ? T.accent : T.textMuted,
              }}><ArrowLeftRight size={14} /> Movimentações</button>
            </div>
            {invTab === "inventario" ? (
              <button onClick={openReportsModal} style={{ ...ghost(), display: "flex", alignItems: "center", gap: 6 }}>
                <FileText size={13} /> Relatórios
              </button>
            ) : (
              <button onClick={openBatchModal} style={{ ...ghost(), display: "flex", alignItems: "center", gap: 6 }}>
                <Layers size={13} /> Movimentação em lote
              </button>
            )}
          </div>

          {invTab === "inventario" && <>

          <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Status</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {QUICK_FILTERS.map(qf => {
              const active = invStatus === qf.key;
              const c = qf.color || T.accent;
              return (
                <button key={qf.key} onClick={() => setInvStatus(qf.key)} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  border: `1px solid ${active ? c : T.border}`,
                  background: active ? c : T.panel,
                  color: active ? "#fff" : T.textMuted,
                }}>
                  {qf.color && <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? "#fff" : c, flexShrink: 0 }} />}
                  {qf.label} <span style={{ opacity: .75 }}>({qfCounts[qf.key]})</span>
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Categoria</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            <button onClick={() => setInvCategoria("Todas")} style={{
              padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${invCategoria === "Todas" ? T.accent : T.border}`,
              background: invCategoria === "Todas" ? T.accent : T.panel,
              color: invCategoria === "Todas" ? "#fff" : T.textMuted,
            }}>Todas <span style={{ opacity: .75 }}>({items.length})</span></button>
            {categoryNames.map(c => (
              <button key={c} onClick={() => setInvCategoria(c)} style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${invCategoria === c ? catColor(c) : T.border}`,
                background: invCategoria === c ? catColor(c) : T.panel,
                color: invCategoria === c ? "#fff" : T.textMuted,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: invCategoria === c ? "#fff" : catColor(c), flexShrink: 0 }} />
                {c} <span style={{ opacity: .75 }}>({catCounts[c]?.items || 0})</span>
              </button>
            ))}
          </div>

          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
            <div className="inv-flt" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <input placeholder="Buscar por nome ou código..." value={invSearch} onChange={e => setInvSearch(e.target.value)} style={inp({ marginBottom: 0 })} />
              <select value={invSector} onChange={e => setInvSector(e.target.value)} style={inp({ marginBottom: 0 })}>
                <option value="Todos">Todos os setores</option>
                {sectorNames.map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={invStatus} onChange={e => setInvStatus(e.target.value)} style={inp({ marginBottom: 0 })}>
                <option value="todos">Todos os status</option>
                <option value="operacional">Operacional</option>
                <option value="verificar">Verificar</option>
                <option value="defeito parcial">Defeito Parcial</option>
                <option value="defeito">Defeito</option>
                <option value="uso-parcial">Em Uso</option>
                <option value="baixo">Estoque Baixo</option>
                <option value="defeituosos">Defeituosos (todos)</option>
                <option value="sem-local">Sem localização</option>
                <option value="sem-categoria">Sem categoria</option>
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
                <option value="condicao:asc">Por status</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: T.textFaint }}><b style={{ color: T.text }}>{sortedInv.length}</b> itens</span>
              {(invSearch || invSector !== "Todos" || invLocal || invStatus !== "todos" || invCategoria !== "Todas") && <button onClick={() => { setInvSearch(""); setInvSector("Todos"); setInvLocal(""); setInvStatus("todos"); setInvCategoria("Todas"); }} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Limpar filtros</button>}
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${T.accent}12`, border: `1px solid ${T.accent}40`, borderRadius: 8, padding: "9px 14px", marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>{selectedIds.size} {selectedIds.size === 1 ? "selecionado" : "selecionados"}</span>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                <button onClick={() => setBulkModal({ type: "edit" })} style={sbtn(T.accent)}>Editar</button>
                <button onClick={() => setBulkModal({ type: "move" })} style={sbtn("#8b5cf6")}>Mover / Transferir</button>
                <button onClick={bulkDelete} style={sbtn("#ef4444")}>Excluir</button>
                <button onClick={() => setSelectedIds(new Set())} style={ghost()}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="inv-panel" style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ width: 34, padding: "9px 6px 9px 12px", background: T.th, borderBottom: `1px solid ${T.border}` }}>
                    <input type="checkbox" aria-label="Selecionar todos os itens desta página" style={{ accentColor: T.accent, cursor: "pointer" }}
                      checked={pagedInv.length > 0 && pagedInv.every(i => selectedIds.has(i.id))}
                      onChange={() => toggleSelectAllVisible(pagedInv.map(i => i.id))} />
                  </th>
                  <SortTh T={T} invSort={invSort} setInvSort={setInvSort} col="nome" label="Nome" />
                  <th style={{ padding: "9px 12px", fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .7, background: T.th, borderBottom: `1px solid ${T.border}` }}>Categoria</th>
                  <th style={{ padding: "9px 12px", fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .7, background: T.th, borderBottom: `1px solid ${T.border}` }}>Locais</th>
                  <SortTh T={T} invSort={invSort} setInvSort={setInvSort} col="condicao" label="Status" />
                  <SortTh T={T} invSort={invSort} setInvSort={setInvSort} col="qty" label="Qtd" align="right" />
                  <SortTh T={T} invSort={invSort} setInvSort={setInvSort} col="min" label="Mín" align="right" />
                  <th style={{ padding: "9px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .7, background: T.th, borderBottom: `1px solid ${T.border}` }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {pagedInv.map(item => {
                  const t = tot(item), low = isLow(item);
                  return (
                    <tr key={item.id} className="inv-row" onClick={() => setModal({ type: "detail", item })} style={{ cursor: "pointer", borderBottom: `1px solid ${T.borderSoft}`, background: selectedIds.has(item.id) ? `${T.accent}0c` : undefined }}>
                      <td style={{ padding: "10px 6px 10px 12px" }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Selecionar ${item.name}`} style={{ accentColor: T.accent, cursor: "pointer" }} checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} />
                      </td>
                      <td style={{ padding: "10px 12px", maxWidth: 220 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                        <div style={{ fontSize: 10, color: T.textFaint, fontFamily: "'DM Mono',monospace" }}>{item.sku}{item.rfid_tag ? ` · ${item.rfid_tag}` : ""}</div>
                      </td>
                      <td style={{ padding: "10px 12px" }}><CategoryBadge T={T} c={item.categoria || "Diversos"} color={catColor(item.categoria || "Diversos")} /></td>
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
                        <StatusDot T={T} s={item.condicao} />
                        {low && <span style={{ fontSize: 9, color: "#eab308", fontWeight: 700, marginLeft: 6, background: "rgba(234,179,8,.12)", padding: "1px 5px", borderRadius: 3 }}>baixo</span>}
                        {(item.qty_in_use || 0) > 0 && <span title="Parte da quantidade está em uso" style={{ fontSize: 9, color: "#3b82f6", fontWeight: 700, marginLeft: 6, background: "rgba(59,130,246,.12)", padding: "1px 5px", borderRadius: 3 }}>{item.qty_in_use} em uso</span>}
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
                {sortedInv.length === 0 && <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: T.textFaint, fontSize: 12 }}>Nenhum item encontrado.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="inv-cards">
            {pagedInv.map(item => {
              const t = tot(item), low = isLow(item);
              return (
                <div key={item.id} onClick={() => setModal({ type: "detail", item })} style={{ background: selectedIds.has(item.id) ? `${T.accent}0c` : T.panel, border: `1px solid ${selectedIds.has(item.id) ? T.accent : T.border}`, borderRadius: 8, padding: 12, marginBottom: 8, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 8, minWidth: 0 }}>
                      <input type="checkbox" aria-label={`Selecionar ${item.name}`} style={{ accentColor: T.accent, cursor: "pointer", marginTop: 2, flexShrink: 0 }} checked={selectedIds.has(item.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(item.id)} />
                      <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                      <div style={{ fontSize: 10, color: T.textFaint, fontFamily: "'DM Mono',monospace" }}>{item.sku}</div>
                      <div style={{ marginTop: 4, marginBottom: 3 }}><CategoryBadge T={T} c={item.categoria || "Diversos"} color={catColor(item.categoria || "Diversos")} /></div>
                      <div style={{ marginTop: 3 }}>
                        <StatusDot T={T} s={item.condicao} />
                        {low && <span style={{ fontSize: 9, color: "#eab308", fontWeight: 700, marginLeft: 6, background: "rgba(234,179,8,.12)", padding: "1px 5px", borderRadius: 3 }}>baixo</span>}
                        {(item.qty_in_use || 0) > 0 && <span style={{ fontSize: 9, color: "#3b82f6", fontWeight: 700, marginLeft: 6, background: "rgba(59,130,246,.12)", padding: "1px 5px", borderRadius: 3 }}>{item.qty_in_use} em uso</span>}
                      </div>
                      </div>
                    </div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 18, fontWeight: 700, color: low ? "#eab308" : T.textBright, flexShrink: 0 }}>{t}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                    {(item.locations || []).map((l, i) => (
                      <span key={i} style={{ fontSize: 10, background: T.panelAlt, border: `1px solid ${T.borderSoft}`, padding: "2px 6px", borderRadius: 3, color: T.textMuted, whiteSpace: "nowrap" }}>
                        {l.sector}{l.local ? " / " + l.local : ""}: {l.qty}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                    <button aria-label="Entrada" onClick={() => { setModal({ type: "mov", item, dir: "entrada" }); setForm({ dir: "entrada" }); }} style={{ ...rowBtn(), flex: 1, height: 32 }} {...rowBtnHover("#22c55e")}><ArrowUp size={14} strokeWidth={2.25} /></button>
                    <button aria-label="Saída" onClick={() => { setModal({ type: "mov", item, dir: "saida" }); setForm({ dir: "saida" }); }} style={{ ...rowBtn(), flex: 1, height: 32 }} {...rowBtnHover("#ef4444")}><ArrowDown size={14} strokeWidth={2.25} /></button>
                    <button aria-label="Transferir" onClick={() => { setModal({ type: "mov", item, dir: "transferencia" }); setForm({ dir: "transferencia" }); }} style={{ ...rowBtn(), flex: 1, height: 32 }} {...rowBtnHover("#8b5cf6")}><ArrowLeftRight size={14} strokeWidth={2.25} /></button>
                  </div>
                </div>
              );
            })}
            {sortedInv.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: T.textFaint, fontSize: 12 }}>Nenhum item encontrado.</div>}
          </div>

          {sortedInv.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: T.textFaint }}>
                {(invPageClamped - 1) * INV_PAGE_SIZE + 1}–{Math.min(invPageClamped * INV_PAGE_SIZE, sortedInv.length)} de {sortedInv.length}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setInvPage(p => Math.max(1, p - 1))} disabled={invPageClamped <= 1} style={{ ...ghost(), padding: "6px 12px", opacity: invPageClamped <= 1 ? .5 : 1, cursor: invPageClamped <= 1 ? "default" : "pointer" }}>Anterior</button>
                <span style={{ fontSize: 11, color: T.textMuted }}>Página {invPageClamped} de {invPageCount}</span>
                <button onClick={() => setInvPage(p => Math.min(invPageCount, p + 1))} disabled={invPageClamped >= invPageCount} style={{ ...ghost(), padding: "6px 12px", opacity: invPageClamped >= invPageCount ? .5 : 1, cursor: invPageClamped >= invPageCount ? "default" : "pointer" }}>Próxima</button>
              </div>
            </div>
          )}
          </>}

          {invTab === "movimentacoes" && <>

          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
            <input placeholder="Buscar item ou responsável..." value={movSearch} onChange={e => setMovSearch(e.target.value)} style={inp({ marginBottom: 10 })} />

            <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Filtros</div>
            <div className="mov-flt" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              <select value={movDir} onChange={e => { setMovDir(e.target.value); setMovTipo("todos"); }} style={inp({ marginBottom: 0 })}>
                <option value="todos">Todas as direções</option>
                <option value="entrada">Entradas</option>
                <option value="saida">Saídas</option>
                <option value="transferencia">Transferências</option>
                <option value="status">Ajustes de status</option>
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

            <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Período</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <input type="date" value={movFrom} onChange={e => setMovFrom(e.target.value)} style={inp({ marginBottom: 0 })} />
              <input type="date" value={movTo} onChange={e => setMovTo(e.target.value)} style={inp({ marginBottom: 0 })} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: `1px solid ${T.borderSoft}` }}>
              <span style={{ fontSize: 11, color: T.textFaint }}><b style={{ color: T.text }}>{sortedMovs.length}</b> registros</span>
              {(movSearch || movDir !== "todos" || movTipo !== "todos" || movResp !== "todos" || movFrom || movTo) && <button onClick={() => { setMovSearch(""); setMovDir("todos"); setMovTipo("todos"); setMovResp("todos"); setMovFrom(""); setMovTo(""); }} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Limpar filtros</button>}
            </div>
          </div>

          <div className="mov-cards" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sortedMovs.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: T.textFaint, fontSize: 12, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8 }}>Nenhuma movimentação encontrada.</div>}
            {sortedMovs.map(m => {
              const isIn = m.dir === "entrada", isTr = m.dir === "transferencia", isSt = m.dir === "status";
              const mc = isIn ? "#22c55e" : isTr ? T.accent : isSt ? "#eab308" : "#ef4444";
              return (
                <div key={m.id} className="mov-card" style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", alignItems: "center", padding: "10px 14px", background: T.panel, border: `1px solid ${T.border}`, borderLeft: `3px solid ${mc}`, borderRadius: 7, transition: "border-color 150ms ease, box-shadow 150ms ease" }} onMouseEnter={e => e.currentTarget.style.boxShadow = T.shadow} onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                  <div style={{ width: 32, height: 32, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", background: `${mc}14`, color: mc, flexShrink: 0 }}>
                    <DirIcon dir={m.dir} size={14} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: T.text }}>{m.item_name}</div>
                    <span style={{ fontSize: 9, background: `${mc}14`, border: `1px solid ${mc}30`, padding: "1px 6px", borderRadius: 3, color: mc, textTransform: "uppercase", letterSpacing: .4, fontWeight: 600 }}>{isSt ? "ajuste" : m.tipo}</span>
                    {m.edited && <span style={{ fontSize: 9, color: T.accent, marginLeft: 6 }}>editado</span>}
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
        </>}
          </div>

        <MobileBottomNav T={T} view={view} invTab={invTab} onNavigate={(item) => navigateTo(item, { setView, setModal, setBatchQtys, setBatchSearch, setInvTab, showToast })} onMore={() => setMobileMenuOpen(true)} />
      </div>

      {mobileMenuOpen && (
        <MoreSheet
          T={T}
          theme={theme}
          setTheme={setTheme}
          currentUser={currentUser}
          ADMIN={ADMIN}
          isAdmin={isAdminUser}
          onClose={() => setMobileMenuOpen(false)}
          onNavigate={(item) => navigateTo(item, { setView, setModal, setBatchQtys, setBatchSearch, setInvTab, showToast })}
          onNewItem={openAddItemModal}
          onOpenTeam={() => { if (isAdminUser) { setModal({ type: "team" }); loadActiveLogins(); } }}
          onLogout={handleLogout}
          taskBadge={myOpenTasks}
        />
      )}

      {/* MODAIS */}
      {modal?.type === "team" && isAdminUser && (
        <Overlay T={T} onClose={() => setModal(null)} wide>
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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: activeLogins.has(name) ? "#22c55e" : T.textFaint }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: activeLogins.has(name) ? "#22c55e" : T.textGhost, display: "inline-block" }} />
                    {activeLogins.has(name) ? "ativo" : "aguardando"}
                  </span>
                </div>
                {name !== ADMIN && <button onClick={() => removeMember(name)} style={sbtn("#ef4444")}>Remover</button>}
              </div>
            ))}
          </div>
        </Overlay>
      )}

      {modal?.type === "cadastros" && (
        <Overlay T={T} onClose={() => setModal(null)} wide>
          <h3 style={mT}>Cadastros</h3>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 10 }}>
            <button
              onClick={() => setModal(m => ({ ...m, tab: "locais" }))}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 7, border: "none",
                background: (modal.tab || "locais") === "locais" ? `${T.accent}16` : "transparent",
                color: (modal.tab || "locais") === "locais" ? T.accent : T.textMuted,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            ><MapPin size={14} /> Locais</button>
            <button
              onClick={() => setModal(m => ({ ...m, tab: "categorias" }))}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 7, border: "none",
                background: modal.tab === "categorias" ? `${T.accent}16` : "transparent",
                color: modal.tab === "categorias" ? T.accent : T.textMuted,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            ><Tags size={14} /> Categorias</button>
          </div>

          {(modal.tab || "locais") === "locais" ? (
            <>
              <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 16 }}>
                Áreas onde os itens podem estar guardados. Marque como <b>Base</b> os locais dentro do almoxarifado — os demais ficam como áreas externas da planta (ex.: laminador, pátio, manutenção civil). Alterações são sincronizadas para toda a equipe.
              </p>
              {lbl("Adicionar local")}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input value={newSectorName} onChange={e => setNewSectorName(e.target.value)} placeholder="Nome do local (ex.: Laminador Sorocaba)" style={inp({ marginBottom: 0, flex: 1 })} onKeyDown={e => e.key === "Enter" && addSector()} />
                <button onClick={addSector} style={btn(T.accent)}>Adicionar</button>
              </div>
              {lbl(`Locais (${sectors.length})`)}
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {sectors.map(s => (
                  <div key={s.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 10px", background: T.panelAlt, borderRadius: 5, marginBottom: 4 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: T.text, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: sectorColor(s.name), flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => toggleSectorBase(s.name)}
                        title={s.is_base ? "Dentro do almoxarifado — clique para marcar como área externa" : "Área externa — clique para marcar como base (almoxarifado)"}
                        style={{
                          fontSize: 10, fontWeight: 700, borderRadius: 5, padding: "4px 9px", cursor: "pointer", fontFamily: "inherit",
                          border: `1px solid ${s.is_base ? "#f59e0b" : T.border}`,
                          background: s.is_base ? "#f59e0b1c" : "transparent",
                          color: s.is_base ? "#f59e0b" : T.textFaint,
                        }}
                      >{s.is_base ? "Base" : "Externa"}</button>
                      <button onClick={() => removeSector(s.name)} style={sbtn("#ef4444")}>Remover</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 16 }}>
                Categorias usadas para classificar os itens do inventário (filtros, gráficos, relatórios). Alterações são sincronizadas para toda a equipe.
              </p>
              {lbl("Adicionar categoria")}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Nome da categoria (ex.: Segurança)" style={inp({ marginBottom: 0, flex: 1 })} onKeyDown={e => e.key === "Enter" && addCategory()} />
                <button onClick={addCategory} style={btn(T.accent)}>Adicionar</button>
              </div>
              {lbl(`Categorias (${categories.length})`)}
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {categories.map(c => (
                  <div key={c.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "9px 10px", background: T.panelAlt, borderRadius: 5, marginBottom: 4 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: T.text, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: catColor(c.name), flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      <span style={{ fontSize: 10, color: T.textFaint, flexShrink: 0 }}>({catCounts[c.name]?.items || 0} {catCounts[c.name]?.items === 1 ? "item" : "itens"})</span>
                    </div>
                    <button onClick={() => removeCategory(c.name)} style={sbtn("#ef4444")}>Remover</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </Overlay>
      )}

      {modal?.type === "reports" && (() => {
        const catsUsed = new Set(items.map(i => i.categoria || "Diversos")).size;
        const sectorsUsed = new Set(items.flatMap(i => (i.locations || []).map(l => l.sector))).size;
        const critCount = items.filter(i => isLow(i) || ["defeito", "defeito parcial"].includes(i.condicao)).length;
        const customCount = items.filter(i => {
          const catv = i.categoria || "Diversos";
          if (reportFilter.categorias.length && !reportFilter.categorias.includes(catv)) return false;
          if (reportFilter.setores.length && !(i.locations || []).some(l => reportFilter.setores.includes(l.sector))) return false;
          return true;
        }).length;
        const REPORTS = [
          { key: "inventario", label: "Inventário completo", sub: `${items.length} itens · ${catsUsed} categorias · ${sectorsUsed} setores`, fn: exportItems, c: T.accent },
          { key: "movs", label: "Todas as movimentações", sub: `${movs.length} registros no histórico`, fn: exportMovs, c: T.textMuted },
          { key: "compras", label: "Lista de compras", sub: `${critCount} ${critCount === 1 ? "item crítico" : "itens críticos"} (estoque baixo + defeito)`, fn: exportCompras, c: "#eab308" },
        ];
        return (
          <Overlay T={T} onClose={() => setModal(null)}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <h3 style={{ ...mT, marginBottom: 4 }}>Relatórios CSV</h3>
            <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 14 }}>
              Resumo do inventário: <b style={{ color: T.text }}>{items.length}</b> itens · <b style={{ color: T.text }}>{catsUsed}</b> categorias · <b style={{ color: T.text }}>{sectorsUsed}</b> setores
            </div>
            {REPORTS.map(r => {
              const loading = exportingKey === r.key;
              return (
                <button key={r.key} onClick={() => runExport(r.key, r.fn)} disabled={!!exportingKey} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 14px", background: T.panelAlt, border: `1px solid ${T.border}`, borderRadius: 6, cursor: exportingKey ? "default" : "pointer", marginBottom: 6, fontFamily: "inherit", textAlign: "left", opacity: exportingKey && !loading ? .5 : 1 }} onMouseEnter={e => !exportingKey && (e.currentTarget.style.borderColor = r.c)} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.textBright }}>{r.label}</div>
                    <div style={{ fontSize: 10, color: T.textFaint }}>{loading ? "Gerando CSV..." : r.sub}</div>
                  </div>
                  {loading
                    ? <div style={{ width: 15, height: 15, border: `2px solid ${r.c}30`, borderTop: `2px solid ${r.c}`, borderRadius: "50%", animation: "spin .7s linear infinite", flexShrink: 0 }} />
                    : <Download size={15} style={{ color: r.c }} />}
                </button>
              );
            })}

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textBright, marginBottom: 2 }}>Relatório personalizado</div>
              <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 10 }}>Escolha categorias e/ou setores — deixe sem marcar para incluir todos</div>

              {lbl("Categoria")}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {categoryNames.map(c => {
                  const on = reportFilter.categorias.includes(c);
                  return (
                    <button key={c} onClick={() => setReportFilter(p => ({ ...p, categorias: on ? p.categorias.filter(x => x !== c) : [...p.categorias, c] }))}
                      style={{ padding: "5px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? T.accent : T.border}`, background: on ? `${T.accent}22` : T.panelAlt, color: on ? T.accent : T.textMuted }}>
                      {c}
                    </button>
                  );
                })}
              </div>

              {lbl("Setor")}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {sectorNames.map(s => {
                  const on = reportFilter.setores.includes(s);
                  return (
                    <button key={s} onClick={() => setReportFilter(p => ({ ...p, setores: on ? p.setores.filter(x => x !== s) : [...p.setores, s] }))}
                      style={{ padding: "5px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${on ? T.accent : T.border}`, background: on ? `${T.accent}22` : T.panelAlt, color: on ? T.accent : T.textMuted }}>
                      {s}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 10.5, color: T.textFaint, marginBottom: 8 }}>
                Este relatório incluirá <b style={{ color: customCount > 0 ? T.text : "#ef4444" }}>{customCount}</b> {customCount === 1 ? "item" : "itens"}.
              </div>

              <button onClick={() => runExport("custom", () => exportItemsCustom(reportFilter.categorias, reportFilter.setores))} disabled={!!exportingKey || customCount === 0} style={{ ...btn(T.accent), width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 13px", opacity: (exportingKey && exportingKey !== "custom") || customCount === 0 ? .5 : 1, cursor: (exportingKey || customCount === 0) ? "default" : "pointer" }}>
                {exportingKey === "custom"
                  ? <><div style={{ width: 14, height: 14, border: "2px solid #ffffff40", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin .7s linear infinite" }} /> Gerando CSV...</>
                  : <><Download size={14} /> Baixar relatório personalizado</>}
              </button>
            </div>
          </Overlay>
        );
      })()}

      {bulkModal?.type === "edit" && (
        <Overlay T={T} onClose={closeBulkModal}>
          <h3 style={{ ...mT, marginBottom: 4 }}>Editar {selectedIds.size} {selectedIds.size === 1 ? "item" : "itens"}</h3>
          <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 14 }}>Só os campos preenchidos abaixo serão alterados.</div>
          {lbl("Categoria")}
          <select value={bulkForm.categoria || ""} onChange={e => setBulkForm(p => ({ ...p, categoria: e.target.value }))} style={inp()}>
            <option value="">Não alterar</option>
            {categoryNames.map(c => <option key={c}>{c}</option>)}
          </select>
          {lbl("Status")}
          <select value={bulkForm.condicao || ""} onChange={e => setBulkForm(p => ({ ...p, condicao: e.target.value }))} style={inp()}>
            <option value="">Não alterar</option>
            {Object.entries(SC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={bulkEdit} style={{ ...btn(T.accent), width: "100%", padding: "11px", fontSize: 13, marginTop: 8 }}>Aplicar a {selectedIds.size} {selectedIds.size === 1 ? "item" : "itens"}</button>
        </Overlay>
      )}

      {bulkModal?.type === "move" && (
        <Overlay T={T} onClose={closeBulkModal}>
          <h3 style={{ ...mT, marginBottom: 4 }}>Mover {selectedIds.size} {selectedIds.size === 1 ? "item" : "itens"}</h3>
          <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 14 }}>Move a quantidade total de cada item selecionado para o novo local e registra uma transferência no histórico.</div>
          {lbl("Setor de destino *")}
          <select value={bulkForm.sector || ""} onChange={e => setBulkForm(p => ({ ...p, sector: e.target.value }))} style={inp()}>
            <option value="">Selecione</option>
            {sectorNames.map(s => <option key={s}>{s}</option>)}
          </select>
          {lbl("Sublocal (opcional)")}
          <input value={bulkForm.local || ""} onChange={e => setBulkForm(p => ({ ...p, local: e.target.value }))} style={inp()} />
          <button onClick={bulkMove} style={{ ...btn(T.accent), width: "100%", padding: "11px", fontSize: 13, marginTop: 8 }}>Mover {selectedIds.size} {selectedIds.size === 1 ? "item" : "itens"}</button>
        </Overlay>
      )}

      {modal?.type === "mov" && (
        <Overlay T={T} onClose={() => { setModal(null); setForm({}); }}>
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
                <div>{lbl("Setor *")}<select value={form.newSector || ""} onChange={e => setForm(p => ({ ...p, newSector: e.target.value }))} style={inp()}><option value="">Selecione</option>{sectorNames.map(s => <option key={s}>{s}</option>)}</select></div>
                <div>{lbl("Sublocal")}<input value={form.newLocal || ""} onChange={e => setForm(p => ({ ...p, newLocal: e.target.value }))} placeholder="ex: Bancada 1" style={inp()} /></div>
              </div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>{lbl("Tipo *")}<select value={form.tipo || ""} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} style={inp()}><option value="">Selecione</option>{(form.dir === "entrada" ? TIPOS_E : TIPOS_S).map(t => <option key={t}>{t}</option>)}</select></div>
                <div>{lbl("Responsável")}<div style={{ ...inp(), color: T.textMuted }}>{currentUser}</div></div>
              </div>
              {(form.tipo === "em uso" || form.tipo === "devolução") && (
                <div style={{ fontSize: 11, color: T.textFaint, marginTop: 6 }}>
                  {form.tipo === "em uso"
                    ? `Não retira do estoque — só marca parte da quantidade como em uso (hoje: ${modal.item.qty_in_use || 0} de ${tot(modal.item)}).`
                    : `Não soma estoque novo — só reduz a quantidade em uso (hoje: ${modal.item.qty_in_use || 0} em uso).`}
                </div>
              )}
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
                <div>{lbl("Setor destino *")}<select value={form.destSector || ""} onChange={e => setForm(p => ({ ...p, destSector: e.target.value }))} style={inp()}><option value="">Selecione</option>{sectorNames.map(s => <option key={s}>{s}</option>)}</select></div>
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

      {modal?.type === "batch" && (() => {
        const isSaida = batchForm.dir === "saida";
        const setQty = (id, max, v) => {
          let n = parseInt(v) || 0;
          n = Math.max(0, n);
          if (isSaida) n = Math.min(n, max);
          setBatchQtys(p => ({ ...p, [id]: n ? String(n) : "" }));
        };
        const batchItems = items.filter(it => it.name.toLowerCase().includes(batchSearch.toLowerCase()));
        const selectedEntries = Object.entries(batchQtys).filter(([, q]) => parseInt(q) > 0);
        const selectedCount = selectedEntries.length;
        const selectedUnits = selectedEntries.reduce((s, [, q]) => s + (parseInt(q) || 0), 0);
        return (
          <Overlay T={T} onClose={() => { setModal(null); setBatchQtys({}); setBatchSearch(""); }} wide>
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
            <input placeholder="Buscar item na lista..." value={batchSearch} onChange={e => setBatchSearch(e.target.value)} style={inp({ marginBottom: 8 })} />
            <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 5, marginBottom: 4 }}>
              {batchItems.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: T.textFaint }}>Nenhum item encontrado.</div>}
              {batchItems.map((it, i) => {
                const avail = tot(it);
                const q = parseInt(batchQtys[it.id]) || 0;
                const remaining = isSaida ? avail - q : avail + q;
                const atMax = isSaida && q >= avail;
                return (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: i < batchItems.length - 1 ? `1px solid ${T.borderSoft}` : "none", opacity: isSaida && avail === 0 ? .5 : 1 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                      <div style={{ fontSize: 9.5, color: T.textFaint, display: "flex", gap: 8 }}>
                        <span>Disponível: <b style={{ color: T.textMuted }}>{avail}</b></span>
                        {q > 0 && <span>Selecionado: <b style={{ color: isSaida ? "#ef4444" : "#22c55e" }}>{q}</b></span>}
                        {q > 0 && <span>Saldo: <b style={{ color: T.textMuted }}>{remaining}</b></span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                      <button onClick={() => setQty(it.id, avail, q - 1)} disabled={q <= 0} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${T.border}`, background: T.panelAlt, color: q <= 0 ? T.textFaint : T.text, fontSize: 14, cursor: q <= 0 ? "default" : "pointer", opacity: q <= 0 ? .5 : 1 }}>−</button>
                      <input type="number" min="0" max={isSaida ? avail : undefined} value={batchQtys[it.id] || ""} onChange={e => setQty(it.id, avail, e.target.value)} placeholder="0" style={{ width: 46, ...inp({ marginBottom: 0, textAlign: "center" }), padding: "5px 4px" }} />
                      <button onClick={() => setQty(it.id, avail, q + 1)} disabled={isSaida && (avail === 0 || atMax)} style={{ width: 26, height: 26, borderRadius: 5, border: `1px solid ${T.border}`, background: T.panelAlt, color: (isSaida && (avail === 0 || atMax)) ? T.textFaint : T.text, fontSize: 14, cursor: (isSaida && (avail === 0 || atMax)) ? "default" : "pointer", opacity: (isSaida && (avail === 0 || atMax)) ? .5 : 1 }}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px 12px", fontSize: 11, color: T.textFaint }}>
              <span>{selectedCount > 0 ? <><b style={{ color: T.text }}>{selectedCount}</b> {selectedCount === 1 ? "item" : "itens"} · <b style={{ color: T.text }}>{selectedUnits}</b> {selectedUnits === 1 ? "unidade" : "unidades"}</> : "Nenhum item selecionado"}</span>
            </div>
            <button onClick={submitBatch} disabled={selectedCount === 0} style={{ ...btn(batchForm.dir === "entrada" ? "#22c55e" : "#ef4444"), width: "100%", padding: "11px", fontSize: 13, opacity: selectedCount === 0 ? .5 : 1, cursor: selectedCount === 0 ? "default" : "pointer" }}>Confirmar Lote</button>
          </Overlay>
        );
      })()}

      {modal?.type === "editMov" && (
        <Overlay T={T} onClose={() => { setModal(null); setEditForm({}); }}>
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
          <Overlay T={T} onClose={() => setModal(null)} wide>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div><h3 style={mT}>{item.name}</h3><div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: T.textFaint, marginBottom: 4 }}>{item.sku}</div><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><CategoryBadge T={T} c={item.categoria || "Diversos"} color={catColor(item.categoria || "Diversos")} /><StatusDot T={T} s={item.condicao} />{item.rfid_tag && <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: T.textFaint }}>{item.rfid_tag}</span>}</div></div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 26, fontWeight: 700, color: isLow(item) ? "#eab308" : T.textBright }}>{tot(item)}</div>
                {!!item.valor_estimado && <div style={{ fontSize: 10, color: T.textFaint, fontFamily: "'DM Mono',monospace" }}>{fmtBRL(item.valor_estimado)}/un · {fmtBRL(item.valor_estimado * tot(item))} total</div>}
              </div>
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
            {(item.qty_in_use > 0) && <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, padding: "8px 10px", background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.25)", borderRadius: 5 }}>
                <div style={{ fontSize: 9, color: "#3b82f6", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>Em uso</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: "#3b82f6" }}>{item.qty_in_use}</div>
              </div>
              <div style={{ flex: 1, padding: "8px 10px", background: T.panelAlt, border: `1px solid ${T.border}`, borderRadius: 5 }}>
                <div style={{ fontSize: 9, color: T.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>Em estoque</div>
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 16, fontWeight: 700, color: T.textBright }}>{Math.max(0, tot(item) - item.qty_in_use)}</div>
              </div>
            </div>}
            {fc && <div style={{ padding: "7px 10px", background: `${T.accent}10`, border: `1px solid ${T.accent}20`, borderRadius: 5, fontSize: 11, color: T.textMuted, marginBottom: 12 }}>Consumo médio: <b>{fc.avg.toFixed(2)}/dia</b> — reposição estimada em <b>~{fc.days} dias</b></div>}
            {lbl("Alterar status")}
            <select value={item.condicao} onChange={e => updateStatus(item.id, e.target.value)} style={inp({ marginBottom: 12 })}>
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
                  <span style={{ marginLeft: "auto", color: T.textFaint, whiteSpace: "nowrap" }}>{fd(m.date_str)}</span>
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
        <Overlay T={T} onClose={() => { setModal(null); setItemDraft({}); }} wide>
          <h3 style={{ ...mT, marginBottom: 14 }}>Editar Item</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ gridColumn: "1/-1" }}>{lbl("Nome *")}<input value={itemDraft.name || ""} onChange={e => setItemDraft(p => ({ ...p, name: e.target.value }))} style={inp()} /></div>
            <div style={{ gridColumn: "1/-1" }}>{lbl("Categoria *")}<select value={itemDraft.categoria || "Diversos"} onChange={e => setItemDraft(p => ({ ...p, categoria: e.target.value }))} style={inp()}>{categoryNames.map(c => <option key={c}>{c}</option>)}</select></div>
            <div>{lbl("Estoque mínimo")}<input type="number" value={itemDraft.min_stock || 0} onChange={e => setItemDraft(p => ({ ...p, min_stock: e.target.value }))} style={inp()} /></div>
            <div>{lbl("Qtd. em uso")}<input type="number" min="0" value={itemDraft.qty_in_use ?? 0} onChange={e => setItemDraft(p => ({ ...p, qty_in_use: e.target.value }))} style={inp()} /></div>
            <div>{lbl("Valor estimado (R$)")}<input type="number" min="0" step="0.01" value={itemDraft.valor_estimado ?? ""} onChange={e => setItemDraft(p => ({ ...p, valor_estimado: e.target.value }))} placeholder="0,00" style={inp()} /></div>
            <div style={{ gridColumn: "1/-1" }}>{lbl("Tag RFID / EPC")}<input value={itemDraft.rfid_tag || ""} onChange={e => setItemDraft(p => ({ ...p, rfid_tag: e.target.value }))} style={inp({ fontFamily: "'DM Mono',monospace" })} /></div>
          </div>
          {lbl("Locais")}
          {(itemDraft.locations || []).map((loc, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 70px 32px", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <select value={loc.sector} onChange={e => { const v = e.target.value; setItemDraft(p => ({ ...p, locations: p.locations.map((l, i) => i === idx ? { ...l, sector: v } : l) })); }} style={inp({ marginBottom: 0, fontSize: 11 })}>{sectorNames.map(s => <option key={s}>{s}</option>)}</select>
              <input value={loc.local} placeholder="Sublocal" onChange={e => { const v = e.target.value; setItemDraft(p => ({ ...p, locations: p.locations.map((l, i) => i === idx ? { ...l, local: v } : l) })); }} style={inp({ marginBottom: 0, fontSize: 11 })} />
              <input type="number" value={loc.qty} onChange={e => { const v = parseInt(e.target.value) || 0; setItemDraft(p => ({ ...p, locations: p.locations.map((l, i) => i === idx ? { ...l, qty: v } : l) })); }} style={inp({ marginBottom: 0, fontSize: 11, textAlign: "center" })} />
              <button onClick={() => setItemDraft(p => ({ ...p, locations: p.locations.filter((_, i) => i !== idx) }))} style={{ ...sbtn("#ef4444"), height: 32, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>
            </div>
          ))}
          <button onClick={() => setItemDraft(p => ({ ...p, locations: [...(p.locations || []), { lid: Date.now(), sector: sectorNames[0], local: "", qty: 0 }] }))} style={{ ...ghost(), marginBottom: 12, fontSize: 11 }}>+ Adicionar local</button>
          <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 12 }}>Total: <b style={{ color: T.text }}>{(itemDraft.locations || []).reduce((s, l) => s + (parseInt(l.qty) || 0), 0)}</b> unidades</div>
          <button onClick={submitEditItem} style={{ ...btn(T.accent), width: "100%", padding: "11px", fontSize: 13 }}>Salvar alterações</button>
        </Overlay>
      )}

      {modal?.type === "add" && (
        <Overlay T={T} onClose={() => setModal(null)}>
          <h3 style={{ ...mT, marginBottom: 4 }}>Novo Item</h3>
          <div style={{ fontSize: 11, color: T.textFaint, marginBottom: 14 }}>O código do item (ex.: CBA-0077) é gerado automaticamente ao salvar.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ gridColumn: "1/-1" }}>{lbl("Nome *")}<input value={addItem.name} onChange={e => setAddItem(p => ({ ...p, name: e.target.value }))} placeholder="Nome do equipamento" style={inp()} /></div>
            <div style={{ gridColumn: "1/-1" }}>{lbl("Categoria *")}<select value={addItem.categoria} onChange={e => setAddItem(p => ({ ...p, categoria: e.target.value }))} style={inp()}>{categoryNames.map(c => <option key={c}>{c}</option>)}</select></div>
            <div>{lbl("Qtd. inicial")}<input type="number" value={addItem.qty} onChange={e => setAddItem(p => ({ ...p, qty: e.target.value }))} style={inp()} /></div>
            <div>{lbl("Estoque mínimo")}<input type="number" value={addItem.min_stock} onChange={e => setAddItem(p => ({ ...p, min_stock: e.target.value }))} style={inp()} /></div>
            <div>{lbl("Setor inicial")}<select value={addItem.sector} onChange={e => setAddItem(p => ({ ...p, sector: e.target.value }))} style={inp()}>{sectorNames.map(s => <option key={s}>{s}</option>)}</select></div>
            <div>{lbl("Status")}<select value={addItem.condicao} onChange={e => setAddItem(p => ({ ...p, condicao: e.target.value }))} style={inp()}>{Object.entries(SC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div>{lbl("Valor estimado (R$, opcional)")}<input type="number" min="0" step="0.01" value={addItem.valor_estimado} onChange={e => setAddItem(p => ({ ...p, valor_estimado: e.target.value }))} placeholder="0,00" style={inp()} /></div>
            <div style={{ gridColumn: "1/-1" }}>{lbl("Tag RFID / EPC (opcional)")}<input value={addItem.rfid_tag} onChange={e => setAddItem(p => ({ ...p, rfid_tag: e.target.value }))} placeholder="E2801170..." style={inp({ fontFamily: "'DM Mono',monospace" })} /></div>
          </div>
          <button onClick={submitAdd} style={{ ...btn(T.accent), width: "100%", padding: "11px", fontSize: 13, marginTop: 8 }}>Adicionar ao inventário</button>
        </Overlay>
      )}

      {/* Renderizado por último de propósito: askConfirm() pode ser disparado a
          partir de QUALQUER modal acima (ex.: remover membro da equipe, remover
          local, excluir item). Como todos os overlays usam o mesmo z-index,
          a ordem no DOM decide quem fica por cima — mantendo este bloco no
          final garante que a confirmação sempre apareça acima do modal que a
          originou, em vez de renderizar escondida atrás dele. */}
      {confirm && <Overlay T={T} onClose={() => setConfirm(null)}>
        <p style={{ fontSize: 13, color: T.text, marginBottom: 18, lineHeight: 1.6 }}>{confirm.message}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setConfirm(null)} style={{ ...ghost(), flex: 1 }}>Cancelar</button>
          <button onClick={() => { const f = confirm.onConfirm; setConfirm(null); f(); }} style={{ ...btn("#dc2626"), flex: 1 }}>Confirmar</button>
        </div>
      </Overlay>}
    </div>
  );
}