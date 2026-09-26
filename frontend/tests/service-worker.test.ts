/**
 * Service worker caching policy tests.
 *
 * These load the real public/sw.js into a stubbed ServiceWorkerGlobalScope and
 * assert which requests it intercepts. The property that matters most is that
 * SOS is never served from cache: a cached or replayed SOS would tell someone
 * help is coming when no request ever reached a police station.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';

interface Handlers {
  install?: (e: any) => void;
  activate?: (e: any) => void;
  fetch?: (e: any) => void;
  message?: (e: any) => void;
}

const handlers: Handlers = {};

/** Load sw.js in a sandbox and capture its event listeners. */
function loadServiceWorker() {
  const source = readFileSync(join(__dirname, '..', 'public', 'sw.js'), 'utf8');

  const self: any = {
    location: { origin: 'https://safezone.test' },
    addEventListener: (type: keyof Handlers, fn: any) => {
      handlers[type] = fn;
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };

  const sandbox: any = {
    self,
    caches: {
      open: async () => ({ match: async () => undefined, put: async () => {}, add: async () => {} }),
      keys: async () => [],
      match: async () => undefined,
      delete: async () => true,
    },
    fetch: async () => new Response('', { status: 200 }),
    Response,
    Request,
    Headers,
    URL,
    console,
    Date,
    Promise,
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
}

/**
 * Drive the captured fetch handler and report whether it took over the request.
 * `respondWith` being called means the SW handled (and may cache) it.
 */
function didIntercept(url: string, method = 'GET', mode = 'cors'): boolean {
  let intercepted = false;
  const event = {
    request: { url, method, mode },
    respondWith: () => {
      intercepted = true;
    },
    waitUntil: () => {},
  };
  handlers.fetch?.(event);
  return intercepted;
}

const ORIGIN = 'https://safezone.test';

beforeAll(() => {
  loadServiceWorker();
});

describe('service worker registration', () => {
  it('registers the handlers the app relies on', () => {
    expect(typeof handlers.install).toBe('function');
    expect(typeof handlers.activate).toBe('function');
    expect(typeof handlers.fetch).toBe('function');
  });
});

describe('emergency paths are never intercepted', () => {
  // The whole point: no cache layer between the user and police dispatch.
  it('ignores the SOS trigger endpoint', () => {
    expect(didIntercept(`${ORIGIN}/api/v1/sos/trigger`, 'POST')).toBe(false);
    expect(didIntercept(`${ORIGIN}/api/v1/sos/trigger`, 'GET')).toBe(false);
  });

  it('ignores all SOS sub-paths', () => {
    expect(didIntercept(`${ORIGIN}/api/v1/sos/abc-123/acknowledge`, 'GET')).toBe(false);
    expect(didIntercept(`${ORIGIN}/api/v1/sos`, 'GET')).toBe(false);
  });

  it('ignores websocket upgrade paths used for live SOS location', () => {
    expect(didIntercept(`${ORIGIN}/ws/sos?sos_id=1`, 'GET')).toBe(false);
  });
});

describe('credentials are never cached', () => {
  it('ignores auth endpoints', () => {
    expect(didIntercept(`${ORIGIN}/api/v1/auth/login`, 'POST')).toBe(false);
    expect(didIntercept(`${ORIGIN}/api/v1/auth/me`, 'GET')).toBe(false);
  });
});

describe('AI chat is not cached', () => {
  it('ignores agent endpoints so replies are never stale', () => {
    expect(didIntercept(`${ORIGIN}/api/v1/agents/chat`, 'POST')).toBe(false);
    expect(didIntercept('http://localhost:8090/api/v1/agents/chat', 'POST')).toBe(false);
  });
});

describe('non-GET requests are never handled', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('ignores %s', (method) => {
    expect(didIntercept(`${ORIGIN}/api/v1/public/cities`, method)).toBe(false);
  });
});

describe('public risk data is cached', () => {
  it('handles the cities and zones endpoints', () => {
    expect(didIntercept(`${ORIGIN}/api/v1/public/cities?page=1&limit=50`)).toBe(true);
    expect(didIntercept(`${ORIGIN}/api/v1/public/zones/city/abc`)).toBe(true);
  });

  it('handles public risk data served from the API origin', () => {
    expect(didIntercept('http://localhost:8080/api/v1/public/cities')).toBe(true);
  });
});

describe('app shell is cached', () => {
  it('handles page navigations so the app opens offline', () => {
    expect(didIntercept(`${ORIGIN}/`, 'GET', 'navigate')).toBe(true);
    expect(didIntercept(`${ORIGIN}/sos`, 'GET', 'navigate')).toBe(true);
  });

  it('handles immutable build output', () => {
    expect(didIntercept(`${ORIGIN}/_next/static/chunks/main-abc123.js`)).toBe(true);
  });

  it('handles same-origin static assets', () => {
    expect(didIntercept(`${ORIGIN}/manifest.webmanifest`)).toBe(true);
    expect(didIntercept(`${ORIGIN}/icons/icon-192.png`)).toBe(true);
  });
});

describe('cross-origin requests', () => {
  it('does not cache third-party map tiles', () => {
    // Tiles are large and OSM asks that they not be bulk-cached.
    expect(didIntercept('https://a.tile.openstreetmap.org/11/1234/5678.png')).toBe(false);
  });
});
