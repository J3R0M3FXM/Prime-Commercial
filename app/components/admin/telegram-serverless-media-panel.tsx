"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Film, ImagePlus, Loader2, Plus, RefreshCw, Save, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { callServerless, getTelegramServerlessSession, uploadServerlessGalleryVideo, uploadStaffImage, type ServerlessGalleryVideo } from "@/lib/telegram-serverless-client";
import TelegramMediaImage from "@/app/components/telegram-media-image";

const CATEGORIES = ["Product Demos", "Unboxing", "Customer Reviews", "Tutorials", "Behind The Scenes", "Exclusive"];
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

type ManagedVideo = ServerlessGalleryVideo & {
  telegramFileId?: string; fileSize?: number; isPublished?: boolean; storageType?: string;
};

const emptyForm = { title: "", description: "", category: "Product Demos", tags: "", thumbnailUrl: "", rating: "0", isPublished: true, featured: false };

function formatSize(bytes?: number) {
  if (!bytes || bytes <= 0) return "Size unavailable";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

type ThumbnailCandidate = { url: string; file: File; label: string };

async function makeThumbnailCandidates(videoFile: File): Promise<ThumbnailCandidate[]> {
  const source = URL.createObjectURL(videoFile);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = source;
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("The video could not be read for thumbnail generation.")); });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration) throw new Error("The video has no readable duration.");
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Thumbnail generation is unavailable on this device.");
    const points = [{ ratio: 0.15, label: "Opening" }, { ratio: 0.5, label: "Middle" }, { ratio: 0.85, label: "Closing" }];
    const results: ThumbnailCandidate[] = [];
    for (const point of points) {
      await new Promise<void>((resolve, reject) => {
        video.currentTime = Math.min(duration - 0.05, Math.max(0, duration * point.ratio));
        video.onseeked = () => resolve(); video.onerror = () => reject(new Error("The video frame could not be read."));
      });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", 0.86);
      const binary = atob(url.split(",")[1]);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      results.push({ url, file: new File([bytes], `video-thumbnail-${point.ratio}.jpg`, { type: "image/jpeg" }), label: point.label });
    }
    return results;
  } finally { URL.revokeObjectURL(source); }
}

