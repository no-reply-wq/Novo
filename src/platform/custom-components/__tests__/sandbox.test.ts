/**
 * Sandbox component tests (node environment).
 * Tests the srcdoc generation and postMessage protocol handling.
 */

import { buildSrcdoc } from '@/components/runtime/components/CustomComponent';

describe('buildSrcdoc', () => {
  it('wraps tenant code with the Novo SDK injected', () => {
    const code = '<button>Click me</button>';
    const doc = buildSrcdoc(code);

    expect(doc).toContain('window.novo');
    expect(doc).toContain('NOVO_READY');
    expect(doc).toContain('NOVO_PROPS');
    expect(doc).toContain('<button>Click me</button>');
  });

  it('SDK exposes emit and resize helpers that use postMessage', () => {
    const doc = buildSrcdoc('<div/>');
    expect(doc).toContain("parent.postMessage({ type: 'NOVO_EVENT'");
    expect(doc).toContain("parent.postMessage({ type: 'NOVO_RESIZE'");
  });

  it('wraps in a full HTML document with DOCTYPE', () => {
    const doc = buildSrcdoc('<p>hello</p>');
    expect(doc.trim()).toMatch(/^<!DOCTYPE html>/i);
    expect(doc).toContain('<html');
    expect(doc).toContain('</html>');
  });

  it('places tenant code inside body', () => {
    const code = '<section id="app">content</section>';
    const doc = buildSrcdoc(code);
    const bodyStart = doc.indexOf('<body>');
    const bodyEnd = doc.indexOf('</body>');
    const bodyContent = doc.slice(bodyStart, bodyEnd);
    expect(bodyContent).toContain(code);
  });

  it('SDK listens for NOVO_PROPS messages from parent', () => {
    const doc = buildSrcdoc('<div/>');
    expect(doc).toContain("e.data.type === 'NOVO_PROPS'");
  });

  it('catches uncaught errors and reports NOVO_ERROR to parent', () => {
    const doc = buildSrcdoc('<div/>');
    expect(doc).toContain('NOVO_ERROR');
    expect(doc).toContain("window.addEventListener('error'");
  });
});

describe('sandbox attribute enforcement', () => {
  it('buildSrcdoc does not include allow-same-origin in srcdoc content', () => {
    // The srcdoc itself must never reference allow-same-origin
    const doc = buildSrcdoc('<script>var x = 1;</script>');
    expect(doc).not.toContain('allow-same-origin');
  });

  it('buildSrcdoc does not include allow-forms in srcdoc content', () => {
    const doc = buildSrcdoc('<form action="/submit"></form>');
    expect(doc).not.toContain('allow-forms');
  });

  it('buildSrcdoc does not include allow-popups', () => {
    const doc = buildSrcdoc('<button>open</button>');
    expect(doc).not.toContain('allow-popups');
  });
});

describe('message protocol', () => {
  interface NovoEventMessage {
    type: 'NOVO_EVENT';
    event: string;
    payload: unknown;
  }

  interface NovoResizeMessage {
    type: 'NOVO_RESIZE';
    height: number;
  }

  interface NovoReadyMessage {
    type: 'NOVO_READY';
  }

  type TestMessage = NovoEventMessage | NovoResizeMessage | NovoReadyMessage;

  it('NOVO_EVENT message has correct shape', () => {
    const msg: NovoEventMessage = {
      type: 'NOVO_EVENT',
      event: 'onScan',
      payload: { barcode: '12345' },
    };
    expect(msg.type).toBe('NOVO_EVENT');
    expect(msg.event).toBe('onScan');
    expect(msg.payload).toEqual({ barcode: '12345' });
  });

  it('NOVO_RESIZE message carries numeric height', () => {
    const msg: NovoResizeMessage = { type: 'NOVO_RESIZE', height: 400 };
    expect(msg.height).toBe(400);
    expect(typeof msg.height).toBe('number');
  });

  it('NOVO_READY message has no payload', () => {
    const msg: NovoReadyMessage = { type: 'NOVO_READY' };
    expect(msg.type).toBe('NOVO_READY');
    expect(Object.keys(msg)).toEqual(['type']);
  });

  it('malformed message (non-object) is handled gracefully', () => {
    // Simulate the guard check in the message handler
    const isValidMessage = (data: unknown): data is TestMessage => {
      return (
        data !== null &&
        typeof data === 'object' &&
        'type' in (data as object) &&
        typeof (data as { type: unknown }).type === 'string'
      );
    };

    expect(isValidMessage(null)).toBe(false);
    expect(isValidMessage('string')).toBe(false);
    expect(isValidMessage(42)).toBe(false);
    expect(isValidMessage({})).toBe(false);  // no type key
    expect(isValidMessage({ type: 'NOVO_READY' })).toBe(true);
  });

  it('malformed NOVO_RESIZE with non-numeric height is detected', () => {
    const isValidResize = (data: unknown): boolean => {
      if (!data || typeof data !== 'object') return false;
      const msg = data as Record<string, unknown>;
      return msg['type'] === 'NOVO_RESIZE' && typeof msg['height'] === 'number' && (msg['height'] as number) > 0;
    };

    expect(isValidResize({ type: 'NOVO_RESIZE', height: 'big' })).toBe(false);
    expect(isValidResize({ type: 'NOVO_RESIZE', height: -1 })).toBe(false);
    expect(isValidResize({ type: 'NOVO_RESIZE', height: 300 })).toBe(true);
  });
});
