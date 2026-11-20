// Offline cache. Bump VERSION on every release so phones pick up new files.
const VERSION = 'v9';
const FILES = ['./', 'index.html', 'app.css', 'logic.js', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first, so updates arrive when online; cache when offline (e.g. no signal in the gym).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  // cache: 'no-cache' revalidates with the server, so the browser's 10-minute HTTP cache can't serve old files.
  e.respondWith(
    fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
