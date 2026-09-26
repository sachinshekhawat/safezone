'use client';

import { useState } from 'react';
import { Phone, MapPin, Loader2, WifiOff } from 'lucide-react';
import api from '@/lib/api';
import useOnlineStatus from '@/hooks/use-online-status';

export default function SOSPage() {
  const [isTriggered, setIsTriggered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sosData, setSOSData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const online = useOnlineStatus();

  const triggerSOS = async () => {
    setIsLoading(true);
    setError(null);

    // Fail fast and loudly rather than letting the request hang. An SOS that
    // silently does nothing is worse than one that tells you to phone instead.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError(
        'No internet connection — your SOS was NOT sent. Call 112 now; phone calls work without mobile data.',
      );
      setIsLoading(false);
      return;
    }

    try {
      // Get current location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const { latitude, longitude } = position.coords;

      // Trigger SOS via API
      const result = await api.triggerSOS(latitude, longitude);
      setSOSData(result);
      setIsTriggered(true);
    } catch (err: any) {
      if (err.code === 1) {
        setError('Location access denied. Please enable GPS and try again.');
      } else if (err instanceof TypeError) {
        // fetch() throws TypeError when the network is unreachable.
        setError(
          'Could not reach the server — your SOS was NOT sent. Call 112 now.',
        );
      } else {
        setError(err.message || 'Failed to trigger SOS. Call 112 directly.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const cancelSOS = () => {
    setIsTriggered(false);
    setSOSData(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      {!isTriggered ? (
        /* SOS Trigger Screen */
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Emergency SOS</h1>
          <p className="text-gray-600 mb-6">
            Press the button to alert the nearest police station with your live location.
            <strong> No login required.</strong>
          </p>

          {!online && (
            <div
              role="alert"
              className="mb-6 p-4 bg-red-50 border-2 border-red-300 rounded-xl text-left"
            >
              <p className="flex items-center gap-2 text-sm font-bold text-red-900">
                <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
                You are offline — SOS cannot be sent
              </p>
              <p className="mt-1 text-xs text-red-800">
                This button needs internet. Use the phone buttons below instead —
                voice calls work without mobile data.
              </p>
            </div>
          )}

          {/* Big SOS Button */}
          <button
            onClick={triggerSOS}
            disabled={isLoading || !online}
            aria-describedby={!online ? 'sos-offline-note' : undefined}
            className={`w-48 h-48 rounded-full text-white text-3xl font-bold 
                       shadow-2xl active:scale-95 transition-all duration-200 
                       mx-auto block disabled:cursor-not-allowed
                       ${online ? 'bg-red-600 hover:bg-red-700 sos-pulse' : 'bg-gray-400'}`}
          >
            {isLoading ? (
              <Loader2 className="h-12 w-12 animate-spin mx-auto" />
            ) : !online ? (
              <>
                <WifiOff className="h-10 w-10 mx-auto mb-1" aria-hidden />
                <span className="text-base">OFFLINE</span>
              </>
            ) : (
              <>
                🆘
                <br />
                <span className="text-lg">PRESS FOR HELP</span>
              </>
            )}
          </button>
          {!online && (
            <p id="sos-offline-note" className="sr-only">
              SOS is disabled because the device is offline. Use the call buttons below.
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="mt-6 p-4 bg-red-50 border-2 border-red-300 rounded-lg text-red-800 font-medium text-left"
            >
              {error}
            </div>
          )}

          {/* Direct call options */}
          <div className="mt-8 flex flex-col gap-3">
            <a
              href="tel:112"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              <Phone className="h-5 w-5" /> Call 112 — Emergency Police
            </a>
            <a
              href="tel:181"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700"
            >
              <Phone className="h-5 w-5" /> Call 181 — Women Helpline
            </a>
          </div>
        </div>
      ) : (
        /* Active SOS Screen */
        <div className="text-center max-w-md w-full">
          <div className="bg-red-600 text-white rounded-2xl p-8 mb-6 sos-pulse">
            <h1 className="text-3xl font-bold mb-2">🚨 SOS ACTIVE</h1>
            <p className="text-red-100">Police have been notified with your live location</p>
          </div>

          {sosData && (
            <div className="bg-white rounded-xl p-6 shadow-lg border mb-6 text-left">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-5 w-5 text-blue-600" />
                <span className="font-semibold">Nearest Police Station</span>
              </div>
              <p className="text-lg font-bold text-gray-900">{sosData.nearest_station || 'Locating...'}</p>
              {sosData.station_distance_km && (
                <p className="text-gray-500">{sosData.station_distance_km} km away</p>
              )}

              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-800">
                  ✅ Your location is being shared every 5 seconds. Help is on the way.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <a
              href="tel:112"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg"
            >
              <Phone className="h-5 w-5" /> Call 112 NOW
            </a>
            <button
              onClick={cancelSOS}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel SOS (I&apos;m safe)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
