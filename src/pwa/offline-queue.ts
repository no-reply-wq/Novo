/**
 * Client-side IndexedDB offline queue — re-exported from lib/offline/queue
 * for the src/pwa module boundary.
 */
export {
  queueSubmission,
  getQueue,
  removeFromQueue,
  flushQueue,
} from '@/lib/offline/queue';

export type { OfflineSubmission } from '@/lib/offline/queue';
