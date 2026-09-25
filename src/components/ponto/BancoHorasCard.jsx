// Card "Banco de horas" da Visão Geral. Regras de cálculo em bancoHoras.js.
// Visual refeito em 25/09/2026 (usuário não gostou da versão só-texto):
// saldo em destaque com selo de status, linha do tempo do dia (07:00–16:00,
// com as faixas de tolerância) e mini-estatísticas do mês. Admin vê uma
// linha por pessoa. A RLS do banco garante que não-admin só recebe os
// próprios registros.
import { useEffect, useState, useMemo } from "react";
import { Clock, ChevronRight, ScanLine } from "lucide-react";
import { bancoDeHoras, fmtSaldo, fmtMin, corSaldo, hojeKey, JORNADA } from "./bancoHoras.js";

const MONO = "'DM Mono',monospace";
const VERDE = "#16a34a", VERMELHO = "#ef4444";

const agoraMin = () => {
  const [h, m] = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  return (h % 24) * 60 + m;
};

function status(min) {
  if (min > 0) return { txt: "Hora extra", cor: VERDE };
  if (min < 0) return { txt: "Devendo", cor: VERMELHO };
  return { txt: "Em dia", cor: null };
}

function Pill({ T, min }) {
  const s = status(min);
  const c = s.cor || T.textMuted;
  return <span style={{ fontSize: 11, fontWeight: 700, color: c, background: `${c}18`, border: `1px solid ${c}33`, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>{s.txt}</span>;
}

// Linha do tempo do dia: 06:00 → 17:00, com a jornada (07:00–16:00), as
// faixas de tolerância (±10 min) e o trecho já trabalhado.
function LinhaDoDia({ T, hoje }) {
  const INI = 6 * 60, FIM = 17 * 60;
  const pos = (m) => `${((Math.min(Math.max(m, INI), FIM) - INI) / (FIM - INI)) * 100}%`;
  const larg = (a, b) => `${((Math.min(Math.max(b, INI), FIM) - Math.min(Math.max(a, INI), FIM)) / (FIM - INI)) * 100}%`;
  const tol = JORNADA.tolerancia;
  const e = hoje?.entradaMin ?? null;
  const fimTrecho = hoje ? (hoje.saidaMin ?? agoraMin()) : null;
  const emAndamento = hoje && hoje.saidaMin == null;

  return (
    <div>
      <div style={{ position: "relative", height: 10, borderRadius: 5, background: T.panelAlt2, overflow: "hidden" }}>
        {/* jornada */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: pos(JORNADA.entrada), width: larg(JORNADA.entrada, JORNADA.saida), background: T.panelAlt2 }} />
        {/* tolerâncias */}
        {[JORNADA.entrada, JORNADA.saida].map(m => (
          <div key={m} style={{ position: "absolute", top: 0, bottom: 0, left: pos(m - tol), width: larg(m - tol, m + tol), background: `${T.accent}22` }} />
        ))}
        {/* trabalhado */}
        {e != null && (
          <div style={{
            position: "absolute", top: 0, bottom: 0, left: pos(e), width: larg(e, fimTrecho), borderRadius: 5,
            background: emAndamento ? `repeating-linear-gradient(45deg, ${T.accent}, ${T.accent} 6px, ${T.accent}cc 6px, ${T.accent}cc 12px)` : T.accent,
          }} />
        )}
      </div>
      <div style={{ position: "relative", height: 16, marginTop: 4, fontSize: 10, color: T.textFaint, fontFamily: MONO }}>
        <span style={{ position: "absolute", left: pos(JORNADA.entrada), transform: "translateX(-50%)" }}>07:00</span>
        <span style={{ position: "absolute", left: pos(12 * 60), transform: "translateX(-50%)" }}>12:00</span>
        <span style={{ position: "absolute", left: pos(JORNADA.saida), transform: "translateX(-50%)" }}>16:00</span>
      </div>
    </div>
  );
}

function Marcacao({ T, label, valor, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: T.textFaint, textTransform: "uppercase", letterSpacing: .6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: valor ? T.textBright : T.textGhost, lineHeight: 1.3 }}>{valor || "--:--"}</div>
      {sub && <div style={{ fontSize: 11, color: T.textFaint }}>{sub}</div>}
    </div>
  );
}

