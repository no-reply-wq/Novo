/**
 * Type definitions for the Novo service worker.
 *
 * The actual service worker implementation lives at public/sw.js
 * (plain JS, not bundled by Next.js — service workers require a specific scope
 * and cannot go through the standard webpack/turbopack pipeline).
 *
 * This file documents the message protocol between the SW and the app.
 */

/** Message sent by the service worker to all clients after a background sync. */
export interface SwSyncCompleteMessage {
  type: 'NOVO_SYNC_COMPLETE';
  succeeded: number;
  failed: number;
  remaining: number;
}

/** Union of all SW → client messages. */
export type SwMessage = SwSyncCompleteMessage;

/** Tags used with the Background Sync API. */
export const SW_SYNC_TAG = 'offline-submissions' as const;

/** Cache name used in the service worker. */
export const SW_CACHE_NAME = 'novo-v1' as const;

/** IndexedDB database name used by the offline queue. */
export const SW_DB_NAME = 'novo-offline' as const;
