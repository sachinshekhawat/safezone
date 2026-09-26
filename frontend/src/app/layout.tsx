import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/layout/navbar';
import BottomNav from '@/components/layout/bottom-nav';
import OfflineBanner from '@/components/layout/offline-banner';
import LocationPrompt from '@/components/layout/location-prompt';
import ServiceWorkerRegistrar from '@/components/pwa/service-worker-registrar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SafeZone India — Safety Risk Prediction',
  description: 'Data-driven safety risk analysis for Indian cities. Empowering law enforcement and citizens with real-time safety intelligence.',
  keywords: ['safety', 'india', 'risk prediction', 'women safety', 'SOS', 'police'],
  manifest: '/manifest.webmanifest',
  applicationName: 'SafeZone India',
  appleWebApp: {
    // Lets iOS run it full-screen from the home screen, like a native app.
    capable: true,
    title: 'SafeZone',
    statusBarStyle: 'default',
  },
  formatDetection: {
    // Stop iOS auto-linking numbers in risk scores and addresses; the real
    // emergency numbers are explicit <a href="tel:"> links already.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deliberately NOT disabling zoom — pinch-to-zoom is an accessibility need.
  maximumScale: 5,
  userScalable: true,
  // Extends the page under the notch so safe-area insets work.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4F46E5' },
    { media: '(prefers-color-scheme: dark)', color: '#312E81' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>
        <Navbar />
        <OfflineBanner />
        {/* pb-nav clears the fixed mobile tab bar; md:pb-0 drops it on desktop. */}
        <main className="pt-16 pb-nav md:pb-0">
          <LocationPrompt />
          {children}
        </main>
        <BottomNav />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
