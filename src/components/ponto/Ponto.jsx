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
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapPin, QrCode, Navigation, LogOut, Home, ArrowLeft, Download, Crosshair, Plus, AlertTriangle, CheckCircle2, Printer, Camera } from "lucide-react";
import { QrScanner } from "./QrScanner.jsx";
import { saldoDia, fmtSaldo, corSaldo } from "./bancoHoras.js";
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

// Destinos quando a pessoa sai do Armário para outro ponto da fábrica
// (lista fixa por enquanto — 25/09/2026). "Outros" abre campo de texto.
const DESTINOS = ["Sala Forno 70", "Balança 80T", "Balança 100T", "Fundição 1", "Fundição 2"];

export function Ponto({ T, sb, currentUser, isAdmin, codigo, onCodigoDone, onScan, showToast }) {
  const { inp, btn, ghost, sbtn } = makeStyleHelpers(T);
  const [locais, setLocais] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [de, setDe] = useState(addDias(hojeKey(), -30));
  const [ate, setAte] = useState(hojeKey());
  const [pessoa, setPessoa] = useState("todos");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(null); // resultado do último registro
  const [novoLocal, setNovoLocal] = useState("");
  const [scanning, setScanning] = useState(false);
  // Pergunta "vai embora ou para outro local?" (QR do Armário com o dia aberto)
  const [escolha, setEscolha] = useState(null); // null | { local, gps, etapa: "pergunta" | "destino" }
  const [destino, setDestino] = useState("");
  const [destinoOutro, setDestinoOutro] = useState("");
  const [motivo, setMotivo] = useState("");
  // Situação atual (último registro de hoje) — pra mostrar "Você está em…"
  const [status, setStatus] = useState(null);
  const [confirmEncerrar, setConfirmEncerrar] = useState(false);
  const aoLerQR = useCallback((c) => { setScanning(false); setOk(null); onScan(c); }, [onScan]);
  const fecharScanner = useCallback(() => setScanning(false), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ini = new Date(`${de}T00:00:00-03:00`).toISOString();
      const fim = new Date(`${addDias(ate, 1)}T00:00:00-03:00`).toISOString();
      const [l, r, st] = await Promise.all([
        sb("ponto_locais?order=nome.asc"),
        sb(`ponto_registros?order=registrado_em.desc&registrado_em=gte.${ini}&registrado_em=lt.${fim}&limit=2000`),
        sb("rpc/meu_status_ponto", "POST", {}).catch(() => null),
      ]);
      setLocais(l || []);
      setRegistros(r || []);
      setStatus(st);
    } catch (e) {
      showToast(`Erro ao carregar ponto: ${errMsg(e)}`, "err");
    } finally {
      setLoading(false);
    }
  }, [sb, de, ate, showToast]);

  useEffect(() => { load(); }, [load]);

  const localQR = codigo ? locais.find(l => l.codigo === codigo) : null;

  // Tipo automático (decidido no servidor): 1ª leitura do dia = entrada;
  // se a última marcação do dia foi entrada = saída. Leitura repetida em
  // menos de 2 min não cria outro registro.
  // No QR do Armário com o dia já aberto, o servidor devolve
  // precisa_escolher em vez de registrar — aí a tela pergunta "vai embora
  // ou vai para outro local?" e chama de novo com a resposta (p_acao).
  const limparEscolha = () => { setEscolha(null); setDestino(""); setDestinoOutro(""); setMotivo(""); };
  const registrar = async (resposta = null) => {
    setEnviando(true);
    try {
      const gps = resposta ? escolha?.gps : await getGPS();
      const res = await sb("rpc/registrar_ponto", "POST", {
        p_codigo: codigo, p_perguntar: true,
        p_lat: gps?.lat ?? null, p_lng: gps?.lng ?? null, p_precisao: gps?.acc ?? null,
        ...(resposta || {}),
      });
      if (res?.precisa_escolher) {
        setEscolha({ local: res.local, gps, etapa: "pergunta" });
        return;
      }
      limparEscolha();
      setOk({ ...res, semGps: !gps });
      onCodigoDone();
      load();
    } catch (e) {
      showToast(errMsg(e), "err");
      if (!resposta) { limparEscolha(); onCodigoDone(); }
    } finally {
      setEnviando(false);
    }
  };
  const cancelarEscolha = () => { limparEscolha(); onCodigoDone(); };
  const confirmarDeslocamento = () => {
    const d = destino === "Outros" ? destinoOutro.trim() : destino;
    if (!d) return showToast("Escolha para onde você vai", "err");
    if (motivo.trim().length < 3) return showToast("Escreva o motivo", "err");
    registrar({ p_acao: "deslocamento", p_destino: d, p_motivo: motivo.trim() });
  };

  // Encerrar o dia de onde estiver (só depois de um deslocamento).
  const encerrarRemoto = async () => {
    setEnviando(true);
    try {
      const gps = await getGPS();
      const res = await sb("rpc/encerrar_dia_remoto", "POST", { p_lat: gps?.lat ?? null, p_lng: gps?.lng ?? null, p_precisao: gps?.acc ?? null });
      setConfirmEncerrar(false);
      setOk({ ...res, semGps: !gps });
      load();
    } catch (e) {
      showToast(errMsg(e), "err");
    } finally {
      setEnviando(false);
    }
  };

  // Assim que o QR (link ou leitor do app) traz um código válido, registra
  // sozinho — uma vez por código.
  const jaRegistrou = useRef(null);
  useEffect(() => {
    if (!codigo || loading || !localQR || jaRegistrou.current === codigo) return;
    jaRegistrou.current = codigo;
    registrar();
  }, [codigo, loading, localQR]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!codigo) jaRegistrou.current = null; }, [codigo]);

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
    return [...m.values()].map(g => ({ ...g, ...saldoDia(g.marc, g.dia), marc: g.marc.sort((a, b) => a.registrado_em.localeCompare(b.registrado_em)) }));
  }, [filtrados]);

  const exportar = () => {
    const rows = [["Data", "Hora", "Pessoa", "Local", "Tipo", "Destino", "Motivo", "Saída remota", "Distância (m)", "Fora do raio", "Latitude", "Longitude"]];
    const nomeTipo = { entrada: "Entrada", saida: "Saída", deslocamento: "Deslocamento" };
    [...filtrados].reverse().forEach(r => rows.push([
      new Date(r.registrado_em).toLocaleDateString("pt-BR", { timeZone: TZ }), fmtHora(r.registrado_em),
      r.pessoa, r.remoto ? "" : r.local_nome, nomeTipo[r.tipo] || r.tipo,
      r.destino ?? "", r.motivo ?? "", r.remoto ? "SIM" : "",
      r.distancia_m ?? "", r.fora_do_raio ? "SIM" : "", r.lat ?? "", r.lng ?? "",
    ]));
    dlCSV(`ponto_${de}_a_${ate}.csv`, rows);
  };

  const card = { background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: T.shadow };
  const tipoCor = (t) => t === "entrada" ? "#16a34a" : t === "deslocamento" ? "#f59e0b" : "#ef4444";
  const bigBtn = (bg, fg) => ({ ...btn(bg, fg), width: "100%", padding: "16px 14px", fontSize: 15, borderRadius: 10, display: "flex", alignItems: "center", gap: 12, textAlign: "left" });
  const emDeslocamento = status?.tipo === "deslocamento";

  return (
    <div style={{ maxWidth: 900 }}>
      {/* ── Registrar (só quando veio de um QR Code) ── */}
      {codigo && !ok && (
        <div style={{ ...card, borderColor: `${T.accent}55` }}>
          {loading ? <div style={{ color: T.textMuted }}>Carregando…</div> : !localQR ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#ef4444" }}>
              <AlertTriangle size={18} /> QR Code inválido ou local desativado.
              <button style={{ ...ghost(), marginLeft: "auto" }} onClick={() => { onCodigoDone(); setScanning(true); }}>Ler outro</button>
            </div>
          ) : (
            escolha ? (
              escolha.etapa === "pergunta" ? (
                <>
                  <div style={{ fontSize: 12, color: T.textMuted, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> {escolha.local}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: T.textBright, margin: "4px 0 14px" }}>Você vai embora ou vai para outro local?</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button disabled={enviando} onClick={() => registrar({ p_acao: "saida" })} style={bigBtn("#ef4444", "#fff")}>
                      <Home size={22} /> <span><b style={{ display: "block" }}>{enviando ? "Registrando…" : "Vou embora"}</b><span style={{ fontSize: 12, opacity: .85, fontWeight: 500 }}>Registra a saída e encerra o dia</span></span>
                    </button>
                    <button disabled={enviando} onClick={() => setEscolha(e => ({ ...e, etapa: "destino" }))} style={bigBtn(T.panelAlt2, T.text)}>
                      <Navigation size={22} color="#f59e0b" /> <span><b style={{ display: "block" }}>Vou para outro local</b><span style={{ fontSize: 12, color: T.textMuted, fontWeight: 500 }}>Continua trabalhando em outro ponto da fábrica</span></span>
                    </button>
                  </div>
                  <button onClick={cancelarEscolha} style={{ ...ghost(), marginTop: 12 }}>Cancelar</button>
                </>
              ) : (
                <>
                  <button onClick={() => setEscolha(e => ({ ...e, etapa: "pergunta" }))} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0, fontFamily: "inherit" }}><ArrowLeft size={14} /> Voltar</button>
                  <div style={{ fontSize: 18, fontWeight: 700, color: T.textBright, margin: "8px 0 12px" }}>Para onde você vai?</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                    {[...DESTINOS, "Outros"].map(d => {
                      const sel = destino === d;
                      return (
                        <button key={d} onClick={() => setDestino(d)} style={{
                          padding: "12px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600,
                          border: `1.5px solid ${sel ? "#f59e0b" : T.border}`, background: sel ? "#f59e0b1f" : T.panelAlt, color: sel ? T.textBright : T.text,
                        }}>{d}</button>
                      );
                    })}
                  </div>
                  {destino === "Outros" && (
                    <input autoFocus value={destinoOutro} onChange={e => setDestinoOutro(e.target.value)} maxLength={80} placeholder="Escreva o local" style={inp({ marginTop: 10, padding: "10px 12px", fontSize: 14 })} />
                  )}
                  {destino && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, margin: "14px 0 6px" }}>Motivo</div>
                      <textarea value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} rows={3} placeholder="Ex.: verificar o totem da sala forno" style={inp({ padding: "10px 12px", fontSize: 14, resize: "vertical" })} />
                      <button disabled={enviando} onClick={confirmarDeslocamento} style={{ ...bigBtn("#f59e0b", "#111"), justifyContent: "center", marginTop: 12 }}>
                        <Navigation size={18} /> {enviando ? "Registrando…" : "Confirmar ida"}
                      </button>
                    </>
                  )}
                  <button onClick={cancelarEscolha} style={{ ...ghost(), marginTop: 12 }}>Cancelar</button>
                </>
              )
            ) : <>
              <div style={{ fontSize: 12, color: T.textMuted, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14} /> Registrando ponto em</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.textBright, margin: "4px 0 2px" }}>{localQR.nome}</div>
              <div style={{ fontSize: 12, color: T.textFaint }}>{enviando ? "Confirmando localização e horário…" : "Aguarde…"}</div>
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
                {ok.tipo === "deslocamento" ? `Ida para ${ok.destino} registrada às ${fmtHora(ok.registrado_em)}` : `${ok.tipo === "entrada" ? "Entrada" : "Saída"} registrada às ${fmtHora(ok.registrado_em)}`}
              </div>
              <div style={{ fontSize: 12.5, color: T.textMuted }}>
                {ok.remoto ? `Saída remota · ${ok.local}` : ok.tipo === "deslocamento" ? "Quando terminar, toque em \"Encerrar o dia\" aqui no Ponto" : ok.local}{ok.duplicado ? " · já estava registrado há menos de 1 minuto" : ""}
                {ok.fora_do_raio ? ` · fora da área do local${ok.distancia_m != null ? ` (${Math.round(ok.distancia_m)} m)` : ""}` : ""}
                {ok.semGps ? " · sem localização" : ""}
              </div>
            </div>
            <button style={{ ...ghost(), marginLeft: "auto" }} onClick={() => setOk(null)}>OK</button>
          </div>
        </div>
      )}

      {!codigo && emDeslocamento && (
        <div style={{ ...card, borderColor: "#f59e0b66", background: `linear-gradient(0deg, #f59e0b0d, #f59e0b0d), ${T.panel}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: "#f59e0b22", color: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Navigation size={20} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: T.textMuted }}>Você está em</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.textBright }}>{status.destino}</div>
              <div style={{ fontSize: 12, color: T.textFaint }}>desde {fmtHora(status.registrado_em)}{status.motivo ? ` · ${status.motivo}` : ""}</div>
            </div>
          </div>
          {!confirmEncerrar ? (
            <button onClick={() => setConfirmEncerrar(true)} style={{ ...bigBtn("#ef4444", "#fff"), justifyContent: "center", marginTop: 14 }}>
              <LogOut size={18} /> Encerrar o dia
            </button>
          ) : (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, color: T.text, marginBottom: 8 }}>Registrar a saída agora, às <b>{fmtHora(new Date().toISOString())}</b>? A sua localização vai junto.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={enviando} onClick={encerrarRemoto} style={{ ...btn("#ef4444", "#fff"), flex: 1, padding: "12px" }}>{enviando ? "Registrando…" : "Sim, encerrar"}</button>
                <button disabled={enviando} onClick={() => setConfirmEncerrar(false)} style={{ ...ghost(), padding: "12px 16px" }}>Não</button>
              </div>
            </div>
          )}
        </div>
      )}

      {!codigo && (
        <button onClick={() => setScanning(true)} style={{
          ...btn(T.accent), width: "100%", padding: "18px 12px", fontSize: 16, borderRadius: 10, marginBottom: 14,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}>
          <Camera size={22} /> {ok ? "Registrar outro ponto" : "Escanear QR Code"}
        </button>
      )}

      {scanning && <QrScanner T={T} onResult={aoLerQR} onClose={fecharScanner} />}

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
                {g.semSaida && g.dia !== hojeKey() ? "sem saída · " : ""}Saldo <b style={{ color: corSaldo(g.saldo) || T.textMuted }}>{fmtSaldo(g.saldo)}</b>
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {g.marc.map(r => (
                <span key={r.id} title={[r.motivo && `Motivo: ${r.motivo}`, r.remoto && "Saída registrada fora do QR Code", r.fora_do_raio && `Fora da área do local${r.distancia_m != null ? ` (${Math.round(r.distancia_m)} m)` : " (sem GPS)"}`].filter(Boolean).join(" · ")} style={{
                  fontSize: 12, padding: "4px 8px", borderRadius: 5, background: `${tipoCor(r.tipo)}14`, border: `1px solid ${tipoCor(r.tipo)}33`,
                  color: T.text, display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  {r.tipo === "deslocamento"
                    ? <><Navigation size={12} color={tipoCor(r.tipo)} /> {fmtHora(r.registrado_em)} · {r.destino}{r.motivo ? <span style={{ color: T.textMuted }}> — {r.motivo}</span> : null}</>
                    : <><b style={{ color: tipoCor(r.tipo) }}>{r.tipo === "entrada" ? "E" : "S"}</b> {fmtHora(r.registrado_em)} · {r.remoto ? <>remota{r.destino ? ` (${r.destino})` : ""}</> : r.local_nome}</>}
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
