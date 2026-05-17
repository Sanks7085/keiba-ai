// ====== Service Worker for offline support ======
const CACHE_VERSION = "v4";
const CACHE_NAME = `keiba-ai-${CACHE_VERSION}`;
const SHELL_FILES = [
  "./style.css",
  "./tansho.css",
  "./app.js",
  "./tansho.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Install: アプリシェルをキャッシュ (HTMLは除外 → 常にネットワーク優先)
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
//   - *.html / ルート → network-first (常に最新版を取得)
//   - data/*.json     → network-first (常に最新を優先、オフライン時のみキャッシュ)
//   - その他 CSS/JS   → cache-first  (高速表示)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  const isHtml = url.pathname.endsWith(".html")
    || url.pathname.endsWith("/")
    || url.pathname === "";
  const isJson = url.pathname.includes("/data/") && url.pathname.endsWith(".json");

  if (isHtml || isJson) {
    // network-first: 常に最新を取得、失敗時のみキャッシュ
    event.respondWith(
      fetch(event.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        return res;
      }).catch(() => caches.match(event.request))
    );
  } else {
    // cache-first: CSS/JS/画像は速く
    event.respondWith(
      caches.match(event.request).then(hit => hit || fetch(event.request))
    );
  }
});
