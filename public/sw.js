/* NeerajCompetitiveClasses — service worker
 * Minimal, dependency-free. Provides the offline fetch handler that Chrome
 * requires for PWA installability, plus a small app-shell cache so the app
 * opens instantly and shows a friendly fallback when the network is down.
 * We deliberately never cache API / auth traffic (Supabase, /api/*) so data
 * and sessions are always fresh. See docs/FEATURES.md → F11.
 */
// The version is stamped onto the registration URL (`/sw.js?v=<buildId>`) by
// PwaRegister, so every deploy is a byte-different worker the browser installs,
// and each build gets its own cache bucket that `activate` cleans up. See F11.
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `ncc-shell-${VERSION}`;
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

  // Static assets: stale-while-revalidate — serve the cached copy instantly, but
  // always kick off a background fetch to refresh it for next time. This keeps
  // stable-URL assets (icons, manifest) from getting stuck on an old version.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* ---------------------------------------------------------------------------
 * Web Push (F15) — student notifications for new homework / tests / study
 * material. The server (utils/push.ts) sends a JSON payload; we render it and,
 * on tap, focus an open app tab or open the deep link it carries. Nothing here
 * touches the cache or any API/auth data — F10/F11 guarantees are unchanged.
 * ------------------------------------------------------------------------- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Neeraj Competitive Classes", body: event.data && event.data.text() };
  }

  const title = data.title || "Neeraj Competitive Classes";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/student" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/student";
  const targetPath = new URL(targetUrl, self.location.origin).pathname;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an already-open app tab (navigate it to the target if needed).
        for (const client of clientList) {
          const clientPath = new URL(client.url).pathname;
          if (clientPath === targetPath && "focus" in client) return client.focus();
        }
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(targetUrl).catch(() => {});
            return client.focus();
          }
        }
        // Otherwise open a fresh window at the deep link.
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        return undefined;
      })
  );
});
