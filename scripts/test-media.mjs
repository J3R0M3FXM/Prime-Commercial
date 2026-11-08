import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { build } from "rolldown";
import { JSDOM } from "jsdom";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
process.on("uncaughtException", (error) => {
  console.error(error.name + ": " + error.message);
  console.error(
    String(error.stack || "")
      .split("\n")
      .filter((line) => !line.includes("data:"))
      .slice(0, 12)
      .join("\n"),
  );
  process.exit(1);
});
function load(file, deps, names) {
  const source = readFileSync(file, "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace(/export default async function\s*\(/, "async function handler(")
    .replace(/export /g, "");
  return new Function(
    ...Object.keys(deps),
    source + "\nreturn {" + names.join(",") + "};",
  )(...Object.values(deps));
}
function adapter(database) {
  return {
    async run(query, params = {}) {
      const statement = database.prepare(query);
      if (/\bRETURNING\b/i.test(query)) {
        const rows = statement.all(params);
        return { rows, rowsAffected: rows.length };
      }
      return { rowsAffected: Number(statement.run(params).changes) };
    },
    async get(query, params = {}) {
      return database.prepare(query).get(params);
    },
    async all(query, params = {}) {
      return database.prepare(query).all(params);
    },
  };
}
class EndpointError extends Error {
  constructor(message, options) {
    super(message);
    this.code = options?.code;
  }
}
const metadata = load("tgcloud/lib/video-metadata.js", {}, [
  "videoCategories",
  "categoryTags",
  "publicVideoMetadata",
]);
assert.deepEqual(
  metadata.videoCategories({ categories: ["Demos", "Tutorials", "demos"] }),
  ["Demos", "Tutorials"],
);
const packed = metadata.categoryTags(["Demos", "Tutorials"], ["useful"]);
assert.deepEqual(
  metadata.publicVideoMetadata({ category: "Demos", tags: packed }).categories,
  ["Demos", "Tutorials"],
);
assert.deepEqual(
  metadata.publicVideoMetadata({ category: "Demos", tags: packed }).tags,
  ["useful"],
);
const { normalize } = load(
  "tgcloud/endpoints/manageVideos.js",
  { EndpointError, ...metadata },
  ["normalize"],
);
assert.equal(
  normalize(
    {
      categories: ["Demos", "Tutorials"],
      thumbnailUrl: "tgmedia:img-valid123",
    },
    false,
  ).category,
  "Demos",
);
assert.throws(() => normalize({ categories: ["x".repeat(81)] }, false), {
  code: "INVALID_INPUT",
});
assert.throws(() => normalize({ thumbnailUrl: "javascript:alert(1)" }, false), {
  code: "INVALID_INPUT",
});

// Real SQLite tests exercise the production journal and engagement statements.
const sqlite = new DatabaseSync(":memory:");
const db = adapter(sqlite);
let sent = 0;
const catalog = new Map();
db.select = () => ({
  from(table) {
    this.table = table;
    return this;
  },
  where(condition) {
    this.condition = condition;
    return this;
  },
  async get() {
    return this.table === "settings"
      ? { value: "-100123456789" }
      : catalog.get(this.condition.value);
  },
});
db.insert = () => ({
  values(row) {
    this.row = row;
    return this;
  },
  onConflictDoNothing() {
    return this;
  },
  async run() {
    if (!catalog.has(this.row.id)) catalog.set(this.row.id, this.row);
  },
});
const deps = {
  db,
  EndpointError,
  eq: (_field, value) => ({ value }),
  systemSettings: "settings",
  videos: "videos",
  InputFile: class {
    constructor(bytes) {
      this.bytes = bytes;
    }
  },
  api: {
    async sendVideo(payload) {
      sent++;
      assert.equal(payload.video.bytes.length, 16);
      return {
        message_id: 1,
        video: { file_id: "file-safe", duration: 8, width: 640, height: 360 },
      };
    },
  },
};
const { handleVideoUpload } = load("tgcloud/lib/video-upload.js", deps, [
  "handleVideoUpload",
]);
const id = "a".repeat(32),
  staff = { id: 123 };
const bytes = Buffer.from([
  0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0,
]);
const start = {
  action: "uploadStart",
  uploadId: id,
  fileSize: 16,
  chunkCount: 1,
  contentType: "video/mp4",
  title: "Safe upload",
  categories: ["Demos", "Tutorials"],
  thumbnailUrl: "tgmedia:img-valid123",
  isPublished: false,
};
await handleVideoUpload(start, staff, normalize);
await assert.rejects(() =>
  handleVideoUpload(
    {
      ...start,
      action: "uploadChunk",
      index: 0,
      data: bytes.toString("base64url"),
    },
    { id: 456 },
    normalize,
  ),
);
await assert.rejects(() =>
  handleVideoUpload(
    { action: "uploadComplete", uploadId: id },
    staff,
    normalize,
  ),
);
await handleVideoUpload(
  {
    action: "uploadChunk",
    uploadId: id,
    index: 0,
    data: bytes.toString("base64url"),
  },
  staff,
  normalize,
);
await assert.rejects(() =>
  handleVideoUpload(
    {
      action: "uploadChunk",
      uploadId: id,
      index: 0,
      data: Buffer.alloc(16).toString("base64url"),
    },
    staff,
    normalize,
  ),
);
const result = await handleVideoUpload(
  { action: "uploadComplete", uploadId: id },
  staff,
  normalize,
);
assert.equal(result.video.telegramFileId, "file-safe");
assert.equal(result.video.isPublished, false);
await handleVideoUpload(
  { action: "uploadComplete", uploadId: id },
  staff,
  normalize,
);
assert.equal(
  sent,
  1,
  "Completion retry must not send a duplicate Telegram message",
);
assert.equal(
  sqlite.prepare("SELECT count(*) AS n FROM media_video_parts").get().n,
  0,
);
// A send with a lost response must remain uncertain rather than blindly replay.
const uncertainId = "b".repeat(32);
await handleVideoUpload({ ...start, uploadId: uncertainId }, staff, normalize);
await handleVideoUpload(
  {
    action: "uploadChunk",
    uploadId: uncertainId,
    index: 0,
    data: bytes.toString("base64url"),
  },
  staff,
  normalize,
);
sqlite
  .prepare("UPDATE media_video_uploads SET status='sending' WHERE id=?")
  .run(uncertainId);
await assert.rejects(
  () =>
    handleVideoUpload(
      { action: "uploadComplete", uploadId: uncertainId },
      staff,
      normalize,
    ),
  { code: "VIDEO_UPLOAD_UNCERTAIN" },
);
assert.equal(sent, 1);
console.log(
  "PASS: multi-category metadata, thumbnail reference validation, Telegram upload ownership/parts/idempotency and uncertain-send protection.",
);

catalog.set("published", { id: "published", isPublished: true, views: 7 });
catalog.set("hidden", { id: "hidden", isPublished: false });
const { handler: engage } = load(
  "tgcloud/endpoints/mediaEngagement.js",
  {
    ...deps,
    fetch: async () =>
      new Response(JSON.stringify([{ id: "r2-public", isPublished: true }])),
  },
  ["handler"],
);
const context = { initData: { user: { id: 123 } } };
await assert.rejects(
  () =>
    engage({ action: "view", id: "published", storageType: "telegram" }, {}),
  { code: "AUTH_REQUIRED" },
);
await assert.rejects(
  () =>
    engage({ action: "view", id: "hidden", storageType: "telegram" }, context),
  { code: "NOT_FOUND" },
);
const item = { id: "published", storageType: "telegram" };
await engage({ ...item, action: "view" }, context);
let stats = await engage({ ...item, action: "view" }, context);
assert.equal(
  stats[0].views,
  8,
  "View retries count once per verified account/day",
);
await engage({ ...item, action: "react", reaction: 1 }, context);
stats = await engage({ ...item, action: "react", reaction: -1 }, context);
assert.equal(stats[0].likes, 0);
assert.equal(stats[0].dislikes, 1);
stats = await engage({ ...item, action: "rate", rating: 5 }, context);
assert.equal(stats[0].rating, 5);
assert.equal(stats[0].myRating, 5);
await assert.rejects(
  () => engage({ ...item, action: "rate", rating: 99 }, context),
  { code: "INVALID_INPUT" },
);
assert.equal(
  (
    await engage(
      { action: "view", id: "r2-public", storageType: "r2" },
      context,
    )
  )[0].views,
  1,
);
console.log(
  "PASS: verified views, repeat suppression, mutually exclusive feedback, ratings and unpublished-media denial for both providers.",
);

// Verify Telegram playback returns bridge-sized parts and reuses only the
// short-lived transfer cache; publication must be checked on each request.
const large = Buffer.alloc(600000, 3);
catalog.set("chunked", {
  id: "chunked",
  isPublished: true,
  telegramFileId: "file-chunked",
  fileSize: large.length,
});
let fileReads = 0;
const mediaDb = {
  ...db,
  select() {
    return {
      from() {
        return this;
      },
      where() {
        return this;
      },
      async get() {
        const video = catalog.get("chunked");
        return video.isPublished ? video : null;
      },
    };
  },
};
const readMedia = load(
  "tgcloud/endpoints/getMediaContent.js",
  {
    ...deps,
    db: mediaDb,
    and: () => null,
    api: {
      async getFileContent() {
        fileReads++;
        return new Uint8Array(large);
      },
    },
    isAdminUser: async () => false,
    customers: {},
    mediaAssets: {},
    mediaAssetContents: {},
    orders: {},
  },
  ["handler"],
).handler;
const first = await readMedia({ videoId: "chunked", chunkIndex: 0 }, context),
  second = await readMedia({ videoId: "chunked", chunkIndex: 1 }, context);
assert.equal(first.chunkCount, 2);
assert.equal(Buffer.from(first.base64, "base64").length, 512 * 1024);
assert.equal(
  Buffer.from(second.base64, "base64").length,
  large.length - 512 * 1024,
);
assert.equal(fileReads, 1);
catalog.get("chunked").isPublished = false;
await assert.rejects(
  () => readMedia({ videoId: "chunked", chunkIndex: 1 }, context),
  { code: "NOT_FOUND" },
);
sqlite.close();
console.log(
  "PASS: bounded Telegram playback parts, single upstream fetch and unpublish checks on cached reads.",
);

const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "https://app.example/",
});
for (const key of [
  "window",
  "document",
  "navigator",
  "localStorage",
  "screen",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLMediaElement",
  "Event",
  "MouseEvent",
])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
Object.defineProperty(navigator, "storage", {
  value: {
    estimate: async () => ({ quota: 1024 ** 3, usage: 0 }),
    persist: async () => true,
  },
  configurable: true,
});
window.Telegram = {
  WebApp: {
    initData: "local-test-only",
    initDataUnsafe: { user: { id: 123 } },
  },
};
HTMLElement.prototype.scrollTo = function () {};
HTMLMediaElement.prototype.load = function () {};
HTMLMediaElement.prototype.pause = function () {};
HTMLMediaElement.prototype.play = async function () {};
class MemoryCache {
  entries = new Map();
  key(value) {
    return new URL(
      typeof value === "string" ? value : value.url,
      window.location.origin,
    ).href;
  }
  async put(key, response) {
    const data = await response.arrayBuffer();
    this.entries.set(this.key(key), { data, headers: [...response.headers] });
  }
  async match(key) {
    const value = this.entries.get(this.key(key));
    return value
      ? new Response(value.data.slice(0), { headers: value.headers })
      : undefined;
  }
  async delete(key) {
    return this.entries.delete(this.key(key));
  }
  async keys() {
    return [...this.entries.keys()].map((key) => new Request(key));
  }
}
const stores = new Map();
globalThis.caches = window.caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new MemoryCache());
    return stores.get(name);
  },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) =>
  new Response(String(url).includes("thumbnail") ? Buffer.alloc(4) : bytes, {
    headers: {
      "Content-Type": String(url).includes("thumbnail")
        ? "image/jpeg"
        : "video/mp4",
    },
  });
