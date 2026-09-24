// Navegação principal do app.
// Desktop (≥960px): sidebar fixa à esquerda (classe .sidebar-desktop).
// Mobile (<960px): header compacto + barra de abas fixa embaixo
// (classes .mobile-topbar / .mobile-bottom-nav) — a visibilidade de cada
// bloco é controlada só por CSS (@media), sem depender de JS medir a tela.
import {
  LayoutDashboard, Boxes, ArrowLeftRight, Layers, FileText, Bell,
  MapPin, Map, Tags, Truck, Settings, Moon, Sun, LogOut, Search, MoreHorizontal, X, Plus,
  FolderOpen, ClipboardCheck, QrCode,
} from "lucide-react";
import { NAV_ITEMS } from "../../constants.js";

const ICONS = {
  LayoutDashboard, Boxes, ArrowLeftRight, Layers, FileText, Bell, MapPin, Map, Tags, Truck, Settings, FolderOpen, ClipboardCheck, QrCode,
};

// `badgeCount` (opcional): contador vermelho tipo "notificação" ao lado do
// rótulo — usado hoje só pelo item "Tarefas" (minhas tarefas em aberto),
// mesmo padrão visual do contador do sino (TopBar), mas por item de menu em
// vez de global. Só aparece quando > 0; nunca conflita com `item.soon`
// (nenhum item tem as duas coisas ao mesmo tempo hoje).
function NavButton({ item, active, T, onClick, compact, badgeCount }) {
  const Icon = ICONS[item.icon];
  return (
    <button
      onClick={onClick}
      title={item.soon ? `${item.label} — em breve` : item.label}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: compact ? "9px 10px" : "9px 12px", borderRadius: 7, border: "none",
        background: active ? `${T.accent}16` : "transparent",
        color: active ? T.accent : item.soon ? T.textFaint : T.textMuted,
        fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: item.soon ? "default" : "pointer",
        fontFamily: "inherit", textAlign: "left", opacity: item.soon ? .6 : 1,
      }}
    >
      {Icon && <Icon size={16} strokeWidth={2.1} style={{ flexShrink: 0 }} />}
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
      {item.soon && <span style={{ fontSize: 8.5, fontWeight: 700, color: T.textFaint, background: T.panelAlt, padding: "2px 5px", borderRadius: 3, flexShrink: 0 }}>em breve</span>}
      {!item.soon && badgeCount > 0 && <span style={{ fontSize: 9.5, fontWeight: 700, color: "#fff", background: "#ef4444", minWidth: 16, height: 16, borderRadius: 8, padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{badgeCount > 99 ? "99+" : badgeCount}</span>}
    </button>
  );
}

// Dispara a ação de um item de navegação: troca de view, abre modal, ou
// (se `soon`) apenas avisa que ainda não existe. `item.tab` (opcional) marca
// que o destino é uma aba interna de uma mega-view (ex.: "Movimentações"
// dentro de "Inventário") — nesse caso também troca a aba ativa, além da
// view em si.
export function navigate(item, { setView, setModal, setBatchQtys, setBatchSearch, setInvTab, showToast }) {
  if (item.soon) { showToast(`${item.label} — em breve`, "warn"); return; }
  if (item.modal === "batch") { setBatchQtys({}); setBatchSearch && setBatchSearch(""); setModal({ type: "batch" }); return; }
  if (item.modal === "reports") { setModal({ type: "reports" }); return; }
  if (item.modal === "cadastros") { setModal({ type: "cadastros", tab: "locais" }); return; }
  if (item.jump) { setView(item.jump); if (item.tab && setInvTab) setInvTab(item.tab); return; }
  setView(item.key);
  if (item.tab && setInvTab) setInvTab(item.tab);
}

// Agrupa NAV_ITEMS pela propriedade `section`, preservando a ordem original
// — usado pra desenhar divisórias visuais na sidebar (desktop) e no sheet
// "Mais opções" (mobile). Só afeta a apresentação, nenhum item muda de
// comportamento por causa disso.
function groupBySection(items) {
  const groups = [];
  for (const item of items) {
    const key = item.section || "";
    let g = groups[groups.length - 1];
    if (!g || g.section !== key) { g = { section: key, items: [] }; groups.push(g); }
    g.items.push(item);
  }
  return groups;
}

function SectionLabel({ T, children }) {
  return (
    <div style={{ fontSize: 9.5, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, padding: "10px 10px 4px" }}>
      {children}
    </div>
  );
}

