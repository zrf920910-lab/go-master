/* Go Master service worker — offline-first app shell.
 *
 * The bundle filenames are hashed by Vite, so the worker discovers them by
 * reading index.html at install time instead of hard-coding paths. Everything
 * needed to boot is then precached, and runtime requests are served cache-first
 * with a background refresh.
 */
const CACHE = 'gomaster-v2';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'];

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE).catch(() => {});
  try {
    const res = await fetch('./index.html', { cache: 'no-store' });
    if (res.ok) {
      const html = await res.text();
      const urls = new Set();
      for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const u = m[1];
        if (u.startsWith('./assets/') || u.startsWith('/assets/') || u.startsWith('./icons/')) {
          urls.add(u.startsWith('/') ? `.${u}` : u);
        }
      }
      await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
    }
  } catch {
    /* offline during install: the runtime cache will fill in later */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (await cache.match(req)) || (await cache.match('./index.html')) || (await cache.match('./'));
        }),
    );
    return;
  }

  // Static assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        fetch(req)
          .then((res) => {
            if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
          })
          .catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
    }),
  );
});
