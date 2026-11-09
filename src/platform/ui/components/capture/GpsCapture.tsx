'use client';

import React, { useState } from 'react';

export interface GpsCoords {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface GpsCaptureProps {
  onCapture: (coords: GpsCoords) => void;
  onError?: (err: GeolocationPositionError) => void;
  showMap?: boolean;
}

export function GpsCapture({ onCapture, onError, showMap = true }: GpsCaptureProps) {
  const [coords, setCoords] = useState<GpsCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const result: GpsCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        setCoords(result);
        setLoading(false);
        onCapture(result);
      },
      (err) => {
        setLoading(false);
        setError(geolocationErrorMessage(err));
        onError?.(err);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const mapUrl = coords
    ? `https://staticmap.openstreetmap.de/staticmap.php?center=${coords.lat},${coords.lng}&zoom=15&size=400x200&markers=${coords.lat},${coords.lng},red`
    : null;

  return (
    <div className="flex flex-col gap-3 w-full max-w-sm">
      {error && (
        <div className="rounded bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>
      )}

      <button
        onClick={captureLocation}
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 text-white py-3 px-4 font-medium flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-60 active:scale-95 transition-all"
      >
        {loading ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
            Acquiring location…
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {coords ? 'Recapture Location' : 'Capture Location'}
          </>
        )}
      </button>

      {coords && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Latitude</span>
            <span className="font-mono">{coords.lat.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Longitude</span>
            <span className="font-mono">{coords.lng.toFixed(6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Accuracy</span>
            <span className="font-mono">±{Math.round(coords.accuracy)} m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Captured</span>
            <span className="font-mono">{new Date(coords.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {showMap && mapUrl && (
        <div className="rounded-lg overflow-hidden border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mapUrl}
            alt={`Map showing location at ${coords?.lat.toFixed(4)}, ${coords?.lng.toFixed(4)}`}
            className="w-full"
            width={400}
            height={200}
          />
          <p className="text-xs text-gray-400 text-center py-1">
            © <a href="https://www.openstreetmap.org/copyright" className="underline" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors
          </p>
        </div>
      )}
    </div>
  );
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Location access denied. Please allow location access and try again.';
    case err.POSITION_UNAVAILABLE:
      return 'Location information is unavailable.';
    case err.TIMEOUT:
      return 'Location request timed out. Please try again.';
    default:
      return 'An unknown error occurred while getting location.';
  }
}
