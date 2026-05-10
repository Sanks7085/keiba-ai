// ====== Service Worker for offline support ======
const CACHE_VERSION = "v1";
const CACHE_NAME = `keiba-ai-${CACHE_VERSION}`;
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Install: アプリシェルをキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activate: 古いキャッシュを削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch:
//   - data/*.json → network-first (常に最新を優先、オフライン時のみキャッシュ)
//   - その他      → cache-first (シェルは速く)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (url.pathname.includes("/data/") && url.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(event.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        return res;
      }).catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(hit => hit || fetch(event.request))
    );
  }
});
