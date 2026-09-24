// Central de Alertas — tela dedicada (view "alertas"), acessível pelo menu
// lateral e pelo sino no topo (que antes só filtrava o Inventário por
// "estoque baixo"). Reaproveita a mesma lógica de "itens com atenção" que já
// existia no Dashboard, só que sem o corte de 7 itens e agrupada por tipo —
// aqui é o lugar certo pra ver TUDO que precisa de atenção, não só um resumo.
import { memo } from "react";
import { AlertTriangle, TrendingDown, ClipboardCheck } from "lucide-react";
import { PanelCard } from "../dashboard/pieces.jsx";
import { CategoryBadge } from "../common.jsx";
import { tot, isLow } from "../../utils.js";

const isDefect = i => i.condicao === "defeito" || i.condicao === "defeito parcial";

function AlertGroup({ T, title, color, Icon, items, catColor, onResolve, onSelectItem, detail }) {
  return (
    <PanelCard T={T} title={`${title} (${items.length})`}>
      {items.length === 0 && (
        <div style={{ padding: "24px 16px", fontSize: 12, color: T.textFaint, textAlign: "center" }}>
          Nenhum item nessa condição agora.
        </div>
      )}
      {items.map(i => (
        <div
          key={i.id}
          onClick={() => onSelectItem(i)}
          style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${T.borderSoft}`, cursor: "pointer", transition: "background 180ms ease" }}
          onMouseEnter={e => e.currentTarget.style.background = T.hover}
          onMouseLeave={e => e.currentTarget.style.background = ""}
        >
          <span style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}18`, color }}>
            <Icon size={14} strokeWidth={2.25} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <CategoryBadge T={T} c={i.categoria || "Diversos"} color={catColor(i.categoria || "Diversos")} />
              <span style={{ fontSize: 10, color }}>{detail(i)}</span>
            </div>
          </div>
          {onResolve && (
            <button
              onClick={e => { e.stopPropagation(); onResolve(i, title === "Estoque baixo" ? "baixo" : title === "Com defeito" ? "defeito" : "verificar"); }}
              style={{ fontSize: 10.5, fontWeight: 700, color, background: `${color}14`, border: `1px solid ${color}30`, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, transition: "background 150ms ease" }}
              onMouseEnter={e => e.currentTarget.style.background = `${color}28`}
              onMouseLeave={e => e.currentTarget.style.background = `${color}14`}
            >
              Resolver
            </button>
          )}
        </div>
      ))}
    </PanelCard>
  );
}

function AlertasImpl({ T, items, catColor, onResolve, onSelectItem }) {
  const defItems = items.filter(isDefect);
  const baixoItems = items.filter(i => !isDefect(i) && isLow(i));
  const verItems = items.filter(i => i.condicao === "verificar");
  const total = defItems.length + baixoItems.length + verItems.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: T.textMuted }}>
        {total === 0
          ? "Nenhum item precisa de atenção agora — tudo em dia."
          : <>{total} {total === 1 ? "item precisa" : "itens precisam"} de atenção — defeito, estoque baixo ou verificação pendente.</>}
      </div>

      <AlertGroup
        T={T} title="Com defeito" color="#ef4444" Icon={AlertTriangle}
        items={defItems} catColor={catColor} onResolve={onResolve} onSelectItem={onSelectItem}
        detail={i => `${tot(i)} unid.`}
      />
      <AlertGroup
        T={T} title="Estoque baixo" color="#eab308" Icon={TrendingDown}
        items={baixoItems} catColor={catColor} onResolve={onResolve} onSelectItem={onSelectItem}
        detail={i => `${tot(i)}/${i.min_stock}`}
      />
      <AlertGroup
        T={T} title="Verificação pendente" color="#f97316" Icon={ClipboardCheck}
        items={verItems} catColor={catColor} onResolve={onResolve} onSelectItem={onSelectItem}
        detail={i => `${tot(i)} unid.`}
      />
    </div>
  );
}

export const Alertas = memo(AlertasImpl);
