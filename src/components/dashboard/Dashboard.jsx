// Visão Geral (Dashboard). Recebe os dados já carregados via props e é
// puramente apresentacional — toda a lógica de estado/CRUD continua
// centralizada no App.jsx, seguindo o padrão container/presentational.
import { memo } from "react";
import {
  Boxes, Package, Wrench, AlertTriangle, TrendingDown, TrendingUp, Plus, ArrowUpDown,
  ArrowLeftRight, FileText, ClipboardCheck, Tags, MapPin, Zap, Kanban, CalendarDays, Flag, ListChecks,
} from "lucide-react";
import { PanelCard, StatTile, DonutChart } from "./pieces.jsx";
import { DirIcon, CategoryBadge } from "../common.jsx";
import { tot, isLow, fd, ft, fmtBRL, disponibilidade } from "../../utils.js";
import { docStatus } from "../documents/helpers.js";
import { TASK_STATUS, TASK_PRIORITY } from "../../constants.js";

// "2026-08-31" → "31/08" — as tarefas guardam só a data (sem hora). Mesma
// função usada em Tarefas.jsx; duplicada aqui (arquivo pequeno, sem import
// cruzado entre features) em vez de promovida pra utils.js — não há ainda
// um terceiro lugar que precise dela pra justificar a extração.
const fmtPrazo = (iso) => {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

// Urgência do prazo de uma tarefa — mesma régua de cores do quadro Kanban
// (atrasada/hoje/próxima/normal), só que resumida pro card da Visão Geral.
function taskUrgency(prazo) {
  if (!prazo) return { label: "Sem prazo", color: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${prazo}T00:00:00`);
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return { label: `Atrasada · ${fmtPrazo(prazo)}`, color: "#ef4444" };
  if (days === 0) return { label: "Hoje", color: "#f97316" };
  if (days <= 2) return { label: `${fmtPrazo(prazo)} · em ${days}d`, color: "#eab308" };
  return { label: fmtPrazo(prazo), color: null };
}

// Chave "AAAA-MM-DD" no horário LOCAL do navegador (não UTC). Usar
// toISOString() faria o "hoje" virar o dia seguinte a partir das 21h (UTC-3).
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// date_iso pode vir só com a data ("2026-10-08") ou com hora completa — só a
// segunda precisa ser convertida pro fuso local.
const movDayKey = iso => (iso.length === 10 ? iso : dayKey(new Date(iso)));

const isDefect = i => i.condicao === "defeito" || i.condicao === "defeito parcial";

// memo(): o Dashboard só é montado quando view==="dashboard", mas enquanto
// visível, qualquer render do App (ex.: abrir um modal) o recriaria e
// recalcularia todos os dados derivados (donuts, tendências, "itens com
// atenção") à toa. Com T memoizado e os handlers em useCallback no App.jsx,
// as props ficam estáveis entre renders não relacionados, e o memo() evita
// esse trabalho repetido.
// `categoryNames`/`catColor` vêm do App.jsx (categorias agora são dinâmicas,
// geridas em "Categorias" — mesmo padrão de `sectorNames`/`sectorColor`).
function DashboardImpl({ T, items, movs, sectorNames, sectorColor, categoryNames, catColor, setView, setInvStatus, setInvCategoria, setInvSector, setInvSearch, onNewItem, onOpenBatch, onOpenReports, onResolve, trainingAlerts, currentUser, isAdmin, onOpenTreinamentos, tasks, onOpenTarefas, showToast }) {
  const totalAll = items.reduce((s, i) => s + tot(i), 0);

  // Partição mutuamente exclusiva do total, para o donut "Status do Inventário".
  const defItems = items.filter(isDefect);
  const baixoItems = items.filter(i => !isDefect(i) && isLow(i));
  const remaining = items.filter(i => !isDefect(i) && !isLow(i));
  // "Em uso" aqui é disponibilidade (qty_in_use), não condição — um item
  // "operacional" pode estar parcialmente em uso. Divide por QUANTIDADE
  // (não por item) para não contar 2x a mesma unidade nos dois lados.
  const usoItems = remaining.filter(i => disponibilidade(i) !== "estoque");
  const estoqueItems = remaining.filter(i => disponibilidade(i) === "estoque");

  const qty = arr => arr.reduce((s, i) => s + tot(i), 0);
  const qUso = remaining.reduce((s, i) => s + (i.qty_in_use || 0), 0);
  const qEstoque = qty(remaining) - qUso, qDefeito = qty(defItems), qBaixo = qty(baixoItems);
  const pct = v => totalAll > 0 ? Math.round((v / totalAll) * 100) : 0;

  const verItems = items.filter(i => i.condicao === "verificar");

  const catData = categoryNames.map(c => ({
    label: c,
    value: items.filter(i => (i.categoria || "Diversos") === c).reduce((s, i) => s + tot(i), 0),
    color: catColor(c),
  }));

  // Valor estimado por categoria — só considera itens com valor_estimado preenchido
  // (o campo é opcional e preenchido aos poucos, item por item).
  const itemsComValor = items.filter(i => i.valor_estimado != null);
  const catValue = categoryNames.map(c => {
    const its = items.filter(i => (i.categoria || "Diversos") === c);
    const priced = its.filter(i => i.valor_estimado != null);
    return {
      label: c,
      color: catColor(c),
      total: priced.reduce((s, i) => s + i.valor_estimado * tot(i), 0),
      precificados: priced.length,
      totalItens: its.length,
    };
  }).filter(c => c.totalItens > 0).sort((a, b) => b.total - a.total);
  const maxCatValue = Math.max(1, ...catValue.map(c => c.total));

  const sectorData = sectorNames.map(sec => ({
    label: sec,
    value: items.reduce((s, it) => s + (it.locations || []).filter(l => l.sector === sec).reduce((a, l) => a + l.qty, 0), 0),
    color: sectorColor(sec),
  }));

  const statusData = [
    { label: "Em estoque", value: qEstoque, color: "#eab308" },
    { label: "Em uso", value: qUso, color: "#3b82f6" },
    { label: "Estoque baixo", value: qBaixo, color: "#f97316" },
    { label: "Com defeito", value: qDefeito, color: "#ef4444" },
  ];

  // Painel "Itens com atenção" — fonte única dessa informação no app (existiu
  // uma tela "Alertas" separada mostrando quase a mesma coisa; foi removida
  // por ficar redundante — agora esse painel é completo, sem cortar em 7
  // itens como antes, agrupado por tipo com rolagem interna se precisar).
  // Grupos "trein_*" reaproveitam o mesmo painel pra treinamentos (ASO/EPI/
  // etc. da sub-aba "Documentos > Treinamentos") vencendo em até 30 dias ou
  // já vencidos — `kind: "training"` avisa o render pra usar o formato de
  // colaborador/data em vez de categoria/quantidade.
  const trainVencidos = (trainingAlerts || []).filter(d => docStatus(d.data_vencimento).dias < 0);
  const trainVencendo = (trainingAlerts || []).filter(d => docStatus(d.data_vencimento).dias >= 0);

  const attentionGroups = [
    { key: "defeito", label: "Com defeito", color: "#ef4444", items: defItems, detail: i => `${tot(i)} unid.` },
    { key: "baixo", label: "Estoque baixo", color: "#eab308", items: baixoItems, detail: i => `${tot(i)}/${i.min_stock}` },
    { key: "verificar", label: "Verificação pendente", color: "#f97316", items: verItems, detail: i => `${tot(i)} unid.` },
    { key: "trein_vencido", label: "Treinamentos vencidos", color: "#ef4444", items: trainVencidos, kind: "training" },
    { key: "trein_vencendo", label: "Treinamentos vencendo em breve", color: "#f59e0b", items: trainVencendo, kind: "training" },
  ].filter(g => g.items.length > 0);
  const attentionTotal = attentionGroups.reduce((s, g) => s + g.items.length, 0);

  // Tendências semanais — variação líquida real (entrada - saída) nos
  // últimos 7 dias, restrita aos itens que hoje pertencem a cada grupo.
  // Não é um histórico perfeito de status (não reconstituímos transições
  // passadas), mas é um número honesto derivado de movimentações reais,
  // nunca inventado.
  const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString(); })();
  const weeklyDelta = ids => movs.reduce((s, m) => {
    if (!m.date_iso || m.date_iso < cutoff || !ids.has(m.item_id)) return s;
    if (m.dir === "entrada") return s + m.qty;
    if (m.dir === "saida") return s - m.qty;
    return s;
  }, 0);
  const idSet = arr => new Set(arr.map(i => i.id));
  const totalTrend = weeklyDelta(idSet(items));
  const estoqueTrend = weeklyDelta(idSet(estoqueItems));
  const usoTrend = weeklyDelta(idSet(usoItems));
  const defTrend = weeklyDelta(idSet(defItems));
  const baixoTrend = weeklyDelta(idSet(baixoItems));

  // Resumo (10/2026) — substituiu o gráfico de linha "Fluxo de estoque"
  // (entradas × saídas por dia): o usuário achou que não agregava valor,
  // porque com pouca movimentação diária a linha fica quase sempre reta/
  // vazia — uma série temporal só compensa quando há volume de dados pra
  // preencher os 14 dias. Em vez disso, isto é um snapshot de fatos prontos
  // (quantidade fixa de linhas, sempre com conteúdo), que fica útil mesmo
  // com poucos registros — mesma ideia do card "Summary" do print de
  // referência que o usuário mandou.
  const todayKey = dayKey(new Date());
  const movsToday = movs.filter(m => m.date_iso && movDayKey(m.date_iso) === todayKey).length;
  const movsWeek = movs.filter(m => m.date_iso && m.date_iso >= cutoff).length;
  const totalValue = itemsComValor.reduce((s, i) => s + i.valor_estimado * tot(i), 0);
  const topSector = sectorData.length ? [...sectorData].sort((a, b) => b.value - a.value)[0] : null;
  const openTasksCount = (tasks || []).filter(t => t.status !== "concluido").length;
  const summaryRows = [
    { icon: ArrowLeftRight, color: T.accent, label: "Movimentações hoje", value: String(movsToday) },
    { icon: TrendingUp, color: "#22c55e", label: "Movimentações esta semana", value: String(movsWeek) },
    { icon: Boxes, color: "#eab308", label: "Valor total em estoque", value: fmtBRL(totalValue) },
    ...(topSector && topSector.value > 0 ? [{ icon: MapPin, color: "#06b6d4", label: "Setor com mais unidades", value: `${topSector.label} (${topSector.value})` }] : []),
    ...(catValue.length && catValue[0].total > 0 ? [{ icon: Tags, color: "#8b5cf6", label: "Categoria mais valiosa", value: catValue[0].label }] : []),
    { icon: Kanban, color: "#f97316", label: "Tarefas em aberto", value: String(openTasksCount) },
  ];

  // Tarefas mais próximas do vencimento — só as que ainda não terminaram,
  // sem prazo vai pro fim da lista; em empate de prazo, a de maior
  // prioridade aparece primeiro (mesmo critério de ordenação do quadro
  // Kanban em Tarefas.jsx, só que aqui o prazo continua mandando — este
  // painel é sobre "o que vence logo", prioridade é só o desempate).
  const upcomingTasks = (tasks || [])
    .filter(t => t.status !== "concluido")
    .sort((a, b) => {
      const prazoCmp = (a.prazo || "9999-99-99").localeCompare(b.prazo || "9999-99-99");
      if (prazoCmp) return prazoCmp;
      return (TASK_PRIORITY[b.prioridade]?.order ?? TASK_PRIORITY.media.order) - (TASK_PRIORITY[a.prioridade]?.order ?? TASK_PRIORITY.media.order);
    })
    .slice(0, 6);

  const goInv = (patch) => {
    if (patch.status !== undefined) setInvStatus(patch.status);
    if (patch.categoria !== undefined) setInvCategoria(patch.categoria);
    if (patch.sector !== undefined) setInvSector(patch.sector);
    if (patch.search !== undefined) setInvSearch(patch.search);
    setView("inventario");
  };

  // Saudação com base no horário local do navegador — só um toque pessoal
  // no topo da Visão Geral (adaptado ao uso real: sem busca/"data range"
  // decorativos que não têm função aqui, diferente do painel de referência).
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = currentUser ? currentUser.trim().split(" ")[0] : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`
        @keyframes dash-greet-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .dash-greet{animation:dash-greet-in 320ms ease both}
        .qa-btn{transition:transform 160ms ease,border-color 160ms ease,box-shadow 160ms ease}
        .qa-btn:hover{transform:translateY(-2px);box-shadow:0 8px 18px -8px rgba(0,0,0,.3)}
        .qa-btn:active{transform:translateY(0) scale(.98)}
        .dash-row{transition:background 150ms ease}
      `}</style>

      <div className="dash-greet">
        <div style={{ fontSize: 17, fontWeight: 700, color: T.textBright }}>{greeting}{firstName ? `, ${firstName}` : ""}</div>
        <div style={{ fontSize: 12, color: T.textFaint, marginTop: 2 }}>Aqui está o resumo do estoque hoje.</div>
      </div>

      <div className="mob-grid-5" style={{ display: "grid", gap: 10 }}>
        {/* Rótulo "Total de unidades" (não "itens") porque o número é a SOMA de
            quantidade física de todos os tipos cadastrados — "itens" sozinho
            seria lido como contagem de tipos/SKUs, que é o que o sub-texto
            "X tipos" já mostra. Padronização de terminologia: tipo de item
            (registro/SKU) vs. unidade (peça física) nunca devem se confundir
            no mesmo número. */}
        <StatTile T={T} icon={Boxes} label="Total de unidades" value={totalAll} sub={`${items.length} tipos de item`} color={T.accent} trend={{ value: totalTrend }} onClick={() => goInv({ status: "todos", categoria: "Todas", sector: "Todos", search: "" })} delay={0} />
        <StatTile T={T} icon={Package} label="Em estoque" value={qEstoque} sub={`${pct(qEstoque)}% do total`} color="#eab308" trend={{ value: estoqueTrend }} onClick={() => goInv({ status: "todos" })} delay={40} />
        <StatTile T={T} icon={Wrench} label="Em uso" value={qUso} sub={`${pct(qUso)}% do total`} color="#3b82f6" trend={{ value: usoTrend }} onClick={() => goInv({ status: "uso-parcial" })} delay={80} />
        <StatTile T={T} icon={AlertTriangle} label="Com defeito" value={qDefeito} sub={`${pct(qDefeito)}% do total`} color="#ef4444" trend={{ value: defTrend }} onClick={() => goInv({ status: "defeituosos" })} delay={120} />
        <StatTile T={T} icon={TrendingDown} label="Estoque baixo" value={qBaixo} sub={`${pct(qBaixo)}% do total`} color="#f97316" trend={{ value: baixoTrend }} onClick={() => goInv({ status: "baixo" })} delay={160} />
      </div>

      <div className="dash-flow" style={{ display: "grid", gap: 14 }}>
        <PanelCard T={T} title="Resumo" icon={ListChecks} iconColor="#22c55e">
          {summaryRows.map((r, idx) => (
            <div key={r.label} className="dash-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: idx === summaryRows.length - 1 ? "none" : `1px solid ${T.borderSoft}`, animation: "pc-in 300ms ease both", animationDelay: `${Math.min(idx * 40, 240)}ms` }}>
              <span style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${r.color}18`, color: r.color }}>
                <r.icon size={13} strokeWidth={2.25} />
              </span>
              <span style={{ flex: 1, fontSize: 12, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.textBright, fontFamily: "'DM Mono',monospace", flexShrink: 0, whiteSpace: "nowrap", textAlign: "right" }}>{r.value}</span>
            </div>
          ))}
        </PanelCard>

        <PanelCard T={T} title={`Tarefas mais próximas${upcomingTasks.length ? ` (${upcomingTasks.length})` : ""}`} icon={Kanban} iconColor={T.accent} action="Ver quadro" onAction={() => onOpenTarefas && onOpenTarefas()}>
          {upcomingTasks.length === 0 && <div style={{ padding: "24px 16px", fontSize: 12, color: T.textFaint, textAlign: "center" }}>Nenhuma tarefa em aberto.</div>}
          {upcomingTasks.length > 0 && upcomingTasks.map((t, idx) => {
            const urgency = taskUrgency(t.prazo);
            const resp = t.responsaveis || [];
            const statusDot = TASK_STATUS[t.status]?.dot;
            const statusColor = statusDot ? (T.isLight ? statusDot.light : statusDot.dark) : T.textFaint;
            // Flag de prioridade só se destaca pra alta/urgente — mesmo
            // critério de "só mostra o que precisa de atenção" do resto do
            // painel (ver Tarefas.jsx, PersonTaskRow).
            const pcfg = TASK_PRIORITY[t.prioridade];
            const showPriority = pcfg && (t.prioridade === "alta" || t.prioridade === "urgente");
            const pColor = showPriority ? (T.isLight ? pcfg.color.light : pcfg.color.dark) : null;
            return (
              <div key={t.id} className="dash-row" onClick={() => onOpenTarefas && onOpenTarefas()} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 16px", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer", animation: "pc-in 300ms ease both", animationDelay: `${Math.min(idx * 35, 280)}ms` }} onMouseEnter={e => e.currentTarget.style.background = T.hover} onMouseLeave={e => e.currentTarget.style.background = ""}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {showPriority && <Flag size={10} strokeWidth={2.5} style={{ color: pColor, flexShrink: 0 }} />}
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.titulo}</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                    {resp.length ? resp.join(", ") : "Sem responsável"}{t.categoria ? ` · ${t.categoria}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: urgency.color || T.textFaint, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {t.prazo && <CalendarDays size={11} strokeWidth={2.25} style={{ opacity: .8 }} />}
                  {urgency.label}
                </div>
              </div>
            );
          })}
        </PanelCard>
      </div>

      <div className="dash-panels" style={{ display: "grid", gap: 14 }}>
        <PanelCard T={T} title={`Itens com atenção${attentionTotal ? ` (${attentionTotal})` : ""}`} icon={AlertTriangle} iconColor="#ef4444" action="Ver inventário" onAction={() => setView("inventario")}>
          {attentionTotal === 0 && <div style={{ padding: "24px 16px", fontSize: 12, color: T.textFaint, textAlign: "center" }}>Nenhum item precisa de atenção agora.</div>}
          {attentionTotal > 0 && (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {attentionGroups.map(g => (
                <div key={g.key}>
                  <div style={{ padding: "6px 16px", fontSize: 9.5, fontWeight: 700, color: g.color, textTransform: "uppercase", letterSpacing: .5, background: T.panelAlt }}>
                    {g.label} ({g.items.length})
                  </div>
                  {g.items.map((i, idx) => {
                    const isTraining = g.kind === "training";
                    const title = isTraining ? i.documento : i.name;
                    const handleClick = isTraining ? () => onOpenTreinamentos && onOpenTreinamentos() : () => goInv({ search: i.name });
                    return (
                      <div key={i.id} onClick={handleClick} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 16px", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer", transition: "background 180ms ease", animation: "pc-in 300ms ease both", animationDelay: `${Math.min(idx * 35, 280)}ms` }} onMouseEnter={e => e.currentTarget.style.background = T.hover} onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <span style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${g.color}18`, color: g.color }}>
                          <AlertTriangle size={13} strokeWidth={2.25} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                            {isTraining ? (
                              <span style={{ fontSize: 10, color: g.color }}>
                                {docStatus(i.data_vencimento).label}{isAdmin ? ` · ${i.colaborador}` : ""}
                              </span>
                            ) : (
                              <>
                                <CategoryBadge T={T} c={i.categoria || "Diversos"} color={catColor(i.categoria || "Diversos")} />
                                <span style={{ fontSize: 10, color: g.color }}>{g.detail(i)}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {!isTraining && onResolve && (
                          <button
                            onClick={e => { e.stopPropagation(); onResolve(i, g.key); }}
                            style={{ fontSize: 10.5, fontWeight: 700, color: g.color, background: `${g.color}14`, border: `1px solid ${g.color}30`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, transition: "background 150ms ease" }}
                            onMouseEnter={e => e.currentTarget.style.background = `${g.color}28`}
                            onMouseLeave={e => e.currentTarget.style.background = `${g.color}14`}
                          >
                            Resolver
                          </button>
                        )}
                        {isTraining && onOpenTreinamentos && (
                          <button
                            onClick={e => { e.stopPropagation(); onOpenTreinamentos(); }}
                            style={{ fontSize: 10.5, fontWeight: 700, color: g.color, background: `${g.color}14`, border: `1px solid ${g.color}30`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, transition: "background 150ms ease" }}
                            onMouseEnter={e => e.currentTarget.style.background = `${g.color}28`}
                            onMouseLeave={e => e.currentTarget.style.background = `${g.color}14`}
                          >
                            Ver
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard T={T} title="Movimentações recentes" icon={ArrowLeftRight} iconColor={T.accent} action="Ver todas" onAction={() => setView("movimentacoes")}>
          {movs.length === 0 && <div style={{ padding: "24px 16px", fontSize: 12, color: T.textFaint, textAlign: "center" }}>Nenhuma movimentação registrada.</div>}
          {movs.slice(0, 7).map((m, idx) => {
            const isIn = m.dir === "entrada", isTr = m.dir === "transferencia", isSt = m.dir === "status";
            const mc = isIn ? "#22c55e" : isTr ? T.accent : isSt ? "#eab308" : "#ef4444";
            return (
              <div key={m.id} className="dash-row" style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 16px", borderBottom: `1px solid ${T.borderSoft}`, animation: "pc-in 300ms ease both", animationDelay: `${Math.min(idx * 35, 280)}ms` }} onMouseEnter={e => e.currentTarget.style.background = T.hover} onMouseLeave={e => e.currentTarget.style.background = ""}>
                <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${mc}15`, color: mc }}>
                  <DirIcon dir={m.dir} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.item_name}</div>
                  <div style={{ fontSize: 10, color: T.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.resp} · {m.tipo}{m.dest && m.dest !== "—" && m.dest !== "lote" ? ` · ${m.dest}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: T.textFaint, whiteSpace: "nowrap", textAlign: "right", flexShrink: 0 }}>
                  {m.qty > 0 && <span style={{ fontFamily: "'DM Mono',monospace", color: mc, fontWeight: 600, marginRight: 6 }}>{isIn ? "+" : isTr ? "" : "-"}{m.qty}</span>}
                  <div>{fd(m.date_str)}</div>
                  <div style={{ opacity: .7 }}>{ft(m.date_str)}</div>
                </div>
              </div>
            );
          })}
        </PanelCard>
      </div>

      <div className="dash-donuts" style={{ display: "grid", gap: 14 }}>
        <PanelCard T={T} title="Status do Inventário" icon={Boxes} iconColor={T.accent}>
          <div style={{ padding: 16 }}>
            <DonutChart T={T} data={statusData} centerValue={totalAll} centerLabel="Total" />
          </div>
        </PanelCard>
        <PanelCard T={T} title="Distribuição por Categoria" icon={Tags} iconColor="#8b5cf6" action="Ver todas" onAction={() => goInv({ categoria: "Todas" })}>
          <div style={{ padding: 16 }}>
            <DonutChart T={T} data={catData} centerValue={items.length} centerLabel="tipos" />
          </div>
        </PanelCard>
        <PanelCard T={T} title="Distribuição por Setor" icon={MapPin} iconColor="#06b6d4">
          <div style={{ padding: 16 }}>
            <DonutChart T={T} data={sectorData} centerValue={totalAll} centerLabel="unidades" />
          </div>
        </PanelCard>
      </div>

      {itemsComValor.length > 0 && (
        <PanelCard T={T} title="Top categorias por valor" icon={TrendingUp} iconColor="#16a34a" action="Ver inventário" onAction={() => setView("inventario")}>
          <div style={{ padding: "6px 16px 16px" }}>
            <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 12 }}>
              Baseado em {itemsComValor.length} {itemsComValor.length === 1 ? "item com valor estimado" : "itens com valor estimado"} — os demais ainda não têm preço cadastrado.
            </div>
            {catValue.map((c, idx) => (
              <div key={c.label} style={{ marginBottom: 10, animation: "pc-in 360ms ease both", animationDelay: `${Math.min(idx * 50, 300)}ms` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{c.label}</span>
                  <span style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", fontWeight: 700, color: c.total > 0 ? T.textBright : T.textFaint }}>
                    {c.total > 0 ? fmtBRL(c.total) : "sem dados"}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: T.panelAlt, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(c.total / maxCatValue) * 100}%`, background: c.color, borderRadius: 3, transition: "width 900ms cubic-bezier(.2,.8,.2,1)", transitionDelay: `${100 + idx * 50}ms` }} />
                </div>
                <div style={{ fontSize: 9, color: T.textFaint, marginTop: 2 }}>{c.precificados} de {c.totalItens} itens precificados</div>
              </div>
            ))}
          </div>
        </PanelCard>
      )}

      <PanelCard T={T} title="Ações rápidas" icon={Zap} iconColor="#eab308">
        <div className="quick-actions" style={{ display: "grid", gap: 10, padding: 14 }}>
          {[
            { l: "Novo Item", sub: "Adicionar ao inventário", icon: Plus, c: T.accent, fn: onNewItem },
            { l: "Movimentação", sub: "Registrar entrada ou saída", icon: ArrowUpDown, c: "#22c55e", fn: () => setView("inventario") },
            { l: "Transferência", sub: "Mover entre locais", icon: ArrowLeftRight, c: "#8b5cf6", fn: () => setView("inventario") },
            { l: "Relatórios", sub: "Gerar relatórios", icon: FileText, c: "#06b6d4", fn: onOpenReports },
            { l: "Inventário físico", sub: "Iniciar contagem", icon: ClipboardCheck, c: "#f97316", fn: () => showToast("Contagem de inventário físico — em breve", "warn") },
          ].map((a, i) => (
            <button key={i} className="qa-btn" onClick={a.fn} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, border: `1px solid ${T.border}`, background: T.panelAlt, cursor: "pointer", fontFamily: "inherit", textAlign: "left", animation: "pc-in 320ms ease both", animationDelay: `${i * 40}ms` }}>
              <span style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: `${a.c}18`, color: a.c }}><a.icon size={14} strokeWidth={2.25} /></span>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: T.textBright }}>{a.l}</div>
                <div style={{ fontSize: 10, color: T.textFaint }}>{a.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </PanelCard>
    </div>
  );
}

export const Dashboard = memo(DashboardImpl);