export function Sidebar({ T, view, currentUser, isAdmin, theme, setTheme, onNavigate, onNewItem, onOpenTeam, onLogout, taskBadge = 0 }) {
  return (
    <aside className="sidebar-desktop" style={{
      position: "fixed", top: 0, left: 0, bottom: 0, width: 226, background: T.panel,
      borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", zIndex: 90,
    }}>
      <div style={{ padding: "18px 16px 14px" }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: T.textFaint, fontWeight: 700, textTransform: "uppercase" }}>Inovacode</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textBright }}>Base de Dados</div>
      </div>

      <button onClick={onNewItem} style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6, margin: "0 12px 14px",
        background: T.accent, border: "none", color: "#fff", padding: "9px", borderRadius: 7,
        fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
      }}><Plus size={15} strokeWidth={2.5} /> Novo Item</button>

      <nav style={{ flex: 1, overflowY: "auto", padding: "0 10px", display: "flex", flexDirection: "column" }}>
        {groupBySection(NAV_ITEMS.filter(i => !i.desktopHidden)).map((group, gi) => (
          <div key={group.section || gi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {group.section && <SectionLabel T={T}>{group.section}</SectionLabel>}
            {group.items.map(item => (
              <NavButton key={item.key} item={item} T={T} active={!item.modal && !item.jump && !item.soon && view === item.key} onClick={() => onNavigate(item)} badgeCount={item.key === "tarefas" ? taskBadge : 0} />
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: 12, borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
        <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", borderRadius: 6,
          border: `1px solid ${T.border}`, background: "transparent", color: T.textMuted, fontSize: 11.5,
          cursor: "pointer", fontFamily: "inherit",
        }}>{theme === "dark" ? <Moon size={14} /> : <Sun size={14} />} {theme === "dark" ? "Modo escuro" : "Modo claro"}</button>
        <button onClick={onOpenTeam} disabled={!isAdmin} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", background: "none", border: "none",
          color: T.textMuted, fontSize: 11.5, fontWeight: 600, cursor: isAdmin ? "pointer" : "default", fontFamily: "inherit",
        }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: `${T.accent}22`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{(currentUser || "?").slice(0, 1)}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser}{isAdmin ? <span style={{ color: T.textFaint, fontWeight: 500 }}> · admin</span> : ""}</span>
        </button>
        <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", borderRadius: 6, border: "none", background: "transparent", color: T.textFaint, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit" }}>
          <LogOut size={14} /> Sair
        </button>
      </div>
    </aside>
  );
}

export function TopBar({ T, title, search, onSearch, onSearchSubmit, alertCount, onAlertClick, theme, setTheme }) {
  return (
    <div className="topbar-desktop" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
      padding: "14px 24px", borderBottom: `1px solid ${T.border}`, background: T.panel,
      position: "sticky", top: 0, zIndex: 80,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.textBright }}>{title}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {onSearch && (
          <div style={{ position: "relative" }}>
            <Search size={13} strokeWidth={2.25} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.textFaint, pointerEvents: "none" }} />
            <input
              id="global-search-input"
              value={search}
              onChange={e => onSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && onSearchSubmit && onSearchSubmit()}
              placeholder="Buscar item, código ou categoria..."
              style={{ width: 240, padding: "7px 44px 7px 30px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.input, color: T.text, fontSize: 12, outline: "none", fontFamily: "inherit" }}
            />
            <kbd style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 9.5, fontWeight: 600, color: T.textFaint, background: T.panelAlt, border: `1px solid ${T.border}`, borderRadius: 4, padding: "1.5px 5px", pointerEvents: "none", fontFamily: "inherit" }}>Ctrl+K</kbd>
          </div>
        )}
        <button onClick={onAlertClick} aria-label="Ver alertas" style={{ position: "relative", width: 32, height: 32, borderRadius: 6, border: `1px solid ${T.border}`, background: T.panelAlt, color: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <Bell size={15} />
          {alertCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 8, minWidth: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{alertCount > 99 ? "99+" : alertCount}</span>}
        </button>
        <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${T.border}`, background: T.panelAlt, color: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </div>
    </div>
  );
}

export function MobileTopBar({ T, currentUser, alertCount, onAlertClick, onMenu }) {
  return (
    <div className="mobile-topbar" style={{
      display: "none", alignItems: "center", justifyContent: "space-between", gap: 10,
      padding: "10px 14px", borderBottom: `1px solid ${T.border}`, background: T.panel,
      position: "sticky", top: 0, zIndex: 90,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 8.5, letterSpacing: 2, color: T.textFaint, fontWeight: 700, textTransform: "uppercase" }}>Inovacode</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Base de Dados</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button onClick={onAlertClick} aria-label="Ver alertas" style={{ position: "relative", width: 30, height: 30, borderRadius: 6, border: `1px solid ${T.border}`, background: T.panelAlt, color: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bell size={14} />
          {alertCount > 0 && <span style={{ position: "absolute", top: -3, right: -3, background: "#ef4444", color: "#fff", fontSize: 8.5, fontWeight: 700, borderRadius: 8, minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{alertCount > 99 ? "99+" : alertCount}</span>}
        </button>
        <button onClick={onMenu} style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${T.border}`, background: T.panelAlt, color: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
          {(currentUser || "?").slice(0, 1)}
        </button>
      </div>
    </div>
  );
}

