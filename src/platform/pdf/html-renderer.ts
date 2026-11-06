import type { PDFTemplate, PDFBlock, LineItemsProps, TotalsProps, GSTINBlockProps } from './types';

export interface PDFRenderData {
  record: Record<string, unknown>;
  lines?: Record<string, unknown>[];
  tenant: {
    name: string;
    gstin?: string;
    address?: string;
    logo?: string;
    state?: string;
  };
}

/** Indian number formatting: 1234567.89 → ₹12,34,567.89 */
export function formatIndianCurrency(value: number): string {
  const fixed = value.toFixed(2);
  const [integer, decimal] = fixed.split('.');
  const intStr = integer ?? '0';
  if (intStr.length <= 3) return `₹${intStr}.${decimal}`;
  const lastThree = intStr.slice(-3);
  const remaining = intStr.slice(0, -3);
  const formatted = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${formatted},${lastThree}.${decimal}`;
}

/** Amount in words for Indian numbering */
export function amountInWords(amount: number): string {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
  ];

  function convertHundreds(n: number): string {
    if (n === 0) return '';
    if (n < 20) return (ones[n] ?? '') + ' ';
    if (n < 100) {
      const t = Math.floor(n / 10);
      const o = n % 10;
      return (tens[t] ?? '') + (o > 0 ? ' ' + (ones[o] ?? '') : '') + ' ';
    }
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return (ones[h] ?? '') + ' Hundred ' + convertHundreds(rem);
  }

  if (amount === 0) return 'Zero';

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let result = '';
  if (rupees >= 10000000) {
    result += convertHundreds(Math.floor(rupees / 10000000)) + 'Crore ';
  }
  if (rupees % 10000000 >= 100000) {
    result += convertHundreds(Math.floor((rupees % 10000000) / 100000)) + 'Lakh ';
  }
  if (rupees % 100000 >= 1000) {
    result += convertHundreds(Math.floor((rupees % 100000) / 1000)) + 'Thousand ';
  }
  result += convertHundreds(rupees % 1000);

  let words = result.trim();
  if (paise > 0) {
    words += ` and ${convertHundreds(paise).trim()} Paise`;
  }
  return words.trim() + ' Only';
}

/** Resolve a data binding like {{record.field}} or plain text */
function resolveBinding(
  template: string,
  record: Record<string, unknown>,
  lines?: Record<string, unknown>[],
  tenant?: { name: string; gstin?: string; address?: string; logo?: string; state?: string }
): string {
  if (typeof template !== 'string') return String(template ?? '');
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, expr: string) => {
    const path = expr.trim().split('.');
    const root = path[0];
    if (root === 'record' && path.length > 1) {
      const key = path.slice(1).join('.');
      return String(record[key] ?? '');
    }
    if (root === 'tenant' && path.length > 1 && tenant) {
      const key = path[1] as keyof typeof tenant;
      return String(tenant[key] ?? '');
    }
    if (root === 'lines' && lines) {
      return String(lines.length);
    }
    return '';
  });
}

/** Evaluate a simple expression like SUM(lines.amount) */
function evaluateExpression(
  expression: string,
  record: Record<string, unknown>,
  lines?: Record<string, unknown>[]
): number {
  const sumMatch = /^SUM\(lines\.(\w+)\)$/i.exec(expression);
  if (sumMatch && lines) {
    const field = sumMatch[1] ?? '';
    return lines.reduce((acc, line) => acc + Number(line[field] ?? 0), 0);
  }
  const countMatch = /^COUNT\(lines\)$/i.exec(expression);
  if (countMatch && lines) return lines.length;

  const fieldMatch = /^record\.(\w+)$/.exec(expression);
  if (fieldMatch) {
    const key = fieldMatch[1] ?? '';
    return Number(record[key] ?? 0);
  }
  return 0;
}

function styleToCSS(style?: Record<string, string>): string {
  if (!style) return '';
  return Object.entries(style)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`)
    .join(';');
}

