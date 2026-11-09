'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getQueue } from '@/lib/offline/queue';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);

  const refreshQueueCount = useCallback(async () => {
    try {
      const queue = await getQueue();
      setQueueCount(queue.length);
    } catch {
      setQueueCount(0);
    }
  }, []);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);
    if (!navigator.onLine) {
      void refreshQueueCount();
    }

    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
      void refreshQueueCount();
    }

    function handleSyncComplete(event: MessageEvent) {
      if (event.data?.type === 'NOVO_SYNC_COMPLETE') {
        void refreshQueueCount();
      }
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', handleSyncComplete);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', handleSyncComplete);
    };
  }, [refreshQueueCount]);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-2 rounded-lg shadow-lg text-sm"
    >
      <AlertTriangle className="w-4 h-4 text-yellow-500" aria-hidden="true" />
      <span>
        You&apos;re offline. Form submissions will sync when you reconnect.
        {queueCount > 0 && (
          <span className="font-medium"> ({queueCount} queued)</span>
        )}
      </span>
    </div>
  );
}
