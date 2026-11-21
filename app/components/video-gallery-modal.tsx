"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Film,
  ListPlus,
  Loader2,
  Maximize,
  Minimize,
  Plus,
  RefreshCw,
  Search,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import PrimePageHeading from "./prime-page-heading";
import {
  callServerless,
  getServerlessVideos,
  resolveTelegramMedia,
  resolveTelegramVideo,
} from "@/lib/telegram-serverless-client";
import { grantR2Playback, listR2Videos } from "@/lib/r2-media-client";
import {
  formatMediaDuration,
  listOfflineMedia,
  mediaKey,
  mediaMatches,
  mediaOwner,
  normalizeMedia,
  offlineMediaUrl,
  paginateMedia,
  readPlaylists,
  registerMediaOfflineShell,
  removeOfflineMedia,
  saveOfflineMedia,
  writePlaylists,
  type MediaPlaylist,
  type MediaVideo,
} from "@/lib/media-library";
import {
  enterMediaFullscreen,
  exitMediaFullscreen,
} from "@/lib/media-fullscreen";
import TelegramMediaImage from "./telegram-media-image";
import "./video-gallery.css";

export default function VideoGalleryModal({
  isOpen,
  onClose,
  offlineOnly = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  offlineOnly?: boolean;
}) {
  const [videos, setVideos] = useState<MediaVideo[]>([]),
    [saved, setSaved] = useState<MediaVideo[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All"),
    [page, setPage] = useState(1),
    [savedOnly, setSavedOnly] = useState(offlineOnly);
  const [online, setOnline] = useState(() => navigator.onLine && !offlineOnly),
    [activeKey, setActiveKey] = useState(""),
    [source, setSource] = useState(""),
    [playerError, setPlayerError] = useState(""),
    [retry, setRetry] = useState(0),
    [buffering, setBuffering] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
  const [saving, setSaving] = useState(false),
    [notice, setNotice] = useState(""),
    [feedbackBusy, setFeedbackBusy] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [reportVideo, setReportVideo] = useState<MediaVideo | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportReasons, setReportReasons] = useState<string[]>([]);
  const [reportBusy, setReportBusy] = useState(false);
  const [playlists, setPlaylists] = useState<MediaPlaylist[]>([]),
    [playlistPanel, setPlaylistPanel] = useState(false),
    [newPlaylist, setNewPlaylist] = useState(""),
    [playlistFilter, setPlaylistFilter] = useState(""),
    [addToPlaylist, setAddToPlaylist] = useState("");
  const owner = useRef(""),
    videoRef = useRef<HTMLVideoElement>(null),
    root = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    position = useRef(0),
    recoveries = useRef(0),
    watchdog = useRef<ReturnType<typeof setTimeout> | null>(null),
    saveController = useRef<AbortController | null>(null),
    seen = useRef(new Set<string>());
  const active =
    videos.find((video) => mediaKey(video) === activeKey) ||
    saved.find((video) => mediaKey(video) === activeKey) ||
    null;
  const activeRef = useRef(active);
  activeRef.current = active;
  const mergeStats = useCallback((stats: any[]) => {
    const merge = (current: MediaVideo[]) =>
      current.map((video) => ({
        ...video,
        ...stats.find((item) => mediaKey(item) === mediaKey(video)),
      }));
    setVideos(merge);
    setSaved(merge);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      owner.current = mediaOwner(offlineOnly || !navigator.onLine);
      setPlaylists(readPlaylists(owner.current));
      const cached = await listOfflineMedia(owner.current);
      setSaved(cached);
      if (offlineOnly || !navigator.onLine) {
        setVideos(cached);
        return;
      }
      const [telegram, r2] = await Promise.allSettled([
        getServerlessVideos(),
        listR2Videos(),
      ]);
      if (telegram.status === "rejected" && r2.status === "rejected") {
        setVideos(cached);
        setError("Online library unavailable. Saved videos remain available.");
        return;
      }
      const items = [
        ...(r2.status === "fulfilled"
          ? r2.value.map((video) => normalizeMedia(video, "r2"))
          : []),
        ...(telegram.status === "fulfilled"
          ? telegram.value.map((video) => normalizeMedia(video, "telegram"))
          : []),
      ];
      setVideos(items);
      if (telegram.status === "rejected" || r2.status === "rejected")
        setError(
          "One storage service is unavailable. The other library is shown.",
        );
      // Never retain unpublished/deleted offline copies after a successful full refresh.
      if (telegram.status === "fulfilled" && r2.status === "fulfilled") {
        const visible = new Set(items.map(mediaKey));
        await Promise.all(
          cached
            .filter((video) => !visible.has(mediaKey(video)))
            .map((video) => removeOfflineMedia(owner.current, video)),
        );
        setSaved(cached.filter((video) => visible.has(mediaKey(video))));
      }
      for (let start = 0; start < items.length; start += 100) {
        try {
          const stats = await callServerless<any[]>("mediaEngagement", {
            action: "list",
            videos: items.slice(start, start + 100).map((video) => ({
              id: video.id,
              storageType: video.storageType,
            })),
          });
          mergeStats(stats);
        } catch {
          setNotice("View counts and feedback could not refresh.");
          break;
        }
      }
      void registerMediaOfflineShell().catch(() => {});
    } catch (err: any) {
      setError(err.message || "Media could not load.");
    } finally {
      setLoading(false);
    }
  }, [offlineOnly, mergeStats]);
  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);
  useEffect(() => {
    if (isOpen && !offlineOnly) setDisclaimerOpen(true);
    if (!isOpen) { setDisclaimerOpen(false); setReportVideo(null); }
  }, [isOpen, offlineOnly]);
  useEffect(() => {
    if (!isOpen || offlineOnly) return;
    void callServerless<string[]>("mediaTakedownRequests", { action: "getReasons" }, 20000)
      .then(setReportReasons)
      .catch(() => setReportReasons([]));
  }, [isOpen, offlineOnly]);
  const submitReport = async () => {
    if (!reportVideo || reportBusy) return;
    setReportBusy(true);
    try {
      await callServerless("mediaTakedownRequests", { action: "submit", id: reportVideo.id, storageType: reportVideo.storageType, reason: reportReason, description: reportDescription.trim() }, 20000);
      setReportVideo(null);
      setReportReason("");
      setReportDescription("");
      setNotice("Takedown request received. Staff will review it.");
    } catch (err: any) { setNotice(err.message || "Request could not be sent."); }
    finally { setReportBusy(false); }
  };
  useEffect(() => {
    const sync = () => {
      setOnline(navigator.onLine && !offlineOnly);
      if (!navigator.onLine) setSavedOnly(true);
      if (offlineOnly && navigator.onLine)
        setNotice("Connection available. Return online to open the shop.");
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [offlineOnly]);
  useEffect(() => {
    if (!isOpen || !root.current) return;
    const element = root.current;
    const size = () =>
      element.style.setProperty(
        "--media-top",
        `${Math.max(0, element.getBoundingClientRect().top)}px`,
      );
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, [isOpen]);
  useEffect(() => {
    setPage(1);
    scroll.current?.scrollTo({ top: 0 });
  }, [query, category, playlistFilter, savedOnly]);
  useEffect(() => {
    const sync = () => {
      setFullscreen(
        Boolean(
          document.fullscreenElement ||
          (window as any).Telegram?.WebApp?.isFullscreen,
        ),
      );
      if (!document.fullscreenElement) screen.orientation?.unlock?.();
    };
    document.addEventListener("fullscreenchange", sync);
    const app = (window as any).Telegram?.WebApp;
    app?.onEvent?.("fullscreenChanged", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      app?.offEvent?.("fullscreenChanged", sync);
    };
  }, []);
  const clearWatchdog = () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  };
  useEffect(() => {
    if (!activeKey) return;
    const selected = activeRef.current;
    if (!selected) return;
    const mountedPlayer = videoRef.current;
    const controller = new AbortController();
    let ownedUrl = "";
    let cancelled = false;
    setSource("");
    setPlayerError("");
    setBuffering(true);
    (async () => {
      let url = "";
      if (!online || savedOnly)
        url = await offlineMediaUrl(owner.current, selected);
      if (!url && online) {
        url =
          selected.storageType === "r2"
            ? await grantR2Playback(selected.id)
            : await resolveTelegramVideo(
                selected.mediaId || selected.id,
                controller.signal,
              );
      }
      if (!url)
        throw new Error(
          "Save this video while online before playing it offline.",
        );
      if (url.startsWith("blob:")) ownedUrl = url;
      if (cancelled) {
        if (ownedUrl) URL.revokeObjectURL(ownedUrl);
        return;
      }
      setSource(url);
    })().catch((err) => {
      if (!cancelled) {
        setPlayerError(err.message || "Playback unavailable.");
        setBuffering(false);
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
      clearWatchdog();
      const player = mountedPlayer;
      player?.pause();
      player?.removeAttribute("src");
      player?.load();
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [activeKey, retry, online, savedOnly]);
  useEffect(
    () => () => {
      saveController.current?.abort();
      clearWatchdog();
      void exitMediaFullscreen();
    },
    [],
  );
  const open = (video: MediaVideo) => {
    position.current = 0;
    recoveries.current = 0;
    setActiveKey(mediaKey(video));
    setPlayerError("");
  };
  const close = () => {
    saveController.current?.abort();
    setActiveKey("");
    setSource("");
    setSaving(false);
    setFullscreen(false);
    void exitMediaFullscreen();
  };
  const sendFeedback = async (
    video: MediaVideo,
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (!online) {
      setNotice("Feedback is available when online.");
      return;
    }
    if (action !== "view") setFeedbackBusy(true);
    try {
      mergeStats(
        await callServerless<any[]>("mediaEngagement", {
          action,
          id: video.id,
          storageType: video.storageType,
          ...extra,
        }),
      );
    } catch (err: any) {
      setNotice(err.message || "Feedback was not saved.");
    } finally {
      if (action !== "view") setFeedbackBusy(false);
    }
  };
  const playing = () => {
    clearWatchdog();
    setBuffering(false);
    const selected = activeRef.current;
    if (selected && !seen.current.has(mediaKey(selected))) {
      seen.current.add(mediaKey(selected));
      void sendFeedback(selected, "view");
    }
  };
  const waiting = () => {
    setBuffering(true);
    clearWatchdog();
    const stalledAt = position.current;
    watchdog.current = setTimeout(() => {
      if (videoRef.current?.paused || position.current > stalledAt + 0.2)
        return;
      if (recoveries.current < 2) {
        recoveries.current++;
        setRetry((value) => value + 1);
      } else {
        setPlayerError("Playback stalled. Check the connection, then retry.");
        setBuffering(false);
      }
    }, 10000);
  };
  const saveOffline = async () => {
    if (!active || saving || !online) return;
    setSaving(true);
    setNotice("Saving for offline playback…");
    const controller = new AbortController();
    saveController.current = controller;
    try {
      const url =
        active.storageType === "r2" ? await grantR2Playback(active.id) : source;
      if (!url) throw new Error("Wait for this video to load first.");
      const thumbnail = active.thumbnailUrl
        ? await resolveTelegramMedia(active.thumbnailUrl)
        : "";
      await saveOfflineMedia(
        owner.current,
        active,
        url,
        thumbnail,
        controller.signal,
      );
      setSaved(await listOfflineMedia(owner.current));
      setNotice("Saved offline on this device.");
    } catch (err: any) {
      if (!controller.signal.aborted)
        setNotice(err.message || "Offline save failed.");
    } finally {
      setSaving(false);
    }
  };
  const updatePlaylists = (next: MediaPlaylist[]) => {
    try {
      writePlaylists(owner.current, next);
      setPlaylists(next);
    } catch {
      setNotice("Playlists could not be saved. Check device storage.");
    }
  };
  const createPlaylist = () => {
    if (!newPlaylist.trim()) return;
    updatePlaylists([
      ...playlists,
      { id: crypto.randomUUID(), name: newPlaylist.trim(), items: [] },
    ]);
    setNewPlaylist("");
  };
  const addVideo = (playlistId: string) => {
    const list = playlists.find((item) => item.id === playlistId);
    if (!list || !addToPlaylist) return;
    updatePlaylists(
      playlists.map((item) =>
        item.id === list.id
          ? { ...item, items: [...new Set([...item.items, addToPlaylist])] }
          : item,
      ),
    );
    setAddToPlaylist("");
    setNotice(`Added to ${list.name}.`);
  };
  const collection = savedOnly ? saved : videos;
  const categories = useMemo(
    () => [
      "All",
      ...[
        ...new Set(collection.flatMap((video) => video.categories || [])),
      ].sort(),
    ],
    [collection],
  );
  const currentList = playlists.find((item) => item.id === playlistFilter);
  const filtered = collection.filter(
    (video) =>
      mediaMatches(video, query, category) &&
      (!currentList || currentList.items.includes(mediaKey(video))),
  );
  if (currentList)
    filtered.sort(
      (a, b) =>
        currentList.items.indexOf(mediaKey(a)) -
        currentList.items.indexOf(mediaKey(b)),
    );
  const pagination = paginateMedia(filtered, page),
    savedKeys = new Set(saved.map(mediaKey));
  const changePage = (next: number) => {
    setPage(next);
    scroll.current?.scrollTo({ top: 0 });
  };
  if (!isOpen) return null;
  return (
    <div ref={root} className="prime-media-gallery" aria-label="Media library">
      <PrimePageHeading icon={<Film />} title="MEDIA" actions={<>
        <button type="button" aria-label="Refresh media" title="Refresh media" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /></button>
        <button type="button" aria-label={offlineOnly ? "Return online" : "Close media"} title={offlineOnly ? "Return online" : "Close media"} disabled={offlineOnly && !navigator.onLine} onClick={onClose}><X /></button>
      </>} />
      <div className="media-search-strip">
        <label>
          <Search size={15} />
          <input
            aria-label="Search media"
            placeholder="Search media…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Filter media by category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {value === "All" ? "All categories" : value}
            </option>
          ))}
        </select>
      </div>
      <div ref={scroll} className="media-library-scroll">
        <div className="media-library-actions">
          <button
            aria-pressed={savedOnly}
            onClick={() => {
              setSavedOnly((value) => !value);
              setCategory("All");
            }}
          >
            <WifiOff size={14} />
            {savedOnly ? "Saved offline" : "Offline saves"}
          </button>
          <button
            aria-expanded={playlistPanel}
            onClick={() => setPlaylistPanel((value) => !value)}
          >
            <ListPlus size={14} />
            Playlists
          </button>
        </div>
        {!online && (
          <p className="media-library-notice">
            Offline · saved videos on this device
          </p>
        )}
        {error && (
          <p role="alert" className="media-library-notice">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="media-library-notice">
            {notice}
          </p>
        )}
        {(playlistPanel || addToPlaylist) && (
          <section className="media-playlists" aria-label="Your playlists">
            <h2>
              Playlists <small>On this device</small>
            </h2>
            <div className="media-playlist-create">
              <input
                aria-label="New playlist name"
                placeholder="Playlist name"
                value={newPlaylist}
                maxLength={80}
                onChange={(event) => setNewPlaylist(event.target.value)}
              />
              <button onClick={createPlaylist}>
                <Plus size={14} />
                Create
              </button>
            </div>
            {addToPlaylist && <p>Choose a playlist for this video.</p>}
            <button
              className="media-playlist-all"
              onClick={() => {
                setPlaylistFilter("");
                setAddToPlaylist("");
              }}
            >
              Show all media
            </button>
            {playlists.map((list) => (
              <div className="media-playlist-row" key={list.id}>
                <button
                  onClick={() =>
                    addToPlaylist
                      ? addVideo(list.id)
                      : setPlaylistFilter(list.id)
                  }
                  aria-pressed={playlistFilter === list.id}
                >
                  {list.name} <small>{list.items.length}</small>
                </button>
                <button
                  aria-label={`Rename ${list.name}`}
                  onClick={() => {
                    const name = window.prompt("Playlist name", list.name);
                    if (name?.trim())
                      updatePlaylists(
                        playlists.map((item) =>
                          item.id === list.id
                            ? { ...item, name: name.trim() }
                            : item,
                        ),
                      );
                  }}
                >
                  Rename
                </button>
                <button
                  aria-label={`Delete playlist ${list.name}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete playlist “${list.name}”? Videos are retained.`,
                      )
                    ) {
                      updatePlaylists(
                        playlists.filter((item) => item.id !== list.id),
                      );
                      if (playlistFilter === list.id) setPlaylistFilter("");
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {currentList && (
              <ol className="media-playlist-items">
                {currentList.items.map((key, index) => (
                  <li key={key}>
                    <span>
                      {collection.find((video) => mediaKey(video) === key)
                        ?.title || "Unavailable video"}
                    </span>
                    <button
                      disabled={index === 0}
                      aria-label="Move up"
                      onClick={() => {
                        const items = [...currentList.items];
                        [items[index - 1], items[index]] = [
                          items[index],
                          items[index - 1],
                        ];
                        updatePlaylists(
                          playlists.map((list) =>
                            list.id === currentList.id
                              ? { ...list, items }
                              : list,
                          ),
                        );
                      }}
                    >
                      ↑
                    </button>
                    <button
                      aria-label="Remove from playlist"
                      onClick={() =>
                        updatePlaylists(
                          playlists.map((list) =>
                            list.id === currentList.id
                              ? {
                                  ...list,
                                  items: list.items.filter(
                                    (item) => item !== key,
                                  ),
                                }
                              : list,
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
        {loading ? (
          <p className="media-library-empty">
            <Loader2 size={20} className="animate-spin" />
            Loading media…
          </p>
        ) : !pagination.total ? (
          <p className="media-library-empty">
            <Film size={24} />
            {savedOnly
              ? "No saved videos match."
              : "No media matches your search."}
          </p>
        ) : (
          <div className="media-card-grid">
            {pagination.items.map((video) => (
              <MediaCard
                key={mediaKey(video)}
                video={video}
                saved={savedKeys.has(mediaKey(video))}
                owner={owner.current}
                offline={savedOnly}
                onOpen={() => open(video)}
                onPlaylist={() => {
                  setAddToPlaylist(mediaKey(video));
                  setPlaylistPanel(true);
                  scroll.current?.scrollTo({ top: 0 });
                }}
                onReaction={(reaction) =>
                  void sendFeedback(video, "react", {
                    reaction: video.reaction === reaction ? 0 : reaction,
                  })
                }
                feedbackDisabled={!online || feedbackBusy}
                onReport={() => { setReportVideo(video); setReportReason(""); setReportDescription(""); }}
              />
            ))}
          </div>
        )}
        {!loading && pagination.total > 0 && (
          <nav className="media-pagination" aria-label="Media pages">
            <button
              disabled={pagination.page === 1}
              onClick={() => changePage(pagination.page - 1)}
            >
              <ChevronLeft size={15} />
              Previous
            </button>
            <span>
              Page {pagination.page}/{pagination.pages}
            </span>
            <button
              disabled={pagination.page === pagination.pages}
              onClick={() => changePage(pagination.page + 1)}
            >
              Next
              <ChevronRight size={15} />
            </button>
          </nav>
        )}
      </div>
      {active && (
        <div className="media-player-backdrop">
          <section
            className="media-player-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={active.title}
          >
            <header>
              <h2>{active.title}</h2>
              <button onClick={close} aria-label="Close video">
                <X size={18} />
              </button>
            </header>
            <div className="media-video-stage">
              <ReportIcon onClick={() => { setReportVideo(active); setReportReason(""); setReportDescription(""); }} />
              <video
                ref={videoRef}
                src={source || undefined}
                controls
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                disableRemotePlayback
                playsInline
                preload="metadata"
                onContextMenu={(event) => event.preventDefault()}
                onPlaying={playing}
                onWaiting={waiting}
                onStalled={waiting}
                onTimeUpdate={() => {
                  const player = videoRef.current;
                  if (source && player?.currentSrc === source)
                    position.current = player.currentTime;
                }}
                onLoadedMetadata={() => {
                  const player = videoRef.current;
                  if (player) {
                    if (position.current > 0)
                      player.currentTime = Math.min(
                        position.current,
                        Number.isFinite(player.duration)
                          ? Math.max(0, player.duration - 0.1)
                          : position.current,
                      );
                    void player.play().catch(() => {
                      setBuffering(false);
                    });
                  }
                }}
                onPause={() => {
                  clearWatchdog();
                  setBuffering(false);
                }}
                onError={() => {
                  if (source) {
                    setPlayerError(
                      "Video could not play. Retry the stream or use a saved offline copy.",
                    );
                    setBuffering(false);
                  }
                }}
                onEnded={() => {
                  if (currentList) {
                    const index = filtered.findIndex(
                      (video) => mediaKey(video) === activeKey,
                    );
                    if (filtered[index + 1]) open(filtered[index + 1]);
                  }
                }}
              />
              {buffering && !playerError && (
                <span className="media-buffering">
                  <Loader2 className="animate-spin" size={24} />
                </span>
              )}
            </div>
            {playerError && (
              <div className="media-player-error" role="alert">
                {playerError}
                <button
                  onClick={() => {
                    recoveries.current = 0;
                    setRetry((value) => value + 1);
                  }}
                >
                  Retry playback
                </button>
              </div>
            )}
            <div className="media-player-actions">
              <button
                onClick={() => {
                  if (fullscreen) {
                    void exitMediaFullscreen();
                    setFullscreen(false);
                  } else if (videoRef.current)
                    void enterMediaFullscreen(
                      videoRef.current,
                      (active.width || 1920) >= (active.height || 1080),
                    )
                      .then(() => setFullscreen(true))
                      .catch((err) => setNotice(err.message));
                }}
              >
                {fullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                Fullscreen
              </button>
              {savedKeys.has(activeKey) ? (
                <button
                  onClick={async () => {
                    await removeOfflineMedia(owner.current, active);
                    setSaved(await listOfflineMedia(owner.current));
                    setNotice("Offline copy removed.");
                  }}
                >
                  <Trash2 size={14} />
                  Remove offline
                </button>
              ) : (
                <button
                  disabled={!online || saving || !source}
                  onClick={() => void saveOffline()}
                >
                  <WifiOff size={14} />
                  {saving ? "Saving…" : "Save offline"}
                </button>
              )}
              <button
                onClick={() => {
                  setAddToPlaylist(activeKey);
                  setPlaylistPanel(true);
                  close();
                  scroll.current?.scrollTo({ top: 0 });
                }}
              >
                <ListPlus size={14} />
                Playlist
              </button>
            </div>
            <div className="media-player-feedback">
              <button
                disabled={!online || feedbackBusy}
                aria-label="Like video"
                aria-pressed={active.reaction === 1}
                onClick={() =>
                  void sendFeedback(active, "react", {
                    reaction: active.reaction === 1 ? 0 : 1,
                  })
                }
              >
                <ThumbsUp size={16} />
                {active.likes || 0}
              </button>
              <button
                disabled={!online || feedbackBusy}
                aria-label="Dislike video"
                aria-pressed={active.reaction === -1}
                onClick={() =>
                  void sendFeedback(active, "react", {
                    reaction: active.reaction === -1 ? 0 : -1,
                  })
                }
              >
                <ThumbsDown size={16} />
                {active.dislikes || 0}
              </button>
              <label>
                Rate
                <select
                  aria-label="Your video rating"
                  disabled={!online || feedbackBusy}
                  value={active.myRating || ""}
                  onChange={(event) =>
                    void sendFeedback(active, "rate", {
                      rating: Number(event.target.value),
                    })
                  }
                >
                  <option value="" disabled>
                    ☆
                  </option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value} ★
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {notice && (
              <p role="status" className="media-library-notice">
                {notice}
              </p>
            )}
            {saving && (
              <p className="media-library-notice">
                Keep the player open until the offline save finishes.
              </p>
            )}
          </section>
        </div>
      )}
      {disclaimerOpen && <div className="media-legal-backdrop"><section className="media-legal-dialog" role="dialog" aria-modal="true" aria-label="Copyright disclaimer"><img src="/copyright-disclaimer.png" alt="Copyright disclaimer. Publicly sourced content belongs to its respective owners. Use the takedown icon on a video to request removal." /><button onClick={() => setDisclaimerOpen(false)}>Continue to Media</button></section></div>}
      {reportVideo && <div className="media-legal-backdrop"><section className="media-report-dialog" role="dialog" aria-modal="true" aria-label="Request Video Takedown"><h2>Request Video Takedown</h2><p>{reportVideo.title}</p><label>Reason for Request<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="">Select a Reason</option>{reportReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label><label>Description (Optional)<textarea value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} maxLength={2000} placeholder="Add details for staff review." /></label><div><button onClick={() => setReportVideo(null)} disabled={reportBusy}>Cancel</button><button onClick={() => void submitReport()} disabled={reportBusy || !reportReason}>{reportBusy ? "Sending…" : "Send Request"}</button></div></section></div>}
    </div>
  );
}

function MediaCard({
  video,
  saved,
  owner,
  offline,
  onOpen,
  onPlaylist,
  onReaction,
  feedbackDisabled,
  onReport,
}: {
  video: MediaVideo;
  saved: boolean;
  owner: string;
  offline: boolean;
  onOpen: () => void;
  onPlaylist: () => void;
  onReaction: (value: number) => void;
  feedbackDisabled: boolean;
  onReport: () => void;
}) {
  const [thumbnail, setThumbnail] = useState("");
  useEffect(() => {
    let cancelled = false;
    let url = "";
    if (offline && video.thumbnailUrl === "offline-thumbnail")
      void offlineMediaUrl(owner, video, "thumbnail").then((value) => {
        url = value;
        if (cancelled) URL.revokeObjectURL(value);
        else setThumbnail(value);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [owner, offline, video.id, video.storageType, video.thumbnailUrl]);
  return (
    <article className="media-card">
      <ReportIcon onClick={onReport} />
      <button className="media-card-open" onClick={onOpen}>
        <span className="media-card-thumbnail">
          <TelegramMediaImage
            src={offline ? thumbnail : video.thumbnailUrl}
            alt={video.title}
            loading="lazy"
            decoding="async"
          />
          <span>{formatMediaDuration(video.duration)}</span>
          {saved && <WifiOff className="media-saved-badge" size={12} />}
        </span>
        <h2>{video.title}</h2>
      </button>
      <div className="media-card-statistics">
        <span title="Views">
          <Eye size={11} />
          {video.views || 0}
        </span>
        <span title="Rating">
          <Star size={11} />
          {video.rating ? video.rating.toFixed(1) : "—"}
        </span>
      </div>
      <div className="media-card-reactions">
        <button
          disabled={feedbackDisabled}
          aria-label={`Like ${video.title}`}
          aria-pressed={video.reaction === 1}
          onClick={() => onReaction(1)}
        >
          <ThumbsUp size={12} />
          {video.likes || 0}
        </button>
        <button
          disabled={feedbackDisabled}
          aria-label={`Dislike ${video.title}`}
          aria-pressed={video.reaction === -1}
          onClick={() => onReaction(-1)}
        >
          <ThumbsDown size={12} />
          {video.dislikes || 0}
        </button>
        <button
          aria-label={`Add ${video.title} to playlist`}
          onClick={onPlaylist}
        >
          <ListPlus size={13} />
        </button>
      </div>
    </article>
  );
}

function ReportIcon({ onClick }: { onClick: () => void }) {
  return <button className="media-takedown-icon" type="button" aria-label="Request video takedown" title="Request takedown" onClick={onClick}><svg viewBox="660 700 105 105" aria-hidden="true"><image href="/copyright-disclaimer.png" width="1448" height="1086" /></svg></button>;
}
