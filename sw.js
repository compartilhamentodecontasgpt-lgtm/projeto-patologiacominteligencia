const CACHE = "btx-laudos-v7-20260108214805";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=20260108214805",
  "./app.js?v=20260108214805",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (e) {
        const cache = await caches.open(CACHE);
        const url = new URL("index.html", self.registration.scope);
        return (await cache.match(url.href)) || (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
