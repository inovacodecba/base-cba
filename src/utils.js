// Funções utilitárias puras, sem estado — extraídas do App.jsx original
// para reuso pelos componentes de dashboard. Comportamento inalterado.

export const ts = () => new Date().toLocaleString("pt-BR");
export const fd = s => s?.split(", ")[0] ?? "";
export const ft = s => s?.split(", ")[1] ?? "";
export const tot = it => (it.locations || []).reduce((s, l) => s + l.qty, 0);
export const isLow = it => tot(it) <= it.min_stock && it.condicao !== "defeito";
export const fmtBRL = v => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Disponibilidade (estoque / uso parcial / em uso) — derivada, nunca salva.
// Compara `qty_in_use` (editado no detalhe do item) contra a quantidade
// total do item (soma dos locais). Ver constants.js (DISP) para cor/label.
export const disponibilidade = it => {
  const t = tot(it), u = it.qty_in_use || 0;
  if (u <= 0) return "estoque";
  if (u >= t) return "em uso";
  return "parcial";
};

export function toCSV(rows) {
  return rows.map(r => r.map(c => { const s = String(c ?? ""); return /["\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
}

export function dlCSV(name, rows) {
  const blob = new Blob(["﻿" + toCSV(rows)], { type: "text/csv;charset=utf-8;sep=;" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
