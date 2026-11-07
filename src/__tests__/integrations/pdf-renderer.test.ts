/**
 * PDF renderer tests — mocks fetch (Gotenberg) and playwright.
 * No real browser or Gotenberg needed.
 */

// Mock playwright before any imports
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent: jest.fn().mockResolvedValue(undefined),
        pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock-playwright')),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHtmlToPdf } from '../../platform/integrations/pdf-renderer';

describe('renderHtmlToPdf', () => {
  const html = '<html><body><h1>Test Invoice</h1></body></html>';

  describe('with Gotenberg', () => {
    beforeEach(() => {
      process.env['GOTENBERG_URL'] = 'http://gotenberg:3000';
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('%PDF-1.4 gotenberg').buffer),
      });
    });

    afterEach(() => {
      delete process.env['GOTENBERG_URL'];
      jest.clearAllMocks();
    });

    it('POSTs to Gotenberg chromium convert endpoint', async () => {
      await renderHtmlToPdf(html);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://gotenberg:3000/forms/chromium/convert/html',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns a Buffer', async () => {
      const result = await renderHtmlToPdf(html);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('throws on Gotenberg error response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('err') });
      await expect(renderHtmlToPdf(html)).rejects.toThrow('Gotenberg error');
    });

    it('passes margin options to Gotenberg form', async () => {
      await renderHtmlToPdf(html, {
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
      const formData = (mockFetch.mock.calls[0][1] as RequestInit).body as FormData;
      expect(formData.get('marginTop')).toBe('20mm');
    });
  });

  describe('with Playwright fallback (no GOTENBERG_URL)', () => {
    beforeEach(() => {
      delete process.env['GOTENBERG_URL'];
      jest.clearAllMocks();
    });

    it('returns a PDF buffer via Playwright', async () => {
      const result = await renderHtmlToPdf(html);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('does not call fetch when Gotenberg is not configured', async () => {
      await renderHtmlToPdf(html);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