const PRIMARY_MOBILE = NAV_ITEMS.filter(i => i.primary);

export function MobileBottomNav({ T, view, invTab, onNavigate, onMore }) {
  return (
    <nav className="mobile-bottom-nav" style={{
      display: "none", position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 90,
      background: T.panel, borderTop: `1px solid ${T.border}`,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      <div style={{ display: "flex" }}>
        {PRIMARY_MOBILE.map(item => {
          const Icon = ICONS[item.icon];
          // Itens com `tab` apontam pra uma aba interna de uma mega-view
          // (ex.: "Inventário" e "Movimentações" hoje vivem na mesma view
          // "inventario") — o destaque do ícone certo depende da aba ativa,
          // não só da view, senão os dois ícones ficariam acesos juntos.
          const active = item.tab ? (view === (item.jump || item.key) && invTab === item.tab) : (view === item.key);
          return (
            <button key={item.key} onClick={() => onNavigate(item)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "8px 4px 7px", border: "none", background: "transparent",
              color: active ? T.accent : T.textFaint, fontFamily: "inherit",
            }}>
              {Icon && <Icon size={19} strokeWidth={active ? 2.4 : 2} />}
              <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500 }}>{item.label}</span>
            </button>
          );
        })}
        <button onClick={onMore} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 4px 7px", border: "none", background: "transparent", color: T.textFaint, fontFamily: "inherit" }}>
          <MoreHorizontal size={19} strokeWidth={2} />
          <span style={{ fontSize: 9.5, fontWeight: 500 }}>Mais</span>
        </button>
      </div>
    </nav>
  );
}

export function MoreSheet({ T, theme, setTheme, currentUser, isAdmin, onClose, onNavigate, onNewItem, onOpenTeam, onLogout, taskBadge = 0 }) {
  const extra = NAV_ITEMS.filter(i => !i.primary);
  return (
    <div style={{ position: "fixed", inset: 0, background: T.overlay, zIndex: 1000, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.panel, borderRadius: "14px 14px 0 0", width: "100%", maxHeight: "80vh", overflowY: "auto", padding: "10px 12px calc(16px + env(safe-area-inset-bottom, 0px))" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border, margin: "4px auto 12px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 6px 10px" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.textBright }}>Mais opções</span>
          <button onClick={onClose} aria-label="Fechar menu" style={{ background: "none", border: "none", color: T.textFaint, padding: 4, cursor: "pointer" }}><X size={18} /></button>
        </div>
        <button onClick={() => { onNewItem(); onClose(); }} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", margin: "0 0 10px",
          background: T.accent, border: "none", color: "#fff", padding: "10px", borderRadius: 8,
          fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
        }}><Plus size={15} strokeWidth={2.5} /> Novo Item</button>
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 10 }}>
          {groupBySection(extra).map((group, gi) => (
            <div key={group.section || gi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {group.section && <SectionLabel T={T}>{group.section}</SectionLabel>}
              {group.items.map(item => <NavButton key={item.key} item={item} T={T} active={false} compact onClick={() => { onNavigate(item); onClose(); }} badgeCount={item.key === "tarefas" ? taskBadge : 0} />)}
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 7, border: "none", background: "transparent", color: T.textMuted, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />} {theme === "dark" ? "Modo escuro" : "Modo claro"}
          </button>
          {isAdmin && (
            <button onClick={() => { onOpenTeam(); onClose(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 7, border: "none", background: "transparent", color: T.textMuted, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              Gerenciar equipe
            </button>
          )}
          <button onClick={() => { onClose(); onLogout(); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 7, border: "none", background: "transparent", color: "#ef4444", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <LogOut size={16} /> Sair ({currentUser})
          </button>
        </div>
      </div>
    </div>
  );
}
