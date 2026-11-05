/**
 * PDF template types for the Novo document system.
 */

export interface PdfTemplate {
  id: string;
  tenantSlug: string;
  name: string;
  tableId: string;
  layout: PdfLayout;
  blocks: PdfBlock[];
  pageSize: 'A4' | 'Letter' | 'A5';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
}

export interface PdfLayout {
  headerHeight?: number;
  footerHeight?: number;
}

export type PdfBlock =
  | TextBlock
  | TableBlock
  | ImageBlock
  | SignatureBlock
  | BarcodeBlock
  | SpacerBlock
  | HeaderFooterBlock;

export interface BlockPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextStyle {
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  fontFamily?: string;
}

export interface TableStyle {
  headerBackground?: string;
  headerColor?: string;
  borderColor?: string;
  fontSize?: number;
  alternateRowBackground?: string;
}

export interface TableColumn {
  field: string;
  label: string;
  type?: 'text' | 'number' | 'currency' | 'date';
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface TextBlock {
  type: 'text';
  content: string;
  style: TextStyle;
  position: BlockPosition;
}

export interface TableBlock {
  type: 'table';
  relationField: string;
  columns: TableColumn[];
  showTotals: boolean;
  style: TableStyle;
  position: BlockPosition;
}

export interface ImageBlock {
  type: 'image';
  src: string;
  position: BlockPosition;
  alt?: string;
}

export interface SignatureBlock {
  type: 'signature';
  label: string;
  position: BlockPosition;
}

export interface BarcodeBlock {
  type: 'barcode';
  value: string;
  format: 'QR' | 'CODE128' | 'EAN13';
  position: BlockPosition;
}

export interface SpacerBlock {
  type: 'spacer';
  position: BlockPosition;
}

export interface HeaderFooterBlock {
  type: 'header-footer';
  area: 'header' | 'footer';
  content: string;
  style: TextStyle;
  position: BlockPosition;
}
