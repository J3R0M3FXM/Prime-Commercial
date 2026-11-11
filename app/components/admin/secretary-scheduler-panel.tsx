"use client";

import { useEffect, useState } from "react";
import { callServerless, uploadStoryPhoto } from "@/lib/telegram-serverless-client";
import TelegramMediaImage from "@/app/components/telegram-media-image";
import SecretaryBroadcastPanel from "./secretary-broadcast-panel";

type Button = { text: string; url: string; row: number };
type Campaign = { id: string; target: string; publishAt: number; storyStatus: string; groupStatus: string; storyId?: number; messageId?: number; storyError?: string; groupError?: string };
const initial = () => ({ target: "", photo: "", storyCaption: "", groupMessage: "", buttons: [] as Button[], publishAt: "", activePeriod: 86400 });
const pendingKey = "prime_story_campaign_pending_v1";

export default function SecretarySchedulerPanel() {
  const [tab, setTab] = useState<"schedule" | "broadcast">("schedule");
  const [draft, setDraft] = useState(initial);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const change = (value: Partial<ReturnType<typeof initial>>) => setDraft(current => ({ ...current, ...value }));
  async function refresh() {
    const result = await callServerless<{ campaigns: Campaign[] }>("manageStoryCampaigns", { action: "list" });
    setCampaigns(result.campaigns || []);
  }
  useEffect(() => {
    try {
      const saved = localStorage.getItem(pendingKey);
      if (saved) {
        const pending = JSON.parse(saved);
        if (/^[A-Za-z0-9_-]{16,128}$/.test(pending?.id) && pending?.draft) {
          setDraft(pending.draft);
          setNotice("A previous scheduling request needs confirmation. Submit again to recover its saved request key.");
        }
      }
    } catch { setError("Could not read the saved scheduling request."); }
    void refresh().catch(cause => setError(cause?.message || "Could not load scheduled campaigns."));
  }, []);
  async function schedule() {
    if (busy) return;
    const publishAt = Math.floor(new Date(draft.publishAt).getTime() / 1000);
    if (!Number.isSafeInteger(publishAt)) { setError("Choose a valid publication time."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = localStorage.getItem(pendingKey);
      const pending = saved ? JSON.parse(saved) : { id: crypto.randomUUID(), draft };
      if (JSON.stringify(pending.draft) !== JSON.stringify(draft)) throw new Error("Recover the saved scheduling request before changing it. Refresh this screen.");
      localStorage.setItem(pendingKey, JSON.stringify(pending));
      await callServerless("manageStoryCampaigns", { action: "create", id: pending.id, ...draft, publishAt }, 60_000);
      localStorage.removeItem(pendingKey);
      setDraft(initial());
      setNotice("Campaign queued. The scheduler checks for due campaigns about every five minutes when activated.");
      await refresh();
    } catch (cause: any) { setError(cause?.message || "Could not schedule campaign. Refresh before trying again."); }
    finally { setBusy(false); }
  }
  async function cancel(id: string) {
    if (busy || !window.confirm("Cancel this queued Story and group message?")) return;
    setBusy(true); setError("");
    try { await callServerless("manageStoryCampaigns", { action: "cancel", id }); await refresh(); }
    catch (cause: any) { setError(cause?.message || "Could not cancel campaign."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 w-full min-w-0 max-w-[430px] mx-auto" aria-label="Secretary Scheduler">
    <div className="grid grid-cols-2 gap-2"><button type="button" className="control-mini" aria-current={tab === "schedule" ? "page" : undefined} onClick={() => setTab("schedule")}>Story Scheduler</button><button type="button" className="control-mini" aria-current={tab === "broadcast" ? "page" : undefined} onClick={() => setTab("broadcast")}>Broadcast</button></div>
    {tab === "broadcast" ? <SecretaryBroadcastPanel /> : <>
      <div className="secretary-help-card"><h2>Story + Group Campaign</h2><p>Post a photo Story on the connected Business account, then send a message as the bot to a group with optional URL buttons. Delivery is checked separately for each destination.</p></div>
      {error && <p role="alert" className="text-xs text-red-700 break-words">{error}</p>}
      {notice && <p role="status" className="text-xs font-mono break-words">{notice}</p>}
      <form onSubmit={event => { event.preventDefault(); void schedule(); }} className="space-y-3 min-w-0">
        <fieldset disabled={busy} className="space-y-3 min-w-0">
          <label className="block"><span className="label-mini">Story Photo · Any Size</span><input className="control-mini w-full" type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            setBusy(true); setError("");
            try { change({ photo: await uploadStoryPhoto(file) }); }
            catch (cause: any) { setError(cause?.message || "Story photo upload failed."); }
            finally { setBusy(false); }
          }}/><span className="secretary-help">Square and landscape photos are centered without cropping. The background fills Telegram's portrait Story frame.</span></label>
          {draft.photo && <TelegramMediaImage src={draft.photo} alt="Scheduled Story photo" className="max-h-48 w-full object-contain"/>}
          <label className="block"><span className="label-mini">Story Caption</span><textarea className="control-mini w-full min-h-20" maxLength={2048} value={draft.storyCaption} onChange={event => change({ storyCaption:event.target.value })}/></label>
          <label className="block"><span className="label-mini">Story Duration</span><select className="control-mini w-full" value={draft.activePeriod} onChange={event => change({activePeriod:Number(event.target.value)})}><option value={86400}>24 hours</option><option value={21600}>6 hours · Premium</option><option value={43200}>12 hours · Premium</option><option value={172800}>48 hours · Premium</option></select></label>
          <label className="block"><span className="label-mini">Group @username Or Chat ID</span><input className="control-mini w-full" required value={draft.target} onChange={event => change({ target:event.target.value })} placeholder="@groupname or -100…" maxLength={40}/></label>
          <label className="block"><span className="label-mini">Group Message</span><textarea className="control-mini w-full min-h-28" required maxLength={4096} value={draft.groupMessage} onChange={event => change({groupMessage:event.target.value})}/></label>
          <details><summary className="label-mini cursor-pointer">URL Buttons · {draft.buttons.length}/12</summary><div className="space-y-2 mt-2">
            {draft.buttons.map((button,index) => <div key={index} className="border-b border-slate-200 pb-2 space-y-2"><div className="grid grid-cols-2 gap-2"><label className="min-w-0"><span className="label-mini">Label</span><input className="control-mini w-full" required maxLength={64} value={button.text} onChange={event => change({buttons:draft.buttons.map((item,i)=>i===index?{...item,text:event.target.value}:item)})}/></label><label className="min-w-0"><span className="label-mini">Row</span><select className="control-mini w-full" value={button.row} onChange={event => change({buttons:draft.buttons.map((item,i)=>i===index?{...item,row:Number(event.target.value)}:item)})}>{[1,2,3,4,5,6].map(row=><option key={row}>{row}</option>)}</select></label></div><label className="block"><span className="label-mini">HTTPS URL</span><input className="control-mini w-full" required type="url" pattern="https://.*" maxLength={2048} value={button.url} onChange={event => change({buttons:draft.buttons.map((item,i)=>i===index?{...item,url:event.target.value}:item)})}/></label><button type="button" className="control-mini" onClick={() => change({buttons:draft.buttons.filter((_,i)=>i!==index)})}>Remove</button></div>)}
            <button type="button" className="control-mini" disabled={draft.buttons.length >= 12} onClick={() => change({buttons:[...draft.buttons,{text:"",url:"",row:Math.min(6,Math.floor(draft.buttons.length/2)+1)}]})}>Add Link Button</button>
          </div></details>
          <label className="block"><span className="label-mini">Publish Time · Your Local Time</span><input className="control-mini w-full" required type="datetime-local" value={draft.publishAt} onChange={event => change({publishAt:event.target.value})}/></label>
          <button className="control-mini w-full" type="submit" disabled={!draft.photo || !draft.target.trim() || !draft.groupMessage.trim() || !draft.publishAt}>Schedule Story + Group Message</button>
        </fieldset>
      </form>
      <div className="space-y-2"><div className="flex items-center justify-between gap-2"><h2 className="label-mini">Scheduled Campaigns</h2><button type="button" className="control-mini" disabled={busy} onClick={() => void refresh().catch(cause => setError(cause?.message || "Could not refresh."))}>Refresh</button></div>
        {campaigns.length === 0 && <p className="secretary-help">No campaigns yet.</p>}
        {campaigns.map(item => <div key={item.id} className="border border-slate-200 bg-white p-3 text-xs break-words space-y-1"><p className="font-mono">{new Date(item.publishAt * 1000).toLocaleString()} · {item.target}</p><p>Story: {item.storyStatus}{item.storyId ? ` #${item.storyId}` : ""} · Group: {item.groupStatus}{item.messageId ? ` #${item.messageId}` : ""}</p>{item.storyError && <p className="text-red-700">Story: {item.storyError}</p>}{item.groupError && <p className="text-red-700">Group: {item.groupError}</p>}{item.storyStatus === "queued" && item.groupStatus === "queued" && <button type="button" className="control-mini" disabled={busy} onClick={() => void cancel(item.id)}>Cancel</button>}</div>)}
      </div>
    </>}
  </section>;
}
