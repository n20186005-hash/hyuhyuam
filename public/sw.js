/* Hyuhyuam Hermitage — service worker (PWA offline shell)
 * Strategy:
 *  - Navigations: network-first, fall back to cached page, then offline notice.
 *  - Same-origin static assets: stale-while-revalidate.
 *  - Cross-origin (analytics / weather API / maps): always network, never cached.
 */
// 站点统一使用带尾斜杠的路径（astro.config.mjs → trailingSlash: 'always'），
// 预缓存清单必须与之一致，否则离线时匹配不到缓存页面。
const CACHE = 'hyuhyuam-v2';
const OFFLINE_URLS = ['/ko/', '/zh/', '/en/', '/ja/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(OFFLINE_URLS.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/ko/')))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              cache.put(req, res.clone()).catch(() => undefined);
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