const fixtures = Array.from({ length: 65 }, (_, index) => ({
  id: "video-" + index,
  title: `Video ${String(index).padStart(2, "0")}`,
  categories: index % 2 ? ["Tutorials"] : ["Demos", "Tutorials"],
  category: index % 2 ? "Tutorials" : "Demos",
  duration: 125,
  thumbnailUrl: "https://image.example/thumbnail.jpg",
  fileSize: 16,
  storageType: index < 50 ? "telegram" : "r2",
}));
globalThis.__mediaTest = {
  fixtures,
  calls: [],
  async call(name, input) {
    this.calls.push({ name, input });
    if (name === "manageVideos") {
      if (input.action === "list")
        return fixtures.filter((item) => item.storageType === "telegram");
      if (input.action === "getStorageTarget")
        return { chatId: "-100123456789" };
      return { success: true };
    }
    return (input.videos || [input]).map((item) => ({
      ...item,
      views: 3,
      likes: input.reaction === 1 ? 1 : 0,
      dislikes: input.reaction === -1 ? 1 : 0,
      rating: 4,
      myRating: 0,
      reaction: input.reaction || 0,
    }));
  },
};
async function bundle(entry, withDefault = true) {
  const root = process.cwd();
  const output = await build({
    input: "\0media-test-entry",
    platform: "node",
    write: false,
    tsconfig: false,
    transform: { jsx: { runtime: "automatic" } },
    onLog(level, log, handler) {
      if (log.code !== "MODULE_LEVEL_DIRECTIVE") handler(level, log);
    },
    resolve: { alias: { "@": root } },
    plugins: [
      {
        name: "media-test-runtime",
        resolveId(id) {
          if (id === "\0media-test-entry") return id;
          if (
            id === "react" ||
            id.startsWith("react/") ||
            id === "lucide-react"
          )
            return {
              id: pathToFileURL(require.resolve(id)).href,
              external: true,
            };
          if (id.includes("telegram-serverless-client")) return "\0bridge";
          if (id.includes("r2-media-client")) return "\0r2";
          if (id.endsWith(".css")) return "\0css";
        },
        load(id) {
          if (id === "\0media-test-entry")
            return `${withDefault ? "export {default}" : "export *"} from ${JSON.stringify(resolve(entry))};export * from ${JSON.stringify(resolve("lib/media-library.ts"))};`;
          if (id === "\0css") return "";
          if (id === "\0bridge")
            return `export const getServerlessVideos=async()=>globalThis.__mediaTest.fixtures.filter(v=>v.storageType==='telegram');export const callServerless=(name,input)=>globalThis.__mediaTest.call(name,input);export const resolveTelegramMedia=async value=>value;export const resolveTelegramVideo=async()=> 'blob:test-video';export const getTelegramServerlessSession=async()=>({authenticated:true,isAdmin:true,tgUserId:'123'});export const uploadStaffImage=async()=> 'tgmedia:img-test1234';export const uploadServerlessGalleryVideo=async(file,metadata)=>{globalThis.__mediaTest.calls.push({name:'telegramUpload',metadata});return{success:true};};`;
          if (id === "\0r2")
            return `export const listR2Videos=async()=>globalThis.__mediaTest.fixtures.filter(v=>v.storageType==='r2');export const grantR2Playback=async id=>'https://r2.example/stream/'+id;export const checkR2Connection=async()=>({connected:true,multipart:true});export const updateR2Video=async()=>({});export const deleteR2Video=async()=>{};export const uploadR2Video=async(file,metadata)=>{globalThis.__mediaTest.calls.push({name:'r2Upload',metadata});return{id:'uploaded'};};`;
        },
      },
    ],
    output: { format: "esm" },
  });
  return await import(
    "data:text/javascript;base64," +
      Buffer.from(output.output[0].code).toString("base64")
  );
}
const gallery = await bundle("app/components/video-gallery-modal.tsx");
gallery.setMediaOwner("123");
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const render = createRoot(document.getElementById("root"));
await act(async () => {
  render.render(createElement(gallery.default, { isOpen: true, onClose() {} }));
});
assert.equal(document.querySelectorAll(".media-card").length, 30);
assert.match(
  document.querySelector(".media-pagination").textContent,
  /Page 1\/3/,
);
await act(async () => {
  [...document.querySelectorAll(".media-pagination button")]
    .find((button) => button.textContent.includes("Next"))
    .click();
});
assert.equal(document.querySelectorAll(".media-card").length, 30);
assert.match(
  document.querySelector(".media-pagination").textContent,
  /Page 2\/3/,
);
await act(async () => {
  [...document.querySelectorAll(".media-pagination button")]
    .find((button) => button.textContent.includes("Next"))
    .click();
});
assert.equal(document.querySelectorAll(".media-card").length, 5);
await act(async () => {
  const input = document.querySelector('[aria-label="Search media"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    "Video 64",
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
assert.equal(document.querySelectorAll(".media-card").length, 1);
assert.match(
  document.querySelector(".media-pagination").textContent,
  /Page 1\/1/,
);
await act(async () => {
  const input = document.querySelector('[aria-label="Search media"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    "",
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await act(async () => {
  const select = document.querySelector(
    '[aria-label="Filter media by category"]',
  );
  select.value = "Demos";
  select.dispatchEvent(new Event("change", { bubbles: true }));
});
assert.equal(document.querySelectorAll(".media-card").length, 30);
assert.match(
  document.querySelector(".media-pagination").textContent,
  /Page 1\/2/,
);
assert.equal(document.querySelectorAll(".media-search-strip input").length, 1);
assert.equal(document.querySelectorAll(".media-search-strip select").length, 1);
await act(async () => {
  document.querySelector(".media-card-reactions button").click();
});
assert.ok(__mediaTest.calls.some((call) => call.input.action === "react"));
await act(async () => {
  document.querySelector('[aria-label="Add Video 00 to playlist"]').click();
});
await act(async () => {
  const input = document.querySelector('[aria-label="New playlist name"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    input,
    "My favorites",
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await act(async () => {
  [...document.querySelectorAll(".media-playlist-create button")][0].click();
});
assert.equal(gallery.readPlaylists("123")[0].name, "My favorites");
await act(async () => {
  document.querySelector(".media-playlist-row>button").click();
});
assert.deepEqual(gallery.readPlaylists("123")[0].items, ["telegram:video-0"]);
await act(async () => {
  document.querySelector(".media-card-open").click();
});
assert.equal(document.querySelectorAll("video").length, 1);
assert.equal(
  document.querySelector("video").getAttribute("controlslist"),
  "nodownload noremoteplayback",
);
await act(async () => {
  document.querySelector('[aria-label="Close video"]').click();
});
assert.equal(document.querySelectorAll("video").length, 0);
await act(async () => {
  render.unmount();
});
console.log(
  "PASS: rendered customer gallery, 30/30/5 pagination, multi-category reset, feedback, persistent playlist creation/add and single-player cleanup.",
);

const offlineVideo = fixtures[0];
await gallery.saveOfflineMedia(
  "123",
  offlineVideo,
  "https://r2.example/video",
  "https://image.example/thumbnail",
);
assert.equal((await gallery.listOfflineMedia("123")).length, 1);
assert.equal((await gallery.listOfflineMedia("456")).length, 0);
const offlineUrl = await gallery.offlineMediaUrl("123", offlineVideo);
assert.match(offlineUrl, /^blob:/);
URL.revokeObjectURL(offlineUrl);
assert.equal(gallery.readPlaylists("456").length, 0);
globalThis.fetch = async () =>
  new Response(Buffer.alloc(3), { headers: { "Content-Type": "video/mp4" } });
await assert.rejects(() =>
  gallery.saveOfflineMedia(
    "123",
    { ...offlineVideo, id: "incomplete" },
    "https://r2.example/bad",
    "",
  ),
);
assert.equal(
  (await gallery.listOfflineMedia("123")).length,
  1,
  "Incomplete offline copies cannot appear as saved",
);
await gallery.removeOfflineMedia("123", offlineVideo);
assert.equal((await gallery.listOfflineMedia("123")).length, 0);
assert.equal(gallery.paginateMedia(fixtures, 99).items.length, 5);
assert.equal(gallery.paginateMedia(fixtures, 0).page, 1);
globalThis.fetch = originalFetch;
assert.match(
  readFileSync("app/components/video-gallery.css", "utf8"),
  /repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
);
console.log(
  "PASS: offline streamed persistence, account isolation, incomplete-copy rejection, removal and pagination clamps.",
);

// Render the actual staff configurator and run its real thumbnail lifecycle
// against a deterministic decoder fixture (no browser codec is claimed here).
const originalCreate = document.createElement.bind(document);
let drawn = 0,
  thumbnailPaused = 0;
let decoderFailure = false;
document.createElement = function (tag, ...args) {
  const element = originalCreate(tag, ...args);
  if (tag === "video") {
    Object.defineProperties(element, {
      duration: { value: 12 },
      videoWidth: { value: 640 },
      videoHeight: { value: 360 },
    });
    let time = 0;
    Object.defineProperty(element, "currentTime", {
      get: () => time,
      set(value) {
        time = value;
        queueMicrotask(() => element.dispatchEvent(new Event("seeked")));
      },
    });
    element.load = () => {
      if (element.getAttribute("src")) {
        assert.ok(element.isConnected, "Mobile decoder must remain attached");
        if (decoderFailure) Object.defineProperty(element, "error", { value: { code: 3 }, configurable: true });
        queueMicrotask(() => element.dispatchEvent(new Event(decoderFailure ? "error" : "loadedmetadata")));
      }
    };
    element.pause = () => {
      thumbnailPaused++;
    };
  }
  if (tag === "canvas") {
    element.getContext = () => ({
      drawImage() {
        drawn++;
      },
    });
    element.toBlob = (callback) =>
      callback(
        new Blob([new Uint8Array([255, 216, 255, 217])], {
          type: "image/jpeg",
        }),
      );
  }
  return element;
};
const admin = await bundle(
  "app/components/admin/telegram-serverless-media-panel.tsx",
);
const adminRoot = createRoot(document.getElementById("root"));
await act(async () => {
  adminRoot.render(createElement(admin.default, { onBack() {} }));
});
await act(async () => {
  [...document.querySelectorAll("header button")]
    .find((button) => button.textContent.includes("Upload"))
    .click();
});
async function inputValue(selector, value) {
  await act(async () => {
    const input = document.querySelector(selector);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
await inputValue('.media-upload-form input[maxlength="180"]', "My media");
await inputValue('[aria-label="New category"]', "New category");
await act(async () => {
  document.querySelector(".media-category-add button").click();
});
await act(async () => {
  const select = document.querySelector('[aria-label="Add existing category"]');
  select.value = "Tutorials";
  select.dispatchEvent(new Event("change", { bubbles: true }));
});
assert.equal(
  document.querySelectorAll(".media-category-chips button").length,
  2,
);
await act(async () => {
  const select = document.querySelector(
    ".media-upload-form select:not([aria-label])",
  );
  select.value = "telegram";
  select.dispatchEvent(new Event("change", { bubbles: true }));
});
await act(async () => {
  const input = document.querySelector(".media-upload-form input[type=file]");
  Object.defineProperty(input, "files", {
    value: [new File([bytes], "sample.mp4", { type: "video/mp4" })],
    configurable: true,
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
});
assert.equal(
  document.querySelectorAll(".media-thumbnail-choices button").length,
  3,
);
assert.equal(drawn, 3);
assert.equal(thumbnailPaused, 1);
await act(async () => {
  document.querySelectorAll(".media-thumbnail-choices button")[1].click();
});
assert.equal(
  document
    .querySelectorAll(".media-thumbnail-choices button")[1]
    .getAttribute("aria-pressed"),
  "true",
);
await act(async () => {
  document
    .querySelector(".media-upload-form")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});
const upload = __mediaTest.calls.find((call) => call.name === "telegramUpload");
assert.equal(upload.metadata.title, "My media");
assert.deepEqual(upload.metadata.categories, ["New category", "Tutorials"]);
assert.equal(upload.metadata.duration, 12);
assert.equal(upload.metadata.thumbnailUrl, "tgmedia:img-test1234");
assert.equal(document.querySelectorAll('video[aria-hidden="true"]').length, 0, "Decoder removed after success");
decoderFailure = true;
await act(async () => {
  [...document.querySelectorAll("header button")].find(button => button.textContent.includes("Upload")).click();
});
await inputValue('.media-upload-form input[maxlength="180"]', "Manual cover draft");
await inputValue('[aria-label="New category"]', "Tutorials");
await act(async () => document.querySelector(".media-category-add button").click());
await act(async () => {
  const input = document.querySelector('.media-upload-form input[accept="video/mp4,.mp4"]');
  Object.defineProperty(input, "files", { value: [new File([bytes], "unsupported.mp4", { type: "video/mp4" })], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 10));
});
assert.match(document.querySelector('.media-thumbnail-warning').textContent, /cannot decode/);
assert.equal(document.querySelector('input[type=checkbox]').checked, false, "Decoder failure forces draft");
assert.equal(document.querySelector('input[type=checkbox]').disabled, true);
assert.equal(document.querySelectorAll('video[aria-hidden="true"]').length, 0, "Decoder removed after error");
await act(async () => {
  const input = document.querySelector('[aria-label="Cover image"]');
  Object.defineProperty(input, "files", { value: [new File([new Uint8Array([255,216,255])], "cover.jpg", { type: "image/jpeg" })], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
await act(async () => document.querySelector('.media-upload-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
assert.ok(__mediaTest.calls.some(call => call.name === 'r2Upload' && call.metadata.title === 'Manual cover draft' && call.metadata.isPublished === false), 'Manual cover must allow draft upload after decoder failure');
console.log('PASS: attached metadata-only decoder, error cleanup, manual-cover fallback and forced draft safety.');
await act(async () => {
  adminRoot.unmount();
});
document.createElement = originalCreate;
const fullscreen = await bundle("lib/media-fullscreen.ts", false);
let locked = "",
  unlocked = 0;
Object.defineProperty(screen, "orientation", {
  value: {
    async lock(value) {
      locked = value;
    },
    unlock() {
      unlocked++;
    },
  },
  configurable: true,
});
Object.defineProperty(document, "fullscreenElement", {
  value: null,
  writable: true,
  configurable: true,
});
const video = originalCreate("video");
video.requestFullscreen = async () => {
  document.fullscreenElement = video;
};
document.exitFullscreen = async () => {
  document.fullscreenElement = null;
};
await fullscreen.enterMediaFullscreen(video, true);
assert.equal(locked, "landscape");
await fullscreen.exitMediaFullscreen();
assert.ok(unlocked > 0);
let telegramFullscreen = 0;
video.requestFullscreen = async () => {
  throw new Error("Native fullscreen denied");
};
window.Telegram.WebApp.requestFullscreen = () => {
  telegramFullscreen++;
};
await fullscreen.enterMediaFullscreen(video);
assert.equal(
  telegramFullscreen,
  1,
  "Telegram fallback is attempted when browser fullscreen is denied",
);
console.log(
  "PASS: rendered staff form, manual/existing multiple categories, three frame selections, decoder cleanup, upload metadata, fullscreen orientation and Telegram fallback.",
);

const workerEvents = new Map();
const shellHtml =
  '<html><script type="module" src="/assets/shell-test.js"></script></html>';
const workerGlobals = {
  self: {
    location: { origin: "https://app.example" },
    addEventListener: (name, handler) => workerEvents.set(name, handler),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  },
  caches: globalThis.caches,
  URL,
  Response,
  fetch: async (request) =>
    new Response(String(request) === "/" ? shellHtml : "export {};", {
      headers: {
        "Content-Type":
          String(request) === "/" ? "text/html" : "text/javascript",
      },
    }),
};
runInNewContext(
  readFileSync("public/media-offline-worker.js", "utf8"),
  workerGlobals,
);
let workerWork;
workerEvents.get("message")({
  data: {
    type: "CACHE_MEDIA_SHELL",
    assets: [
      "/",
      "https://app.example/assets/shell-test.js",
      "/private-records",
      "https://evil.example/assets/x.js",
    ],
  },
  waitUntil(promise) {
    workerWork = promise;
  },
});
await workerWork;
const shell = await caches.open("prime-media-shell-v1");
assert.ok(await shell.match("/"));
assert.equal(await shell.match("/private-records"), undefined);
assert.equal(await shell.match("https://evil.example/assets/x.js"), undefined);
workerGlobals.fetch = async () => {
  throw new Error("Offline");
};
let responsePromise;
workerEvents.get("fetch")({
  request: {
    url: "https://app.example/?tgWebAppStartParam=media",
    method: "GET",
    mode: "navigate",
  },
  respondWith(promise) {
    responsePromise = promise;
  },
});
assert.equal(
  await (await responsePromise).text(),
  shellHtml,
  "Telegram navigation with a query can reopen the cached static shell",
);
let intercepted = false;
workerEvents.get("fetch")({
  request: {
    url: "https://app.example/customer-records",
    method: "GET",
    mode: "cors",
  },
  respondWith() {
    intercepted = true;
  },
});
assert.equal(
  intercepted,
  false,
  "Offline worker must not intercept business endpoints",
);
workerGlobals.fetch = async (request) =>
  new Response(
    String(request) === "/"
      ? '<script src="/assets/not-cached.js"></script>'
      : "export {};",
  );
workerEvents.get("message")({
  data: { type: "CACHE_MEDIA_SHELL", assets: ["/", "/assets/shell-test.js"] },
  waitUntil(promise) {
    workerWork = promise;
  },
});
await workerWork;
assert.equal(
  await (await shell.match("/")).text(),
  shellHtml,
  "An overlapping deployment cannot replace a working index with missing new assets",
);
dom.window.close();
console.log(
  "PASS: offline shell caches static files only, supports Telegram navigation, excludes business records and survives incomplete release updates.",
);
