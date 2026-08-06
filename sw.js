const CACHE = "inventario-cba-v1";
const CORE_ASSETS = ["/inventario-cba/", "/inventario-cba/index.html", "/inventario-cba/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE_ASSETS)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for navigation & API calls (Supabase), cache-first for static assets
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin.includes("supabase.co") || e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      const resClone = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, resClone));
      return res;
    }).catch(() => cached))
  );
});