export function BancoHorasCard({ T, sb, currentUser, isAdmin, onOpen }) {
  const [regs, setRegs] = useState(null);

  useEffect(() => {
    sb("ponto_registros?select=pessoa,tipo,registrado_em&order=registrado_em.asc&limit=10000")
      .then(r => setRegs(r || []))
      .catch(() => setRegs([]));
  }, [sb]);

  const banco = useMemo(() => bancoDeHoras(regs || []), [regs]);
  const mes = hojeKey().slice(0, 7);
  const hoje = hojeKey();

  const linhas = useMemo(() => {
    // Não-admin: a RLS só devolve os próprios registros, então usa o que vier
    // (o nome digitado no login pode diferir em maiúsculas/acentos do nome
    // gravado no registro — ex.: "rodrigo junior" x "Rodrigo Júnior").
    const nomes = isAdmin ? Object.keys(banco).sort() : [Object.keys(banco)[0] || currentUser];
    return nomes.map(nome => {
      const b = banco[nome] || { total: 0, dias: [] };
      const doMes = b.dias.filter(d => d.dia.startsWith(mes));
      return {
        nome,
        total: b.total,
        mes: doMes.reduce((s, d) => s + d.saldo, 0),
        diasMes: doMes.length,
        hoje: b.dias.find(d => d.dia === hoje) || null,
      };
    });
  }, [banco, isAdmin, currentUser, mes, hoje]);

  const card = { background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18, marginBottom: 16, boxShadow: T.shadow };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: `${T.accent}18`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Clock size={16} strokeWidth={2.25} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.textBright }}>Banco de horas</div>
        <div style={{ fontSize: 11, color: T.textFaint }}>07:00–16:00 · tolerância 10 min</div>
      </div>
      <button onClick={onOpen} style={{ marginLeft: "auto", background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 2, fontFamily: "inherit", flexShrink: 0 }}>
        Ver ponto <ChevronRight size={14} />
      </button>
    </div>
  );

  if (regs === null) return <div style={card}>{header}<div style={{ color: T.textFaint, fontSize: 12 }}>Carregando…</div></div>;

  // ── Admin: uma linha por pessoa ──
  if (isAdmin) {
    return (
      <div style={card}>
        {header}
        {linhas.length === 0 ? <div style={{ color: T.textFaint, fontSize: 12 }}>Nenhum registro de ponto ainda.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {linhas.map(l => (
              <div key={l.nome} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, background: T.panelAlt }}>
                <span style={{ width: 32, height: 32, borderRadius: "50%", background: `${T.accent}22`, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {l.nome.trim().slice(0, 1).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: T.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nome}</div>
                  <div style={{ fontSize: 11, color: T.textFaint, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.hoje ? `Hoje ${fmtMin(l.hoje.entradaMin)} → ${l.hoje.semSaida ? "…" : fmtMin(l.hoje.saidaMin)}` : "Sem registro hoje"}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: T.textFaint }}>Mês</div>
                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: corSaldo(l.mes) || T.textMuted }}>{fmtSaldo(l.mes)}</div>
                </div>
                <div style={{ textAlign: "right", minWidth: 58, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: T.textFaint }}>Total</div>
                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: corSaldo(l.total) || T.textMuted }}>{fmtSaldo(l.total)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Pessoa: o próprio saldo ──
  const l = linhas[0];
  const cor = corSaldo(l.total) || T.textBright;
  const h = l.hoje;

  return (
    <div style={card}>
      {header}
      <div className="bh-grid" style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 2fr", gap: 18 }}>
        <style>{`@media (max-width: 640px){ .bh-grid{ grid-template-columns: 1fr !important; } }`}</style>

        {/* Saldo */}
        <div style={{ borderRadius: 10, padding: "14px 16px", background: `${corSaldo(l.total) || T.textMuted}0f`, border: `1px solid ${(corSaldo(l.total) || T.textMuted)}26`, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>Saldo total</span>
            <Pill T={T} min={l.total} />
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, fontFamily: MONO, color: cor, lineHeight: 1, letterSpacing: -1 }}>{fmtSaldo(l.total)}</div>
          <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: T.textFaint }}>
            <span>Mês <b style={{ fontFamily: MONO, color: corSaldo(l.mes) || T.textMuted }}>{fmtSaldo(l.mes)}</b></span>
            <span>{l.diasMes} {l.diasMes === 1 ? "dia registrado" : "dias registrados"}</span>
          </div>
        </div>

        {/* Hoje */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Hoje</span>
            {h && <span style={{ fontSize: 11.5, fontFamily: MONO, fontWeight: 700, color: corSaldo(h.saldo) || T.textFaint }}>{fmtSaldo(h.saldo)}</span>}
            {h?.semSaida && <span style={{ fontSize: 10.5, fontWeight: 700, color: T.accent, background: `${T.accent}18`, padding: "2px 8px", borderRadius: 999 }}>● trabalhando</span>}
          </div>

          {h ? (
            <>
              <div style={{ display: "flex", gap: 12 }}>
                <Marcacao T={T} label="Entrada" valor={fmtMin(h.entradaMin)} />
                <Marcacao T={T} label="Saída" valor={h.saidaMin != null ? fmtMin(h.saidaMin) : null} sub={h.saidaMin == null ? "previsão 16:00" : null} />
              </div>
              <LinhaDoDia T={T} hoje={h} />
            </>
          ) : (
            <button onClick={onOpen} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 10, cursor: "pointer", textAlign: "left",
              border: `1px dashed ${T.accent}66`, background: `${T.accent}0d`, color: T.text, fontFamily: "inherit",
            }}>
              <ScanLine size={24} color={T.accent} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                <b style={{ display: "block", fontSize: 13 }}>Você ainda não registrou a entrada</b>
                <span style={{ fontSize: 11.5, color: T.textFaint }}>Toque para ir ao Ponto e escanear o QR Code</span>
              </span>
              <ChevronRight size={18} color={T.accent} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
