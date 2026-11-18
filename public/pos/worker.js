const CACHE='prime-pos-launcher-v1';
const ASSETS=['/pos/index.html','/pos/launcher.css','/pos/launcher.js','/pos/manifest.webmanifest','/pos/lato-400.woff2','/pos/roboto-condensed-400.woff2','/pos/icon-192.png','/pos/icon-512.png','/prime-header-brand-refined.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  const navigation=event.request.mode==='navigate'&&(url.pathname==='/pos/'||url.pathname==='/pos/index.html');
  if(!navigation&&(!ASSETS.includes(url.pathname)||url.search))return;
  // Only the public launcher is cached. POS data and Telegram requests never enter this cache.
  event.respondWith(fetch(event.request).catch(async()=>{
    const saved=await (await caches.open(CACHE)).match(navigation?'/pos/index.html':url.pathname);
    return saved||Response.error();
  }));
});
