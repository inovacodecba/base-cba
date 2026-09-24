// "Ponto" — controle interno de entrada/saída por QR Code (24/09/2026).
//
// NÃO é ponto oficial (Portaria MTP 671/2021) — decisão registrada com o
// usuário: é só controle interno de presença nos locais.
//
// Como funciona:
//   - Cada local (tabela ponto_locais) tem um `codigo` aleatório. O QR Code
//     impresso no local aponta pra  .../base-cba/?ponto=<codigo>.
//   - O App.jsx lê esse parâmetro da URL e abre esta tela com o local já
//     selecionado (pede login antes, se precisar).
//   - Só dá pra registrar via QR Code (não existe botão "registrar" solto).
//   - O registro em si é feito pela função do banco `registrar_ponto`, que:
//     grava o horário do SERVIDOR (não do celular), pega o nome da pessoa do
//     token de login (não dá pra registrar em nome de outro), compara o GPS
//     com a posição do local e marca `fora_do_raio`, e ignora toque duplo.
//   - Ninguém edita nem apaga registro (sem policy de update/delete).
//   - Cada pessoa vê só os próprios registros; admin vê todos (RLS no banco).
import { useState, useEffect, useMemo, useCallback } from "react";
import { LogIn, LogOut, MapPin, QrCode, Download, Crosshair, Plus, AlertTriangle, CheckCircle2, Printer, ScanLine } from "lucide-react";
import { makeStyleHelpers } from "../../theme.js";
import { dlCSV } from "../../utils.js";

const TZ = "America/Sao_Paulo";
export const PONTO_BASE_URL = "https://inovacodecba.github.io/base-cba/";
export const pontoUrl = (codigo) => `${PONTO_BASE_URL}?ponto=${codigo}`;

const fmtHora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtDia = (iso) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const diaKey = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ }); // "2026-09-24"
const hojeKey = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const addDias = (key, n) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const fmtDur = (ms) => { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; };

// Mensagem legível a partir do erro do PostgREST (vem como JSON em texto).
const errMsg = (e) => { try { return JSON.parse(e.message).message || e.message; } catch { return e.message; } };

const getGPS = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
  );
});

// Soma o tempo entre cada "entrada" e a "saída" seguinte do mesmo dia.
function totalDia(marcacoes) {
  const ord = [...marcacoes].sort((a, b) => a.registrado_em.localeCompare(b.registrado_em));
  let total = 0, aberta = null;
  for (const r of ord) {
    if (r.tipo === "entrada") aberta = aberta || r;
    else if (aberta) { total += new Date(r.registrado_em) - new Date(aberta.registrado_em); aberta = null; }
  }
  return { total, emAberto: !!aberta };
}

