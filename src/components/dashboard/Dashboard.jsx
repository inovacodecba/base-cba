// Visão Geral (Dashboard). Recebe os dados já carregados via props e é
// puramente apresentacional — toda a lógica de estado/CRUD continua
// centralizada no App.jsx, seguindo o padrão container/presentational.
import { memo } from "react";
import {
  Boxes, Package, Wrench, AlertTriangle, TrendingDown, Plus, ArrowUpDown,
  ArrowLeftRight, FileText, ClipboardCheck,
} from "lucide-react";
import { PanelCard, StatTile, DonutChart } from "./pieces.jsx";
import { DirIcon, CategoryBadge } from "../common.jsx";
import { tot, isLow, fd, ft, fmtBRL, disponibilidade } from "../../utils.js";
import { docStatus } from "../documents/helpers.js";

const isDefect = i => i.condicao === "defeito" || i.condicao === "defeito parcial";

// memo(): o Dashboard só é montado quando view==="dashboard", mas enquanto
// visível, qualquer render do App (ex.: abrir um modal) o recriaria e
// recalcularia todos os dados derivados (donuts, tendências, "itens com
// atenção") à toa. Com T memoizado e os handlers em useCallback no App.jsx,
// as props ficam estáveis entre renders não relacionados, e o memo() evita
// esse trabalho repetido.
// `categoryNames`/`catColor` vêm do App.jsx (categorias agora são dinâmicas,
// geridas em "Categorias" — mesmo padrão de `sectorNames`/`sectorColor`).
function DashboardImpl({ T, items, movs, sectorNames, sectorColor, categoryNames, catColor, setView, setInvStatus, setInvCategoria, setInvSector, setInvSearch, onNewItem, onOpenBatch, onOpenReports, onResolve, trainingAlerts, currentUser, isAdmin, onOpenTreinamentos, showToast }) {
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

  const goInv = (patch) => {
    if (patch.status !== undefined) setInvStatus(patch.status);
    if (patch.categoria !== undefined) setInvCategoria(patch.categoria);
    if (patch.sector !== undefined) setInvSector(patch.sector);
    if (patch.search !== undefined) setInvSearch(patch.search);
    setView("inventario");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="mob-grid-5" style={{ display: "grid", gap: 10 }}>
        {/* Rótulo "Total de unidades" (não "itens") porque o número é a SOMA de
            quantidade física de todos os tipos cadastrados — "itens" sozinho
            seria lido como contagem de tipos/SKUs, que é o que o sub-texto
            "X tipos" já mostra. Padronização de terminologia: tipo de item
            (registro/SKU) vs. unidade (peça física) nunca devem se confundir
            no mesmo número. */}
        <StatTile T={T} icon={Boxes} label="Total de unidades" value={totalAll} sub={`${items.length} tipos de item`} color={T.accent} trend={{ value: totalTrend }} onClick={() => goInv({ status: "todos", categoria: "Todas", sector: "Todos", search: "" })} />
        <StatTile T={T} icon={Package} label="Em estoque" value={qEstoque} sub={`${pct(qEstoque)}% do total`} color="#eab308" trend={{ value: estoqueTrend }} onClick={() => goInv({ status: "todos" })} />
        <StatTile T={T} icon={Wrench} label="Em uso" value={qUso} sub={`${pct(qUso)}% do total`} color="#3b82f6" trend={{ value: usoTrend }} onClick={() => goInv({ status: "uso-parcial" })} />
        <StatTile T={T} icon={AlertTriangle} label="Com defeito" value={qDefeito} sub={`${pct(qDefeito)}% do total`} color="#ef4444" trend={{ value: defTrend }} onClick={() => goInv({ status: "defeituosos" })} />
        <StatTile T={T} icon={TrendingDown} label="Estoque baixo" value={qBaixo} sub={`${pct(qBaixo)}% do total`} color="#f97316" trend={{ value: baixoTrend }} onClick={() => goInv({ status: "baixo" })} />
      </div>

      <div className="dash-panels" style={{ display: "grid", gap: 14 }}>
        <PanelCard T={T} title={`Itens com atenção${attentionTotal ? ` (${attentionTotal})` : ""}`} action="Ver inventário" onAction={() => setView("inventario")}>
          {attentionTotal === 0 && <div style={{ padding: "24px 16px", fontSize: 12, color: T.textFaint, textAlign: "center" }}>Nenhum item precisa de atenção agora.</div>}
          {attentionTotal > 0 && (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {attentionGroups.map(g => (
                <div key={g.key}>
                  <div style={{ padding: "6px 16px", fontSize: 9.5, fontWeight: 700, color: g.color, textTransform: "uppercase", letterSpacing: .5, background: T.panelAlt }}>
                    {g.label} ({g.items.length})
                  </div>
                  {g.items.map(i => {
                    const isTraining = g.kind === "training";
                    const title = isTraining ? i.documento : i.name;
                    const handleClick = isTraining ? () => onOpenTreinamentos && onOpenTreinamentos() : () => goInv({ search: i.name });
                    return (
                      <div key={i.id} onClick={handleClick} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 16px", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer", transition: "background 180ms ease" }} onMouseEnter={e => e.currentTarget.style.background = T.hover} onMouseLeave={e => e.currentTarget.style.background = ""}>
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

        <PanelCard T={T} title="Movimentações recentes" action="Ver todas" onAction={() => setView("movimentacoes")}>
          {movs.length === 0 && <div style={{ padding: "24px 16px", fontSize: 12, color: T.textFaint, textAlign: "center" }}>Nenhuma movimentação registrada.</div>}
          {movs.slice(0, 7).map(m => {
            const isIn = m.dir === "entrada", isTr = m.dir === "transferencia", isSt = m.dir === "status";
            const mc = isIn ? "#22c55e" : isTr ? T.accent : isSt ? "#eab308" : "#ef4444";
            return (
              <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 16px", borderBottom: `1px solid ${T.borderSoft}` }}>
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
        <PanelCard T={T} title="Status do Inventário">
          <div style={{ padding: 16 }}>
            <DonutChart T={T} data={statusData} centerValue={totalAll} centerLabel="Total" />
          </div>
        </PanelCard>
        <PanelCard T={T} title="Distribuição por Categoria" action="Ver todas" onAction={() => goInv({ categoria: "Todas" })}>
          <div style={{ padding: 16 }}>
            <DonutChart T={T} data={catData} centerValue={items.length} centerLabel="tipos" />
          </div>
        </PanelCard>
        <PanelCard T={T} title="Distribuição por Setor">
          <div style={{ padding: 16 }}>
            <DonutChart T={T} data={sectorData} centerValue={totalAll} centerLabel="unidades" />
          </div>
        </PanelCard>
      </div>

      {itemsComValor.length > 0 && (
        <PanelCard T={T} title="Top categorias por valor" action="Ver inventário" onAction={() => setView("inventario")}>
          <div style={{ padding: "6px 16px 16px" }}>
            <div style={{ fontSize: 10, color: T.textFaint, marginBottom: 12 }}>
              Baseado em {itemsComValor.length} {itemsComValor.length === 1 ? "item com valor estimado" : "itens com valor estimado"} — os demais ainda não têm preço cadastrado.
            </div>
            {catValue.map(c => (
              <div key={c.label} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{c.label}</span>
                  <span style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", fontWeight: 700, color: c.total > 0 ? T.textBright : T.textFaint }}>
                    {c.total > 0 ? fmtBRL(c.total) : "sem dados"}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: T.panelAlt, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(c.total / maxCatValue) * 100}%`, background: c.color, borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 9, color: T.textFaint, marginTop: 2 }}>{c.precificados} de {c.totalItens} itens precificados</div>
              </div>
            ))}
          </div>
        </PanelCard>
      )}

      <PanelCard T={T} title="Ações rápidas">
        <div className="quick-actions" style={{ display: "grid", gap: 10, padding: 14 }}>
          {[
            { l: "Novo Item", sub: "Adicionar ao inventário", icon: Plus, c: T.accent, fn: onNewItem },
            { l: "Movimentação", sub: "Registrar entrada ou saída", icon: ArrowUpDown, c: "#22c55e", fn: () => setView("inventario") },
            { l: "Transferência", sub: "Mover entre locais", icon: ArrowLeftRight, c: "#8b5cf6", fn: () => setView("inventario") },
            { l: "Relatórios", sub: "Gerar relatórios", icon: FileText, c: "#06b6d4", fn: onOpenReports },
            { l: "Inventário físico", sub: "Iniciar contagem", icon: ClipboardCheck, c: "#f97316", fn: () => showToast("Contagem de inventário físico — em breve", "warn") },
          ].map((a, i) => (
            <button key={i} onClick={a.fn} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 7, border: `1px solid ${T.border}`, background: T.panelAlt, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
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
