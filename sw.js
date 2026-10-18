/* Service worker for Trade Journal. vite.config.js builds it: PRECACHE (every
   file of this build) and VERSION are added in front of this file.
   - Install: save the whole app, so it opens offline from the first launch.
   - Pages: network first, falling back to the saved copy when offline.
   - Fingerprinted assets, icons and fonts: from the cache.
   - Trades never go through here: Google, Apps Script and imgbb are other
     origins and are left alone, so no trade data is cached by this worker.
   - A new version waits until the page says "skip-waiting" (Reload button). */
/* global PRECACHE, VERSION */
const CACHE = "tj-" + VERSION;
const FONTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("tj-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !FONTS.has(url.hostname)) return;

  if (req.mode === "navigate") {
    /* The app is one page: "/" (with ?demo or #view). Only it refreshes the
       offline copy; other pages (privacy.html) are cached under their own URL. */
    const app = url.pathname === "/" || url.pathname === "/index.html";
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(app ? "/" : url.pathname, copy)); }
          return res;
        })
        .catch(() => caches.match(app ? "/" : url.pathname).then(hit => hit || caches.match("/")))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
