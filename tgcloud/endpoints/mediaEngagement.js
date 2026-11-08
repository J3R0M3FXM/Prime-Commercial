import { db, EndpointError } from "sdk";
import { eq } from "sdk/db";
import { fetch } from "sdk/fetch";
import { videos } from "../schema.js";

export default async function (input, ctx) {
  const userId = String(ctx?.initData?.user?.id || "");
  if (!/^\d{1,24}$/.test(userId))
    throw new EndpointError("Telegram access required.", {
      code: "AUTH_REQUIRED",
    });
  const action = String(input?.action || "list");
  if (!["list", "view", "react", "rate"].includes(action))
    throw new EndpointError("Invalid media action.", { code: "INVALID_INPUT" });
  const requested =
    action === "list"
      ? input?.videos
      : [{ id: input?.id, storageType: input?.storageType }];
  if (
    !Array.isArray(requested) ||
    requested.length > 100 ||
    requested.some(
      (item) =>
        !/^[A-Za-z0-9_-]{1,120}$/.test(String(item?.id || "")) ||
        !["r2", "telegram"].includes(item?.storageType),
    )
  )
    throw new EndpointError("Invalid media identities.", {
      code: "INVALID_INPUT",
    });
  let r2Catalog = [];
  if (requested.some((item) => item.storageType === "r2")) {
    const response = await fetch(
      "https://prime-media-gateway.pages.dev/videos",
    );
    if (!response.ok)
      throw new EndpointError("Media availability could not be verified.", {
        code: "MEDIA_UNAVAILABLE",
      });
    r2Catalog = await response.json();
    if (!Array.isArray(r2Catalog))
      throw new EndpointError("Media availability could not be verified.", {
        code: "MEDIA_UNAVAILABLE",
      });
  }
  const allowed = [];
  for (const item of requested) {
    const video =
      item.storageType === "r2"
        ? r2Catalog.find(
            (row) => row.id === item.id && row.isPublished !== false,
          )
        : await db.select().from(videos).where(eq(videos.id, item.id)).get();
    if (video && (video.isPublished === true || video.isPublished === 1))
      allowed.push({
        ...item,
        baseViews: Math.max(0, Number(video.views) || 0),
      });
    else if (action !== "list")
      throw new EndpointError("Video not found.", { code: "NOT_FOUND" });
  }
  await db.run(`CREATE TABLE IF NOT EXISTS media_engagements (
    storage_type TEXT NOT NULL, video_id TEXT NOT NULL, user_id TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0, view_day TEXT, reaction INTEGER NOT NULL DEFAULT 0,
    rating INTEGER NOT NULL DEFAULT 0, updated_at INTEGER,
    PRIMARY KEY(storage_type,video_id,user_id))`);
  if (action !== "list") {
    const item = allowed[0];
    const reaction = Number(input.reaction);
    const rating = Number(input.rating);
    if (
      (action === "react" && ![-1, 0, 1].includes(reaction)) ||
      (action === "rate" &&
        (!Number.isInteger(rating) || rating < 1 || rating > 5))
    )
      throw new EndpointError("Invalid media feedback.", {
        code: "INVALID_INPUT",
      });
    await db.run(
      `INSERT INTO media_engagements (storage_type,video_id,user_id,views,view_day,reaction,rating,updated_at)
      VALUES (:storage,:id,:user,CASE WHEN :action='view' THEN 1 ELSE 0 END,
        CASE WHEN :action='view' THEN date('now') ELSE NULL END,
        CASE WHEN :action='react' THEN :reaction ELSE 0 END,CASE WHEN :action='rate' THEN :rating ELSE 0 END,unixepoch())
      ON CONFLICT(storage_type,video_id,user_id) DO UPDATE SET
        views=media_engagements.views+CASE WHEN :action='view' AND coalesce(media_engagements.view_day,'')<>date('now') THEN 1 ELSE 0 END,
        view_day=CASE WHEN :action='view' THEN date('now') ELSE media_engagements.view_day END,
        reaction=CASE WHEN :action='react' THEN :reaction ELSE media_engagements.reaction END,
        rating=CASE WHEN :action='rate' THEN :rating ELSE media_engagements.rating END,updated_at=unixepoch()`,
      {
        ":storage": item.storageType,
        ":id": item.id,
        ":user": userId,
        ":action": action,
        ":reaction": [-1, 0, 1].includes(reaction) ? reaction : 0,
        ":rating": Number.isInteger(rating) ? rating : 0,
      },
    );
  }
  return await Promise.all(
    allowed.map(async (item) => {
      const stats = await db.get(
        `SELECT coalesce(sum(views),0) AS views,
      coalesce(sum(CASE WHEN reaction=1 THEN 1 ELSE 0 END),0) AS likes,
      coalesce(sum(CASE WHEN reaction=-1 THEN 1 ELSE 0 END),0) AS dislikes,
      coalesce(avg(CASE WHEN rating>0 THEN rating END),0) AS rating,
      coalesce(max(CASE WHEN user_id=:user THEN reaction END),0) AS reaction,
      coalesce(max(CASE WHEN user_id=:user THEN rating END),0) AS myRating
      FROM media_engagements WHERE storage_type=:storage AND video_id=:id`,
        { ":user": userId, ":storage": item.storageType, ":id": item.id },
      );
      return {
        id: item.id,
        storageType: item.storageType,
        ...stats,
        views: item.baseViews + Number(stats?.views || 0),
      };
    }),
  );
}
