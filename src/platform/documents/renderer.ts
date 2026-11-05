/**
 * PDF renderer for Novo document templates.
 *
 * Uses Gotenberg (if GOTENBERG_URL is set) or Playwright as a fallback.
 * Template blocks are rendered to HTML first, then converted to PDF.
 */

import type {
  PdfTemplate,
  PdfBlock,
  TextBlock,
  TableBlock,
  ImageBlock,
  SignatureBlock,
  BarcodeBlock,
  SpacerBlock,
  HeaderFooterBlock,
  TableColumn,
} from './types.js';

// ─── Amount in Words ──────────────────────────────────────────────────────────

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
  'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

function threeDigitWords(n: number): string {
  if (n === 0) return '';
  const hundred = Math.floor(n / 100);
  const remainder = n % 100;
  const parts: string[] = [];
  if (hundred > 0) {
    parts.push(`${ONES[hundred]} Hundred`);
  }
  if (remainder < 20) {
    if (remainder > 0) parts.push(ONES[remainder]);
  } else {
    const ten = Math.floor(remainder / 10);
    const one = remainder % 10;
    parts.push(one > 0 ? `${TENS[ten]} ${ONES[one]}` : TENS[ten]);
  }
  return parts.join(' ');
}

/**
 * Converts a numeric amount to Indian-style words.
 * e.g. 12345.50 → "Twelve Thousand Three Hundred Forty Five Rupees and Fifty Paise Only"
 */
export function amountInWords(amount: number): string {
  if (!isFinite(amount) || amount < 0) {
    throw new RangeError(`amountInWords: invalid amount ${amount}`);
  }

  const rounded = Math.round(amount * 100) / 100;
  const rupees = Math.floor(rounded);
  const paiseRaw = Math.round((rounded - rupees) * 100);

  function convertRupees(n: number): string {
    if (n === 0) return 'Zero';
    const parts: string[] = [];

    const crore = Math.floor(n / 10_000_000);
    n %= 10_000_000;
    const lakh = Math.floor(n / 100_000);
    n %= 100_000;
    const thousand = Math.floor(n / 1_000);
    n %= 1_000;

    if (crore > 0) parts.push(`${threeDigitWords(crore)} Crore`);
    if (lakh > 0) parts.push(`${threeDigitWords(lakh)} Lakh`);
    if (thousand > 0) parts.push(`${threeDigitWords(thousand)} Thousand`);
    if (n > 0) parts.push(threeDigitWords(n));

    return parts.join(' ');
  }

  const rupeeWords = convertRupees(rupees);
  const suffix = paiseRaw > 0
    ? ` and ${threeDigitWords(paiseRaw)} Paise Only`
    : ' Only';

  return `${rupeeWords} Rupees${suffix}`;
}

// ─── Field binding ────────────────────────────────────────────────────────────

function bindFields(
  template: string,
  record: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, field: string) => {
    const value = record[field];
    return value !== undefined && value !== null ? String(value) : '';
  });
}

// ─── Page size helpers ────────────────────────────────────────────────────────

const PAGE_SIZES: Record<string, { width: string; height: string }> = {
  A4: { width: '210mm', height: '297mm' },
  Letter: { width: '8.5in', height: '11in' },
  A5: { width: '148mm', height: '210mm' },
};

// ─── Block renderers ──────────────────────────────────────────────────────────

function renderTextBlock(block: TextBlock, record: Record<string, unknown>): string {
  const { style, position } = block;
  const content = bindFields(block.content, record);
  const css = [
    `position:absolute`,
    `left:${position.x}px`,
    `top:${position.y}px`,
    `width:${position.width}px`,
    `height:${position.height}px`,
    style.fontSize ? `font-size:${style.fontSize}pt` : '',
    style.fontWeight ? `font-weight:${style.fontWeight}` : '',
    style.color ? `color:${style.color}` : '',
    style.textAlign ? `text-align:${style.textAlign}` : '',
    style.fontFamily ? `font-family:${style.fontFamily}` : '',
  ].filter(Boolean).join(';');
  return `<div style="${css}">${escapeHtml(content)}</div>`;
}

