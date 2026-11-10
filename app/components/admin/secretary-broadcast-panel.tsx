"use client";

import { useEffect, useRef, useState } from "react";
import { callServerless, getTelegramServerlessSession, uploadStaffImage } from "@/lib/telegram-serverless-client";
import TelegramMediaImage from "@/app/components/telegram-media-image";

type LinkButton = { text: string; url: string; row: number };
type Draft = { target: string; message: string; mediaType: "none" | "photo" | "video"; media: string; buttons: LinkButton[] };
type Attempt = { operationKey: string; draft: Draft };
type Result = { status: string; messageId?: number; target?: string; requestKey?: string; createdAt?: number };
const blank = (): Draft => ({ target: "", message: "", mediaType: "none", media: "", buttons: [] });
const statusText = (result: Result) => result.status === "sent"
  ? `Sent To ${result.target} · Message ${result.messageId}`
  : `Delivery Not Confirmed${result.target ? ` · ${result.target}` : ""}. Check the destination before creating another broadcast. This request will not be automatically resent.`;

export default function SecretaryBroadcastPanel() {
  const [draft, setDraft] = useState<Draft>(blank);
  const [storageKey, setStorageKey] = useState("");
  const [pending, setPending] = useState<Attempt | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function refresh() {
    const result = await callServerless<{ broadcasts: Result[] }>("sendSecretaryBroadcast", { action: "list" });
    setHistory(result.broadcasts || []);
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await getTelegramServerlessSession();
        if (!session.authenticated || !session.isAdmin || !session.tgUserId) throw new Error("Staff access is required.");
        const key = `prime_secretary_broadcast_v1:${session.tgUserId}`;
        const stored = localStorage.getItem(key);
        const attempt: Attempt | null = stored ? JSON.parse(stored) : null;
        if (attempt && (!/^[A-Za-z0-9_-]{16,128}$/.test(attempt.operationKey) || !attempt.draft || !Array.isArray(attempt.draft.buttons))) throw new Error("Saved broadcast is unreadable. Check the destination before clearing browser data.");
        if (cancelled) return;
        setStorageKey(key); setPending(attempt);
        if (attempt) { setDraft(attempt.draft); setNotice("A previous send needs confirmation. Use Check Send Status before starting another broadcast."); }
        await refresh();
      } catch (cause: any) { if (!cancelled) setError(cause?.message || "Could not load broadcasts."); }
    })();
    return () => { cancelled = true; };
  }, []);
  function change(update: Partial<Draft>) { setDraft(current => ({ ...current, ...update })); }
  async function send() {
    if (lock.current || !storageKey || pending) return;
    if (!window.confirm(`Send this broadcast to ${draft.target}? It will be visible to members of that group or channel.`)) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const attempt = { operationKey: crypto.randomUUID(), draft };
      // Persist before sending: reloads and lost responses must not create a fresh send key.
      localStorage.setItem(storageKey, JSON.stringify(attempt)); setPending(attempt);
      const result = await callServerless<Result>("sendSecretaryBroadcast", { action: "send", operationKey: attempt.operationKey, ...draft }, 60_000);
      setNotice(statusText(result));
      if (result.status === "sent") { localStorage.removeItem(storageKey); setPending(null); setDraft(blank()); }
      await refresh();
    } catch (cause: any) { setError(cause?.message || "Send could not be confirmed. Check Send Status."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function check() {
    if (!pending || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const result = await callServerless<Result>("sendSecretaryBroadcast", { action: "status", operationKey: pending.operationKey });
      setNotice(result.status === "not_found" ? "No send record yet. A timed-out request may still be running. Check the destination before starting again." : statusText(result));
      if (result.status === "sent") { localStorage.removeItem(storageKey); setPending(null); setDraft(blank()); }
      await refresh();
    } catch (cause: any) { setError(cause?.message || "Could not check delivery."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="space-y-3 min-w-0" aria-label="Secretary Broadcast">
    <div className="secretary-help-card"><h2>Group &amp; Channel Broadcast</h2><p>Send as the bot, not the connected business account. Add the bot to the destination and allow it to post. One destination per broadcast.</p></div>
    {error && <p role="alert" className="text-xs text-red-700 break-words">{error}</p>}
    {notice && <p role="status" className="text-xs font-mono break-words">{notice}</p>}
    {pending && <div className="grid grid-cols-2 gap-2">
      <button type="button" className="control-mini" disabled={busy} onClick={check}>Check Send Status</button>
      <button type="button" className="control-mini" disabled={busy} onClick={() => {
        if (!window.confirm("Have you checked the destination and recent broadcast history? Starting again can duplicate a message whose delivery was not confirmed.")) return;
        try { localStorage.removeItem(storageKey); setPending(null); setNotice(""); setError(""); } catch { setError("Unable to clear the saved attempt."); }
      }}>Start New Attempt</button>
    </div>}
    <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <fieldset disabled={busy || !!pending || !storageKey} className="space-y-3 min-w-0">
        <label className="block"><span className="label-mini">Group Or Channel</span><input className="control-mini w-full" required value={draft.target} onChange={event => change({ target: event.target.value })} placeholder="@channelname or -100…" maxLength={40}/></label>
        <label className="block"><span className="label-mini">Media Type</span><select className="control-mini w-full" value={draft.mediaType} onChange={event => change({ mediaType: event.target.value as Draft["mediaType"], media: "" })}><option value="none">Text Only</option><option value="photo">Photo</option><option value="video">Video</option></select></label>
        {draft.mediaType === "photo" && <label className="block"><span className="label-mini">Upload Photo</span><input type="file" className="control-mini w-full" accept="image/jpeg,image/png,image/webp" onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file || lock.current) return;
          lock.current = true; setBusy(true); setError("");
          try { change({ media: await uploadStaffImage(file, "media-gallery") }); }
          catch (cause: any) { setError(cause?.message || "Photo upload failed."); }
          finally { lock.current = false; setBusy(false); }
        }}/></label>}
        {draft.mediaType !== "none" && <label className="block"><span className="label-mini">{draft.mediaType === "photo" ? "Photo Reference Or HTTPS Link" : "Video HTTPS Link"}</span><input className="control-mini w-full" required value={draft.media} onChange={event => change({ media: event.target.value })} maxLength={2048}/><span className="secretary-help">{draft.mediaType === "video" ? "Use a publicly accessible MP4 link, including an R2 media link. Telegram must be able to retrieve it." : "Upload above or enter a publicly accessible image link."}</span></label>}
        {draft.mediaType === "photo" && draft.media.startsWith("tgmedia:") && <TelegramMediaImage src={draft.media} alt="Broadcast photo" className="max-h-40 w-full object-contain"/>}
        <label className="block"><span className="label-mini">Message</span><textarea className="control-mini w-full min-h-28" required value={draft.message} maxLength={draft.mediaType === "none" ? 4096 : 1024} onChange={event => change({ message: event.target.value })}/><span className="secretary-help">Plain Text · {draft.message.length}/{draft.mediaType === "none" ? 4096 : 1024}</span></label>
        <details open><summary className="label-mini cursor-pointer">Inline Buttons · {draft.buttons.length}/12</summary><div className="space-y-3 mt-2">
          {draft.buttons.map((button, index) => <div key={index} className="space-y-2 border-b border-slate-200 pb-2">
            <div className="grid grid-cols-2 gap-2"><label className="min-w-0"><span className="label-mini">Button Label</span><input className="control-mini w-full" required maxLength={64} value={button.text} onChange={event => change({ buttons: draft.buttons.map((item, i) => i === index ? { ...item, text: event.target.value } : item) })}/></label><label className="min-w-0"><span className="label-mini">Row</span><select className="control-mini w-full" value={button.row} onChange={event => change({ buttons: draft.buttons.map((item, i) => i === index ? { ...item, row: Number(event.target.value) } : item) })}>{[1,2,3,4,5,6].map(row => <option key={row}>{row}</option>)}</select></label></div>
            <label className="block"><span className="label-mini">HTTPS Link</span><input className="control-mini w-full" required type="url" pattern="https://.*" maxLength={2048} value={button.url} onChange={event => change({ buttons: draft.buttons.map((item, i) => i === index ? { ...item, url: event.target.value } : item) })}/></label>
            <button type="button" className="control-mini" onClick={() => change({ buttons: draft.buttons.filter((_, i) => i !== index) })}>Remove Button</button>
          </div>)}
          <button type="button" className="control-mini" disabled={draft.buttons.length >= 12} onClick={() => change({ buttons: [...draft.buttons, { text: "", url: "", row: Math.min(6, Math.floor(draft.buttons.length / 2) + 1) }] })}>Add Inline Button</button>
          <p className="secretary-help">Up to two link buttons per row. No automatic replies are changed.</p>
        </div></details>
        <details><summary className="label-mini cursor-pointer">Preview Broadcast</summary><div className="secretary-message-preview mt-2"><p className="whitespace-pre-wrap break-words">{draft.message || "Your message preview"}</p>{[1,2,3,4,5,6].map(row => <div key={row} className="grid grid-cols-2 gap-1 mt-1">{draft.buttons.filter(button => button.row === row).map((button, index) => <span key={index} className="border border-slate-200 p-2 text-xs text-center break-words">{button.text || "Button Label"}</span>)}</div>)}</div></details>
        <button type="submit" className="control-mini w-full" disabled={!draft.message.trim() || !draft.target.trim() || (draft.mediaType !== "none" && !draft.media)}>Send Broadcast</button>
      </fieldset>
    </form>
    <details><summary className="label-mini cursor-pointer">Recent Broadcasts · This Staff Account</summary><button type="button" className="control-mini my-2" disabled={busy} onClick={() => { void refresh().catch(() => setError("Could not refresh history.")); }}>Refresh History</button>{history.length === 0 && <p className="secretary-help">No broadcasts yet.</p>}{history.map(item => <div key={item.requestKey} className="border-b border-slate-200 py-2 text-xs break-words"><p>{statusText(item)}</p><p className="font-mono">{item.createdAt ? new Date(item.createdAt * 1000).toLocaleString() : ""}</p></div>)}</details>
  </section>;
}
