// Service Worker for Weight Insider
// Strategy:
//  - Static assets (JS, CSS, fonts, icons): Cache-First → serve instantly from cache,
//    update cache in the background.
//  - data.json:  Network-First → always try the network; fall back to cache if offline.
//    When the network returns data that differs from the cached version, post a message
//    to all open clients so they can show a "New data available" toast.
//  - Everything else: Network-Only (no caching for unknown dynamic resources).

const CACHE_VERSION = "weight-insider-v3";
const DATA_CACHE = "weight-insider-data-v1"; // Separate cache for data.json

// Static shell assets to pre-cache at install time.
// NOTE: Only list files that definitely exist; the JS bundle filenames are
// content-hashed by Vite and can't be enumerated here — they will be cached
// on first fetch instead.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon.svg",
];

// ─── Install ─────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.map((name) => {
            if (name !== CACHE_VERSION && name !== DATA_CACHE) {
              return caches.delete(name);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isStaticAsset(url) {
  const { pathname } = new URL(url);
  return (
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith("manifest.json") ||
    // Google Fonts
    url.startsWith("https://fonts.googleapis.com") ||
    url.startsWith("https://fonts.gstatic.com")
  );
}

function isDataJson(url) {
  return new URL(url).pathname === "/data.json";
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

// ─── Cache-First for Static Assets ───────────────────────────────────────────

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) {
    // Serve cached version immediately; update cache in the background.
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => {/* offline — cached version stays */});
    return cached;
  }
  // Not in cache yet — fetch and store.
  const response = await fetch(request);
  if (response && response.status === 200) {
    cache.put(request, response.clone());
  }
  return response;
}

// ─── Network-First for data.json ─────────────────────────────────────────────

async function networkFirstData(request) {
  const cache = await caches.open(DATA_CACHE);

  try {
    const networkResponse = await fetch(request);
    if (!networkResponse || networkResponse.status !== 200) {
      throw new Error("Non-200 response");
    }

    // Check if the data changed compared to what's cached.
    const existing = await cache.match(request);
    if (existing) {
      const [newText, oldText] = await Promise.all([
        networkResponse.clone().text(),
        existing.text(),
      ]);
      if (newText !== oldText) {
        // Data actually changed — update cache and notify the UI.
        await cache.put(request, new Response(newText, {
          status: 200,
          headers: networkResponse.headers,
        }));
        await notifyClients({ type: "DATA_UPDATED" });
      }
    } else {
      // First fetch — just cache it.
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    // Network unavailable or error — serve from cache.
    const cached = await cache.match(request);
    if (cached) {
      await notifyClients({ type: "SERVING_CACHED_DATA" });
      return cached;
    }
    // Nothing in cache either — return a helpful error response.
    return new Response(
      JSON.stringify({ error: "offline", message: "No cached data available." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

// ─── Fetch Handler ────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const { url } = event.request;

  if (isDataJson(url)) {
    event.respondWith(networkFirstData(event.request));
  } else if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request));
  }
  // All other requests pass through to the network without caching.
});
