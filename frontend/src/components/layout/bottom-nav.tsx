'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MapPin, MessageCircle, TriangleAlert, UserRound } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Map', icon: MapPin },
  { href: '/dashboard', label: 'Stats', icon: LayoutDashboard },
  { href: '/sos', label: 'SOS', icon: TriangleAlert, emphasis: true },
  { href: '/chat', label: 'Advisor', icon: MessageCircle },
  { href: '/login', label: 'Account', icon: UserRound },
] as const;

/**
 * Bottom tab bar, phones only.
 *
 * The desktop navbar hides its links below `md`, which previously left phones
 * with no way to navigate. A bottom bar is also the iOS/Android convention and
 * keeps SOS within thumb reach, which matters for an emergency action.
 */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-t border-gray-200 pb-safe"
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map(({ href, label, icon: Icon, ...rest }) => {
          const emphasis = 'emphasis' in rest && rest.emphasis;
          const active = pathname === href;

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                // 56px tall clears Apple's 44px minimum touch target.
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 text-[11px] font-medium transition-colors ${
                  emphasis
                    ? 'text-red-600'
                    : active
                      ? 'text-indigo-600'
                      : 'text-gray-500 active:text-indigo-600'
                }`}
              >
                {emphasis ? (
                  <span className="flex items-center justify-center w-9 h-9 -mt-0.5 rounded-full bg-red-600 text-white shadow-md shadow-red-600/30">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                ) : (
                  <Icon className="h-5 w-5" aria-hidden />
                )}
                <span>{label}</span>
                {active && !emphasis && (
                  <span className="sr-only">(current page)</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
