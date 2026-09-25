// Banco de horas do Ponto (24/09/2026) — regras combinadas com o usuário:
//
//   - Jornada: entrada 07:00, saída 16:00, segunda a sexta. Almoço não bate
//     ponto (não entra na conta).
//   - Tolerância de 10 min em CADA marcação: chegar entre 06:50 e 07:10, ou
//     sair entre 15:50 e 16:10, conta como zero.
//   - Fora da tolerância conta a diferença INTEIRA (não só o excedente):
//     chegar 06:49 = +11 min; chegar 07:11 = −11 min; sair 16:11 = +11 min;
//     sair 15:49 = −11 min.
//   - Usa a PRIMEIRA entrada e a ÚLTIMA saída do dia (saídas/voltas no meio
//     do dia não mudam o saldo).
//   - Dia sem nenhum registro não entra no saldo (folga/feriado/falta não
//     viram débito automaticamente).
//   - Sábado/domingo com registro: todo o tempo entre entrada e saída conta
//     como hora extra.
//   - Dia sem saída: conta só a entrada e fica marcado "sem saída".
//
// Tudo em minutos, no fuso de São Paulo.

export const JORNADA = { entrada: 7 * 60, saida: 16 * 60, tolerancia: 10 };
const TZ = "America/Sao_Paulo";

export const diaKey = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
export const hojeKey = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });

const minutosDoDia = (iso) => {
  const [h, m] = new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  return (h % 24) * 60 + m;
};

const comTolerancia = (dif) => (Math.abs(dif) <= JORNADA.tolerancia ? 0 : dif);

// Saldo de um dia (marcações de UMA pessoa em UM dia).
export function saldoDia(marcacoes, dia) {
  const ord = [...marcacoes].sort((a, b) => a.registrado_em.localeCompare(b.registrado_em));
  const entrada = ord.find(r => r.tipo === "entrada");
  const saida = [...ord].reverse().find(r => r.tipo === "saida" && (!entrada || r.registrado_em > entrada.registrado_em));
  const dow = new Date(`${dia}T12:00:00`).getDay(); // 0 dom, 6 sáb
  const fimDeSemana = dow === 0 || dow === 6;

  if (!entrada) return { saldo: 0, entradaMin: null, saidaMin: null, semSaida: false, semEntrada: true, fimDeSemana };
  const e = minutosDoDia(entrada.registrado_em);
  const s = saida ? minutosDoDia(saida.registrado_em) : null;

  let saldo;
  if (fimDeSemana) saldo = s != null ? Math.max(0, s - e) : 0;
  else saldo = comTolerancia(JORNADA.entrada - e) + (s != null ? comTolerancia(s - JORNADA.saida) : 0);

  return { saldo, entradaMin: e, saidaMin: s, semSaida: s == null, semEntrada: false, fimDeSemana };
}

// Agrupa registros por pessoa e dia → { [pessoa]: { total, dias: [{dia, ...saldoDia}] } }
export function bancoDeHoras(registros) {
  const porPessoaDia = new Map();
  for (const r of registros) {
    const k = `${r.pessoa}|${diaKey(r.registrado_em)}`;
    if (!porPessoaDia.has(k)) porPessoaDia.set(k, []);
    porPessoaDia.get(k).push(r);
  }
  const out = {};
  for (const [k, marc] of porPessoaDia) {
    const [pessoa, dia] = k.split("|");
    const d = { dia, ...saldoDia(marc, dia) };
    if (!out[pessoa]) out[pessoa] = { total: 0, dias: [] };
    out[pessoa].total += d.saldo;
    out[pessoa].dias.push(d);
  }
  for (const p of Object.values(out)) p.dias.sort((a, b) => b.dia.localeCompare(a.dia));
  return out;
}

// +1h05 / −0h11 / 0h00
export const fmtSaldo = (min) => {
  const sinal = min > 0 ? "+" : min < 0 ? "−" : "";
  const a = Math.abs(min);
  return `${sinal}${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
};
export const fmtMin = (m) => (m == null ? "--:--" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
export const corSaldo = (min) => (min > 0 ? "#16a34a" : min < 0 ? "#ef4444" : null);
