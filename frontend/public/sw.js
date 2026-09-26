/*
 * SafeZone India service worker.
 *
 * Hand-written rather than generated so the caching policy is explicit — this is
 * a safety app and the wrong policy is dangerous, not just stale.
 *
 * POLICY SUMMARY
 * --------------
 * 1. App shell + static assets: cache-first. The app must open with no network
 *    so the emergency numbers on the offline page are always reachable.
 * 2. Public risk data (GET /api/v1/public/...): stale-while-revalidate. Cached
 *    responses are stamped with a timestamp so the UI can say how old they are.
 * 3. SOS, auth, and AI chat: NETWORK ONLY, never cached, never queued.
 *
 * Point 3 is deliberate. A cached or background-queued SOS would tell someone
 * help is coming when no request ever reached a police station. Offline SOS must
 * fail loudly so the user places a real phone call to 112 instead.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `safezone-static-${CACHE_VERSION}`;
const DATA_CACHE = `safezone-data-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline';

// Header we add to cached API responses so the UI can show data age.
const CACHED_AT_HEADER = 'x-safezone-cached-at';

// Minimum we need for the app to open and show emergency numbers offline.
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Paths that must always hit the network and must never be cached.
const NEVER_CACHE_PATTERNS = [
  '/api/v1/sos',       // emergency dispatch — see policy note above
  '/api/v1/auth',      // credentials and tokens
  '/api/v1/agents',    // AI chat needs a live model to be useful
  '/ws/',              // websockets
];

// Public, non-personal risk data that is safe and useful to keep offline.
const CACHEABLE_API_PATTERNS = ['/api/v1/public/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // addAll fails the whole install if any single URL 404s, so add
      // individually and tolerate misses.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('safezone-') && k !== STATIC_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Let the page trigger an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isNeverCached(url) {
  return NEVER_CACHE_PATTERNS.some((p) => url.pathname.startsWith(p) || url.pathname.includes(p));
}

function isCacheableApi(url) {
  return CACHEABLE_API_PATTERNS.some((p) => url.pathname.includes(p));
}

/** Clone a response with a timestamp header so the UI can report data age. */
async function stampResponse(response) {
  const body = await response.clone().blob();
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, new Date().toISOString());
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is ever cacheable; everything else goes straight to the network.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Emergency, auth and AI paths: do not intercept at all.
  if (isNeverCached(url)) return;

  // Page navigations: network first so content is fresh, cache then offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })(),
    );
    return;
  }

  // Public risk data: stale-while-revalidate.
  if (isCacheableApi(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(DATA_CACHE);
        const cached = await cache.match(request);

        const network = fetch(request)
          .then(async (response) => {
            if (response && response.ok) {
              const stamped = await stampResponse(response);
              cache.put(request, stamped.clone()).catch(() => {});
              return stamped;
            }
            return response;
          })
          .catch(() => null);

        // Serve cache immediately when we have it, refresh in the background.
        if (cached) {
          event.waitUntil(network);
          return cached;
        }

        const fresh = await network;
        if (fresh) return fresh;

        return new Response(
          JSON.stringify({ code: 503, message: 'Offline and no cached data available' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        );
      })(),
    );
    return;
  }

  // Build output is content-hashed and immutable: cache-first.
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          return new Response('', { status: 504 });
        }
      })(),
    );
    return;
  }

  // Same-origin static files (icons, manifest, robots): cache with network fallback.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, fresh.clone()).catch(() => {});
          }
          return fresh;
        } catch {
          return new Response('', { status: 504 });
        }
      })(),
    );
  }
});
