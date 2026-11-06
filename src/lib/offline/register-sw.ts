/**
 * Service worker registration.
 * Call from a client component's useEffect.
 */

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js');

    // Request background sync permission if supported
    if ('sync' in reg) {
      await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register('offline-submissions');
    }
  } catch {
    // SW registration is best-effort; don't throw
  }
}
