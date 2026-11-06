/**
 * Offline submission queue — client-side IndexedDB wrapper.
 * This module runs in the browser only.
 */

export interface OfflineSubmission {
  id: string;
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  queuedAt: number;
  retries: number;
}

const DB_NAME = 'novo-offline';
const DB_VERSION = 1;
const STORE_NAME = 'submissions';

function openDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueSubmission(request: Request): Promise<void> {
  const body = await request.clone().text();

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // Duplicate prevention: same URL + body within 1 second
  const existing = await getQueue();
  const now = Date.now();
  const isDuplicate = existing.some(
    (item) =>
      item.url === request.url &&
      item.body === body &&
      now - item.queuedAt < 1000
  );
  if (isDuplicate) return;

  const submission: OfflineSubmission = {
    id: `${now}-${Math.random().toString(36).slice(2)}`,
    url: request.url,
    method: request.method,
    body,
    headers,
    queuedAt: now,
    retries: 0,
  };

  const db = await openDb();
  await idbRequest(txStore(db, 'readwrite').put(submission));
}

export async function getQueue(): Promise<OfflineSubmission[]> {
  const db = await openDb();
  return idbRequest<OfflineSubmission[]>(
    txStore(db, 'readonly').getAll() as IDBRequest<OfflineSubmission[]>
  );
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDb();
  await idbRequest(txStore(db, 'readwrite').delete(id));
}

export async function flushQueue(): Promise<{ succeeded: number; failed: number }> {
  const items = await getQueue();
  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.method !== 'GET' && item.method !== 'HEAD' ? item.body : undefined,
      });

      if (response.ok || response.status < 500) {
        await removeFromQueue(item.id);
        succeeded++;
      } else {
        // 4xx — won't succeed on retry, remove it
        if (response.status >= 400 && response.status < 500) {
          await removeFromQueue(item.id);
        }
        failed++;
      }
    } catch {
      // Network error — leave in queue for next flush
      failed++;
    }
  }

  return { succeeded, failed };
}