function renderTableBlock(
  block: TableBlock,
  childRecords: Record<string, Record<string, unknown>[]>,
): string {
  const rows = childRecords[block.relationField] ?? [];
  const { style, position } = block;

  const headerBg = style.headerBackground ?? '#f0f0f0';
  const headerColor = style.headerColor ?? '#000000';
  const borderColor = style.borderColor ?? '#cccccc';
  const fontSize = style.fontSize ?? 10;
  const altBg = style.alternateRowBackground ?? '#f9f9f9';

  const css = [
    `position:absolute`,
    `left:${position.x}px`,
    `top:${position.y}px`,
    `width:${position.width}px`,
    `font-size:${fontSize}pt`,
  ].join(';');

  const headerCells = block.columns
    .map(col => {
      const w = col.width ? `width:${col.width}px;` : '';
      return `<th style="background:${headerBg};color:${headerColor};border:1px solid ${borderColor};padding:4px 6px;${w}">${escapeHtml(col.label)}</th>`;
    })
    .join('');

  const dataRows = rows.map((row, idx) => {
    const bg = idx % 2 === 1 ? `background:${altBg};` : '';
    const cells = block.columns
      .map(col => {
        const value = row[col.field];
        const align = col.align ?? (col.type === 'number' || col.type === 'currency' ? 'right' : 'left');
        const formatted = formatCellValue(value, col);
        return `<td style="border:1px solid ${borderColor};padding:4px 6px;text-align:${align};${bg}">${escapeHtml(formatted)}</td>`;
      })
      .join('');
    return `<tr>${cells}</tr>`;
  });

  let totalsRow = '';
  if (block.showTotals) {
    const totalCells = block.columns.map((col, colIdx) => {
      if (colIdx === 0) {
        return `<td style="border:1px solid ${borderColor};padding:4px 6px;font-weight:bold;">Total</td>`;
      }
      if (col.type === 'number' || col.type === 'currency') {
        const sum = rows.reduce((acc, row) => {
          const v = Number(row[col.field]);
          return acc + (isFinite(v) ? v : 0);
        }, 0);
        const formatted = col.type === 'currency'
          ? `₹${sum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          : String(sum);
        return `<td style="border:1px solid ${borderColor};padding:4px 6px;text-align:right;font-weight:bold;">${escapeHtml(formatted)}</td>`;
      }
      return `<td style="border:1px solid ${borderColor};padding:4px 6px;"></td>`;
    }).join('');
    totalsRow = `<tr>${totalCells}</tr>`;
  }

  return `<div style="${css}">
<table style="border-collapse:collapse;width:100%;">
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${dataRows.join('')}${totalsRow}</tbody>
</table>
</div>`;
}

function renderImageBlock(block: ImageBlock): string {
  const { position } = block;
  const css = [
    `position:absolute`,
    `left:${position.x}px`,
    `top:${position.y}px`,
    `width:${position.width}px`,
    `height:${position.height}px`,
    `object-fit:contain`,
  ].join(';');
  return `<img src="${escapeAttr(block.src)}" alt="${escapeAttr(block.alt ?? '')}" style="${css}" />`;
}

function renderSignatureBlock(block: SignatureBlock): string {
  const { position } = block;
  const css = [
    `position:absolute`,
    `left:${position.x}px`,
    `top:${position.y}px`,
    `width:${position.width}px`,
    `height:${position.height}px`,
    `border-top:1px solid #000`,
    `padding-top:4px`,
    `font-size:9pt`,
    `color:#333`,
  ].join(';');
  return `<div style="${css}">${escapeHtml(block.label)}</div>`;
}

function renderBarcodeBlock(block: BarcodeBlock, record: Record<string, unknown>): string {
  // Render as a placeholder with the value bound from record fields
  const { position } = block;
  const value = bindFields(block.value, record);
  const css = [
    `position:absolute`,
    `left:${position.x}px`,
    `top:${position.y}px`,
    `width:${position.width}px`,
    `height:${position.height}px`,
    `display:flex`,
    `align-items:center`,
    `justify-content:center`,
    `border:1px solid #ccc`,
    `font-size:8pt`,
  ].join(';');
  return `<div style="${css}">[${escapeHtml(block.format)}: ${escapeHtml(value)}]</div>`;
}

function renderSpacerBlock(block: SpacerBlock): string {
  const { position } = block;
  return `<div style="position:absolute;left:${position.x}px;top:${position.y}px;width:${position.width}px;height:${position.height}px;"></div>`;
}

function renderHeaderFooterBlock(
  block: HeaderFooterBlock,
  record: Record<string, unknown>,
): string {
  const content = bindFields(block.content, record);
  const { style } = block;
  const css = [
    style.fontSize ? `font-size:${style.fontSize}pt` : 'font-size:9pt',
    style.fontWeight ? `font-weight:${style.fontWeight}` : '',
    style.color ? `color:${style.color}` : '',
    style.textAlign ? `text-align:${style.textAlign}` : '',
  ].filter(Boolean).join(';');
  return `<div style="${css}">${escapeHtml(content)}</div>`;
}

// ─── Cell value formatting ────────────────────────────────────────────────────

function formatCellValue(value: unknown, col: TableColumn): string {
  if (value === null || value === undefined) return '';
  if (col.type === 'currency') {
    const n = Number(value);
    if (!isFinite(n)) return String(value);
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }
  if (col.type === 'date' && (value instanceof Date || typeof value === 'string')) {
    const d = new Date(value as string);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-IN');
  }
  return String(value);
}

// ─── HTML escaping ────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

export function buildHtml(params: {
  template: PdfTemplate;
  record: Record<string, unknown>;
  childRecords: Record<string, Record<string, unknown>[]>;
}): string {
  const { template, record, childRecords } = params;
  const size = PAGE_SIZES[template.pageSize] ?? PAGE_SIZES['A4'];
  const isLandscape = template.orientation === 'landscape';
  const pageWidth = isLandscape ? size.height : size.width;
  const pageHeight = isLandscape ? size.width : size.height;

  const { top, right, bottom, left } = template.margins;

  const headerBlocks = template.blocks.filter(
    (b): b is HeaderFooterBlock => b.type === 'header-footer' && b.area === 'header',
  );
  const footerBlocks = template.blocks.filter(
    (b): b is HeaderFooterBlock => b.type === 'header-footer' && b.area === 'footer',
  );
  const bodyBlocks = template.blocks.filter(b => b.type !== 'header-footer');

  const headerHtml = headerBlocks.map(b => renderHeaderFooterBlock(b, record)).join('\n');
  const footerHtml = footerBlocks.map(b => renderHeaderFooterBlock(b, record)).join('\n');

  const bodyHtml = bodyBlocks.map((block: PdfBlock) => {
    switch (block.type) {
      case 'text': return renderTextBlock(block, record);
      case 'table': return renderTableBlock(block, childRecords);
      case 'image': return renderImageBlock(block);
      case 'signature': return renderSignatureBlock(block);
      case 'barcode': return renderBarcodeBlock(block, record);
      case 'spacer': return renderSpacerBlock(block);
      default: return '';
    }
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    @page {
      size: ${pageWidth} ${pageHeight};
      margin: ${top}mm ${right}mm ${bottom}mm ${left}mm;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 10pt; }
    .page { position: relative; width: ${pageWidth}; min-height: ${pageHeight}; }
    .header { border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
    .footer { border-top: 1px solid #ccc; padding-top: 4px; margin-top: 8px; position: fixed; bottom: ${bottom}mm; left: ${left}mm; right: ${right}mm; }
  </style>
</head>
<body>
  <div class="header">${headerHtml}</div>
  <div class="page">${bodyHtml}</div>
  <div class="footer">${footerHtml}</div>
</body>
</html>`;
}

// ─── PDF rendering ────────────────────────────────────────────────────────────

async function renderViaGotenberg(html: string, url: string): Promise<Buffer> {
  const formData = new FormData();
  formData.append('files', new Blob([html], { type: 'text/html' }), 'index.html');

  const res = await fetch(`${url}/forms/chromium/convert/html`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gotenberg error ${res.status}: ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function renderViaPlaywright(html: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require('playwright') as typeof import('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function renderPdf(params: {
  template: PdfTemplate;
  record: Record<string, unknown>;
  childRecords: Record<string, Record<string, unknown>[]>;
  tenantSlug: string;
}): Promise<Buffer> {
  const html = buildHtml(params);

  const gotenbergUrl = process.env.GOTENBERG_URL;
  if (gotenbergUrl) {
    return renderViaGotenberg(html, gotenbergUrl);
  }

  return renderViaPlaywright(html);
}
