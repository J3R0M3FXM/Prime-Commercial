import { videoCategories } from "@/tgcloud/lib/video-metadata.js";

export type MediaVideo = {
  id: string;
  storageType: "r2" | "telegram";
  title: string;
  category?: string;
  categories?: string[];
  description?: string;
  tags?: string[];
  thumbnailUrl?: string;
  duration?: number;
  views?: number;
  rating?: number;
  likes?: number;
  dislikes?: number;
  reaction?: number;
  myRating?: number;
  fileSize?: number;
  width?: number;
  height?: number;
  mediaId?: string;
  directUrl?: string;
  isPublished?: boolean;
};
export type MediaPlaylist = { id: string; name: string; items: string[] };
const CACHE = "prime-media-offline-v1";
const PREFIX = "/__prime_offline_media__/";
let verifiedOwner = "";

export function setMediaOwner(id: string) {
  if (!/^\d{1,24}$/.test(id)) return;
  verifiedOwner = id;
  try {
    localStorage.setItem("prime_media_verified_owner", id);
  } catch {}
}
export function mediaOwner(offline = false): string {
  const webApp = (window as any).Telegram?.WebApp;
  const active = String(webApp?.initDataUnsafe?.user?.id || "");
  if (verifiedOwner && (!active || active === verifiedOwner))
    return verifiedOwner;
  if (offline && webApp?.initData && /^\d{1,24}$/.test(active)) {
    try {
      if (localStorage.getItem("prime_media_verified_owner") === active)
        return active;
    } catch {}
  }
  throw new Error("Reopen Media from your verified Telegram account.");
}
export const mediaKey = (video: Pick<MediaVideo, "id" | "storageType">) =>
  video.storageType + ":" + video.id;
