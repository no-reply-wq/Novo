/**
 * @jest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { queueSubmission, getQueue, removeFromQueue, flushQueue } from '@/lib/offline/queue';

function makeRequest(url: string, body: string): Request {
  return new Request(url, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Offline queue (IndexedDB)', () => {
  it('enqueues a submission and returns it in getQueue', async () => {
    await queueSubmission(makeRequest('https://example.com/api/runtime/submit', '{"test":1}'));
    const queue = await getQueue();
    expect(queue.length).toBeGreaterThan(0);
    const item = queue.find((q) => q.url.includes('/api/runtime/submit'));
    expect(item).toBeDefined();
    expect(item?.method).toBe('POST');
  });

  it('removes a specific item by id', async () => {
    await queueSubmission(makeRequest('https://example.com/api/runtime/submit', '{"del":true}'));
    const before = await getQueue();
    const toDelete = before[before.length - 1];
    await removeFromQueue(toDelete.id);
    const after = await getQueue();
    expect(after.find((q) => q.id === toDelete.id)).toBeUndefined();
  });

  it('prevents duplicate submissions within 1 second', async () => {
    const before = await getQueue();
    const req1 = makeRequest('https://example.com/api/runtime/submit', '{"dup":true}');
    const req2 = makeRequest('https://example.com/api/runtime/submit', '{"dup":true}');
    await queueSubmission(req1);
    await queueSubmission(req2); // should be deduplicated
    const after = await getQueue();
    // Should have added exactly one, not two
    const added = after.length - before.length;
    expect(added).toBe(1);
  });

  it('flushQueue removes items that succeed', async () => {
    // Mock fetch to return 200
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as Response);

    await queueSubmission(makeRequest('https://example.com/api/runtime/submit', '{"flush":true}'));
    const before = await getQueue();
    expect(before.length).toBeGreaterThan(0);

    const result = await flushQueue();
    expect(result.succeeded).toBeGreaterThan(0);

    const after = await getQueue();
    expect(after.length).toBe(0);
  });

  it('flushQueue leaves items in queue when network fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await queueSubmission(makeRequest('https://example.com/api/runtime/submit', '{"netfail":true}'));
    const before = await getQueue();

    const result = await flushQueue();
    expect(result.failed).toBeGreaterThan(0);

    const after = await getQueue();
    expect(after.length).toBe(before.length); // unchanged
  });
});