export function Ponto({ T, sb, currentUser, isAdmin, codigo, onCodigoDone, showToast }) {
  const { inp, btn, ghost, sbtn } = makeStyleHelpers(T);
  const [locais, setLocais] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [de, setDe] = useState(addDias(hojeKey(), -30));
  const [ate, setAte] = useState(hojeKey());
  const [pessoa, setPessoa] = useState("todos");
  const [enviando, setEnviando] = useState(null); // "entrada" | "saida" | null
  const [ok, setOk] = useState(null); // resultado do último registro
  const [novoLocal, setNovoLocal] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ini = new Date(`${de}T00:00:00-03:00`).toISOString();
      const fim = new Date(`${addDias(ate, 1)}T00:00:00-03:00`).toISOString();
      const [l, r] = await Promise.all([
        sb("ponto_locais?order=nome.asc"),
        sb(`ponto_registros?order=registrado_em.desc&registrado_em=gte.${ini}&registrado_em=lt.${fim}&limit=2000`),
      ]);
      setLocais(l || []);
      setRegistros(r || []);
    } catch (e) {
      showToast(`Erro ao carregar ponto: ${errMsg(e)}`, "err");
    } finally {
      setLoading(false);
    }
  }, [sb, de, ate, showToast]);

  useEffect(() => { load(); }, [load]);

  const localQR = codigo ? locais.find(l => l.codigo === codigo) : null;

  // Sugere o próximo tipo: se a última marcação de hoje foi entrada, sugere saída.
  const sugerido = useMemo(() => {
    const minhasHoje = registros.filter(r => r.pessoa === currentUser && diaKey(r.registrado_em) === hojeKey());
    return minhasHoje[0]?.tipo === "entrada" ? "saida" : "entrada";
  }, [registros, currentUser]);

  const registrar = async (tipo) => {
    setEnviando(tipo);
    try {
      const gps = await getGPS();
      const res = await sb("rpc/registrar_ponto", "POST", {
        p_codigo: codigo, p_tipo: tipo,
        p_lat: gps?.lat ?? null, p_lng: gps?.lng ?? null, p_precisao: gps?.acc ?? null,
      });
      setOk({ ...res, semGps: !gps });
      onCodigoDone();
      load();
    } catch (e) {
      showToast(errMsg(e), "err");
    } finally {
      setEnviando(null);
    }
  };

  // ── admin: locais ──
  const definirPosicao = async (local) => {
    showToast("Pegando sua localização…", "warn");
    const gps = await getGPS();
    if (!gps) return showToast("Não foi possível pegar o GPS. Libere a localização no navegador.", "err");
    try {
      await sb(`ponto_locais?id=eq.${local.id}`, "PATCH", { lat: gps.lat, lng: gps.lng });
      showToast(`Posição de "${local.nome}" salva (precisão ~${Math.round(gps.acc)} m)`);
      load();
    } catch (e) { showToast(errMsg(e), "err"); }
  };
  const mudarRaio = async (local, raio) => {
    const v = parseInt(raio, 10);
    if (!v || v < 20) return showToast("Raio mínimo: 20 m", "err");
    try { await sb(`ponto_locais?id=eq.${local.id}`, "PATCH", { raio_m: v }); load(); } catch (e) { showToast(errMsg(e), "err"); }
  };
  const addLocal = async () => {
    const nome = novoLocal.trim();
    if (!nome) return;
    try { await sb("ponto_locais", "POST", { nome }); setNovoLocal(""); showToast(`Local "${nome}" criado`); load(); } catch (e) { showToast(errMsg(e), "err"); }
  };
  const imprimirQR = async (lista) => {
    const QR = await import("qrcode");
    const cards = await Promise.all(lista.map(async (l) => {
      const svg = await QR.toString(pontoUrl(l.codigo), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      return `<div class="card"><h1>PONTO</h1><div class="qr">${svg}</div><h2>${l.nome}</h2><p>Aponte a câmera do celular para registrar entrada ou saída</p></div>`;
    }));
    const w = window.open("", "_blank");
    if (!w) return showToast("Libere pop-ups para imprimir", "err");
    w.document.write(`<html><head><title>QR Codes — Ponto</title><style>
      body{font-family:Arial,sans-serif;margin:0}
      .card{page-break-after:always;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;box-sizing:border-box}
      .card:last-child{page-break-after:auto}
      h1{font-size:48px;margin:0 0 20px;letter-spacing:4px}
      .qr{width:70vmin;max-width:130mm}.qr svg{width:100%;height:auto}
      h2{font-size:34px;margin:20px 0 8px}p{font-size:18px;color:#444;margin:0}
    </style></head><body>${cards.join("")}<script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
    w.document.close();
  };

  // ── histórico ──
  const pessoas = useMemo(() => [...new Set(registros.map(r => r.pessoa))].sort(), [registros]);
  const filtrados = useMemo(() => registros.filter(r => pessoa === "todos" || r.pessoa === pessoa), [registros, pessoa]);
  const grupos = useMemo(() => {
    const m = new Map();
    for (const r of filtrados) {
      const k = `${diaKey(r.registrado_em)}|${r.pessoa}`;
      if (!m.has(k)) m.set(k, { dia: diaKey(r.registrado_em), iso: r.registrado_em, pessoa: r.pessoa, marc: [] });
      m.get(k).marc.push(r);
    }
    return [...m.values()].map(g => ({ ...g, ...totalDia(g.marc), marc: g.marc.sort((a, b) => a.registrado_em.localeCompare(b.registrado_em)) }));
  }, [filtrados]);

  const exportar = () => {
    const rows = [["Data", "Hora", "Pessoa", "Local", "Tipo", "Distância (m)", "Fora do raio"]];
    [...filtrados].reverse().forEach(r => rows.push([
      new Date(r.registrado_em).toLocaleDateString("pt-BR", { timeZone: TZ }), fmtHora(r.registrado_em),
      r.pessoa, r.local_nome, r.tipo === "entrada" ? "Entrada" : "Saída",
      r.distancia_m ?? "", r.fora_do_raio ? "SIM" : "",
    ]));
    dlCSV(`ponto_${de}_a_${ate}.csv`, rows);
  };

  const card = { background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: T.shadow };
  const tipoCor = (t) => t === "entrada" ? "#16a34a" : "#ef4444";

  return (
    <div style={{ maxWidth: 900 }}>
      {/* ── Registrar (só quando veio de um QR Code) ── */}
      {codigo && !ok && (
        <div style={{ ...card, borderColor: `${T.accent}55` }}>
          {loading ? <div style={{ color: T.textMuted }}>Carregando…</div> : !localQR ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#ef4444" }}>
              <AlertTriangle size={18} /> QR Code inválido ou local desativado.
              <button style={{ ...ghost(), marginLeft: "auto" }} onClick={onCodigoDone}>Fechar</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: T.textMuted, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> Registrar ponto em</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.textBright, margin: "4px 0 2px" }}>{localQR.nome}</div>
              <div style={{ fontSize: 12, color: T.textFaint, marginBottom: 14 }}>{currentUser} · o horário é registrado pelo servidor</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {["entrada", "saida"].map(t => {
                  const Icon = t === "entrada" ? LogIn : LogOut;
                  const destaque = sugerido === t;
                  return (
                    <button key={t} disabled={!!enviando} onClick={() => registrar(t)} style={{
                      ...btn(destaque ? tipoCor(t) : T.panelAlt, destaque ? "#fff" : T.text),
                      border: destaque ? "none" : `1px solid ${T.border}`,
                      padding: "18px 10px", fontSize: 16, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      opacity: enviando && enviando !== t ? .5 : 1,
                    }}>
                      <Icon size={20} /> {enviando === t ? "Registrando…" : t === "entrada" ? "Entrada" : "Saída"}
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: T.textFaint, marginTop: 10 }}>O navegador pode pedir permissão de localização — permita, para confirmar que você está no local.</div>
            </>
          )}
        </div>
      )}

      {ok && (
        <div style={{ ...card, borderColor: ok.fora_do_raio ? "#f97316" : "#16a34a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {ok.fora_do_raio ? <AlertTriangle size={28} color="#f97316" /> : <CheckCircle2 size={28} color="#16a34a" />}
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.textBright }}>
                {ok.tipo === "entrada" ? "Entrada" : "Saída"} registrada às {fmtHora(ok.registrado_em)}
              </div>
              <div style={{ fontSize: 12.5, color: T.textMuted }}>
                {ok.local}{ok.duplicado ? " · já estava registrado há menos de 1 minuto" : ""}
                {ok.fora_do_raio ? ` · fora da área do local${ok.distancia_m != null ? ` (${Math.round(ok.distancia_m)} m)` : ""}` : ""}
                {ok.semGps ? " · sem localização" : ""}
              </div>
            </div>
            <button style={{ ...ghost(), marginLeft: "auto" }} onClick={() => setOk(null)}>OK</button>
          </div>
        </div>
      )}

      {!codigo && !ok && (
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 10, color: T.textMuted }}>
          <ScanLine size={22} color={T.accent} />
          <span>Para registrar, aponte a câmera do celular para o <b>QR Code do local</b>.</span>
        </div>
      )}

      {/* ── Histórico ── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.textBright, marginRight: "auto" }}>{isAdmin ? "Registros da equipe" : "Meus registros"}</div>
          <input type="date" value={de} onChange={e => setDe(e.target.value)} style={inp({ width: 140 })} />
          <span style={{ color: T.textFaint }}>até</span>
          <input type="date" value={ate} onChange={e => setAte(e.target.value)} style={inp({ width: 140 })} />
          {isAdmin && (
            <select value={pessoa} onChange={e => setPessoa(e.target.value)} style={inp({ width: 160 })}>
              <option value="todos">Todas as pessoas</option>
              {pessoas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <button style={{ ...sbtn(T.accent), display: "flex", alignItems: "center", gap: 5 }} onClick={exportar} disabled={!filtrados.length}><Download size={13} /> Excel/CSV</button>
        </div>
        {loading ? <div style={{ color: T.textMuted }}>Carregando…</div> : grupos.length === 0 ? (
          <div style={{ color: T.textFaint, padding: "10px 0" }}>Nenhum registro no período.</div>
        ) : grupos.map(g => (
          <div key={`${g.dia}${g.pessoa}`} style={{ borderTop: `1px solid ${T.borderSoft}`, padding: "10px 0" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: T.text, textTransform: "capitalize" }}>{fmtDia(g.iso)}</span>
              {isAdmin && <span style={{ color: T.textMuted }}>· {g.pessoa}</span>}
              <span style={{ marginLeft: "auto", fontSize: 12, color: T.textMuted }}>
                {g.total > 0 ? `Total ${fmtDur(g.total)}` : ""}{g.emAberto ? " · sem saída" : ""}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {g.marc.map(r => (
                <span key={r.id} title={r.fora_do_raio ? `Fora da área do local${r.distancia_m != null ? ` (${Math.round(r.distancia_m)} m)` : " (sem GPS)"}` : ""} style={{
                  fontSize: 12, padding: "4px 8px", borderRadius: 5, background: `${tipoCor(r.tipo)}14`, border: `1px solid ${tipoCor(r.tipo)}33`,
                  color: T.text, display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  <b style={{ color: tipoCor(r.tipo) }}>{r.tipo === "entrada" ? "E" : "S"}</b> {fmtHora(r.registrado_em)} · {r.local_nome}
                  {r.fora_do_raio && <AlertTriangle size={12} color="#f97316" />}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Locais / QR Codes (admin) ── */}
      {isAdmin && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.textBright, marginRight: "auto" }}>Locais de ponto</div>
            <button style={{ ...sbtn(T.accent), display: "flex", alignItems: "center", gap: 5 }} onClick={() => imprimirQR(locais.filter(l => l.ativo))} disabled={!locais.length}><Printer size={13} /> Imprimir todos</button>
          </div>
          {locais.map(l => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${T.borderSoft}`, padding: "9px 0" }}>
              <QrCode size={16} color={T.textMuted} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600, color: T.text }}>{l.nome}</div>
                <div style={{ fontSize: 11, color: l.lat == null ? "#f97316" : T.textFaint }}>
                  {l.lat == null ? "Sem posição — o GPS não é conferido" : `Posição definida · raio ${l.raio_m} m`}
                </div>
              </div>
              <label style={{ fontSize: 11, color: T.textFaint, display: "flex", alignItems: "center", gap: 4 }}>
                raio <input type="number" defaultValue={l.raio_m} onBlur={e => e.target.value != l.raio_m && mudarRaio(l, e.target.value)} style={inp({ width: 64 })} /> m
              </label>
              <button style={{ ...sbtn(T.textMuted), display: "flex", alignItems: "center", gap: 5 }} onClick={() => definirPosicao(l)}><Crosshair size={13} /> Usar minha posição</button>
              <button style={{ ...sbtn(T.accent), display: "flex", alignItems: "center", gap: 5 }} onClick={() => imprimirQR([l])}><Printer size={13} /> QR</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={novoLocal} onChange={e => setNovoLocal(e.target.value)} onKeyDown={e => e.key === "Enter" && addLocal()} placeholder="Novo local (ex.: Portaria)" style={inp({ flex: 1 })} />
            <button style={{ ...btn(T.accent), display: "flex", alignItems: "center", gap: 5 }} onClick={addLocal}><Plus size={14} /> Adicionar</button>
          </div>
          <div style={{ fontSize: 11, color: T.textFaint, marginTop: 8 }}>
            Para definir a posição: vá até o local com o celular e toque em "Usar minha posição". Marcações a mais de "raio" metros ficam sinalizadas com <AlertTriangle size={11} color="#f97316" style={{ verticalAlign: "middle" }} />.
          </div>
        </div>
      )}
    </div>
  );
}
