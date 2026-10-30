"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { resolveTelegramMedia } from "@/lib/telegram-serverless-client";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string | null; fallbackSrc?: string };

/** Resolve public Telegram media references before passing them to the browser image loader. */
export default function TelegramMediaImage({ src, fallbackSrc, alt = "", className, onError, ...props }: Props) {
  const [resolved, setResolved] = useState("");
  const reference = String(src || "");

  useEffect(() => {
    let current = true;
    setResolved("");
    if (!reference) return () => { current = false; };
    resolveTelegramMedia(reference)
      .then((url) => { if (current) setResolved(url); })
      .catch(() => { if (current) setResolved(fallbackSrc || ""); });
    return () => { current = false; };
  }, [reference, fallbackSrc]);

  if (!resolved) return <span aria-label={alt} className={className} />;
  return <img {...props} src={resolved} alt={alt} className={className} onError={(event) => {
    if (fallbackSrc && resolved !== fallbackSrc) { setResolved(fallbackSrc); return; }
    onError?.(event);
  }} />;
}
