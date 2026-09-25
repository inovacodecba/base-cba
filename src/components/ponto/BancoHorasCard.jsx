// Card "Banco de horas" da Visão Geral (24/09/2026). Regras em bancoHoras.js.
// Cada pessoa vê o próprio saldo; admin vê uma linha por pessoa (a RLS do
// banco já garante que não-admin só recebe os próprios registros).
import { useEffect, useState, useMemo } from "react";
import { Clock, ChevronRight } from "lucide-react";
import { bancoDeHoras, fmtSaldo, fmtMin, corSaldo, hojeKey } from "./bancoHoras.js";

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
    const nomes = isAdmin ? Object.keys(banco).sort() : [currentUser];
    return nomes.map(nome => {
      const b = banco[nome] || { total: 0, dias: [] };
      return {
        nome,
        total: b.total,
        mes: b.dias.filter(d => d.dia.startsWith(mes)).reduce((s, d) => s + d.saldo, 0),
        hoje: b.dias.find(d => d.dia === hoje) || null,
      };
    });
  }, [banco, isAdmin, currentUser, mes, hoje]);

  const card = { background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 16, boxShadow: T.shadow };
  const Saldo = ({ min, size = 13 }) => <b style={{ color: corSaldo(min) || T.textMuted, fontSize: size }}>{fmtSaldo(min)}</b>;
  const hojeTxt = (h) => !h ? "sem registro hoje"
    : `entrada ${fmtMin(h.entradaMin)} · saída ${fmtMin(h.saidaMin)}${h.semSaida ? " (em andamento)" : ""}`;

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Clock size={16} color={T.accent} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textBright }}>Banco de horas</div>
          <div style={{ fontSize: 10.5, color: T.textFaint }}>07:00–16:00 · tolerância 10 min</div>
        </div>
        <button onClick={onOpen} style={{ marginLeft: "auto", background: "none", border: "none", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 2, fontFamily: "inherit" }}>
          Ver ponto <ChevronRight size={14} />
        </button>
      </div>

      {regs === null ? <div style={{ color: T.textFaint, fontSize: 12 }}>Carregando…</div>
        : linhas.length === 0 ? <div style={{ color: T.textFaint, fontSize: 12 }}>Nenhum registro de ponto ainda.</div>
        : !isAdmin ? (() => {
          const l = linhas[0];
          const msg = l.total > 0 ? "de hora extra" : l.total < 0 ? "devendo" : "em dia";
          return (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 11, color: T.textFaint }}>Saldo total</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}><Saldo min={l.total} size={26} /><span style={{ color: T.textMuted, fontSize: 12 }}>{msg}</span></div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.textFaint }}>Este mês</div>
                <Saldo min={l.mes} size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 11, color: T.textFaint }}>Hoje</div>
                <div style={{ fontSize: 12.5, color: T.text }}>{hojeTxt(l.hoje)}{l.hoje && <> · <Saldo min={l.hoje.saldo} /></>}</div>
              </div>
            </div>
          );
        })() : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: T.textFaint, fontSize: 11, textAlign: "left" }}>
                  <th style={{ padding: "4px 8px 6px 0", fontWeight: 600 }}>Pessoa</th>
                  <th style={{ padding: "4px 8px 6px", fontWeight: 600 }}>Hoje</th>
                  <th style={{ padding: "4px 8px 6px", fontWeight: 600, textAlign: "right" }}>Mês</th>
                  <th style={{ padding: "4px 0 6px 8px", fontWeight: 600, textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.nome} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                    <td style={{ padding: "7px 8px 7px 0", color: T.text, fontWeight: 600, whiteSpace: "nowrap" }}>{l.nome}</td>
                    <td style={{ padding: "7px 8px", color: T.textMuted, whiteSpace: "nowrap" }}>{l.hoje ? `${fmtMin(l.hoje.entradaMin)} – ${fmtMin(l.hoje.saidaMin)}` : "—"}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}><Saldo min={l.mes} /></td>
                    <td style={{ padding: "7px 0 7px 8px", textAlign: "right" }}><Saldo min={l.total} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
