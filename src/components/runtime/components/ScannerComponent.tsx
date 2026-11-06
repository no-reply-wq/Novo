'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface ScannerProps {
  onScan: (code: string, format: string) => void;
  continuous?: boolean;
  formats?: string[];
  placeholder?: string;
}

/** Returns true if BarcodeDetector is available in this browser. Exported for testing. */
export function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

// BarcodeDetector type declaration (not in standard lib.dom.d.ts yet)
interface BarcodeDetectorResult {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats: string[] }): {
    detect(source: HTMLVideoElement | ImageBitmap | HTMLCanvasElement): Promise<BarcodeDetectorResult[]>;
  };
  getSupportedFormats(): Promise<string[]>;
}

declare const BarcodeDetector: BarcodeDetectorConstructor;

export function ScannerComponent({
  onScan,
  continuous = false,
  formats = ['qr_code', 'code_128', 'ean_13'],
  placeholder = 'Enter barcode manually',
}: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [supported] = useState(isBarcodeDetectorSupported);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState('');

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!supported) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      setScanned(false);

      const detector = new BarcodeDetector({ formats });

      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(() => { void tick(); });
          return;
        }
        try {
          const results = await detector.detect(videoRef.current);
          if (results.length > 0) {
            const { rawValue, format } = results[0];
            onScan(rawValue, format);
            setScanned(true);
            if (!continuous) {
              stopCamera();
            } else {
              // Brief pause before next scan
              await new Promise<void>((resolve) => setTimeout(resolve, 1500));
              setScanned(false);
              rafRef.current = requestAnimationFrame(() => { void tick(); });
            }
            return;
          }
        } catch {
          // Detection error — keep scanning
        }
        rafRef.current = requestAnimationFrame(() => { void tick(); });
      };

      rafRef.current = requestAnimationFrame(() => { void tick(); });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera access denied');
      setScanning(false);
    }
  }, [supported, formats, continuous, onScan, stopCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  if (!supported) {
    // Fallback: manual text input
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Barcode scanner not supported in this browser. Enter code manually:
        </p>
        <form
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (manualValue.trim()) {
              onScan(manualValue.trim(), 'manual');
              setManualValue('');
            }
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={manualValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManualValue(e.target.value)}
            placeholder={placeholder}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-sm font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Scan
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Camera preview */}
      <div
        className={`relative bg-black aspect-video ${scanned ? 'ring-4 ring-green-400 ring-inset' : ''}`}
        style={{ maxHeight: 300 }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
        />
        {!scanning && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <button
              onClick={() => { void startCamera(); }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              Start Scanner
            </button>
          </div>
        )}
        {scanning && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-green-400 animate-pulse" />
        )}
        {scanned && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-green-500 text-white text-sm font-bold px-4 py-2 rounded-lg">
              ✓ Scanned!
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-3 flex items-center justify-between gap-2">
        {error && <p className="text-xs text-red-500 flex-1">{error}</p>}
        {scanning ? (
          <button
            onClick={stopCamera}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => { void startCamera(); }}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            {scanned ? 'Scan Again' : 'Start'}
          </button>
        )}

        {/* Manual entry alongside */}
        <form
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (manualValue.trim()) {
              onScan(manualValue.trim(), 'manual');
              setManualValue('');
            }
          }}
          className="flex gap-1 flex-1"
        >
          <input
            type="text"
            value={manualValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManualValue(e.target.value)}
            placeholder={placeholder}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none"
          />
          <button
            type="submit"
            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