export default function TelegramServerlessMediaPanel({ onBack }: { onBack: () => void }) {
  const [authorized, setAuthorized] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [videos, setVideos] = useState<ManagedVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageChatId, setStorageChatId] = useState("");
  const [storageSaved, setStorageSaved] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [thumbnailCandidates, setThumbnailCandidates] = useState<ThumbnailCandidate[]>([]);
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadMedia = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [rows, target] = await Promise.all([
        callServerless<ManagedVideo[]>("manageVideos", { action: "list" }, 30_000),
        callServerless<{ chatId?: string }>("manageVideos", { action: "getStorageTarget" }, 15_000),
      ]);
      if (!Array.isArray(rows)) throw new Error("The Serverless media list response was invalid.");
      setVideos(rows); setStorageChatId(String(target?.chatId || "")); setStorageSaved(String(target?.chatId || ""));
    } catch (err: any) { setError(err?.message || "Could not load Serverless media."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let current = true;
    getTelegramServerlessSession().then((session) => {
      if (!current) return;
      if (!session?.authenticated || !session?.isAdmin) {
        setError(session?.error || "Verified Telegram admin access is required to manage videos.");
        return;
      }
      setAuthorized(true);
    }).catch((err: any) => { if (current) setError(err?.message || "Open PRIME from Telegram to manage videos."); })
      .finally(() => { if (current) setAuthLoading(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => { if (authorized) void loadMedia(); }, [authorized, loadMedia]);

  const saveStorageTarget = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await callServerless<{ success?: boolean; chatId?: string }>("manageVideos", { action: "setStorageTarget", chatId: storageChatId.trim() }, 20_000);
      if (!result?.success) throw new Error("The storage channel setting was not confirmed.");
      setStorageSaved(String(result.chatId || "")); setNotice("Video storage destination saved.");
    } catch (err: any) { setError(err?.message || "Could not save the video storage destination."); }
    finally { setBusy(false); }
  };

  const resetForm = () => { setEditingId(""); setForm(emptyForm); setFile(null); setThumbnailCandidates([]); setFormOpen(false); };
  const beginEdit = (video: ManagedVideo) => {
    setEditingId(video.id);
    setForm({ title: video.title || "", description: video.description || "", category: video.category || CATEGORIES[0], tags: (video.tags || []).join(", "), thumbnailUrl: String(video.thumbnailUrl || "").startsWith("tgmedia:") ? video.thumbnailUrl || "" : "", rating: String(video.rating ?? 0), isPublished: video.isPublished !== false, featured: video.featured === true });
    setFile(null); setThumbnailCandidates([]); setError(""); setNotice(""); setFormOpen(true);
  };

  const saveVideo = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (editingId) {
        const result = await callServerless<{ success?: boolean }>("manageVideos", {
          action: "update", id: editingId, ...form, rating: Number(form.rating), tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        }, 30_000);
        if (!result?.success) throw new Error("The video changes were not confirmed.");
        setNotice("Video details updated.");
      } else {
        if (!file) throw new Error("Choose an MP4 video file.");
        if (file.size > MAX_VIDEO_BYTES) throw new Error("This file exceeds the 20 MiB limit.");
        await uploadServerlessGalleryVideo(
          file,
          { ...form, rating: Number(form.rating), tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) },
          (completed, total) => setNotice(`Uploading video · part ${completed}/${total} · 512 KiB each`),
        );
        setNotice("Video uploaded to Telegram and added to the gallery.");
      }
      resetForm(); await loadMedia();
    } catch (err: any) { setError(err?.message || "Could not save this video."); }
    finally { setBusy(false); }
  };

  const togglePublished = async (video: ManagedVideo) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await callServerless("manageVideos", { action: "update", id: video.id, isPublished: video.isPublished === false }, 30_000);
      setNotice(video.isPublished === false ? "Video published." : "Video unpublished from the customer gallery.");
      await loadMedia();
    } catch (err: any) { setError(err?.message || "Could not change publication status."); }
    finally { setBusy(false); }
  };

  const toggleFeatured = async (video: ManagedVideo) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await callServerless("manageVideos", { action: "update", id: video.id, featured: !video.featured }, 30_000);
      setNotice(video.featured ? "Featured placement removed." : "Video set as featured.");
      await loadMedia();
    } catch (err: any) { setError(err?.message || "Could not update featured placement."); }
    finally { setBusy(false); }
  };

  const deleteVideo = async (video: ManagedVideo) => {
    if (!window.confirm(`Remove “${video.title}” from the gallery? The Telegram storage-channel message is retained.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await callServerless("manageVideos", { action: "delete", id: video.id }, 30_000);
      setNotice("Video removed from the customer gallery. The source message remains in Telegram storage.");
      await loadMedia();
    } catch (err: any) { setError(err?.message || "Could not remove the video."); }
    finally { setBusy(false); }
  };

  return <main className="serverless-admin-panel" aria-label="Telegram Serverless video gallery management">
    <header className="serverless-panel-header">
      <button type="button" onClick={onBack} className="serverless-action" aria-label="Back to Admin modules"><ArrowLeft className="h-4 w-4"/></button>
      <div className="serverless-panel-header__copy"><h1>Media Gallery</h1><p><ShieldCheck className="mr-1 inline h-3 w-3 text-emerald-700"/>Verified Telegram staff · {videos.length} video{videos.length === 1 ? "" : "s"}</p></div>
      <button type="button" disabled={!authorized || busy} onClick={() => { setForm(emptyForm); setEditingId(""); setFile(null); setThumbnailCandidates([]); setFormOpen(true); }} className="serverless-action serverless-action--primary"><Plus className="h-4 w-4"/>Upload</button>
      <button type="button" disabled={!authorized || loading || busy} onClick={() => void loadMedia()} className="serverless-action" aria-label="Refresh videos"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}/></button>
    </header>

    {error && <div role="alert" className="my-2 border border-red-200 bg-red-50 p-2 text-xs text-red-800">{error}</div>}
    {notice && <div role="status" className="my-2 flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0"/>{notice}</div>}
    {authLoading || loading && videos.length === 0 ? <div className="my-2 flex justify-center border border-slate-200 bg-white p-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-700"/></div> : null}

    {authorized && <>
      <form onSubmit={saveStorageTarget} className="my-2 space-y-2 border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2"><Film className="h-4 w-4 text-emerald-700"/><h2 className="font-heading text-sm font-normal uppercase tracking-wide text-slate-900">Telegram storage channel</h2></div>
        <p className="text-[11px] leading-relaxed text-slate-600">Choose a private channel where the PRIME bot is an administrator. Uploaded videos are stored there; only their file reference and gallery details are saved in the app database.</p>
        <div className="flex gap-2"><input value={storageChatId} onChange={(event) => setStorageChatId(event.target.value)} placeholder="-100… or @channelname" aria-label="Telegram video storage channel ID" className="min-w-0 flex-1 border border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-900 outline-none focus:border-emerald-700"/><button type="submit" disabled={busy || storageChatId.trim() === storageSaved} className="serverless-action serverless-action--primary"><Save className="h-4 w-4"/>Save</button></div>
      </form>

      {formOpen && <form onSubmit={saveVideo} className="my-2 space-y-3 border border-emerald-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="font-heading text-base font-normal uppercase tracking-wide text-slate-900">{editingId ? "Edit video details" : "Upload a video"}</h2><button type="button" className="serverless-action" onClick={resetForm} aria-label="Close form"><X className="h-4 w-4"/></button></div>
        {!editingId && <label className="serverless-field">MP4 video · maximum 20 MiB<input required type="file" accept="video/mp4,.mp4" onChange={async (event) => { const selected = event.currentTarget.files?.[0] || null; setFile(selected); setThumbnailCandidates([]); if (!selected) return; setError(""); setNotice("Generating three thumbnail choices…"); try { setThumbnailCandidates(await makeThumbnailCandidates(selected)); setNotice("Choose a thumbnail frame, or upload your own image below."); } catch (err: any) { setError(err?.message || "Could not generate thumbnail choices."); } }}/>{file && <small>{file.name} · {formatSize(file.size)}</small>}</label>}
        <div className="serverless-fields">
          <label className="serverless-field">Title<input required maxLength={180} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}/></label>
          <label className="serverless-field">Category<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label className="serverless-field">Tags · comma separated<input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}/></label>
          <div className="serverless-field"><span>Thumbnail image · optional</span><div className="flex items-center gap-2">{form.thumbnailUrl && <TelegramMediaImage src={form.thumbnailUrl} alt="Video thumbnail preview" className="h-12 w-16 shrink-0 border border-slate-200 object-cover"/>}<label className="serverless-action flex-1 cursor-pointer justify-center">{thumbnailUploading ? <Loader2 className="h-4 w-4 animate-spin"/> : <ImagePlus className="h-4 w-4"/>}{form.thumbnailUrl ? "Replace image" : "Choose image file"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy || thumbnailUploading} onChange={async (event) => { const image = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!image) return; setThumbnailUploading(true); setError(""); setNotice(""); try { const reference = await uploadStaffImage(image, "media-gallery"); setForm((current) => ({ ...current, thumbnailUrl: reference })); setNotice("Thumbnail image uploaded."); } catch (err: any) { setError(err?.message || "Could not upload thumbnail image."); } finally { setThumbnailUploading(false); } }}/></label>{form.thumbnailUrl && <button type="button" className="serverless-action" disabled={busy || thumbnailUploading} onClick={() => setForm((current) => ({ ...current, thumbnailUrl: "" }))}>Remove</button>}</div><small>Choose an image from this device. Image links cannot be entered here.</small></div>
          {thumbnailCandidates.length > 0 && <div className="serverless-field"><span>Choose a generated thumbnail</span><div className="grid grid-cols-3 gap-2">{thumbnailCandidates.map((candidate) => <button key={candidate.label} type="button" disabled={busy || thumbnailUploading} onClick={async () => { setThumbnailUploading(true); setError(""); try { const reference = await uploadStaffImage(candidate.file, "media-gallery"); setForm((current) => ({ ...current, thumbnailUrl: reference })); setNotice(`${candidate.label} frame selected as the thumbnail.`); } catch (err: any) { setError(err?.message || "Could not upload the selected thumbnail."); } finally { setThumbnailUploading(false); } }} className="overflow-hidden border border-slate-200 bg-slate-50 text-left hover:border-emerald-600"><img src={candidate.url} alt={`${candidate.label} thumbnail`} className="aspect-video w-full object-cover"/><span className="block px-1.5 py-1 text-[10px] font-heading uppercase text-slate-700">{candidate.label}</span></button>)}</div></div>}
          <label className="serverless-field">Editorial rating · 0–5<input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={(event) => setForm((current) => ({ ...current, rating: event.target.value }))}/><small>Optional display rating. Leave at 0 to show no rating yet.</small></label>
        </div>
        <label className="serverless-field">Description<textarea rows={3} maxLength={4000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}/></label>
        <div className="flex flex-wrap gap-4 text-xs text-slate-700"><label className="flex items-center gap-2"><input type="checkbox" checked={form.isPublished} onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))}/>Publish in customer gallery</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.featured} onChange={(event) => setForm((current) => ({ ...current, featured: event.target.checked }))}/>Feature video</label></div>
        {file && <p className="text-[10px] leading-relaxed text-slate-500">The file is sent to Telegram for storage. Upload time depends on your connection; keep this screen open until it finishes.</p>}
        <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={resetForm} className="serverless-action">Cancel</button><button type="submit" disabled={busy || (!editingId && !storageSaved)} className="serverless-action serverless-action--primary">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : editingId ? <Save className="h-4 w-4"/> : <Upload className="h-4 w-4"/>}{busy ? "Uploading…" : editingId ? "Save details" : "Upload and save"}</button></div>
        {!editingId && !storageSaved && <p className="text-[10px] text-amber-800">Save the storage channel above before uploading.</p>}
      </form>}

      <section className="mt-3 space-y-2" aria-label="Videos">
        {videos.length === 0 && !loading ? <div className="border border-dashed border-slate-300 bg-white p-6 text-center"><Film className="mx-auto mb-2 h-7 w-7 text-emerald-700"/><p className="font-heading text-sm font-normal uppercase text-slate-800">No videos yet</p><p className="mt-1 text-xs text-slate-500">Set the storage channel, then upload your first compressed MP4.</p></div> : videos.map((video) => <article key={video.id} className="flex min-w-0 items-start gap-3 border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-emerald-100 bg-emerald-50 text-emerald-800"><Film className="h-5 w-5"/></div>
          <div className="min-w-0 flex-1"><h3 className="break-words font-heading text-sm font-normal text-slate-900">{video.title}</h3><p className="mt-0.5 text-[10px] text-slate-500">{video.category} · {formatSize(video.fileSize)} · {video.isPublished === false ? "Draft" : "Published"}{video.featured ? " · Featured" : ""}</p><div className="mt-2 flex flex-wrap gap-1.5"><button type="button" disabled={busy} onClick={() => beginEdit(video)} className="serverless-action">Edit details</button><button type="button" disabled={busy} onClick={() => void togglePublished(video)} className="serverless-action">{video.isPublished === false ? "Publish" : "Unpublish"}</button><button type="button" disabled={busy} onClick={() => void toggleFeatured(video)} className="serverless-action">{video.featured ? "Unfeature" : "Feature"}</button><button type="button" disabled={busy} onClick={() => void deleteVideo(video)} className="serverless-action serverless-action--danger"><Trash2 className="h-3.5 w-3.5"/>Remove</button></div></div>
        </article>)}
      </section>
    </>}
  </main>;
}
