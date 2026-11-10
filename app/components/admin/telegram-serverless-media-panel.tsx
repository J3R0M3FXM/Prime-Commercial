"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  callServerless,
  getTelegramServerlessSession,
  uploadServerlessGalleryVideo,
  uploadStaffImage,
} from "@/lib/telegram-serverless-client";
import {
  checkR2Connection,
  deleteR2Video,
  listR2Videos,
  updateR2Video,
  uploadR2Video,
} from "@/lib/r2-media-client";
import { normalizeMedia, type MediaVideo } from "@/lib/media-library";
import { inspectVideo, type ThumbnailChoice } from "@/lib/video-thumbnails";
import TelegramMediaImage from "../telegram-media-image";
import "./media-panel.css";
type ManagedVideo = MediaVideo & { featured?: boolean };
const empty = {
  title: "",
  categories: [] as string[],
  thumbnailUrl: "",
  description: "",
  tags: [] as string[],
  isPublished: true,
  featured: false,
  duration: 0,
  width: 0,
  height: 0,
};
export default function TelegramServerlessMediaPanel({
  onBack,
}: {
  onBack: () => void;
}) {
  const [authorized, setAuthorized] = useState(false),
    [authLoading, setAuthLoading] = useState(true),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [videos, setVideos] = useState<ManagedVideo[]>([]),
    [connection, setConnection] = useState("Checking R2 connection…");
  const [storageChat, setStorageChat] = useState(""),
    [savedChat, setSavedChat] = useState("");
  const [formOpen, setFormOpen] = useState(false),
    [editing, setEditing] = useState<ManagedVideo | null>(null),
    [storage, setStorage] = useState<"r2" | "telegram">("r2"),
    [form, setForm] = useState(empty);
  const [categoryInput, setCategoryInput] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [choices, setChoices] = useState<ThumbnailChoice[]>([]),
    [choice, setChoice] = useState(0),
    [generating, setGenerating] = useState(false);
  const generation = useRef<AbortController | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [thumbnailError, setThumbnailError] = useState("");
  useEffect(() => {
    if (!cover) { setCoverPreview(""); return; }
    const url = URL.createObjectURL(cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);
  useEffect(
    () => () => {
      choices.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [choices],
  );
  useEffect(
    () => () => {
      generation.current?.abort();
    },
    [],
  );
  useEffect(() => {
    let current = true;
    getTelegramServerlessSession()
      .then((session) => {
        if (current) {
          setAuthorized(Boolean(session.authenticated && session.isAdmin));
          if (!session.isAdmin)
            setError("Verified Telegram staff access is required.");
        }
      })
      .catch((err) => {
        if (current) setError(err.message);
      })
      .finally(() => {
        if (current) setAuthLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [telegram, r2, target, health] = await Promise.allSettled([
      callServerless<ManagedVideo[]>("manageVideos", { action: "list" }, 30000),
      listR2Videos(true),
      callServerless<{ chatId?: string }>("manageVideos", {
        action: "getStorageTarget",
      }),
      checkR2Connection(),
    ]);
    const rows: ManagedVideo[] = [],
      warnings: string[] = [];
    if (telegram.status === "fulfilled" && Array.isArray(telegram.value))
      rows.push(
        ...telegram.value.map((row) => normalizeMedia(row, "telegram")),
      );
    else warnings.push("Telegram catalog unavailable.");
    if (r2.status === "fulfilled")
      rows.push(...r2.value.map((row) => normalizeMedia(row, "r2")));
    else warnings.push("R2 catalog unavailable.");
    setVideos(rows);
    if (target.status === "fulfilled") {
      setStorageChat(target.value.chatId || "");
      setSavedChat(target.value.chatId || "");
    } else warnings.push("Telegram storage setting could not load.");
    setConnection(
      health.status === "fulfilled" && health.value.connected
        ? health.value.multipart
          ? "R2 connected · private bucket · uploads ready"
          : "R2 reachable · upload signing needs configuration"
        : r2.status === "fulfilled"
          ? "R2 catalog reachable · upload connection check unavailable"
          : "R2 connection unavailable",
    );
    setError(warnings.join(" "));
    setLoading(false);
  }, []);
  useEffect(() => {
    if (authorized) void load();
  }, [authorized, load]);
  const categories = [
    ...new Set(videos.flatMap((video) => video.categories || [])),
  ].sort((a, b) => a.localeCompare(b));
  const addCategory = (value: string) => {
    const category = value.trim();
    if (!category) return;
    if (category.length > 80 || form.categories.length >= 12) {
      setError("Use up to 12 categories, each 80 characters or less.");
      return;
    }
    setForm((current) => ({
      ...current,
      categories: current.categories.some(
        (item) => item.toLowerCase() === category.toLowerCase(),
      )
        ? current.categories
        : [...current.categories, category],
    }));
    setCategoryInput("");
  };
  const reset = () => {
    generation.current?.abort();
    setFormOpen(false);
    setEditing(null);
    setForm(empty);
    setFile(null);
    setChoices([]);
    setGenerating(false);
    setCategoryInput("");
    setCover(null);
    setThumbnailError("");
  };
  const pickFile = async (selected?: File, force = false) => {
    // Android pickers may emit another change for the same selected file.
    // Keep its prepared frames instead of unnecessarily restarting the decoder.
    if (!force && selected && file && (choices.length > 0 || cover || thumbnailError || generating) &&
      selected.name === file.name && selected.size === file.size &&
      selected.lastModified === file.lastModified && selected.type === file.type) return;
    generation.current?.abort();
    setChoices([]);
    setFile(selected || null);
    setChoice(0);
    setCover(null);
    setThumbnailError("");
    setGenerating(false);
    setForm((current) => ({ ...current, duration: 0, width: 0, height: 0 }));
    if (!selected) {
      setGenerating(false);
      return;
    }
    if (selected.size > (storage === "r2" ? 150 : 20) * 1024 * 1024) {
      setFile(null);
      setError(`Choose a video up to ${storage === "r2" ? 150 : 20} MiB.`);
      return;
    }
    const controller = new AbortController();
    generation.current = controller;
    setGenerating(true);
    setError("");
    try {
      const inspected = await inspectVideo(selected, controller.signal);
      if (controller.signal.aborted) {
        inspected.choices.forEach((item) => URL.revokeObjectURL(item.url));
        return;
      }
      setChoices(inspected.choices);
      setForm((current) => ({
        ...current,
        duration: inspected.duration,
        width: inspected.width,
        height: inspected.height,
      }));
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setThumbnailError(err.message);
        setForm((current) => ({ ...current, isPublished: false }));
      }
    } finally {
      if (generation.current === controller) setGenerating(false);
    }
  };
  const edit = (video: ManagedVideo) => {
    setCover(null);
    setThumbnailError("");
    generation.current?.abort();
    setChoices([]);
    setFile(null);
    setEditing(video);
    setStorage(video.storageType);
    setForm({
      title: video.title,
      categories: video.categories || [],
      thumbnailUrl: video.thumbnailUrl || "",
      description: video.description || "",
      tags: video.tags || [],
      isPublished: video.isPublished !== false,
      featured: video.featured === true,
      duration: video.duration || 0,
      width: video.width || 1920,
      height: video.height || 1080,
    });
    setFormOpen(true);
    setError("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || generating) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!form.title.trim() || !form.categories.length)
        throw new Error("Enter a title and add at least one category.");
      if (!editing && !file)
        throw new Error(
          "Choose an MP4 to upload.",
        );
      if (thumbnailError && form.isPublished)
        throw new Error("Save this video as a draft first, then verify playback before publishing.");
      let thumbnailUrl=form.thumbnailUrl, thumbnailUploadFailed=false;
      try {
        if(cover || choices[choice]) thumbnailUrl=await uploadStaffImage(cover || choices[choice].file,"media-gallery");
      } catch {
        thumbnailUploadFailed=true;
      }
      const metadata = {
        ...form,
        isPublished:form.isPublished && !thumbnailUploadFailed,
        title: form.title.trim(),
        category: form.categories[0],
        thumbnailUrl,
      };
      if (editing) {
        if (storage === "r2") await updateR2Video(editing.id, metadata);
        else
          await callServerless(
            "manageVideos",
            { action: "update", id: editing.id, ...metadata },
            30000,
          );
      } else if (storage === "r2") {
        const video = await uploadR2Video(file!, metadata, (part, total) =>
          setNotice(`Uploading to R2 · ${part}/${total} parts`),
        );
        // A failed publish must remain an edit of the uploaded draft, never
        // silently re-upload the same large video on the next Save.
        setEditing(normalizeMedia(video, "r2"));
        setForm((current) => ({ ...current, thumbnailUrl }));
        setFile(null);
        setChoices([]);
        if (metadata.isPublished)
          await updateR2Video(video.id, { isPublished: true });
      } else
        await uploadServerlessGalleryVideo(file!, metadata, (part, total) =>
          setNotice(`Uploading to Telegram · ${part}/${total} parts`),
        );
      reset();
      await load();
      setNotice(thumbnailUploadFailed ? "Video saved as a draft. The cover could not be uploaded; you can add it later." : thumbnailError ? "Video uploaded as a draft. Preview playback, then add a cover or publish when ready." : editing ? "Media updated." : "Media uploaded.");
    } catch (err: any) {
      setError(err.message || "Media could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  const publish = async (video: ManagedVideo) => {
    setBusy(true);
    setError("");
    try {
      if (video.storageType === "r2")
        await updateR2Video(video.id, {
          isPublished: video.isPublished === false,
        });
      else
        await callServerless("manageVideos", {
          action: "update",
          id: video.id,
          isPublished: video.isPublished === false,
        });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (video: ManagedVideo) => {
    if (
      !window.confirm(
        video.storageType === "r2"
          ? `Delete “${video.title}” from R2 and the gallery?`
          : `Remove “${video.title}” from the gallery? Its Telegram channel message is retained.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (video.storageType === "r2") await deleteR2Video(video.id);
      else
        await callServerless("manageVideos", {
          action: "delete",
          id: video.id,
        });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const saveTarget = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await callServerless("manageVideos", {
        action: "setStorageTarget",
        chatId: storageChat.trim(),
      });
      setSavedChat(storageChat.trim());
      setNotice("Telegram storage channel saved.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main
      className="serverless-admin-panel prime-media-admin"
      aria-label="Media management"
    >
      <header className="serverless-panel-header">
        <button
          className="serverless-action"
          onClick={onBack}
          aria-label="Back to Admin"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="serverless-panel-header__copy">
          <h1>{formOpen ? (editing ? "Edit Media" : "Upload Media") : "Media Library"}</h1>
          <p>Manager · R2 and Telegram storage</p>
        </div>
        <button
          className="serverless-action"
          disabled={!authorized || busy}
          onClick={() => {
            reset();
            setStorage("r2");
            setFormOpen(true);
          }}
        >
          <Plus size={16} />
          Upload
        </button>
        <button
          className="serverless-action"
          disabled={!authorized || busy || loading}
          onClick={() => void load()}
          aria-label="Refresh media"
        >
          <RefreshCw size={16} />
        </button>
      </header>
      {error && (
        <p role="alert" className="media-message media-message--error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="media-message">
          {notice}
        </p>
      )}
      {authLoading ? (
        <p className="media-message">Verifying staff access…</p>
      ) : !authorized ? (
        <p className="media-message">Open the Admin panel in Telegram.</p>
      ) : (
        <>
          <p className="media-message" role="status">
            {connection}
          </p>
          <nav className="media-manager-tabs" aria-label="Media sections">
            <button type="button" aria-current={!formOpen ? "page" : undefined} disabled={busy} onClick={reset}>Library · {videos.length}</button>
            <button type="button" aria-current={formOpen ? "page" : undefined} disabled={busy} onClick={() => setFormOpen(true)}>{editing ? "Edit Media" : "Uploader"}</button>
          </nav>
          <details className="media-storage-settings" hidden={formOpen && storage !== "telegram"}>
            <summary>Telegram Storage Channel</summary>
            <form onSubmit={saveTarget}>
              <label className="serverless-field">
                Private Channel ID or Username
                <input
                  value={storageChat}
                  onChange={(event) => setStorageChat(event.target.value)}
                  placeholder="-100… or @channel"
                />
              </label>
              <button
                className="serverless-action"
                disabled={busy || storageChat.trim() === savedChat}
              >
                Save Channel
              </button>
            </form>
            <p>The bot must be an administrator in this channel.</p>
          </details>
          {formOpen && (
            <form className="media-upload-form" onSubmit={save}>
              <div className="media-form-title">
                <h2>{editing ? "Edit Media" : "Upload Media"}</h2>
                <button
                  type="button"
                  disabled={busy}
                  className="serverless-action"
                  onClick={reset}
                  aria-label="Close upload form"
                >
                  <X size={16} />
                </button>
              </div>
              <label className="serverless-field">
                Title
                <input
                  required
                  maxLength={180}
                  value={form.title}
                  disabled={busy}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <fieldset disabled={busy}>
                <legend>Categories</legend>
                <div className="media-category-add">
                  <input
                    aria-label="New category"
                    list="media-existing-categories"
                    value={categoryInput}
                    maxLength={80}
                    placeholder="Type a category"
                    onChange={(event) => setCategoryInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCategory(categoryInput);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="serverless-action"
                    onClick={() => addCategory(categoryInput)}
                  >
                    Add
                  </button>
                </div>
                <datalist id="media-existing-categories">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
                <select
                  aria-label="Add existing category"
                  value=""
                  onChange={(event) => addCategory(event.target.value)}
                >
                  <option value="">Choose an Existing Category</option>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
                <div className="media-category-chips">
                  {form.categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          categories: current.categories.filter(
                            (value) => value !== category,
                          ),
                        }))
                      }
                      aria-label={`Remove category ${category}`}
                    >
                      {category}
                      <X size={12} />
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="serverless-field">
                Storage
                <select
                  value={storage}
                  disabled={busy || Boolean(editing)}
                  onChange={(event) => {
                    setStorage(event.target.value as "r2" | "telegram");
                    void pickFile();
                  }}
                >
                  <option value="r2">Cloudflare R2 · Up to 150 MiB</option>
                  <option value="telegram">Telegram · Up to 20 MiB</option>
                </select>
              </label>
              {
                <label className="serverless-field">
                  {editing
                    ? "Choose the original MP4 to replace its thumbnail"
                    : "MP4 Video"}
                  <input
                    type="file"
                    required={!editing}
                    accept="video/mp4,.mp4"
                    disabled={busy}
                    onChange={(event) => { if(event.target.files?.[0])void pickFile(event.target.files[0]); }}
                  />
                  {file && (
                    <small>
                      {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MiB
                    </small>
                  )}
                </label>
              }
              {generating && (
                <p className="media-message">
                  <Loader2 size={14} className="animate-spin" />
                  Generating three thumbnail choices…
                  <button type="button" className="serverless-action" onClick={()=>{generation.current?.abort();setGenerating(false);setThumbnailError('Automatic thumbnails skipped. You can upload this video without a cover.');setForm(current=>({...current,isPublished:false}));}}>Skip Thumbnails</button>
                </p>
              )}
              {thumbnailError && (
                <div className="media-thumbnail-warning" role="status">
                  <p>{thumbnailError}</p>
                  <button type="button" className="serverless-action" disabled={busy || generating} onClick={() => void pickFile(file || undefined, true)}>Retry Thumbnails</button>
                  <small>You can upload now without a cover, or select your own image. The video will be saved as a draft for playback review.</small>
                </div>
              )}
              <label className="serverless-field">
                Cover Image (Optional Fallback)
                <input type="file" aria-label="Cover image" accept="image/jpeg,image/png,image/webp" disabled={busy || generating} onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) { setCover(null); return; }
                  if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 10 * 1024 * 1024) {
                    setError("Choose a JPG, PNG or WebP cover up to 10 MiB.");
                    event.target.value = "";
                    return;
                  }
                  setCover(selected);
                  setError("");
                }} />
                <small>{cover ? `Selected cover: ${cover.name}` : "Use a cover if this device cannot generate frames."}</small>
                {coverPreview && <img src={coverPreview} className="media-current-thumbnail" alt="Selected cover preview" />}
              </label>
              {choices.length > 0 && (
                <fieldset disabled={busy}>
                  <legend>Select a Thumbnail</legend>
                  <div className="media-thumbnail-choices">
                    {choices.map((item, index) => (
                      <button
                        type="button"
                        key={item.label}
                        aria-pressed={!cover && choice === index}
                        onClick={() => { setChoice(index); setCover(null); }}
                      >
                        <img src={item.url} alt={`${item.label} frame`} />
                        <span>
                          {item.label}
                          {choice === index && <Check size={12} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {editing && form.thumbnailUrl && (
                <TelegramMediaImage
                  src={form.thumbnailUrl}
                  className="media-current-thumbnail"
                  alt="Current thumbnail"
                />
              )}
              <label className="media-publish-checkbox">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  disabled={busy || Boolean(thumbnailError)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isPublished: event.target.checked,
                    }))
                  }
                />
                Published in Customer Gallery
              </label>
              <button
                className="serverless-action serverless-action--primary"
                disabled={
                  busy ||
                  generating ||
                  (!editing && storage === "telegram" && !savedChat)
                }
              >
                {busy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}{" "}
                {busy ? "Saving…" : editing ? "Save Changes" : "Upload Media"}
              </button>
            </form>
          )}
          <section aria-label="Media library" className="media-admin-library" hidden={formOpen}>
            {loading && <p className="media-message">Loading library…</p>}
            {!loading && !videos.length && (
              <p className="media-message">
                No media yet. Upload an MP4 to get started.
              </p>
            )}
            {videos.map((video) => (
              <article key={video.storageType + ":" + video.id}>
                <TelegramMediaImage
                  src={video.thumbnailUrl}
                  alt={video.title}
                />
                <div>
                  <h2>{video.title}</h2>
                  <p>{video.categories?.join(" · ")}</p>
                  <p>
                    {video.storageType === "r2" ? "R2" : "Telegram"} ·{" "}
                    {video.isPublished === false
                      ? "Hidden / unpublished"
                      : "Published"}
                  </p>
                  <div className="media-admin-actions">
                    <button
                      className="serverless-action"
                      disabled={busy}
                      onClick={() => edit(video)}
                    >
                      Edit
                    </button>
                    <button
                      className="serverless-action"
                      disabled={busy}
                      onClick={() => void publish(video)}
                    >
                      {video.isPublished === false
                        ? "Publish"
                        : "Hide / Unpublish"}
                    </button>
                    <button
                      className="serverless-action serverless-action--danger"
                      disabled={busy}
                      onClick={() => void remove(video)}
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
