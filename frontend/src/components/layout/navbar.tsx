'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, MapPin, MessageCircle, LayoutDashboard, LogIn } from 'lucide-react';
import CitySwitcher from './city-switcher';

const LINKS = [
  { href: '/', label: 'Risk Map', icon: MapPin },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/chat', label: 'Safety Advisor', icon: MessageCircle },
] as const;

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-200 z-50 pt-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 py-2 shrink-0">
            <Shield className="h-8 w-8 text-indigo-600" />
            <span className="text-xl font-bold text-gray-900">
              Safe<span className="text-indigo-600">Zone</span>
            </span>
          </Link>

          {/* Navigation Links — desktop only; phones use the bottom tab bar */}
          <div className="hidden md:flex items-center gap-6">
            {LINKS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-1 transition ${
                    active ? 'text-indigo-600 font-semibold' : 'text-gray-600 hover:text-indigo-600'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </Link>
              );
            })}
            <Link
              href="/login"
              className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              Login
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* City switcher — the primary control for which data you see */}
            <CitySwitcher />

            {/*
              SOS: desktop only. On phones the bottom tab bar carries a prominent
              SOS action within thumb reach, so duplicating it here would just
              crowd the header.
            */}
            <Link
              href="/sos"
              className="hidden md:inline-flex px-4 py-2 bg-red-600 text-white font-bold rounded-full hover:bg-red-700 transition sos-pulse"
            >
              🆘 SOS
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
