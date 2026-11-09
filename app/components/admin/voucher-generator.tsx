"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import "@fontsource/ibm-plex-mono/700.css";
import "./voucher-generator.css";

const WIDTH = 1836, HEIGHT = 857;
const TEMPLATE = "/voucher-template.png";

export function makeVoucherCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `PRIME-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
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
    ctx.font = `700 ${fontSize}px "IBM Plex Mono"`;
    if (ctx.measureText(code).width <= maxWidth) break;
    fontSize -= 2;
  }
  do {
    ctx.font = `700 ${fontSize}px "IBM Plex Mono"`;
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

  useEffect(() => {
    let current = true;
    setReady(false); setError(""); imageBlob.current = null;
    const image = new Image();
    const imageReady = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The voucher template could not be loaded."));
      image.src = TEMPLATE;
    });
    const prepare = async () => {
      if (!document.fonts?.load) throw new Error("The voucher font could not be loaded on this device.");
      const [, fonts] = await Promise.all([imageReady, document.fonts.load('700 72px "IBM Plex Mono"', code)]);
      if (!fonts.length) throw new Error("The voucher font could not be loaded on this device.");
      if (!current) return;
      const canvas = output.current, qrCanvas = qr.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !qrCanvas) throw new Error("Voucher image generation is not available on this device.");
      drawVoucher(ctx, image, qrCanvas, code);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not create the voucher image.")), "image/png"));
      if (!current) return;
      imageBlob.current = blob;
      setReady(true);
    };
    void prepare().catch(err => { if (current) setError(err?.message || "Could not generate the voucher."); });
    return () => { current = false; image.onload = null; image.onerror = null; };
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
      setNotice("Download started. If your Telegram app does not save it, use Share to save the image.");
    } catch (err: any) { setError(err?.message || "Could not download the voucher."); }
    finally { setBusy(false); }
  };
  const share = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const file = exportFile();
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) throw new Error("Sharing files is unavailable on this device. Try Download instead.");
      await navigator.share({ files: [file], title: "PRIME Voucher" });
    } catch (err: any) { if (err?.name !== "AbortError") setError(err?.message || "Could not share the voucher."); }
    finally { setBusy(false); }
  };

  return <div className="serverless-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="serverless-dialog voucher-generator" role="dialog" aria-modal="true" aria-labelledby="voucher-generator-title">
      <header className="serverless-dialog__header"><h2 id="voucher-generator-title">Voucher Preview</h2><button type="button" className="serverless-action" aria-label="Close voucher preview" onClick={onClose} disabled={busy}><X size={16}/></button></header>
      <div className="serverless-dialog__body">
        <QRCodeCanvas ref={qr} value={code} size={184} level="M" marginSize={4} className="voucher-generator__qr" aria-hidden="true" />
        <canvas ref={output} width={WIDTH} height={HEIGHT} className="voucher-generator__preview" aria-label={`Voucher for ${code}`} />
        {!ready && !error && <p role="status">Preparing voucher…</p>}
        {error && <p role="alert" className="voucher-generator__error">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <p>The QR code contains the voucher code. The customer can scan it and enter the code at checkout.</p>
        {!active && <p className="voucher-generator__error">This promotion is disabled. Enable it before sharing the voucher.</p>}
      </div>
      <footer className="serverless-dialog__footer"><button type="button" className="serverless-action" onClick={() => void share()} disabled={!ready || busy}><Share2 size={16}/>Share</button><button type="button" className="serverless-action serverless-action--primary" onClick={() => void download()} disabled={!ready || busy}><Download size={16}/>Download PNG</button></footer>
    </section>
  </div>;
}
