'use client';

import { Phone, WifiOff } from 'lucide-react';
import useOnlineStatus from '@/hooks/use-online-status';

/**
 * Connectivity banner.
 *
 * Sits below the navbar when offline. It deliberately surfaces the phone
 * helplines, because a phone call works over the cellular voice network even
 * when data does not — so it is the reliable path when the app cannot reach
 * the server.
 */
export default function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 inset-x-0 z-40 bg-amber-50 border-b border-amber-200 px-4 py-2"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          You&apos;re offline — showing last saved data
        </span>
        <span className="text-xs text-amber-800">
          SOS needs a connection.
        </span>
        <a
          href="tel:112"
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white text-xs font-bold rounded-full hover:bg-red-700"
        >
          <Phone className="h-3 w-3" aria-hidden />
          Call 112
        </a>
      </div>
    </div>
  );
}
