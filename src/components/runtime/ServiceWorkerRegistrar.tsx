'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/offline/register-sw';

/**
 * Client component that registers the service worker on mount.
 * Include this in a server layout via a client boundary.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return null;
}
