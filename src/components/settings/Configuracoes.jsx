// Aba "Configurações" — preferências pessoais do app: aparência (tema +
// cor de destaque) e segurança (trocar senha), além de um atalho pra
// "Gerenciar equipe" (admin) e um lembrete rápido de quem está logado.
// Tema/cor de destaque são preferência de DISPOSITIVO (mesmo padrão que o
// modo escuro já usava) — não são sincronizados entre aparelhos, só o
// navegador atual lembra.
import { useState } from "react";
import { Moon, Sun, Check, Lock, User, Users, Info } from "lucide-react";
import { PanelCard } from "../dashboard/pieces.jsx";
import { makeStyleHelpers, ACCENT_PRESETS } from "../../theme.js";

export function Configuracoes({ T, theme, setTheme, accentKey, setAccentKey, currentUser, isAdmin, onOpenTeam, onChangePassword }) {
  const { inp, btn, ghost } = makeStyleHelpers(T);
  const [pwd, setPwd] = useState({ atual: "", nova: "", confirmar: "" });
  const [pwdErr, setPwdErr] = useState("");
  const [saving, setSaving] = useState(false);

  const submitPwd = async () => {
    setPwdErr("");
    if (!pwd.atual) return setPwdErr("Digite sua senha atual");
    if (pwd.nova.length < 10) return setPwdErr("A nova senha precisa ter ao menos 10 caracteres");
    if (pwd.nova !== pwd.confirmar) return setPwdErr("As senhas não coincidem");
    setSaving(true);
    const ok = await onChangePassword(pwd.atual, pwd.nova);
    setSaving(false);
    if (ok) setPwd({ atual: "", nova: "", confirmar: "" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      {/* aparência */}
      <PanelCard T={T} title="Aparência">
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Tema</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setTheme("dark")} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", borderRadius: 7,
                border: `1px solid ${theme === "dark" ? T.accent : T.border}`, background: theme === "dark" ? `${T.accent}14` : "transparent",
                color: theme === "dark" ? T.accent : T.textMuted, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
              }}><Moon size={15} /> Escuro</button>
              <button onClick={() => setTheme("light")} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", borderRadius: 7,
                border: `1px solid ${theme === "light" ? T.accent : T.border}`, background: theme === "light" ? `${T.accent}14` : "transparent",
                color: theme === "light" ? T.accent : T.textMuted, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
              }}><Sun size={15} /> Claro</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Cor de destaque</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {ACCENT_PRESETS.map(p => {
                const active = accentKey === p.key;
                const swatch = theme === "light" ? p.light : p.dark;
                return (
                  <button key={p.key} onClick={() => setAccentKey(p.key)} title={p.label} aria-label={`Cor de destaque: ${p.label}`} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 2,
                  }}>
                    <span style={{
                      width: 34, height: 34, borderRadius: "50%", background: swatch, display: "flex", alignItems: "center", justifyContent: "center",
                      border: active ? `2px solid ${T.textBright}` : "2px solid transparent", boxShadow: active ? `0 0 0 2px ${swatch}` : "none",
                    }}>{active && <Check size={15} color="#fff" strokeWidth={3} />}</span>
                    <span style={{ fontSize: 10, color: active ? T.textBright : T.textFaint, fontWeight: active ? 700 : 500 }}>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </PanelCard>

      {/* segurança */}
      <PanelCard T={T} title="Segurança">
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxWidth: 340 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: .5, display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={12} /> Trocar senha
          </div>
          <input type="password" placeholder="Senha atual" value={pwd.atual} onChange={e => setPwd(p => ({ ...p, atual: e.target.value }))} style={inp({ marginBottom: 0 })} />
          <input type="password" placeholder="Nova senha" value={pwd.nova} onChange={e => setPwd(p => ({ ...p, nova: e.target.value }))} style={inp({ marginBottom: 0 })} onKeyDown={e => e.key === "Enter" && submitPwd()} />
          <input type="password" placeholder="Confirmar nova senha" value={pwd.confirmar} onChange={e => setPwd(p => ({ ...p, confirmar: e.target.value }))} style={inp({ marginBottom: 0 })} onKeyDown={e => e.key === "Enter" && submitPwd()} />
          {pwdErr && <div style={{ fontSize: 11, color: "#ef4444" }}>{pwdErr}</div>}
          <button onClick={submitPwd} disabled={saving} style={{ ...btn(T.accent), padding: "9px", opacity: saving ? .6 : 1 }}>{saving ? "Salvando..." : "Salvar nova senha"}</button>
        </div>
      </PanelCard>

      {/* conta */}
      <PanelCard T={T} title="Conta">
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: "50%", background: `${T.accent}22`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{(currentUser || "?").slice(0, 1)}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textBright }}>{currentUser}{isAdmin && <span style={{ color: T.textFaint, fontWeight: 500 }}> · admin</span>}</div>
              <div style={{ fontSize: 10.5, color: T.textFaint, display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <Info size={11} /> Renomear conta ainda não é suportado — envolve histórico de movimentações e responsáveis vinculados ao seu nome hoje.
              </div>
            </div>
          </div>
          {isAdmin && (
            <button onClick={onOpenTeam} style={{ ...ghost(), display: "flex", alignItems: "center", justifyContent: "center", gap: 7, alignSelf: "flex-start" }}>
              <Users size={14} /> Gerenciar equipe
            </button>
          )}
        </div>
      </PanelCard>
    </div>
  );
}