function renderBlock(
  block: PDFBlock,
  data: PDFRenderData
): string {
  const { record, lines, tenant } = data;
  const inlineStyle = styleToCSS(block.style);

  switch (block.type) {
    case 'text': {
      const content = resolveBinding(
        String(block.props['content'] ?? ''),
        record,
        lines,
        tenant
      );
      return `<p class="pdf-text" style="${inlineStyle}">${escapeHtml(content)}</p>`;
    }

    case 'heading': {
      const content = resolveBinding(
        String(block.props['content'] ?? ''),
        record,
        lines,
        tenant
      );
      const level = Number(block.props['level'] ?? 1);
      const tag = `h${Math.min(Math.max(level, 1), 6)}`;
      return `<${tag} class="pdf-heading" style="${inlineStyle}">${escapeHtml(content)}</${tag}>`;
    }

    case 'image': {
      const src = resolveBinding(String(block.props['src'] ?? ''), record, lines, tenant);
      const alt = String(block.props['alt'] ?? '');
      const width = String(block.props['width'] ?? '100%');
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" style="width:${escapeAttr(width)};${inlineStyle}" />`;
    }

    case 'divider':
      return `<hr class="pdf-divider" style="${inlineStyle}" />`;

    case 'spacer': {
      const height = String(block.props['height'] ?? '16px');
      return `<div class="pdf-spacer" style="height:${escapeAttr(height)};${inlineStyle}"></div>`;
    }

    case 'two_column': {
      const leftBlocks = (block.props['left'] as PDFBlock[] | undefined) ?? [];
      const rightBlocks = (block.props['right'] as PDFBlock[] | undefined) ?? [];
      const leftHtml = leftBlocks.map((b) => renderBlock(b, data)).join('');
      const rightHtml = rightBlocks.map((b) => renderBlock(b, data)).join('');
      return `<div class="pdf-two-col" style="${inlineStyle}"><div class="pdf-col">${leftHtml}</div><div class="pdf-col">${rightHtml}</div></div>`;
    }

    case 'line_items': {
      const props = block.props as unknown as LineItemsProps;
      const columns = props.columns ?? [];
      const showTotals = props.showTotals ?? false;
      const rows = lines ?? [];

      const headerCells = columns
        .map(
          (col) =>
            `<th style="width:${col.width ?? 'auto'};text-align:${col.align ?? 'left'}">${escapeHtml(col.label)}</th>`
        )
        .join('');

      const bodyRows = rows
        .map((row, idx) => {
          const cells = columns
            .map((col) => {
              const raw = row[col.field];
              let cell = '';
              if (col.format === 'currency') {
                cell = formatIndianCurrency(Number(raw ?? 0));
              } else if (col.format === 'number') {
                cell = Number(raw ?? 0).toLocaleString('en-IN');
              } else {
                cell = String(raw ?? '');
              }
              return `<td style="text-align:${col.align ?? 'left'}">${escapeHtml(cell)}</td>`;
            })
            .join('');
          const rowClass = idx % 2 === 0 ? 'even-row' : 'odd-row';
          return `<tr class="${rowClass}">${cells}</tr>`;
        })
        .join('');

      let totalsRow = '';
      if (showTotals && columns.length > 0) {
        const totalCells = columns
          .map((col, i) => {
            if (i === 0) return `<td class="totals-label">Total</td>`;
            if (col.format === 'currency' || col.format === 'number') {
              const sum = rows.reduce((acc, row) => acc + Number(row[col.field] ?? 0), 0);
              const val =
                col.format === 'currency'
                  ? formatIndianCurrency(sum)
                  : sum.toLocaleString('en-IN');
              return `<td style="text-align:${col.align ?? 'right'}">${escapeHtml(val)}</td>`;
            }
            return `<td></td>`;
          })
          .join('');
        totalsRow = `<tr class="totals-row">${totalCells}</tr>`;
      }

      return `<table class="pdf-line-items" style="${inlineStyle}">
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${bodyRows}${totalsRow}</tbody>
</table>`;
    }

    case 'totals': {
      const props = block.props as unknown as TotalsProps;
      const rows = props.rows ?? [];
      const tableRows = rows
        .map((row) => {
          const val = evaluateExpression(row.expression, record, lines);
          return `<tr><td class="totals-label">${escapeHtml(row.label)}</td><td class="totals-value">${escapeHtml(formatIndianCurrency(val))}</td></tr>`;
        })
        .join('');
      return `<table class="pdf-totals" style="${inlineStyle}">${tableRows}</table>`;
    }

    case 'gstin_block': {
      const props = block.props as unknown as GSTINBlockProps;
      const supplierGstin = resolveBinding(
        String(props.supplierFields?.['gstin'] ?? tenant.gstin ?? ''),
        record,
        lines,
        tenant
      );
      const buyerGstin = resolveBinding(
        String(props.buyerFields?.['gstin'] ?? '{{record.buyer_gstin}}'),
        record,
        lines,
        tenant
      );
      const supplierName = tenant.name;
      const buyerName = resolveBinding('{{record.buyer_name}}', record, lines, tenant);

      let gstSplit = '';
      if (props.showGSTSplit) {
        const taxableAmount = evaluateExpression('SUM(lines.taxable_amount)', record, lines);
        const gstAmount = evaluateExpression('SUM(lines.gst_amount)', record, lines);
        // Determine intra-state vs inter-state by comparing first 2 chars of GSTINs
        const supplierState = supplierGstin.slice(0, 2);
        const buyerState = buyerGstin.slice(0, 2);
        const isIntraState = supplierState === buyerState && supplierState !== '';

        if (isIntraState) {
          const half = gstAmount / 2;
          gstSplit = `
  <div class="gst-split">
    <div class="gst-row"><span>Taxable Amount</span><span>${escapeHtml(formatIndianCurrency(taxableAmount))}</span></div>
    <div class="gst-row"><span>CGST</span><span>${escapeHtml(formatIndianCurrency(half))}</span></div>
    <div class="gst-row"><span>SGST</span><span>${escapeHtml(formatIndianCurrency(half))}</span></div>
    <div class="gst-row total"><span>Total Tax</span><span>${escapeHtml(formatIndianCurrency(gstAmount))}</span></div>
  </div>`;
        } else {
          gstSplit = `
  <div class="gst-split">
    <div class="gst-row"><span>Taxable Amount</span><span>${escapeHtml(formatIndianCurrency(taxableAmount))}</span></div>
    <div class="gst-row"><span>IGST</span><span>${escapeHtml(formatIndianCurrency(gstAmount))}</span></div>
    <div class="gst-row total"><span>Total Tax</span><span>${escapeHtml(formatIndianCurrency(gstAmount))}</span></div>
  </div>`;
        }
      }

      return `<div class="pdf-gstin-block" style="${inlineStyle}">
  <div class="pdf-two-col">
    <div class="pdf-col">
      <div class="gstin-party"><strong>Supplier</strong></div>
      <div>${escapeHtml(supplierName)}</div>
      <div class="gstin-num">GSTIN: ${escapeHtml(supplierGstin || 'N/A')}</div>
    </div>
    <div class="pdf-col">
      <div class="gstin-party"><strong>Buyer</strong></div>
      <div>${escapeHtml(buyerName || 'N/A')}</div>
      <div class="gstin-num">GSTIN: ${escapeHtml(buyerGstin || 'N/A')}</div>
    </div>
  </div>
  ${gstSplit}
</div>`;
    }

    case 'amount_in_words': {
      const field = String(block.props['field'] ?? 'total');
      const expr = String(block.props['expression'] ?? `record.${field}`);
      const val = evaluateExpression(expr, record, lines);
      const words = amountInWords(val);
      return `<div class="pdf-amount-words" style="${inlineStyle}"><strong>Amount in Words:</strong> ${escapeHtml(words)}</div>`;
    }

    case 'qr_code': {
      const value = resolveBinding(String(block.props['value'] ?? ''), record, lines, tenant);
      const size = Number(block.props['size'] ?? 80);
      // Use a data URL placeholder; in production would use qrcode library
      return `<div class="pdf-qr" style="${inlineStyle}"><img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}" width="${size}" height="${size}" alt="QR Code" /></div>`;
    }

    case 'barcode': {
      const value = resolveBinding(String(block.props['value'] ?? ''), record, lines, tenant);
      return `<div class="pdf-barcode" style="${inlineStyle}"><div class="barcode-placeholder">[Barcode: ${escapeHtml(value)}]</div></div>`;
    }

    default:
      return `<div class="pdf-unknown">[Unknown block type]</div>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;');
}

const PAGE_DIMENSIONS: Record<string, { width: string; height: string }> = {
  A4: { width: '210mm', height: '297mm' },
  A5: { width: '148mm', height: '210mm' },
  Letter: { width: '215.9mm', height: '279.4mm' },
};

export function renderPDFTemplate(template: PDFTemplate, data: PDFRenderData): string {
  const { pageSize, orientation, margins, header, footer, body, styles } = template;

  const dims = PAGE_DIMENSIONS[pageSize] ?? PAGE_DIMENSIONS['A4'];
  const pageWidth = orientation === 'landscape' ? dims.height : dims.width;
  const pageHeight = orientation === 'landscape' ? dims.width : dims.height;

  const headerHtml = header ? header.map((b) => renderBlock(b, data)).join('\n') : '';
  const footerHtml = footer ? footer.map((b) => renderBlock(b, data)).join('\n') : '';
  const bodyHtml = body.map((b) => renderBlock(b, data)).join('\n');

  const customStyles = Object.entries(styles)
    .map(([sel, css]) => `${sel} { ${css} }`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(template.name)}</title>
<style>
  @page {
    size: ${pageWidth} ${pageHeight};
    margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
    @top-center { content: element(pageHeader); }
    @bottom-center { content: element(pageFooter); }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    color: #111;
    background: #fff;
  }

  #page-header {
    position: running(pageHeader);
    width: 100%;
    padding-bottom: 8px;
    border-bottom: 1px solid #ddd;
    margin-bottom: 8px;
  }

  #page-footer {
    position: running(pageFooter);
    width: 100%;
    padding-top: 8px;
    border-top: 1px solid #ddd;
    margin-top: 8px;
    display: flex;
    justify-content: space-between;
    font-size: 9pt;
    color: #555;
  }

  .page-number::before { content: "Page "; }
  .page-number { counter-increment: page; }
  .page-number::after { content: counter(page) " of " counter(pages); }

  .pdf-text { margin-bottom: 6px; line-height: 1.5; }
  .pdf-heading { margin-bottom: 8px; }
  h1.pdf-heading { font-size: 18pt; }
  h2.pdf-heading { font-size: 15pt; }
  h3.pdf-heading { font-size: 13pt; }
  .pdf-divider { border: none; border-top: 1px solid #ccc; margin: 8px 0; }
  .pdf-spacer { display: block; }

  .pdf-two-col {
    display: flex;
    gap: 16px;
    width: 100%;
  }
  .pdf-col { flex: 1; }

  .pdf-line-items {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
    font-size: 10pt;
  }
  .pdf-line-items th {
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    padding: 6px 8px;
    font-weight: 600;
    text-align: left;
  }
  .pdf-line-items td {
    border: 1px solid #d1d5db;
    padding: 5px 8px;
  }
  .even-row { background: #fff; }
  .odd-row { background: #f9fafb; }
  .totals-row {
    background: #e5e7eb;
    font-weight: 600;
  }
  .totals-label { font-weight: 600; }

  .pdf-totals {
    width: 50%;
    margin-left: auto;
    border-collapse: collapse;
    font-size: 10pt;
  }
  .pdf-totals td {
    border: 1px solid #d1d5db;
    padding: 5px 10px;
  }
  .pdf-totals .totals-label { text-align: left; }
  .pdf-totals .totals-value { text-align: right; font-weight: 600; }

  .pdf-gstin-block {
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 12px;
    font-size: 10pt;
  }
  .gstin-party { font-weight: 600; margin-bottom: 4px; }
  .gstin-num { color: #374151; margin-top: 4px; font-size: 9pt; }

  .gst-split {
    margin-top: 12px;
    border-top: 1px solid #e5e7eb;
    padding-top: 8px;
  }
  .gst-row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
  }
  .gst-row.total {
    border-top: 1px solid #d1d5db;
    margin-top: 4px;
    padding-top: 4px;
    font-weight: 600;
  }

  .pdf-amount-words {
    font-size: 10pt;
    padding: 8px;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    background: #f9fafb;
    margin-bottom: 10px;
  }

  .pdf-qr { display: inline-block; }
  .barcode-placeholder {
    font-size: 9pt;
    color: #6b7280;
    border: 1px dashed #9ca3af;
    padding: 4px 8px;
    display: inline-block;
  }

  ${customStyles}
</style>
</head>
<body>
${headerHtml ? `<div id="page-header">${headerHtml}</div>` : ''}
${footerHtml ? `<div id="page-footer">${footerHtml}<span class="page-number"></span></div>` : ''}
<div id="content">
${bodyHtml}
</div>
</body>
</html>`;
}
