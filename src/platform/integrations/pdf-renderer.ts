/**
 * Standalone HTML → PDF renderer.
 *
 * Strategy (tried in order):
 *   1. Gotenberg HTTP API if GOTENBERG_URL env is set
 *   2. Playwright headless Chromium fallback
 */

export interface PdfMargin {
  top: string;
  bottom: string;
  left: string;
  right: string;
}

export interface PdfRenderOptions {
  margin?: PdfMargin;
  format?: 'A4' | 'Letter';
}

/**
 * Render an HTML string to a PDF buffer.
 */
export async function renderHtmlToPdf(
  html: string,
  options?: PdfRenderOptions,
): Promise<Buffer> {
  const gotenbergUrl = process.env['GOTENBERG_URL'];
  if (gotenbergUrl) {
    return renderViaGotenberg(html, gotenbergUrl, options);
  }
  return renderViaPlaywright(html, options);
}

// ─── Gotenberg ────────────────────────────────────────────────────────────────

async function renderViaGotenberg(
  html: string,
  baseUrl: string,
  options?: PdfRenderOptions,
): Promise<Buffer> {
  const url = `${baseUrl.replace(/\/$/, '')}/forms/chromium/convert/html`;

  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');

  const margin = options?.margin;
  if (margin) {
    form.append('marginTop', margin.top);
    form.append('marginBottom', margin.bottom);
    form.append('marginLeft', margin.left);
    form.append('marginRight', margin.right);
  }
  if (options?.format) {
    form.append('paperWidth', options.format === 'Letter' ? '8.5in' : '8.27in');
    form.append('paperHeight', options.format === 'Letter' ? '11in' : '11.69in');
  }

  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Gotenberg error: ${response.status} ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Playwright fallback ───────────────────────────────────────────────────────

async function renderViaPlaywright(
  html: string,
  options?: PdfRenderOptions,
): Promise<Buffer> {
  // Dynamic import so playwright is not required in environments that use Gotenberg
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require('playwright') as typeof import('playwright');

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    const margin = options?.margin;
    const pdfBuffer = await page.pdf({
      format: options?.format ?? 'A4',
      margin: margin
        ? { top: margin.top, bottom: margin.bottom, left: margin.left, right: margin.right }
        : { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
      printBackground: true,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