export const MEDIA_PAGE_SIZE = 30;
export function paginateMedia<T>(videos: T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(videos.length / MEDIA_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1));
  return {
    items: videos.slice((page - 1) * MEDIA_PAGE_SIZE, page * MEDIA_PAGE_SIZE),
    page,
    pages,
    total: videos.length,
  };
}
export function normalizeMedia(
  video: any,
  storageType: "r2" | "telegram",
): MediaVideo {
  return {
    ...video,
    storageType,
    categories: videoCategories(video),
    duration: Number(video.duration) || 0,
  };
}
export function mediaMatches(
  video: MediaVideo,
  query: string,
  category: string,
) {
  return (
    (!category ||
      category === "All" ||
      videoCategories(video).some(
        (value: string) => value.toLowerCase() === category.toLowerCase(),
      )) &&
    [
      video.title,
      video.description,
      ...(video.tags || []),
      ...videoCategories(video),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
}
export function formatMediaDuration(seconds = 0) {
  const duration = Math.max(0, Math.floor(seconds));
  return (
    Math.floor(duration / 60)
      .toString()
      .padStart(2, "0") +
    ":" +
    (duration % 60).toString().padStart(2, "0")
  );
}
function localKey(owner: string) {
  if (!/^\d{1,24}$/.test(owner)) throw new Error("Telegram account required.");
  return "prime_media_playlists_v1:" + owner;
}
export function readPlaylists(owner: string): MediaPlaylist[] {
  try {
    const value = JSON.parse(localStorage.getItem(localKey(owner)) || "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (item) =>
              item &&
              /^[A-Za-z0-9_-]{8,64}$/.test(item.id) &&
              typeof item.name === "string" &&
              Array.isArray(item.items),
          )
          .slice(0, 50)
          .map((item) => ({
            id: item.id,
            name: item.name.slice(0, 80),
            items: [
              ...new Set<string>(
                item.items.filter(
                  (key: unknown) =>
                    typeof key === "string" &&
                    /^(r2|telegram):[A-Za-z0-9_-]{1,120}$/.test(key),
                ),
              ),
            ].slice(0, 500),
          }))
      : [];
  } catch {
    return [];
  }
}
export function writePlaylists(owner: string, playlists: MediaPlaylist[]) {
  if (
    playlists.length > 50 ||
    playlists.some(
      (list) =>
        !list.name.trim() || list.name.length > 80 || list.items.length > 500,
    )
  )
    throw new Error("Playlist limit reached.");
  localStorage.setItem(localKey(owner), JSON.stringify(playlists));
}
function cachePath(
  owner: string,
  video: Pick<MediaVideo, "id" | "storageType">,
  part: string,
) {
  localKey(owner);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(video.id))
    throw new Error("Invalid media identity.");
  return PREFIX + owner + "/" + video.storageType + "/" + video.id + "/" + part;
}
export async function listOfflineMedia(owner: string): Promise<MediaVideo[]> {
  if (!("caches" in window)) return [];
  localKey(owner);
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  const videos: MediaVideo[] = [];
  for (const key of keys) {
    const path = new URL(key.url).pathname;
    if (path.startsWith(PREFIX + owner + "/") && path.endsWith("/info")) {
      const info = await cache.match(key);
      try {
        const video = await info?.json();
        if (video?.id && (await cache.match(cachePath(owner, video, "video"))))
          videos.push(video);
      } catch {}
    }
  }
  return videos;
}
export async function saveOfflineMedia(
  owner: string,
  video: MediaVideo,
  url: string,
  thumbnailUrl: string,
  signal?: AbortSignal,
) {
  if (!("caches" in window))
    throw new Error("Offline media storage is unavailable on this device.");
  const quota = await navigator.storage?.estimate?.();
  if (
    video.fileSize &&
    quota?.quota &&
    quota.quota - (quota.usage || 0) < video.fileSize * 1.15
  )
    throw new Error("Not enough device storage. Remove a saved video first.");
  const response = await fetch(url, { signal, cache: "no-store" });
  if (
    response.status !== 200 ||
    !/^video\/mp4/i.test(response.headers.get("Content-Type") || "")
  )
    throw new Error("The full video could not be saved. Retry while online.");
  const cache = await caches.open(CACHE);
  const target = cachePath(owner, video, "video");
  let size = 0;
  const stream = response.body?.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > 150 * 1024 * 1024)
          throw new Error("Video exceeds the offline storage limit.");
        controller.enqueue(chunk);
      },
      flush() {
        if (!size || (video.fileSize && size !== video.fileSize))
          throw new Error("The offline copy was incomplete.");
      },
    }),
  );
  if (!stream) throw new Error("Offline streaming storage is unavailable.");
  try {
    await cache.put(
      target,
      new Response(stream, { headers: { "Content-Type": "video/mp4" } }),
    );
    let thumbnailSaved = false;
    if (thumbnailUrl) {
      try {
        const image = await fetch(thumbnailUrl, { signal });
        if (image.ok) {
          await cache.put(cachePath(owner, video, "thumbnail"), image);
          thumbnailSaved = true;
        }
      } catch {}
    }
    // Signed stream URLs and Telegram credentials are never persisted.
    const metadata = {
      ...video,
      thumbnailUrl: thumbnailSaved ? "offline-thumbnail" : "",
      directUrl: "",
      savedAt: Date.now(),
    };
    await cache.put(
      cachePath(owner, video, "info"),
      new Response(JSON.stringify(metadata), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    void navigator.storage?.persist?.();
  } catch (error) {
    await cache.delete(target);
    throw error;
  }
}
export async function offlineMediaUrl(
  owner: string,
  video: MediaVideo,
  part = "video",
) {
  const cache = await caches.open(CACHE);
  const response = await cache.match(cachePath(owner, video, part));
  return response ? URL.createObjectURL(await response.blob()) : "";
}
export async function removeOfflineMedia(owner: string, video: MediaVideo) {
  const cache = await caches.open(CACHE);
  await Promise.all(
    ["video", "thumbnail", "info"].map((part) =>
      cache.delete(cachePath(owner, video, part)),
    ),
  );
}
export async function registerMediaOfflineShell() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.register(
    "/media-offline-worker.js",
  );
  await navigator.serviceWorker.ready;
  const assets = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => {
      const value = new URL(url);
      return (
        value.origin === location.origin &&
        value.pathname.startsWith("/assets/")
      );
    });
  const entryAssets = [
    ...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
      'script[type="module"][src],link[rel="stylesheet"][href]',
    ),
  ]
    .map((element) =>
      element instanceof HTMLScriptElement ? element.src : element.href,
    )
    .filter(
      (value) =>
        new URL(value).origin === location.origin &&
        new URL(value).pathname.startsWith("/assets/"),
    );
  (
    registration.active ||
    registration.waiting ||
    registration.installing
  )?.postMessage({
    type: "CACHE_MEDIA_SHELL",
    assets: ["/", ...entryAssets, ...assets],
  });
}
