/**
 * iframe-protocol.test.ts
 * Tests for the postMessage protocol between host page and sandboxed iframe.
 */

import type { PropsMessage, EventMessage, ComponentMessage } from '../types';

// ─── PropsMessage serialization ────────────────────────────────────────────────

describe('PropsMessage serialization', () => {
  it('serializes correctly with novo:props type', () => {
    const msg: PropsMessage = {
      type: 'novo:props',
      payload: { name: 'Alice', count: 42, active: true },
    };

    const serialized = JSON.stringify(msg);
    const parsed = JSON.parse(serialized) as PropsMessage;

    expect(parsed.type).toBe('novo:props');
    expect(parsed.payload).toEqual({ name: 'Alice', count: 42, active: true });
  });

  it('handles empty payload', () => {
    const msg: PropsMessage = { type: 'novo:props', payload: {} };
    const parsed = JSON.parse(JSON.stringify(msg)) as PropsMessage;
    expect(parsed.payload).toEqual({});
  });

  it('handles nested object payload', () => {
    const msg: PropsMessage = {
      type: 'novo:props',
      payload: { user: { id: '1', roles: ['admin'] } },
    };
    const parsed = JSON.parse(JSON.stringify(msg)) as PropsMessage;
    expect(parsed.payload).toEqual({ user: { id: '1', roles: ['admin'] } });
  });
});

// ─── EventMessage serialization ────────────────────────────────────────────────

describe('EventMessage serialization', () => {
  it('serializes correctly with novo:event type', () => {
    const msg: EventMessage = {
      type: 'novo:event',
      payload: { eventName: 'onSelect', data: { id: 42 } },
    };

    const serialized = JSON.stringify(msg);
    const parsed = JSON.parse(serialized) as EventMessage;

    expect(parsed.type).toBe('novo:event');
    expect(parsed.payload.eventName).toBe('onSelect');
    expect(parsed.payload.data).toEqual({ id: 42 });
  });

  it('round-trips with null data', () => {
    const msg: EventMessage = {
      type: 'novo:event',
      payload: { eventName: 'onReset', data: null },
    };
    const parsed = JSON.parse(JSON.stringify(msg)) as EventMessage;
    expect(parsed.payload.data).toBeNull();
  });
});

// ─── Origin validation ─────────────────────────────────────────────────────────

describe('Origin validation', () => {
  /**
   * Simulates the host-side message handler that validates origin.
   * In production the iframe's contentWindow is compared to event.source.
   */
  function validateOrigin(
    messageSource: Window | null,
    iframeWindow: Window | null,
  ): boolean {
    if (messageSource === null || iframeWindow === null) return false;
    return messageSource === iframeWindow;
  }

  it('accepts messages from the expected iframe window', () => {
    const fakeWindow = {} as Window;
    expect(validateOrigin(fakeWindow, fakeWindow)).toBe(true);
  });

  it('rejects messages from a different window (cross-origin)', () => {
    const iframeWindow = {} as Window;
    const attackerWindow = {} as Window;
    expect(validateOrigin(attackerWindow, iframeWindow)).toBe(false);
  });

  it('rejects null source', () => {
    const iframeWindow = {} as Window;
    expect(validateOrigin(null, iframeWindow)).toBe(false);
  });

  it('rejects null iframe reference (unmounted)', () => {
    const msgSource = {} as Window;
    expect(validateOrigin(msgSource, null)).toBe(false);
  });
});

// ─── Resize message ────────────────────────────────────────────────────────────

describe('Resize message', () => {
  it('resize message carries the novo:resize type and numeric payload', () => {
    const msg: ComponentMessage = { type: 'novo:resize', payload: 350 };
    const parsed = JSON.parse(JSON.stringify(msg)) as ComponentMessage;
    expect(parsed.type).toBe('novo:resize');
    expect(parsed.payload).toBe(350);
  });

  /**
   * Simulates the height state update that the host performs when
   * it receives a valid resize message.
   */
  function handleResizeMessage(msg: ComponentMessage, currentHeight: number): number {
    if (msg.type !== 'novo:resize') return currentHeight;
    if (typeof msg.payload !== 'number' || msg.payload <= 0) return currentHeight;
    return msg.payload;
  }

  it('updates iframe height on valid resize message', () => {
    const msg: ComponentMessage = { type: 'novo:resize', payload: 500 };
    expect(handleResizeMessage(msg, 200)).toBe(500);
  });

  it('ignores resize with zero payload', () => {
    const msg: ComponentMessage = { type: 'novo:resize', payload: 0 };
    expect(handleResizeMessage(msg, 200)).toBe(200);
  });

  it('ignores resize with negative payload', () => {
    const msg: ComponentMessage = { type: 'novo:resize', payload: -100 };
    expect(handleResizeMessage(msg, 200)).toBe(200);
  });

  it('ignores non-resize message types', () => {
    const msg: ComponentMessage = { type: 'novo:props', payload: {} };
    expect(handleResizeMessage(msg, 200)).toBe(200);
  });
});

// ─── ComponentMessage type guard ───────────────────────────────────────────────

describe('ComponentMessage type guard', () => {
  const VALID_TYPES = new Set(['novo:props', 'novo:event', 'novo:ready', 'novo:resize']);

  function isComponentMessage(val: unknown): val is ComponentMessage {
    if (!val || typeof val !== 'object') return false;
    const obj = val as Record<string, unknown>;
    return typeof obj['type'] === 'string' && VALID_TYPES.has(obj['type']);
  }

  it('accepts valid ComponentMessage objects', () => {
    expect(isComponentMessage({ type: 'novo:props', payload: {} })).toBe(true);
    expect(isComponentMessage({ type: 'novo:event', payload: {} })).toBe(true);
    expect(isComponentMessage({ type: 'novo:ready', payload: null })).toBe(true);
    expect(isComponentMessage({ type: 'novo:resize', payload: 100 })).toBe(true);
  });

  it('rejects unknown types', () => {
    expect(isComponentMessage({ type: 'NOVO_PROPS', payload: {} })).toBe(false);
    expect(isComponentMessage({ type: 'unknown', payload: {} })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isComponentMessage(null)).toBe(false);
    expect(isComponentMessage('string')).toBe(false);
    expect(isComponentMessage(42)).toBe(false);
  });

  it('rejects objects missing type field', () => {
    expect(isComponentMessage({ payload: {} })).toBe(false);
  });
});
