'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Production only: in `next dev`, a service worker caches hashed chunks that
 * change on every edit, which produces confusing stale-module errors. Offline
 * behaviour should be tested against `npm run build && npm start`.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (cancelled) return;

        // Activate a waiting worker straight away so users are not stuck on a
        // stale build after a deploy.
        if (registration.waiting) {
          registration.waiting.postMessage('SKIP_WAITING');
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage('SKIP_WAITING');
            }
          });
        });
      } catch {
        // A failed registration must never break the app — it only means no
        // offline support this session.
      }
    };

    register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
