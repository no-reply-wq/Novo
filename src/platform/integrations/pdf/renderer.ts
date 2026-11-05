/**
 * PDF renderer — converts DocTemplateDef + record data to a PDF buffer.
 *
 * Strategy (in order):
 *   1. Gotenberg HTTP API (if GOTENBERG_URL env var is set)
 *   2. Playwright page.pdf() as fallback
 *
 * Handlebars templates are rendered per section.
 * Expressions (hideWhen) are evaluated via an injected ExprEngine.
 */

import { Handlebars } from './handlebars'; // registers custom helpers as side-effect
import type { DocTemplateDef, DocTemplateSection } from '@/platform/contracts';
import type { ExprEngine, ExprContext } from '@/platform/expr';

export interface RenderDocTemplateParams {
  template: DocTemplateDef;
  record: Record<string, unknown>;
  relations?: Record<string, Record<string, unknown>[]>;
  exprEngine?: ExprEngine;  // optional — if absent, hideWhen is skipped
}

export async function renderDocTemplate(params: RenderDocTemplateParams): Promise<Buffer> {
  const html = buildHtml(params);

  // 1. Try Gotenberg
  const gotenbergUrl = process.env.GOTENBERG_URL;
  if (gotenbergUrl) {
    return renderViaGotenberg(html, params.template, gotenbergUrl);
  }

  // 2. Fall back to Playwright
  return renderViaPlaywright(html, params.template);
}

// ─── HTML builder ──────────────────────────────────────────────────────────────

function buildHtml(params: RenderDocTemplateParams): string {
  const { template, record, relations, exprEngine } = params;

  // Sort sections by rank
  const sorted = [...template.sections].sort((a, b) => a.rank - b.rank);

  const ctx: ExprContext = {
    record: record as Record<string, import('@/platform/expr').ExprValue>,
    relations: relations as Record<string, Record<string, import('@/platform/expr').ExprValue>[]> | undefined,
  };

  const bodyParts: string[] = [];

  for (const section of sorted) {
    // Evaluate hideWhen expression
    if (section.hideWhen && exprEngine) {
      try {
        const hide = exprEngine.evaluateSource(section.hideWhen, ctx);
        if (hide === true) continue;
      } catch {
        // On eval error, don't hide the section
      }
    }

    // Handle repeatFor
    if (section.repeatFor && relations) {
      const rows = relations[section.repeatFor] ?? [];
      for (const row of rows) {
        // Spread row fields directly into context so templates use {{fieldName}} not {{_row.fieldName}}
        const rowCtx = { ...record, ...row, _row: row };
        bodyParts.push(renderSection(section, rowCtx));
      }
    } else {
      bodyParts.push(renderSection(section, record));
    }
  }

  const pageSetup = template.pageSetup;
  const marginTop = pageSetup?.marginTopMm ?? 15;
  const marginBottom = pageSetup?.marginBottomMm ?? 15;
  const marginLeft = pageSetup?.marginLeftMm ?? 15;
  const marginRight = pageSetup?.marginRightMm ?? 15;
  const pageSize = pageSetup?.size ?? 'A4';
  const orientation = pageSetup?.orientation ?? 'portrait';

  const watermarkStyle =
    template.watermarkText
      ? `
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 80px;
      color: rgba(200, 0, 0, 0.15);
      z-index: 1000;
      white-space: nowrap;
      pointer-events: none;
    }`
      : '';

  const watermarkHtml = template.watermarkText
    ? `<div class="watermark">${escapeHtml(template.watermarkText)}</div>`
    : '';

  const pageNumberScript = template.pageNumbers
    ? `<script>
        document.querySelectorAll('.page-number').forEach(el => {
          el.textContent = window.location.hash || '';
        });
      </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
    font-family: Arial, sans-serif;
    font-size: 12pt;
    line-height: 1.4;
  }
  @page {
    size: ${pageSize} ${orientation};
    margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
  }
  ${watermarkStyle}
  .section { margin-bottom: 8pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
</style>
</head>
<body>
${watermarkHtml}
${bodyParts.join('\n')}
${pageNumberScript}
</body>
</html>`;
}

function renderSection(section: DocTemplateSection, data: Record<string, unknown>): string {
  const compiled = Handlebars.compile(section.content, { noEscape: false });
  const rendered = compiled(data);
  return `<div class="section section-${section.kind}" data-section-id="${escapeHtml(section.id)}">${rendered}</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Gotenberg backend ─────────────────────────────────────────────────────────

async function renderViaGotenberg(
  html: string,
  template: DocTemplateDef,
  gotenbergUrl: string
): Promise<Buffer> {
  const formData = new FormData();
  formData.append(
    'files',
    new Blob([html], { type: 'text/html' }),
    'index.html'
  );

  const pageSetup = template.pageSetup;
  const paperWidth = pageSetup?.size === 'Letter' ? '8.5in'
    : pageSetup?.size === 'A5' ? '14.8cm'
    : '21cm'; // A4 default
  const paperHeight = pageSetup?.size === 'Letter' ? '11in'
    : pageSetup?.size === 'A5' ? '21cm'
    : '29.7cm';
  const isLandscape = pageSetup?.orientation === 'landscape';

  const marginTop = ((pageSetup?.marginTopMm ?? 15) / 10).toFixed(1) + 'cm';
  const marginBottom = ((pageSetup?.marginBottomMm ?? 15) / 10).toFixed(1) + 'cm';
  const marginLeft = ((pageSetup?.marginLeftMm ?? 15) / 10).toFixed(1) + 'cm';
  const marginRight = ((pageSetup?.marginRightMm ?? 15) / 10).toFixed(1) + 'cm';

  // Gotenberg Chromium HTML route
  const url = `${gotenbergUrl.replace(/\/$/, '')}/forms/chromium/convert/html`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      // Gotenberg specific options via headers
      'Gotenberg-Output-Filename': 'output.pdf',
    },
    body: formData,
  });

  // Try with query params if headers didn't apply
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
  template: DocTemplateDef
): Promise<Buffer> {
  // Dynamic import to avoid loading Playwright unless needed
  const { chromium } = await import('playwright');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    const pageSetup = template.pageSetup;
    const format = pageSetup?.size === 'Letter' ? 'Letter'
      : pageSetup?.size === 'A5' ? 'A5'
      : 'A4';

    const pdfBuffer = await page.pdf({
      format: format as 'A4' | 'A5' | 'Letter',
      landscape: pageSetup?.orientation === 'landscape',
      margin: {
        top: `${pageSetup?.marginTopMm ?? 15}mm`,
        bottom: `${pageSetup?.marginBottomMm ?? 15}mm`,
        left: `${pageSetup?.marginLeftMm ?? 15}mm`,
        right: `${pageSetup?.marginRightMm ?? 15}mm`,
      },
      printBackground: true,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
