const SHELL = "prime-media-shell-v1";
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("message", (event) => {
  if (
    event.data?.type !== "CACHE_MEDIA_SHELL" ||
    !Array.isArray(event.data.assets)
  )
    return;
  const assets = [...new Set(event.data.assets)]
    .filter((value) => {
      try {
        const url = new URL(value, self.location.origin);
        return (
          url.origin === self.location.origin &&
          !url.search &&
          (url.pathname === "/" || url.pathname.startsWith("/assets/"))
        );
      } catch {
        return false;
      }
    })
    .slice(0, 100);
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const staticAssets = assets.filter(
        (value) => new URL(value, self.location.origin).pathname !== "/",
      );
      if (
        !staticAssets.some((value) =>
          new URL(value, self.location.origin).pathname.endsWith(".js"),
        )
      )
        return;
      // Commit the static HTML only after all of its scripts/styles are stored.
      // A connection loss or overlapping release must not replace a usable
      // offline shell with an index whose new bundle is absent.
      try {
        await Promise.all(
          staticAssets.map(async (value) => {
            const response = await fetch(value, { cache: "force-cache" });
            if (!response.ok) throw new Error("Static asset unavailable");
            await cache.put(value, response);
          }),
        );
        const index = await fetch("/", { cache: "no-cache" });
        if (!index.ok) return;
        const html = await index.clone().text();
        const required = [
          ...html.matchAll(
            /(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g,
          ),
        ].map((match) => match[1]);
        if (!required.length) return;
        for (const path of required) if (!(await cache.match(path))) return;
        await cache.put("/", index);
      } catch {
        /* Keep the previous complete offline shell. */
      }
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const saved = await (await caches.open(SHELL)).match("/");
        return saved || Response.error();
      }),
    );
  } else if (!url.search && url.pathname.startsWith("/assets/")) {
    event.respondWith(
      fetch(event.request).catch(
        async () =>
          (await (await caches.open(SHELL)).match(event.request)) ||
          Response.error(),
      ),
    );
  }
});
