import { api, db, EndpointError, InputFile } from "sdk";
import { eq } from "sdk/db";
import { systemSettings, videos } from "../schema.js";

const MAX_SIZE = 20 * 1024 * 1024;
const PART_SIZE = 512 * 1024;
const fail = (message, code = "VIDEO_UPLOAD_INVALID") => {
  throw new EndpointError(message, { code });
};

function decode(value) {
  if (
    typeof value !== "string" ||
    value.length > 700000 ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    fail("Invalid video part.");
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = new Uint8Array(Math.floor((value.length * 3) / 4));
  let bits = 0;
  let buffer = 0;
  let offset = 0;
  for (const character of value) {
    buffer = (buffer << 6) | alphabet.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset++] = (buffer >> bits) & 255;
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits && buffer) fail("Invalid video encoding.");
  return bytes;
}

export async function handleVideoUpload(input, staff, normalize) {
  const id = String(input.uploadId || "");
  if (!/^[a-f0-9]{32}$/.test(id)) fail("Invalid upload ID.");
  const owner = String(staff.id);
  await db.run(`CREATE TABLE IF NOT EXISTS media_video_uploads (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, metadata TEXT NOT NULL, channel_id TEXT NOT NULL,
    file_size INTEGER NOT NULL, chunk_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'uploading',
    message_json TEXT, expires_at INTEGER NOT NULL)`);
  await db.run(`CREATE TABLE IF NOT EXISTS media_video_parts (
    upload_id TEXT NOT NULL, part_index INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(upload_id,part_index))`);
  await db.run(
    `DELETE FROM media_video_parts WHERE upload_id IN (SELECT id FROM media_video_uploads WHERE expires_at<=unixepoch() AND status<>'sending')`,
  );
  await db.run(
    `DELETE FROM media_video_uploads WHERE expires_at<=unixepoch() AND status<>'sending'`,
  );
  if (input.action === "uploadStart") {
    const size = Number(input.fileSize);
    const count = Number(input.chunkCount);
    if (
      !Number.isSafeInteger(size) ||
      size < 12 ||
      size > MAX_SIZE ||
      input.contentType !== "video/mp4" ||
      count !== Math.ceil(size / PART_SIZE)
    )
      fail("Choose an MP4 up to 20 MiB.");
    const {
      action,
      uploadId,
      fileName,
      contentType,
      fileSize,
      chunkCount,
      ...metadata
    } = input;
    const values = normalize(metadata, false);
    if (!values.title) fail("A title is required.");
    const target = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "telegram_video_storage_chat_id"))
      .get();
    if (!target?.value || typeof target.value !== "string")
      fail("Save the Telegram storage channel first.");
    const inserted = await db.run(
      `INSERT INTO media_video_uploads (id,owner,metadata,channel_id,file_size,chunk_count,expires_at)
      VALUES (:id,:owner,:metadata,:channel,:size,:count,unixepoch()+3600) ON CONFLICT(id) DO NOTHING RETURNING id`,
      {
        ":id": id,
        ":owner": owner,
        ":metadata": JSON.stringify(values),
        ":channel": target.value,
        ":size": size,
        ":count": count,
      },
    );
    if (!Number(inserted?.rowsAffected))
      fail("This upload ID is already in use.");
    return { success: true };
  }
  const session = await db.get(
    `SELECT * FROM media_video_uploads WHERE id=:id AND owner=:owner`,
    { ":id": id, ":owner": owner },
  );
  if (!session || Number(session.expires_at) <= Math.floor(Date.now() / 1000))
    fail("This upload expired. Choose the video again.");
  if (input.action === "uploadCancel") {
    if (session.status === "sending")
      fail(
        "Telegram delivery is uncertain. Check the storage channel before retrying.",
        "VIDEO_UPLOAD_UNCERTAIN",
      );
    if (session.status !== "complete") {
      await db.run(`DELETE FROM media_video_parts WHERE upload_id=:id`, {
        ":id": id,
      });
      await db.run(
        `DELETE FROM media_video_uploads WHERE id=:id AND status<>'sending'`,
        { ":id": id },
      );
    }
    return { success: true };
  }
  if (input.action === "uploadChunk") {
    if (session.status !== "uploading")
      fail("This upload no longer accepts parts.");
    const index = Number(input.index);
    if (!Number.isInteger(index) || index < 0 || index >= session.chunk_count)
      fail("Invalid part number.");
    const bytes = decode(input.data);
    const expected = Math.min(PART_SIZE, session.file_size - index * PART_SIZE);
    if (bytes.length !== expected) fail("Video part size does not match.");
    const prior = await db.get(
      `SELECT data FROM media_video_parts WHERE upload_id=:id AND part_index=:index`,
      { ":id": id, ":index": index },
    );
    if (prior && prior.data !== input.data)
      fail("A different part was already saved at this position.");
    await db.run(
      `INSERT INTO media_video_parts VALUES (:id,:index,:data) ON CONFLICT(upload_id,part_index) DO NOTHING`,
      { ":id": id, ":index": index, ":data": input.data },
    );
    return { success: true };
  }
  const videoId = "tg-" + id;
  const existing = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId))
    .get();
  if (existing) return { success: true, video: existing };
  let message;
  if (session.status === "sent" && session.message_json)
    message = JSON.parse(session.message_json);
  else {
    if (session.status !== "uploading")
      fail(
        "Telegram delivery is uncertain. Check the storage channel before retrying.",
        "VIDEO_UPLOAD_UNCERTAIN",
      );
    const parts = await db.all(
      `SELECT part_index,data FROM media_video_parts WHERE upload_id=:id ORDER BY part_index`,
      { ":id": id },
    );
    if (parts.length !== session.chunk_count)
      fail("Some upload parts are missing.");
    const bytes = new Uint8Array(session.file_size);
    parts.forEach((part, index) => {
      if (Number(part.part_index) !== index)
        fail("Some upload parts are missing.");
      bytes.set(decode(part.data), index * PART_SIZE);
    });
    if (String.fromCharCode(...bytes.subarray(4, 8)) !== "ftyp")
      fail("The file is not an MP4.");
    const claim = await db.run(
      `UPDATE media_video_uploads SET status='sending' WHERE id=:id AND status='uploading' RETURNING id`,
      { ":id": id },
    );
    if (!Number(claim?.rowsAffected))
      fail("Upload completion is already in progress.");
    // Never blindly re-send after an uncertain Telegram response.
    message = await api.sendVideo({
      chat_id: session.channel_id,
      video: new InputFile(bytes, videoId + ".mp4", { type: "video/mp4" }),
      supports_streaming: true,
      caption: JSON.parse(session.metadata).title,
    });
    if (!message?.video?.file_id)
      fail(
        "Telegram did not confirm the video. Check the storage channel.",
        "VIDEO_UPLOAD_UNCERTAIN",
      );
    await db.run(
      `UPDATE media_video_uploads SET status='sent',message_json=:message WHERE id=:id`,
      { ":id": id, ":message": JSON.stringify(message) },
    );
  }
  const metadata = JSON.parse(session.metadata);
  delete metadata.updatedAt;
  const row = {
    ...metadata,
    id: videoId,
    storageType: "telegram",
    telegramFileId: message.video.file_id,
    telegramMessageId: String(message.message_id),
    fileSize: session.file_size,
    duration: Number(message.video.duration) || metadata.duration || 0,
    width: Number(message.video.width) || metadata.width || 1920,
    height: Number(message.video.height) || metadata.height || 1080,
    views: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(videos).values(row).onConflictDoNothing().run();
  await db.run(
    `UPDATE media_video_uploads SET status='complete' WHERE id=:id`,
    { ":id": id },
  );
  await db.run(`DELETE FROM media_video_parts WHERE upload_id=:id`, {
    ":id": id,
  });
  return {
    success: true,
    video: await db.select().from(videos).where(eq(videos.id, videoId)).get(),
  };
}
