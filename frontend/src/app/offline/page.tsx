import type { Metadata } from 'next';
import Link from 'next/link';
import { Phone, WifiOff } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Offline — SafeZone India',
  description: 'You are offline. Emergency helplines still work over a phone call.',
};

const HELPLINES = [
  { number: '112', label: 'Emergency Police', tone: 'bg-red-600 hover:bg-red-700' },
  { number: '181', label: 'Women Helpline', tone: 'bg-pink-600 hover:bg-pink-700' },
  { number: '1091', label: 'Women in Distress', tone: 'bg-amber-600 hover:bg-amber-700' },
  { number: '1098', label: 'Child Helpline', tone: 'bg-cyan-600 hover:bg-cyan-700' },
];

/**
 * Shown by the service worker when a navigation fails with no cached copy.
 *
 * The priority here is the phone numbers, not the app. Voice calls go over the
 * cellular network and keep working when mobile data does not, so in a real
 * emergency this page's job is to get the user dialling.
 */
export default function OfflinePage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-100 rounded-2xl mb-4">
          <WifiOff className="h-7 w-7 text-amber-700" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900">You&apos;re offline</h1>
        <p className="mt-2 text-gray-600">
          SafeZone can&apos;t reach the server, so risk scores and the SOS button are
          unavailable right now.
        </p>

        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-left">
          <p className="text-sm font-semibold text-red-900">
            In an emergency, call instead of using the app.
          </p>
          <p className="mt-1 text-xs text-red-800">
            Phone calls use the cellular voice network and usually connect even
            with no mobile data. Emergency numbers also work with no balance and
            from a locked phone.
          </p>
        </div>

        <div className="mt-5 grid gap-2.5">
          {HELPLINES.map(({ number, label, tone }) => (
            <a
              key={number}
              href={`tel:${number}`}
              className={`flex items-center justify-between gap-3 px-5 min-h-[56px] text-white rounded-xl font-semibold transition ${tone}`}
            >
              <span className="flex items-center gap-2">
                <Phone className="h-5 w-5 shrink-0" aria-hidden />
                {label}
              </span>
              <span className="text-lg tabular-nums">{number}</span>
            </a>
          ))}
        </div>

        <div className="mt-6 space-y-2">
          <Link
            href="/"
            className="block px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 min-h-[48px]"
          >
            Try again
          </Link>
          <p className="text-xs text-gray-400">
            Any risk data saved from your last visit is still viewable on the map.
          </p>
        </div>
      </div>
    </div>
  );
}
