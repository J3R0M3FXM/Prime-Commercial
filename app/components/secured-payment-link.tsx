"use client";

import type { MouseEvent } from "react";
import { ExternalLink } from "lucide-react";

export function validatedPaymentLink(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function openSecuredPaymentLink(value: unknown): boolean {
  const href = validatedPaymentLink(value);
  if (!href) return false;
  const webApp = (window as unknown as { Telegram?: { WebApp?: { initData?: string; openLink?: (url: string, options?: { try_instant_view: boolean }) => void } } }).Telegram?.WebApp;
  try {
    if (webApp?.initData && webApp.openLink) webApp.openLink(href, { try_instant_view: false });
    else window.open(href, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

export function handleSecuredPaymentLink(event: MouseEvent<HTMLAnchorElement>, url: string) {
  if (!validatedPaymentLink(url)) {
    event.preventDefault();
    return;
  }
  const webApp = (window as unknown as {
    Telegram?: { WebApp?: { initData?: string; openLink?: (url: string, options?: { try_instant_view: boolean }) => void } };
  }).Telegram?.WebApp;
  if (!webApp?.initData || !webApp.openLink) return;
  try {
    webApp.openLink(url, { try_instant_view: false });
    event.preventDefault();
  } catch {
    // Keep the HTTPS anchor's native new-tab action when the native bridge fails.
  }
}

export default function SecuredPaymentLink({ url, className }: { url: unknown; className?: string }) {
  const href = validatedPaymentLink(url);
  if (!href) return <p role="alert" className="text-xs text-red-700">This payment link is unavailable. Contact the shop.</p>;
  return <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
    onClick={(event) => handleSecuredPaymentLink(event, href)}
    className={className || "flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-3 text-center text-xs text-white"}>
    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />Open Secured Payment Link
  </a>;
}
