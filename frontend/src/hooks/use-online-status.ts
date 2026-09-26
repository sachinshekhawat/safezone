'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks browser connectivity.
 *
 * Starts as `true` so server-rendered markup matches the first client render
 * (assuming online) and avoids a hydration mismatch; the effect corrects it
 * immediately on mount.
 *
 * Note this reflects `navigator.onLine`, which means "has a network interface",
 * not "the internet works". Treat it as a hint, never as proof that a request
 * will succeed — callers that matter must still handle fetch failures.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

export default useOnlineStatus;
