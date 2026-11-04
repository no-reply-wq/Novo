/**
 * Page Builder Type System
 * Full WordPress/Elementor-style visual builder for LRBC ERP
 */

// ─── Block Types ────────────────────────────────────────────────────────────

export type BlockType =
  | 'section'
  | 'container'
  | 'text'
  | 'heading'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'image'
  | 'image-carousel'
  | 'card'
  | 'stat-card'
  | 'form-embed'
  | 'table-embed'
  | 'html';

// ─── Responsive Styles ──────────────────────────────────────────────────────

export interface BlockStyles {
  display?: string;
  flexDirection?: string;
  flexWrap?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;
  gridCols?: number;
  width?: string;
  maxWidth?: string;
  height?: string;
  minHeight?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  textAlign?: string;
  color?: string;
  letterSpacing?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  borderWidth?: string;
  borderColor?: string;
  borderRadius?: string;
  borderStyle?: string;
  boxShadow?: string;
  opacity?: string;
  overflow?: string;
  position?: string;
  zIndex?: string;
}

export interface ResponsiveStyles {
  desktop?: BlockStyles;
  tablet?: BlockStyles;
  mobile?: BlockStyles;
}

// ─── Data Binding ────────────────────────────────────────────────────────────

export interface DataBinding {
  sourceType: 'static' | 'form-submission' | 'table-selection' | 'api';
  sourceId?: string;
  targetField?: string;
  fieldMapping?: Record<string, string>;
}

// ─── Block Props ────────────────────────────────────────────────────────────

export interface SectionProps { fullWidth?: boolean; containerMaxWidth?: string; }
export interface ContainerProps { columns?: number; columnGap?: string; rowGap?: string; }
export interface TextProps { content?: string; tag?: 'p' | 'span' | 'div'; }
export interface HeadingProps { content?: string; level?: 1 | 2 | 3 | 4 | 5 | 6; }
export interface ButtonProps { label?: string; href?: string; variant?: 'primary' | 'secondary' | 'outline' | 'ghost'; size?: 'sm' | 'md' | 'lg'; action?: 'link' | 'submit' | 'custom' | 'popup-form'; formId?: string; }
export interface ImageProps { src?: string; alt?: string; objectFit?: 'cover' | 'contain' | 'fill'; dataBinding?: DataBinding; }
export interface ImageCarouselProps { images?: Array<{ src: string; alt?: string; caption?: string }>; autoplay?: boolean; autoplayDelay?: number; showIndicators?: boolean; showArrows?: boolean; dataBinding?: DataBinding; }
export interface StatCardProps { title?: string; value?: string; unit?: string; trend?: 'up' | 'down' | 'neutral'; trendValue?: string; icon?: string; color?: string; dataBinding?: DataBinding; }
export interface FormEmbedProps { formId?: string; formSlug?: string; showTitle?: boolean; compact?: boolean; onSubmitRefreshTableId?: string; }
export interface TableEmbedProps { sourceTable?: string; formId?: string; title?: string; columns?: Array<{ key: string; label: string; type?: string }>; filters?: Array<{ column: string; value: string }>; showSumRow?: boolean; sumColumns?: string[]; pageSize?: number; onRowSelectFormId?: string; stickyHeader?: boolean; stripeRows?: boolean; headerBgColor?: string; }
export interface DividerProps { thickness?: string; color?: string; style?: 'solid' | 'dashed' | 'dotted'; }
export interface SpacerProps { height?: string; }
export interface HtmlProps { html?: string; }

export type BlockProps = SectionProps | ContainerProps | TextProps | HeadingProps | ButtonProps | ImageProps | ImageCarouselProps | StatCardProps | FormEmbedProps | TableEmbedProps | DividerProps | SpacerProps | HtmlProps;

// ─── Canvas Block ────────────────────────────────────────────────────────────

export interface CanvasBlock {
  id: string;
  type: BlockType;
  parentId: string | null;
  children: string[];
  props: BlockProps;
  styles: ResponsiveStyles;
  dataBindings?: DataBinding[];
  locked?: boolean;
  hidden?: boolean;
  label?: string;
}

// ─── Page Layout Config ──────────────────────────────────────────────────────

export interface PageLayoutConfig {
  version: 1;
  pageKey: string;
  pageTitle?: string;
  blocks: Record<string, CanvasBlock>;
  rootIds: string[];
  globalStyles?: BlockStyles;
  metadata?: { createdAt: string; updatedAt: string; };
}

// ─── Builder State ───────────────────────────────────────────────────────────

