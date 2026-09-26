'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { RISK_BANDS } from '@/lib/utils';

interface RiskLegendProps {
  /** Count of rendered zones per risk level, used to show totals. */
  counts?: Record<string, number>;
  /** Currently hidden risk levels. */
  hidden?: Set<string>;
  /** Toggle visibility of a risk level. Omit to render a read-only legend. */
  onToggle?: (level: string) => void;
}

/**
 * Map legend for the risk bands.
 *
 * Collapsible because on a phone a fixed legend would cover a large share of
 * the map. Starts collapsed on small screens and expanded from `sm` upward.
 */
export default function RiskLegend({ counts, hidden, onToggle }: RiskLegendProps) {
  const [open, setOpen] = useState(false);
  const interactive = typeof onToggle === 'function';

  return (
    <div className="absolute bottom-3 left-3 z-[400] max-w-[calc(100%-1.5rem)]">
      {/* Collapsed pill — small screens only */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="sm:hidden flex items-center gap-1.5 px-3 py-2 bg-white/95 backdrop-blur border border-gray-200 rounded-lg shadow-sm text-xs font-semibold text-gray-700 min-h-[40px]"
      >
        <Info className="h-4 w-4 text-indigo-600" />
        Risk levels
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <div
        className={`${open ? 'block' : 'hidden'} sm:block mt-2 sm:mt-0 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm p-3`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Risk level
        </p>
        <ul className="space-y-0.5">
          {RISK_BANDS.map((band) => {
            const isHidden = hidden?.has(band.level) ?? false;
            const count = counts?.[band.level];
            const row = (
              <>
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0 border border-black/10"
                  style={{ backgroundColor: band.color, opacity: isHidden ? 0.25 : 1 }}
                />
                <span className={`flex-1 ${isHidden ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                  {band.label}
                </span>
                <span className="text-gray-400 tabular-nums">
                  {band.min}–{band.max}
                </span>
                {count != null && (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 tabular-nums text-[10px] min-w-[1.4rem] text-center">
                    {count}
                  </span>
                )}
              </>
            );

            return (
              <li key={band.level}>
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => onToggle?.(band.level)}
                    aria-pressed={!isHidden}
                    title={isHidden ? `Show ${band.label} zones` : `Hide ${band.label} zones`}
                    className="w-full flex items-center gap-2 text-xs py-1.5 px-1 -mx-1 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[32px]"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-xs py-1">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
        {interactive && (
          <p className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
            Tap a band to show or hide it
          </p>
        )}
      </div>
    </div>
  );
}
