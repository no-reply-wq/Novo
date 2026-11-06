export interface PDFTemplate {
  id: string;
  appId: string;
  name: string;
  pageSize: 'A4' | 'Letter' | 'A5';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number }; // mm
  header?: PDFBlock[];
  footer?: PDFBlock[];
  body: PDFBlock[];
  styles: Record<string, string>; // custom CSS
}

export type PDFBlockType =
  | 'text'
  | 'heading'
  | 'image'
  | 'divider'
  | 'spacer'
  | 'two_column'
  | 'table'
  | 'line_items'
  | 'totals'
  | 'gstin_block'
  | 'amount_in_words'
  | 'qr_code'
  | 'barcode';

export interface PDFBlock {
  id: string;
  type: PDFBlockType;
  props: Record<string, unknown>; // type-specific props
  style?: Record<string, string>;
}

export interface LineItemColumn {
  label: string;
  field: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  format?: 'currency' | 'number' | 'text' | 'date';
}

export interface LineItemsProps {
  columns: LineItemColumn[];
  showTotals?: boolean;
}

export interface TotalsRow {
  label: string;
  expression: string;
}

export interface TotalsProps {
  rows: TotalsRow[];
}

export interface GSTINBlockProps {
  supplierFields?: Record<string, string>;
  buyerFields?: Record<string, string>;
  showGSTSplit?: boolean;
}

export interface PDFGenerationRecord {
  id: string;
  templateId: string;
  recordId: string;
  tableId: string;
  storageKey?: string;
  generatedAt: string;
}
