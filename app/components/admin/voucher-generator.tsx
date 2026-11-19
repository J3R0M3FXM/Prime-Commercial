"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Send, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { callServerless } from "@/lib/telegram-serverless-client";
import "@fontsource/lato/700.css";
import "./voucher-generator.css";

const WIDTH = 1836, HEIGHT = 857;
const TEMPLATE = "/voucher-template-color.png";

export function makeVoucherCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `PRIME-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
}

export async function sendVoucherFile(file: File, onProgress?: (completed: number, total: number) => void) {
  if (!window.crypto?.getRandomValues) throw new Error("Secure voucher delivery is unavailable on this device.");
  const bytes = typeof file.arrayBuffer === "function" ? new Uint8Array(await file.arrayBuffer()) : await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(new Uint8Array(reader.result)) : reject(new Error("Could not read the voucher image."));
    reader.onerror = () => reject(new Error("Could not read the voucher image."));
    reader.readAsArrayBuffer(file);
  });
  if (bytes.length < 8 || bytes.length > 8 * 1024 * 1024) throw new Error("The voucher image is too large to send.");
  const id = Array.from(window.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
  const chunkSize = 256 * 1024, count = Math.ceil(bytes.length / chunkSize);
  let started = false, sending = false;
  try {
    const start = await callServerless<{ success: boolean }>("sendVoucherToTelegram", { action: "start", uploadId: id, fileName: file.name, fileSize: bytes.length, chunkCount: count }, 30_000);
    if (!start?.success) throw new Error("Could not start voucher delivery.");
    started = true;
    for (let index = 0; index < count; index++) {
      const part = bytes.subarray(index * chunkSize, Math.min((index + 1) * chunkSize, bytes.length));
      let binary = "";
      for (let offset = 0; offset < part.length; offset += 0x8000) binary += String.fromCharCode(...part.subarray(offset, Math.min(offset + 0x8000, part.length)));
      const data = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const result = await callServerless<{ success: boolean }>("sendVoucherToTelegram", { action: "chunk", uploadId: id, index, data }, 30_000);
      if (!result?.success) throw new Error("A voucher image part was not confirmed.");
      onProgress?.(index + 1, count);
    }
    sending = true;
    const result = await callServerless<{ success: boolean; messageId?: number }>("sendVoucherToTelegram", { action: "send", uploadId: id }, 120_000);
    if (!result?.success || !result.messageId) throw new Error("Telegram did not confirm voucher delivery.");
  } catch (error: any) {
    if (started && !sending) { try { await callServerless("sendVoucherToTelegram", { action: "cancel", uploadId: id }, 15_000); } catch { /* Preserve the original failure. */ } }
    if (sending) throw new Error("Delivery could not be confirmed. Check your PRIME bot chat before retrying. If needed, open the bot and press Start.");
    throw error;
  }
}

export function drawVoucher(ctx: CanvasRenderingContext2D, template: CanvasImageSource, qr: CanvasImageSource, code: string) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(template, 0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#101e32";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxWidth = 800;
  let fontSize = 72, lines: string[] = [];
  while (fontSize > 38) {
    ctx.font = `700 ${fontSize}px "Lato Condensed", "Lato", sans-serif`;
    if (ctx.measureText(code).width <= maxWidth) break;
    fontSize -= 2;
  }
  do {
    ctx.font = `700 ${fontSize}px "Lato Condensed", "Lato", sans-serif`;
    lines = [""];
    for (const character of Array.from(code)) {
      const index = lines.length - 1;
      const next = lines[index] + character;
      if (lines[index] && ctx.measureText(next).width > maxWidth) lines.push(character);
      else lines[index] = next;
    }
    if (lines.length <= 3) break;
    fontSize -= 2;
  } while (fontSize >= 18);
  const lineHeight = fontSize * 1.08;
  lines.forEach((line, index) => ctx.fillText(line, 503, 510 + (index - (lines.length - 1) / 2) * lineHeight));
  // Replace the four decorative placeholder corners with a complete QR,
  // including its required white quiet zone, inside the marked frame.
  ctx.fillStyle = "#fff";
  ctx.fillRect(1052, 418, 184, 184);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, 1052, 418, 184, 184);
}

export default function VoucherGenerator({ code, active, onClose }: { code: string; active: boolean; onClose: () => void }) {
  const output = useRef<HTMLCanvasElement>(null);
  const qr = useRef<HTMLCanvasElement>(null);
  const imageBlob = useRef<Blob | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    let current = true, objectUrl = "";
    setReady(false); setError(""); setPreviewUrl(""); imageBlob.current = null;
    const image = new Image();
    const imageReady = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The voucher template could not be loaded."));
      image.src = TEMPLATE;
    });
    const prepare = async () => {
      if (!document.fonts?.load) throw new Error("The voucher font could not be loaded on this device.");
      const [, fonts] = await Promise.all([imageReady, document.fonts.load('700 72px "Lato Condensed", "Lato", sans-serif', code)]);
      if (!fonts.length) throw new Error("The voucher font could not be loaded on this device.");
      if (!current) return;
      const canvas = output.current, qrCanvas = qr.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !qrCanvas) throw new Error("Voucher image generation is not available on this device.");
      drawVoucher(ctx, image, qrCanvas, code);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not create the voucher image.")), "image/png"));
      if (!current) return;
      imageBlob.current = blob;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
      setReady(true);
    };
    void prepare().catch(err => { if (current) setError(err?.message || "Could not generate the voucher."); });
    return () => { current = false; image.onload = null; image.onerror = null; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [code]);

  const filename = `PRIME-Voucher-${code.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80)}.png`;
  const exportFile = () => {
    if (!ready || !imageBlob.current) throw new Error("The voucher is not ready yet.");
    return new File([imageBlob.current], filename, { type: "image/png" });
  };
  const download = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const file = exportFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url; link.download = filename; link.style.display = "none";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice("Download requested. If no file appears, use Send to Telegram.");
    } catch (err: any) { setError(err?.message || "Could not download the voucher."); }
    finally { setBusy(false); }
  };
  const sendToTelegram = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      await sendVoucherFile(exportFile(), (completed, total) => setNotice(`Sending voucher: ${completed}/${total}`));
      setNotice("Voucher sent to your PRIME bot chat. Open the chat to save or forward the PNG file.");
    } catch (err: any) { setError(err?.message || "Could not send the voucher to Telegram."); }
    finally { setBusy(false); }
  };
  const shareFile = async () => {
    setError(""); setNotice("");
    try {
      const file = exportFile();
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) throw new Error("File sharing is not available in this Telegram view. Try opening PRIME in another supported browser or use Send to Telegram.");
      await navigator.share({ files: [file], title: "PRIME Voucher" });
      setNotice("Share sheet closed. Check your selected app to confirm delivery.");
    } catch (err: any) {
      if (err?.name !== "AbortError") setError(err?.message || "Could not open the file share sheet.");
    }
  };

  return <div className="serverless-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="serverless-dialog voucher-generator" role="dialog" aria-modal="true" aria-labelledby="voucher-generator-title">
      <header className="serverless-dialog__header"><h2 id="voucher-generator-title">Voucher Preview</h2><button type="button" className="serverless-action" aria-label="Close voucher preview" onClick={onClose} disabled={busy}><X size={16}/></button></header>
      <div className="serverless-dialog__body">
        <QRCodeCanvas ref={qr} value={code} size={184} level="M" marginSize={4} className="voucher-generator__qr" aria-hidden="true" />
        <canvas ref={output} width={WIDTH} height={HEIGHT} className="voucher-generator__render" aria-hidden="true" />
        {previewUrl && <img src={previewUrl} className="voucher-generator__preview" alt={`Voucher for ${code}`} />}
        {!ready && !error && <p role="status">Preparing voucher…</p>}
        {error && <p role="alert" className="voucher-generator__error">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <p>Send the PNG to your PRIME bot chat, or use the device share sheet when available. You can also try holding the image to save it. The QR contains the voucher code.</p>
        {!active && <p className="voucher-generator__error">This promotion is disabled. Enable it before sharing the voucher.</p>}
      </div>
      <footer className="serverless-dialog__footer"><button type="button" className="serverless-action" onClick={() => void download()} disabled={!ready || busy}><Download size={16}/>Download PNG</button><button type="button" className="serverless-action" onClick={() => void shareFile()} disabled={!ready || busy}>Share File</button><button type="button" className="serverless-action serverless-action--primary" onClick={() => void sendToTelegram()} disabled={!ready || busy}><Send size={16}/>Send to Telegram</button></footer>
    </section>
  </div>;
}
