"use client";

import { useRef, useState } from "react";
import { callServerless } from "@/lib/telegram-serverless-client";

type Link = { text: string; url: string; row: number };
type Post = { status: string; revision: number; target: string; messageId: number; canDelete: boolean;
  draft: { message: string; mediaType: string; buttons: Link[] } };

export default function BroadcastPostControls({ operationKey, onChanged }: { operationKey: string; onChanged: () => Promise<void> }) {
  const [post, setPost] = useState<Post | null>(null);
  const [message, setMessage] = useState("");
  const [buttons, setButtons] = useState<Link[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  async function load() {
    const result = await callServerless<Post>("sendSecretaryBroadcast", { action: "detail", operationKey });
    setPost(result); setMessage(result.draft.message); setButtons(result.draft.buttons);
  }
  async function run(action: "open" | "edit" | "retry_edit" | "delete") {
    if (lock.current) return;
    if (action !== "open" && !window.confirm(action === "delete"
      ? "Delete this bot post from the group or channel? This cannot be undone."
      : "Update this existing bot post in the group or channel?")) return;
    lock.current = true; setBusy(true); setNotice("");
    try {
      if (action === "open") { await load(); return; }
      const result = await callServerless<{ status: string }>("sendSecretaryBroadcast", {
        action, operationKey, revision: post?.revision, ...(action === "edit" ? { message, buttons } : {}),
      }, 60_000);
      setNotice(result.status === "sent" ? "Post updated." : result.status === "deleted" ? "Post deleted."
        : "Telegram did not confirm the change. Check the group or channel, then refresh this post. Retry uses the same saved change.");
      await load(); await onChanged();
    } catch (cause: any) { setNotice(cause?.message || "Could not confirm the change. Refresh this post before trying again."); }
    finally { lock.current = false; setBusy(false); }
  }
  const active = post?.status === "sent";
  const retryEdit = post?.status === "edit_uncertain" || post?.status === "editing";
  const retryDelete = post?.status === "delete_uncertain" || post?.status === "deleting";
  return <div className="space-y-2 mt-2">
    <button type="button" className="control-mini" disabled={busy} onClick={() => void run("open")}>{post ? "Refresh Post" : "Edit / Delete Post"}</button>
    {post && <div className="space-y-2 rounded-lg border border-slate-200 p-3" aria-label={`Manage broadcast ${post.messageId}`}>
      <p className="secretary-help">{post.target} · Message {post.messageId} · {post.status.replace(/_/g, " ")}</p>
      {post.status !== "deleted" && <>
        <p className="secretary-help">Edit the text or caption and link buttons. The existing photo or video stays attached.</p>
        <fieldset disabled={busy || !active} className="space-y-2 min-w-0">
          <label className="block"><span className="label-mini">{post.draft.mediaType === "none" ? "Post Text" : "Post Caption (Optional)"}</span>
            <textarea className="control-mini w-full min-h-28" value={message} maxLength={post.draft.mediaType === "none" ? 4096 : 1024} onChange={event => setMessage(event.target.value)} /></label>
          {buttons.map((button, index) => <div key={index} className="space-y-2 border-b border-slate-200 pb-2">
            <label className="block"><span className="label-mini">Button {index + 1} Label</span><input className="control-mini w-full" value={button.text} maxLength={64} onChange={event => setButtons(items => items.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} /></label>
            <label className="block"><span className="label-mini">Button {index + 1} HTTPS Link</span><input type="url" className="control-mini w-full" value={button.url} maxLength={2048} onChange={event => setButtons(items => items.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} /></label>
            <label className="block"><span className="label-mini">Button {index + 1} Row</span><select className="control-mini w-full" value={button.row} onChange={event => setButtons(items => items.map((item, i) => i === index ? { ...item, row: Number(event.target.value) } : item))}>{[1,2,3,4,5,6].map(row => <option key={row}>{row}</option>)}</select></label>
            <button type="button" className="control-mini" onClick={() => setButtons(items => items.filter((_, i) => i !== index))}>Remove Post Button {index + 1}</button>
          </div>)}
          <button type="button" className="control-mini" disabled={buttons.length >= 12} onClick={() => setButtons(items => [...items, { text: "", url: "", row: Math.min(6, Math.floor(items.length / 2) + 1) }])}>Add Post Button</button>
          <button type="button" className="control-mini w-full" disabled={post.draft.mediaType === "none" && !message.trim()} onClick={() => void run("edit")}>Save Post Changes</button>
        </fieldset>
        {retryEdit && <button type="button" className="control-mini w-full" disabled={busy} onClick={() => void run("retry_edit")}>Retry Saved Edit</button>}
        {(active || retryDelete) && <button type="button" className="control-mini w-full text-red-700" disabled={busy || !post.canDelete} onClick={() => void run("delete")}>{retryDelete ? "Retry Post Deletion" : "Delete Post"}</button>}
        {!post.canDelete && <p className="secretary-help">Telegram's 48-hour deletion window has passed.</p>}
      </>}
      <button type="button" className="control-mini" disabled={busy} onClick={() => setPost(null)}>Close Post Editor</button>
    </div>}
    {notice && <p role="status" className="text-xs break-words">{notice}</p>}
  </div>;
}
