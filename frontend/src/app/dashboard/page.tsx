'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  MapPin,
  Shield,
  TrendingDown,
  Users,
} from 'lucide-react';
import api from '@/lib/api';
import useLocationStore from '@/store/location-store';
import { RISK_BANDS, riskColor, riskLabel, riskLevelFromScore } from '@/lib/utils';
import type { ZoneWithRisk } from '@/types';

// Leaflet touches `window`, so it must not be server-rendered.
const HeatMap = dynamic(() => import('@/components/map/heat-map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
      <p className="text-gray-500">Loading map…</p>
    </div>
  ),
});

/** Material-style surface: white, subtly elevated, generous radius. */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tint,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-500 truncate">{sub}</p>}
        </div>
        <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${tint}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { cities, selectedCity, loadCities } = useLocationStore();
  const [zones, setZones] = useState<ZoneWithRisk[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  useEffect(() => {
    if (!selectedCity) return;
    let cancelled = false;
    setLoading(true);

    api
      .getZonesByCity(selectedCity.id)
      .then((res) => {
        if (!cancelled) setZones(res?.zones ?? []);
      })
      .catch(() => {
        if (!cancelled) setZones([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCity]);

  const stats = useMemo(() => {
    const scored = zones.filter((z) => z.risk_score != null);
    const avg = scored.length
      ? scored.reduce((sum, z) => sum + (z.risk_score ?? 0), 0) / scored.length
      : null;

    const byBand = zones.reduce<Record<string, number>>((acc, z) => {
      const level = z.risk_level || riskLevelFromScore(z.risk_score);
      acc[level] = (acc[level] ?? 0) + 1;
      return acc;
    }, {});

    const elevated = (byBand.high ?? 0) + (byBand.critical ?? 0);
    const highest = scored.reduce<ZoneWithRisk | null>(
      (best, z) => (!best || (z.risk_score ?? 0) > (best.risk_score ?? 0) ? z : best),
      null,
    );

    return { scored: scored.length, avg, byBand, elevated, highest };
  }, [zones]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Safety Dashboard</h1>
        <p className="text-gray-600 mt-1 text-sm">
          {selectedCity ? (
            <>
              Showing <span className="font-semibold text-gray-800">{selectedCity.name}</span>,{' '}
              {selectedCity.state}. Change the city from the top bar.
            </>
          ) : (
            'Loading cities…'
          )}
        </p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard
          label="Cities monitored"
          value={cities.length || '—'}
          icon={Building2}
          tint="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Zones here"
          value={zones.length || (loading ? '…' : 0)}
          sub={`${stats.scored} scored`}
          icon={MapPin}
          tint="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Elevated risk"
          value={stats.elevated}
          sub="high or critical"
          icon={AlertTriangle}
          tint="bg-red-50 text-red-600"
        />
        <StatCard
          label="Average score"
          value={stats.avg != null ? stats.avg.toFixed(1) : '—'}
          sub={stats.avg != null ? riskLabel(riskLevelFromScore(stats.avg)) : undefined}
          icon={BarChart3}
          tint="bg-amber-50 text-amber-600"
        />
      </div>

      {/* Risk distribution + city profile */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Risk distribution</h2>
          {zones.length === 0 ? (
            <p className="text-sm text-gray-500">{loading ? 'Loading zones…' : 'No zone data.'}</p>
          ) : (
            <ul className="space-y-2.5">
              {RISK_BANDS.map((band) => {
                const count = stats.byBand[band.level] ?? 0;
                const pct = zones.length ? (count / zones.length) * 100 : 0;
                return (
                  <li key={band.level} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-gray-600">{band.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: band.color }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-gray-500">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {stats.highest?.risk_score != null && (
            <p className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-600">
              Highest scoring zone:{' '}
              <span className="font-semibold text-gray-900">{stats.highest.name}</span> at{' '}
              <span
                className="font-semibold"
                style={{ color: riskColor(stats.highest.risk_level || 'moderate') }}
              >
                {stats.highest.risk_score}/100
              </span>
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">City profile</h2>
          {selectedCity ? (
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-gray-500 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" aria-hidden /> Population
                </dt>
                <dd className="font-semibold tabular-nums">
                  {selectedCity.population?.toLocaleString('en-IN') ?? 'N/A'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-gray-500">Literacy</dt>
                <dd className="font-semibold tabular-nums">
                  {selectedCity.literacy_rate ? `${selectedCity.literacy_rate}%` : 'N/A'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-gray-500">Female literacy</dt>
                <dd className="font-semibold tabular-nums">
                  {selectedCity.female_literacy_rate
                    ? `${selectedCity.female_literacy_rate}%`
                    : 'N/A'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-gray-500">Tier</dt>
                <dd>
                  <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-full">
                    {selectedCity.tier}
                  </span>
                </dd>
              </div>
              <p className="pt-2 text-[11px] leading-snug text-gray-400 border-t border-gray-100">
                Demographic figures are approximate Census-era values held for
                development and require verification before official use.
              </p>
            </dl>
          ) : (
            <p className="text-sm text-gray-500">No city selected.</p>
          )}
        </Card>
      </div>

      {/* Map */}
      <Card className="overflow-hidden mb-6">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
          <Shield className="h-4 w-4 text-indigo-600" aria-hidden />
          <h2 className="text-sm font-semibold text-gray-900">
            Zone risk map{selectedCity ? ` — ${selectedCity.name}` : ''}
          </h2>
        </div>
        <div className="h-[58vh] min-h-[360px]">
          <HeatMap />
        </div>
      </Card>

      {/* Trend note */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingDown className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">How to read this</p>
            <p className="mt-0.5 text-xs text-gray-600 leading-relaxed">
              Scores reflect <em>reported</em> incidents plus local infrastructure. Crimes
              against women are widely under-reported, so a low score can mean low
              reporting rather than low risk. Use this to allocate attention, never to
              judge an individual or restrict anyone&apos;s movement.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
