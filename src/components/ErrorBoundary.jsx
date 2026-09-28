// Evita a "tela branca": se uma tela quebrar (erro de JavaScript ou falha ao
// baixar um pedaço do app), mostra a mensagem e um botão de recarregar em
// vez de derrubar o app inteiro (28/09/2026).
import { Component } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro, info) { console.error("[ErrorBoundary]", erro, info?.componentStack); }
  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    const { T } = this.props;
    const recarregar = () => { try { sessionStorage.removeItem("chunk-reload"); } catch { /* ignora */ } window.location.reload(); };
    return (
      <div style={{ background: T.panel, border: "1px solid #ef444466", borderRadius: 10, padding: 18, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <AlertTriangle size={22} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: T.textBright, fontSize: 14 }}>Não foi possível abrir esta tela</div>
          <div style={{ fontSize: 12.5, color: T.textMuted, margin: "4px 0 12px" }}>Recarregue o app. Se continuar, mande um print desta mensagem.</div>
          <div style={{ fontSize: 11, color: T.textFaint, fontFamily: "'DM Mono',monospace", wordBreak: "break-word", marginBottom: 12 }}>{String(erro?.message || erro)}</div>
          <button onClick={recarregar} style={{ background: T.accent, color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 600, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
            <RotateCw size={14} /> Recarregar
          </button>
        </div>
      </div>
    );
  }
}
