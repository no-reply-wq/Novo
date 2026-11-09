'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getQueue } from '@/lib/offline/queue';

type SyncState = 'idle' | 'syncing' | 'synced';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>('idle');

  const refreshCount = useCallback(async () => {
    try {
      const q = await getQueue();
      setQueueCount(q.length);
    } catch {
      setQueueCount(0);
    }
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    void refreshCount();

    const handleOnline = () => {
      setIsOnline(true);
      setSyncState('syncing');
      void refreshCount().then(() => {
        setTimeout(() => setSyncState('synced'), 1500);
        setTimeout(() => setSyncState('idle'), 4000);
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncState('idle');
      void refreshCount();
    };
    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'NOVO_SYNC_COMPLETE') {
        void refreshCount();
        setSyncState(e.data.remaining === 0 ? 'synced' : 'idle');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', handleSwMessage);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
    };
  }, [refreshCount]);

  // Show nothing when online and idle with nothing queued
  if (isOnline && syncState === 'idle' && queueCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all ${
        !isOnline
          ? 'bg-amber-50 border border-amber-300 text-amber-800'
          : syncState === 'syncing'
          ? 'bg-blue-50 border border-blue-300 text-blue-800'
          : 'bg-green-50 border border-green-300 text-green-800'
      }`}
    >
      {!isOnline ? (
        <>
          <AlertTriangle className="w-4 h-4 text-yellow-500" aria-hidden="true" />
          <span>
            You are offline — changes will sync when reconnected.
            {queueCount > 0 && <span className="font-semibold"> ({queueCount} pending)</span>}
          </span>
        </>
      ) : syncState === 'syncing' ? (
        <>
          <span
            className="inline-block w-4 h-4 border-2 border-blue-300 border-t-blue-700 rounded-full animate-spin"
            aria-hidden="true"
          />
          <span>Syncing {queueCount > 0 ? `${queueCount} ` : ''}queued changes…</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="w-4 h-4 text-green-500" aria-hidden="true" />
          <span>Synced</span>
        </>
      )}
    </div>
  );
}
