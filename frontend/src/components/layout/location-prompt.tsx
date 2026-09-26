'use client';

import { useEffect, useState } from 'react';
import { Crosshair, Loader2, X } from 'lucide-react';
import useLocationStore from '@/store/location-store';

const DISMISS_KEY = 'safezone-location-prompt-dismissed';

/**
 * First-visit prompt asking for location access.
 *
 * Shown instead of firing `getCurrentPosition` on page load. A cold permission
 * dialog with no explanation gets denied, and once denied it is painful to
 * recover — Chrome and Safari both require the user to dig into site settings.
 * Asking in context, after saying why, converts far better and is recoverable.
 */
export default function LocationPrompt() {
  const { permission, detecting, selectedCity, autoDetected, detectLocation, refreshPermission } =
    useLocationStore();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until we read storage

  useEffect(() => {
    refreshPermission();
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, [refreshPermission]);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private browsing can block storage; dismissing for this session is fine.
    }
  };

  // Only ask when we can actually succeed and have not already got a fix.
  const shouldAsk = !dismissed && permission === 'prompt' && !autoDetected;
  if (!shouldAsk) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4">
      <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
        <div className="shrink-0 w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center">
          <Crosshair className="h-4 w-4 text-white" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-indigo-900">
            Show safety data for where you are
          </p>
          <p className="mt-0.5 text-xs text-indigo-800">
            Allow location and we&apos;ll open on your nearest monitored city
            {selectedCity ? ` instead of ${selectedCity.name}` : ''}. Your coordinates are
            used to pick the city and are never stored.
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => detectLocation()}
              disabled={detecting}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
            >
              {detecting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {detecting ? 'Detecting…' : 'Allow location'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="px-3 py-2 min-h-[40px] text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              Choose a city myself
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss location prompt"
          className="shrink-0 p-1.5 text-indigo-400 hover:text-indigo-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
