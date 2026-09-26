'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Crosshair, Loader2, MapPin, Search, X } from 'lucide-react';
import useLocationStore from '@/store/location-store';
import type { City } from '@/types';

/**
 * City switcher for the top bar.
 *
 * On first load it asks for location and selects the nearest monitored city, so
 * a user sees data for where she actually is. She can override that here at any
 * time, and the override persists.
 */
export default function CitySwitcher() {
  const {
    cities,
    selectedCity,
    autoDetected,
    distanceKm,
    withinCoverage,
    permission,
    detecting,
    error,
    loadCities,
    detectLocation,
    selectCity,
    refreshPermission,
  } = useLocationStore();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCities();
    refreshPermission();
  }, [loadCities, refreshPermission]);

  // Auto-detect once, only if already granted. A cold prompt on page load is
  // hostile and browsers increasingly ignore it; the explicit banner handles
  // the first ask instead.
  useEffect(() => {
    if (permission === 'granted' && !selectedCity) {
      detectLocation();
    }
  }, [permission, selectedCity, detectLocation]);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery('');
  }, [open]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? cities.filter(
          (c) => c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q),
        )
      : cities;

    const byState = new Map<string, City[]>();
    for (const c of filtered) {
      const list = byState.get(c.state) ?? [];
      list.push(c);
      byState.set(c.state, list);
    }
    // Array.from rather than spreading the iterator: tsconfig sets no explicit
    // `target`, so iterator spread is not permitted here.
    return Array.from(byState.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [cities, query]);

  const label = selectedCity?.name ?? 'Select city';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 max-w-[11rem] sm:max-w-none px-2.5 py-2 min-h-[40px] rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <MapPin className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        {autoDetected && (
          <span
            title="Detected from your location"
            className="hidden sm:inline text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded"
          >
            NEAR YOU
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose a city"
          className="absolute right-0 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50"
        >
          {/* Detect */}
          <div className="p-2 border-b border-gray-100">
            <button
              type="button"
              onClick={() => detectLocation()}
              disabled={detecting || permission === 'unavailable'}
              className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 disabled:opacity-60 transition"
            >
              {detecting ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
              ) : (
                <Crosshair className="h-4 w-4 shrink-0" aria-hidden />
              )}
              {detecting ? 'Finding your city…' : 'Use my current location'}
            </button>

            {error && <p className="mt-1.5 px-1 text-xs text-red-600">{error}</p>}

            {autoDetected && distanceKm != null && !error && (
              <p className="mt-1.5 px-1 text-xs text-gray-500">
                {withinCoverage === false ? (
                  <span className="text-amber-700">
                    Nearest monitored city is {distanceKm} km away — data may not reflect
                    your area.
                  </span>
                ) : (
                  <>Detected {distanceKm} km from {selectedCity?.name}.</>
                )}
              </p>
            )}
          </div>

          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search city or state"
                aria-label="Search city or state"
                className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[17rem] overflow-y-auto chat-scroll">
            {grouped.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">
                No city matches “{query}”.
              </p>
            ) : (
              grouped.map(([state, list]) => (
                <div key={state}>
                  <p className="sticky top-0 px-3 py-1.5 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {state}
                  </p>
                  {list.map((city) => {
                    const active = selectedCity?.id === city.id;
                    return (
                      <button
                        key={city.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          selectCity(city);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 min-h-[44px] text-sm text-left hover:bg-indigo-50 transition ${
                          active ? 'text-indigo-700 font-semibold bg-indigo-50/60' : 'text-gray-700'
                        }`}
                      >
                        <span className="truncate">{city.name}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] uppercase text-gray-400">{city.tier}</span>
                          {active && <Check className="h-4 w-4" aria-hidden />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
