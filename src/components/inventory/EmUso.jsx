// Tela dedicada "Equipamentos em Uso" (view "em-uso") — mostra só os itens
// com parte da quantidade em uso (`qty_in_use > 0`, controlado no detalhe do
// item), separado do estoque parado. Acessada a partir de um atalho no topo
// do Inventário, não fica no menu principal (evita poluir a navegação com
// mais uma entrada para o que é, na prática, um recorte do inventário).
import { memo } from "react";
import { Wrench } from "lucide-react";
import { PanelCard, StatTile } from "../dashboard/pieces.jsx";
import { CategoryBadge } from "../common.jsx";
import { tot } from "../../utils.js";

function EmUsoImpl({ T, items, catColor, onOpenItem, onBack }) {
  const emUso = items
    .filter(i => (i.qty_in_use || 0) > 0)
    .sort((a, b) => (b.qty_in_use || 0) - (a.qty_in_use || 0));

  const totalUso = emUso.reduce((s, i) => s + (i.qty_in_use || 0), 0);
  const totalEstoqueRestante = emUso.reduce((s, i) => s + Math.max(0, tot(i) - (i.qty_in_use || 0)), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button onClick={onBack} style={{
        display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "flex-start",
        fontSize: 11.5, fontWeight: 600, color: T.textMuted, background: "none", border: "none",
        cursor: "pointer", fontFamily: "inherit", padding: "2px 0",
      }}>
        ‹ Voltar ao Inventário
      </button>

      <div className="mob-grid-3" style={{ display: "grid", gap: 10 }}>
        <StatTile T={T} icon={Wrench} label="Itens com uso ativo" value={emUso.length} color="#3b82f6" />
        <StatTile T={T} icon={Wrench} label="Unidades em uso" value={totalUso} color="#3b82f6" />
        <StatTile T={T} icon={Wrench} label="Unidades ainda em estoque" value={totalEstoqueRestante} color={T.textFaint} />
      </div>

      <PanelCard T={T} title={`Equipamentos em uso (${emUso.length})`}>
        {emUso.length === 0 && (
          <div style={{ padding: "32px 16px", fontSize: 12, color: T.textFaint, textAlign: "center" }}>
            Nenhum item com quantidade em uso registrada agora.
          </div>
        )}
        {emUso.map(i => {
          const estoque = Math.max(0, tot(i) - (i.qty_in_use || 0));
          return (
            <div
              key={i.id}
              onClick={() => onOpenItem(i)}
              style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 16px", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer", transition: "background 180ms ease" }}
              onMouseEnter={e => e.currentTarget.style.background = T.hover}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                  <CategoryBadge T={T} c={i.categoria || "Diversos"} color={catColor(i.categoria || "Diversos")} />
                  {i.responsavel && (
                    <span style={{ fontSize: 10, color: T.textFaint }}>
                      {i.responsavel}
                    </span>
                  )}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(i.locations || []).map((l, li) => (
                      <span key={li} style={{ fontSize: 9.5, background: T.panelAlt, border: `1px solid ${T.borderSoft}`, padding: "1px 6px", borderRadius: 3, color: T.textMuted, whiteSpace: "nowrap" }}>
                        {l.sector}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <div style={{ textAlign: "right", minWidth: 46 }}>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 15, fontWeight: 700, color: "#3b82f6" }}>{i.qty_in_use}</div>
                  <div style={{ fontSize: 8.5, color: T.textFaint, textTransform: "uppercase", letterSpacing: .4 }}>Em uso</div>
                </div>
                <div style={{ textAlign: "right", minWidth: 46 }}>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 15, fontWeight: 700, color: T.textBright }}>{estoque}</div>
                  <div style={{ fontSize: 8.5, color: T.textFaint, textTransform: "uppercase", letterSpacing: .4 }}>Estoque</div>
                </div>
              </div>
            </div>
          );
        })}
      </PanelCard>
    </div>
  );
}

export const EmUso = memo(EmUsoImpl);
