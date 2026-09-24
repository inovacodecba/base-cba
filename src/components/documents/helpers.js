// Helpers de apresentação para a aba "Documentos": ícone/cor por tipo de
// arquivo (deduzido do mime_type, com fallback pela extensão do nome),
// formatação legível de tamanho, e detecção de tipos com preview inline
// (imagem/PDF) — os demais tipos abrem/baixam direto, sem tentar renderizar
// dentro do app.
import { FileText, Image as ImageIcon, FileSpreadsheet, FileArchive, FileVideo, FileAudio, File as FileIcon } from "lucide-react";

export function fileKind(mime = "", name = "") {
  mime = mime || "";
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext))
    return { icon: ImageIcon, color: "#22c55e", label: "Imagem" };
  if (mime === "application/pdf" || ext === "pdf")
    return { icon: FileText, color: "#ef4444", label: "PDF" };
  if (["doc", "docx", "odt", "rtf"].includes(ext) || mime.includes("word"))
    return { icon: FileText, color: "#3b82f6", label: "Documento" };
  if (["xls", "xlsx", "csv", "ods"].includes(ext) || mime.includes("sheet") || mime.includes("excel") || mime === "text/csv")
    return { icon: FileSpreadsheet, color: "#16a34a", label: "Planilha" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext) || mime.includes("zip") || mime.includes("compressed"))
    return { icon: FileArchive, color: "#a855f7", label: "Arquivo compactado" };
  if (mime.startsWith("video/") || ["mp4", "mov", "avi", "mkv"].includes(ext))
    return { icon: FileVideo, color: "#f97316", label: "Vídeo" };
  if (mime.startsWith("audio/") || ["mp3", "wav", "m4a"].includes(ext))
    return { icon: FileAudio, color: "#06b6d4", label: "Áudio" };
  return { icon: FileIcon, color: "#6b7280", label: "Arquivo" };
}

export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function isPreviewable(mime = "", name = "") {
  mime = mime || "";
  const ext = (name.split(".").pop() || "").toLowerCase();
  return mime.startsWith("image/") || mime === "application/pdf" || ["jpg", "jpeg", "png", "gif", "webp", "pdf"].includes(ext);
}

export function isImageFile(mime = "", name = "") {
  mime = mime || "";
  const ext = (name.split(".").pop() || "").toLowerCase();
  return mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext);
}

// Gera uma miniatura leve (JPEG, lado maior limitado a `maxSize`) de uma foto
// recém-enviada, redimensionando via <canvas> antes de subir pro Storage.
// Por quê: sem isso, o card na grade de Documentos usaria a foto original
// como thumbnail — uma foto de celular fácil chega a 3-5MB, e uma pasta com
// 20 fotos viraria 60-100MB só pra mostrar quadradinhos de 52px, o que é
// especialmente ruim numa PWA usada no chão de fábrica com wi-fi/4G fraco.
// Gerar (e fazer upload de) uma miniatura de ~15-30KB junto do original
// resolve isso sem precisar de nenhuma biblioteca nova.
// Retorna `null` (em vez de rejeitar) se o navegador não conseguir decodificar
// a imagem — nesse caso o card cai de volta pra mostrar a foto original em
// tamanho cheio (pior pra performance, mas nunca quebra o upload).
export function makeThumbnail(file, { maxSize = 320, quality = 0.75 } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob); }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// Status de validade de um documento de colaborador (aba "Documentos da
// Equipe"), sempre CALCULADO a partir de "data_vencimento" comparado com
// hoje — nunca armazenado no banco. Evita repetir o bug da planilha
// original, onde a coluna de status ficava desatualizada/quebrada quando a
// data de vencimento estava em branco (valores como "-46246 dias").
export function formatDateBR(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function docStatus(dataVencimento) {
  if (!dataVencimento) return { label: "Sem vencimento", color: "#6b7280", bg: "#6b728022" };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const venc = new Date(dataVencimento + "T00:00:00");
  const dias = Math.round((venc - hoje) / 86400000);
  if (dias < 0) return { label: "Vencido", color: "#ef4444", bg: "#ef444422", dias };
  if (dias <= 30) return { label: `Vence em ${dias}d`, color: "#f59e0b", bg: "#f59e0b22", dias };
  return { label: "Válido", color: "#22c55e", bg: "#22c55e22", dias };
}
