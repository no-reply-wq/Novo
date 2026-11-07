'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface BarcodeScannerProps {
  onScan: (value: string, format: string) => void;
  onError?: (err: Error) => void;
  formats?: string[];
  continuous?: boolean;
  facingMode?: 'user' | 'environment';
}

// BarcodeDetector type declaration (not in standard lib.dom.d.ts)
interface BarcodeDetectorResult {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats: string[] }): {
    detect(source: HTMLVideoElement | HTMLCanvasElement): Promise<BarcodeDetectorResult[]>;
  };
  getSupportedFormats(): Promise<string[]>;
}

declare const BarcodeDetector: BarcodeDetectorConstructor;

function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

export function BarcodeScanner({
  onScan,
  onError,
  formats = ['qr_code', 'code_128', 'ean_13'],
  continuous = false,
  facingMode = 'environment',
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<ReturnType<BarcodeDetectorConstructor['prototype']['detect']> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<{ value: string; format: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasFrontCamera, setHasFrontCamera] = useState(false);
  const [currentFacing, setCurrentFacing] = useState<'user' | 'environment'>(facingMode);
  const supported = isBarcodeDetectorSupported();

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    if (!supported) {
      setError('BarcodeDetector not supported in this browser.');
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacing },
      });
      streamRef.current = stream;

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoCams = devices.filter((d) => d.kind === 'videoinput');
      if (videoCams.length > 1) setHasFrontCamera(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new BarcodeDetector({ formats });

      setScanning(true);

      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        try {
          const results = await detector.detect(videoRef.current);
          if (results.length > 0) {
            const { rawValue, format } = results[0];
            setLastScan({ value: rawValue, format });
            if (navigator.vibrate) navigator.vibrate([100]);
            onScan(rawValue, format);
            if (!continuous) {
              stopCamera();
              return;
            }
          }
        } catch {
          // detection frame errors are non-fatal
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e.message);
      onError?.(e);
    }
  }, [supported, currentFacing, formats, continuous, onScan, onError, stopCamera]);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  const flipCamera = () => {
    stopCamera();
    setCurrentFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  };

  useEffect(() => {
    if (scanning) {
      stopCamera();
      void startScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFacing]);

  return (
    <div className="relative flex flex-col items-center gap-3 w-full max-w-sm mx-auto">
      {error && (
        <div className="w-full rounded bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Camera preview */}
      <div className="relative w-full aspect-square bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
          aria-label="Camera preview"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scan region overlay */}
        {scanning && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden="true"
          >
            <div className="w-3/5 h-3/5 border-2 border-green-400 rounded-lg shadow-lg" />
          </div>
        )}

        {!scanning && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="text-white text-sm">Camera off</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2 w-full">
        {!scanning ? (
          <button
            onClick={() => void startScan()}
            className="flex-1 rounded-lg bg-blue-600 text-white py-2 px-4 font-medium hover:bg-blue-700 active:scale-95 transition-all"
          >
            Start Scanning
          </button>
        ) : (
          <button
            onClick={stopCamera}
            className="flex-1 rounded-lg bg-gray-600 text-white py-2 px-4 font-medium hover:bg-gray-700 active:scale-95 transition-all"
          >
            Stop
          </button>
        )}

        {hasFrontCamera && (
          <button
            onClick={flipCamera}
            aria-label="Flip camera"
            className="rounded-lg bg-gray-100 border border-gray-300 py-2 px-3 hover:bg-gray-200 active:scale-95 transition-all"
          >
            🔄
          </button>
        )}
      </div>

      {/* Last scan result */}
      {lastScan && (
        <div className="w-full rounded-lg border border-green-200 bg-green-50 p-3 flex items-center gap-2">
          <span className="text-xs text-green-600 font-medium uppercase tracking-wide">{lastScan.format}</span>
          <span className="flex-1 font-mono text-sm truncate">{lastScan.value}</span>
          <button
            onClick={() => void navigator.clipboard.writeText(lastScan.value)}
            aria-label="Copy scanned value"
            className="text-green-700 hover:text-green-900 text-xs font-medium px-2 py-1 rounded bg-green-100 hover:bg-green-200"
          >
            Copy
          </button>
        </div>
      )}

      {!supported && (
        <p className="text-xs text-gray-500 text-center">
          Barcode scanning is not supported in this browser. Try Chrome on Android or Safari 17+.
        </p>
      )}
    </div>
  );
}
