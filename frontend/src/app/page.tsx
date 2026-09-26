'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Shield, MapPin, Phone, Bot, ArrowRight, AlertTriangle } from 'lucide-react';

// Dynamically import map to avoid SSR issues with Leaflet
const HeatMap = dynamic(() => import('@/components/map/heat-map'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 rounded-2xl flex items-center justify-center">
      <p className="text-gray-500">Loading map...</p>
    </div>
  ),
});

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-6 w-6 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">SafeZone India</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Empowering Safety Through{' '}
              <span className="text-emerald-400">Data Intelligence</span>
            </h1>
            <p className="text-lg md:text-xl text-indigo-100 mb-8 leading-relaxed">
              Real-time safety risk analysis for Indian cities. Helping law enforcement 
              create safer environments — not through fear, but through 
              <strong> awareness and action</strong>.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-indigo-700 font-semibold rounded-lg hover:bg-indigo-50 transition"
              >
                View Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/sos"
                className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition sos-pulse"
              >
                🆘 Emergency SOS
              </Link>
            </div>
          </div>
        </div>
        {/* Wave divider */}
        <div className="absolute bottom-0 w-full">
          <svg viewBox="0 0 1440 120" fill="none" className="w-full">
            <path d="M0,96L60,85.3C120,75,240,53,360,48C480,43,600,53,720,64C840,75,960,85,1080,80C1200,75,1320,53,1380,42.7L1440,32L1440,120L1380,120C1320,120,1200,120,1080,120C960,120,840,120,720,120C600,120,480,120,360,120C240,120,120,120,60,120L0,120Z" fill="#F9FAFB"/>
          </svg>
        </div>
      </section>

      {/* Risk Map Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            <MapPin className="inline h-8 w-8 text-indigo-600 mr-2" />
            Safety Risk Map
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Interactive heat map showing risk levels across zones. Select a city to explore safety data.
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200">
          <div className="h-[65vh] min-h-[380px] sm:h-[500px]">
            <HeatMap />
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500 text-center">
          Circle size reflects each zone&apos;s real extent, colour reflects its risk
          band. Pinch or use +/- to zoom; tap a zone for details.
        </p>
      </section>

      {/* Features Grid */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How SafeZone Helps
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <MapPin className="h-6 w-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Risk Analysis</h3>
              <p className="text-gray-600">
                Zone-wise risk scores based on historical data, demographics, 
                infrastructure, and ML predictions. Updated monthly.
              </p>
            </div>
            {/* Feature 2 */}
            <div className="p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">SOS Emergency</h3>
              <p className="text-gray-600">
                One-tap panic button that streams your live location to the nearest 
                police station. Works without login.
              </p>
            </div>
            {/* Feature 3 */}
            <div className="p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI Safety Advisor</h3>
              <p className="text-gray-600">
                Ask &quot;Is this area safe at night?&quot; and get data-backed advice 
                with risk scores, nearby police stations, and safety tips.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Emergency Numbers */}
      <section className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-6">
            <Phone className="inline h-6 w-6 mr-2" />
            Emergency Helplines
          </h2>
          <div className="flex flex-wrap justify-center gap-8">
            <div>
              <p className="text-3xl font-bold text-red-400">112</p>
              <p className="text-gray-400">Emergency Police</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-pink-400">181</p>
              <p className="text-gray-400">Women Helpline</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-amber-400">1091</p>
              <p className="text-gray-400">Women in Distress</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-cyan-400">1098</p>
              <p className="text-gray-400">Child Helpline</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
