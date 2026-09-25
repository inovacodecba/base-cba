// Leitor de QR Code pela câmera, dentro do app (24/09/2026).
//
// Por que existe: quando o site está instalado como app (PWA) no celular,
// escanear o QR com a câmera do sistema abre o link no NAVEGADOR, não no
// app — e no iPhone o app instalado tem login separado do Safari. Lendo o
// QR por aqui, a pessoa fica sempre dentro do app, já logada.
//
// Como lê: usa o BarcodeDetector nativo do navegador quando existe (Android/
// Chrome — rápido, sem baixar nada); senão, cai no jsQR (JS puro, funciona
// no iPhone), carregado sob demanda só quando o leitor é aberto.
// Câmera exige HTTPS — o GitHub Pages já é HTTPS.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// Aceita o link completo do QR (…/base-cba/?ponto=CODIGO) ou só o código.
export function extrairCodigoPonto(texto) {
  const t = (texto || "").trim();
  try {
    const u = new URL(t);
    const c = u.searchParams.get("ponto");
    if (c) return c;
  } catch { /* não é URL */ }
  return /^[a-f0-9]{12}$/.test(t) ? t : null;
}

export function QrScanner({ T, onResult, onClose }) {
  const videoRef = useRef(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    let stream = null, parado = false, timer = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const iniciar = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro("Este navegador não permite usar a câmera. Use a câmera do celular para ler o QR Code.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        setErro(e?.name === "NotAllowedError"
          ? "Permissão da câmera negada. Libere a câmera para este site nas configurações do navegador e tente de novo."
          : "Não foi possível abrir a câmera.");
        return;
      }
      if (parado) { stream.getTracks().forEach(t => t.stop()); return; }
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => {});

      let detector = null, jsQR = null;
      if ("BarcodeDetector" in window) {
        try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch { detector = null; }
      }
      if (!detector) jsQR = (await import("jsqr")).default;

      const ler = async () => {
        if (parado) return;
        let texto = null;
        try {
          if (video.readyState >= 2 && video.videoWidth) {
            if (detector) {
              const r = await detector.detect(video);
              texto = r[0]?.rawValue || null;
            } else {
              const escala = Math.min(1, 640 / video.videoWidth);
              canvas.width = Math.round(video.videoWidth * escala);
              canvas.height = Math.round(video.videoHeight * escala);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              texto = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || null;
            }
          }
        } catch { /* quadro ruim, tenta o próximo */ }
        if (texto) {
          const codigo = extrairCodigoPonto(texto);
          if (codigo) {
            if (navigator.vibrate) navigator.vibrate(80);
            parado = true;
            onResult(codigo);
            return;
          }
          setAviso("Esse QR Code não é de um local de ponto.");
        }
        timer = setTimeout(ler, 200);
      };
      ler();
    };
    iniciar();

    return () => {
      parado = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [onResult]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 1100, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "calc(12px + env(safe-area-inset-top, 0px)) 14px 12px", color: "#fff" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Escanear QR Code do local</span>
        <button onClick={onClose} aria-label="Fechar" style={{ marginLeft: "auto", background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X size={20} />
        </button>
      </div>
      <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {!erro && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ width: "65vmin", height: "65vmin", border: `3px solid ${T.accent}`, borderRadius: 16, boxShadow: "0 0 0 9999px rgba(0,0,0,.45)" }} />
          </div>
        )}
        {erro && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: "#fff", textAlign: "center", fontSize: 14 }}>{erro}</div>
        )}
      </div>
      <div style={{ padding: "14px 16px calc(18px + env(safe-area-inset-bottom, 0px))", color: aviso ? "#fbbf24" : "#ccc", textAlign: "center", fontSize: 13 }}>
        {aviso || "Aponte para o QR Code colado no local"}
      </div>
    </div>
  );
}