export type Breakpoint = 'desktop' | 'tablet' | 'mobile';

export interface BuilderState {
  layout: PageLayoutConfig;
  selectedBlockId: string | null;
  breakpoint: Breakpoint;
  isDragging: boolean;
  dragSourceId: string | null;
  dropTargetId: string | null;
  dropPosition: 'before' | 'after' | 'inside' | null;
  history: PageLayoutConfig[];
  historyIndex: number;
  clipboard: CanvasBlock | null;
}

// ─── Block Library ───────────────────────────────────────────────────────────

export interface BlockLibraryItem {
  type: BlockType;
  label: string;
  icon: string;
  category: 'layout' | 'content' | 'media' | 'data' | 'advanced';
  defaultProps: BlockProps;
  defaultStyles: ResponsiveStyles;
  canHaveChildren: boolean;
}

export const BLOCK_LIBRARY: BlockLibraryItem[] = [
  { type: 'section', label: 'Section', icon: 'layout', category: 'layout', canHaveChildren: true, defaultProps: { fullWidth: false, containerMaxWidth: '1200px' } as SectionProps, defaultStyles: { desktop: { display: 'flex', flexDirection: 'column', paddingTop: '40px', paddingBottom: '40px', paddingLeft: '24px', paddingRight: '24px', width: '100%' } } },
  { type: 'container', label: 'Container', icon: 'square', category: 'layout', canHaveChildren: true, defaultProps: { columns: 1, columnGap: '16px' } as ContainerProps, defaultStyles: { desktop: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '16px', width: '100%' } } },
  { type: 'card', label: 'Card', icon: 'credit-card', category: 'layout', canHaveChildren: true, defaultProps: {}, defaultStyles: { desktop: { backgroundColor: '#ffffff', borderRadius: '12px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', paddingTop: '24px', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } } },
  { type: 'heading', label: 'Heading', icon: 'heading', category: 'content', canHaveChildren: false, defaultProps: { content: 'Your Heading', level: 2 } as HeadingProps, defaultStyles: { desktop: { fontSize: '28px', fontWeight: '700', lineHeight: '1.2', color: '#111827', marginBottom: '16px' } } },
  { type: 'text', label: 'Text', icon: 'type', category: 'content', canHaveChildren: false, defaultProps: { content: 'Enter your text here...', tag: 'p' } as TextProps, defaultStyles: { desktop: { fontSize: '16px', lineHeight: '1.6', color: '#374151' } } },
  { type: 'button', label: 'Button', icon: 'mouse-pointer', category: 'content', canHaveChildren: false, defaultProps: { label: 'Click me', variant: 'primary', size: 'md', action: 'link' } as ButtonProps, defaultStyles: { desktop: {} } },
  { type: 'stat-card', label: 'Stat Card', icon: 'bar-chart', category: 'content', canHaveChildren: false, defaultProps: { title: 'Total Revenue', value: '₹0', trend: 'neutral' } as StatCardProps, defaultStyles: { desktop: { backgroundColor: '#ffffff', borderRadius: '12px', borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb', paddingTop: '24px', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } } },
  { type: 'divider', label: 'Divider', icon: 'minus', category: 'content', canHaveChildren: false, defaultProps: { thickness: '1px', color: '#e5e7eb', style: 'solid' } as DividerProps, defaultStyles: { desktop: { marginTop: '16px', marginBottom: '16px', width: '100%' } } },
  { type: 'spacer', label: 'Spacer', icon: 'move-vertical', category: 'content', canHaveChildren: false, defaultProps: { height: '40px' } as SpacerProps, defaultStyles: { desktop: {} } },
  { type: 'image', label: 'Image', icon: 'image', category: 'media', canHaveChildren: false, defaultProps: { src: '', alt: '', objectFit: 'cover' } as ImageProps, defaultStyles: { desktop: { width: '100%', height: '300px' } } },
  { type: 'image-carousel', label: 'Image Carousel', icon: 'gallery-horizontal', category: 'media', canHaveChildren: false, defaultProps: { images: [], autoplay: true, autoplayDelay: 3000, showIndicators: true, showArrows: true } as ImageCarouselProps, defaultStyles: { desktop: { width: '100%', height: '400px' } } },
  { type: 'form-embed', label: 'Form', icon: 'file-text', category: 'data', canHaveChildren: false, defaultProps: { showTitle: true, compact: false } as FormEmbedProps, defaultStyles: { desktop: { width: '100%', maxWidth: '680px' } } },
  { type: 'table-embed', label: 'Data Table', icon: 'table', category: 'data', canHaveChildren: false, defaultProps: { title: 'Data Table', columns: [], filters: [], showSumRow: false, pageSize: 20, stickyHeader: true, stripeRows: true } as TableEmbedProps, defaultStyles: { desktop: { width: '100%' } } },
  { type: 'html', label: 'Custom HTML', icon: 'code', category: 'advanced', canHaveChildren: false, defaultProps: { html: '<p>Custom HTML</p>' } as HtmlProps, defaultStyles: { desktop: {} } },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function generateBlockId(): string {
  return `blk_${Math.random().toString(36).slice(2, 9)}`;
}

export function createBlock(type: BlockType, parentId: string | null = null): CanvasBlock {
  const lib = BLOCK_LIBRARY.find(b => b.type === type);
  return {
    id: generateBlockId(),
    type,
    parentId,
    children: [],
    props: lib?.defaultProps ?? {},
    styles: lib?.defaultStyles ?? { desktop: {} },
    label: lib?.label,
  };
}

export function resolveStyles(styles: ResponsiveStyles, breakpoint: Breakpoint): BlockStyles {
  const desktop = styles.desktop ?? {};
  if (breakpoint === 'desktop') return desktop;
  if (breakpoint === 'tablet') return { ...desktop, ...styles.tablet };
  return { ...desktop, ...styles.tablet, ...styles.mobile };
}

export function stylesToCSS(styles: BlockStyles): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (styles.display) css.display = styles.display as React.CSSProperties['display'];
  if (styles.flexDirection) css.flexDirection = styles.flexDirection as React.CSSProperties['flexDirection'];
  if (styles.flexWrap) css.flexWrap = styles.flexWrap as React.CSSProperties['flexWrap'];
  if (styles.justifyContent) css.justifyContent = styles.justifyContent;
  if (styles.alignItems) css.alignItems = styles.alignItems;
  if (styles.gap) css.gap = styles.gap;
  if (styles.width) css.width = styles.width;
  if (styles.maxWidth) css.maxWidth = styles.maxWidth;
  if (styles.height) css.height = styles.height;
  if (styles.minHeight) css.minHeight = styles.minHeight;
  if (styles.paddingTop) css.paddingTop = styles.paddingTop;
  if (styles.paddingRight) css.paddingRight = styles.paddingRight;
  if (styles.paddingBottom) css.paddingBottom = styles.paddingBottom;
  if (styles.paddingLeft) css.paddingLeft = styles.paddingLeft;
  if (styles.marginTop) css.marginTop = styles.marginTop;
  if (styles.marginRight) css.marginRight = styles.marginRight;
  if (styles.marginBottom) css.marginBottom = styles.marginBottom;
  if (styles.marginLeft) css.marginLeft = styles.marginLeft;
  if (styles.fontSize) css.fontSize = styles.fontSize;
  if (styles.fontWeight) css.fontWeight = styles.fontWeight as React.CSSProperties['fontWeight'];
  if (styles.lineHeight) css.lineHeight = styles.lineHeight;
  if (styles.textAlign) css.textAlign = styles.textAlign as React.CSSProperties['textAlign'];
  if (styles.color) css.color = styles.color;
  if (styles.letterSpacing) css.letterSpacing = styles.letterSpacing;
  if (styles.backgroundColor) css.backgroundColor = styles.backgroundColor;
  if (styles.backgroundImage) css.backgroundImage = styles.backgroundImage;
  if (styles.backgroundSize) css.backgroundSize = styles.backgroundSize;
  if (styles.backgroundPosition) css.backgroundPosition = styles.backgroundPosition;
  if (styles.borderWidth) css.borderWidth = styles.borderWidth;
  if (styles.borderColor) css.borderColor = styles.borderColor;
  if (styles.borderRadius) css.borderRadius = styles.borderRadius;
  if (styles.borderStyle) css.borderStyle = styles.borderStyle as React.CSSProperties['borderStyle'];
  if (styles.boxShadow) css.boxShadow = styles.boxShadow;
  if (styles.opacity) css.opacity = Number(styles.opacity);
  if (styles.overflow) css.overflow = styles.overflow as React.CSSProperties['overflow'];
  if (styles.position) css.position = styles.position as React.CSSProperties['position'];
  if (styles.zIndex) css.zIndex = Number(styles.zIndex);
  return css;
}

export function emptyLayout(pageKey: string): PageLayoutConfig {
  return {
    version: 1,
    pageKey,
    rootIds: [],
    blocks: {},
    metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  };
}
