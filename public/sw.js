/**
 * Novo Service Worker — offline-first PWA support
 * Strategies:
 *   - /api/runtime/submit*  → network-with-queue (IndexedDB offline queue)
 *   - /api/*                → network-first
 *   - everything else       → cache-first
 */

const CACHE_NAME = 'novo-v1';
const OFFLINE_URLS = ['/', '/offline'];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  // Only handle GET + POST over http(s)
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/runtime/submit')) {
    event.respondWith(networkWithQueue(event.request));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
  } else {
    event.respondWith(cacheFirst(event.request));
  }
});

// ─── Background sync ──────────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-submissions') {
    event.waitUntil(flushOfflineQueue());
  }
});

// ─── Strategy: network-first ──────────────────────────────────────────────────

async function networkFirst(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ─── Strategy: cache-first ────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // For navigation requests, return the offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline');
      if (offlinePage) return offlinePage;
    }
    return new Response('Offline', { status: 503 });
  }
}

// ─── Strategy: network-with-queue ─────────────────────────────────────────────

async function networkWithQueue(request) {
  try {
    return await fetch(request.clone());
  } catch {
    // Queue the request for later retry
    await enqueueRequest(request);
    return new Response(
      JSON.stringify({ queued: true, message: 'Request queued for offline sync' }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ─── IndexedDB offline queue (SW side) ────────────────────────────────────────

const DB_NAME = 'novo-offline';
const DB_VERSION = 1;
const STORE_NAME = 'submissions';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueRequest(request) {
  const body = await request.clone().text();
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url: request.url,
    method: request.method,
    body,
    headers,
    queuedAt: Date.now(),
    retries: 0,
  };

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getAllQueued() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueued(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function flushOfflineQueue() {
  const items = await getAllQueued();
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
        await removeQueued(item.id);
        succeeded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  // Notify clients of sync result
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({
      type: 'NOVO_SYNC_COMPLETE',
      succeeded,
      failed,
      remaining: failed,
    });
  }
}
