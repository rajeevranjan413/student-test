/* NeerajCompetitiveClasses — service worker
 * Minimal, dependency-free. Provides the offline fetch handler that Chrome
 * requires for PWA installability, plus a small app-shell cache so the app
 * opens instantly and shows a friendly fallback when the network is down.
 * We deliberately never cache API / auth traffic (Supabase, /api/*) so data
 * and sessions are always fresh. See docs/FEATURES.md → F11.
 */
const CACHE = "ncc-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never intercept cross-origin, API, or auth traffic — always live network.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return;

  // Navigations: network-first, fall back to cached app shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Static assets: cache-first with background refresh.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
    )
  );
});
