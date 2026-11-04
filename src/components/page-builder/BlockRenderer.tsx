'use client';

import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'isomorphic-dompurify';
import {
  CanvasBlock, PageLayoutConfig, Breakpoint,
  resolveStyles, stylesToCSS,
  TextProps, HeadingProps, ButtonProps, ImageProps, ImageCarouselProps,
  StatCardProps, FormEmbedProps, TableEmbedProps, DividerProps, SpacerProps, HtmlProps,
  SectionProps, BlockType,
} from '@/lib/page-builder/types';
import { TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';

interface BlockRendererProps {
  blockId: string;
  layout: PageLayoutConfig;
  breakpoint: Breakpoint;
  selectedBlockId?: string | null;
  onSelect?: (id: string) => void;
  isEditing?: boolean;
  tenantSlug?: string;
  onDropInto?: (parentId: string, blockType: BlockType) => void;
  tableSelections?: Record<string, Record<string, unknown>>;
  onTableRowSelect?: (tableBlockId: string, row: Record<string, unknown>) => void;
  onFormSubmit?: (formBlockId: string, data: unknown) => void;
}

export function BlockRenderer({
  blockId, layout, breakpoint, selectedBlockId, onSelect, isEditing = false,
  tenantSlug, onDropInto, tableSelections, onTableRowSelect, onFormSubmit,
}: BlockRendererProps) {
  const block = layout.blocks[blockId];
  if (!block || block.hidden) return null;

  const resolvedStyles = resolveStyles(block.styles, breakpoint);
  const cssStyles = stylesToCSS(resolvedStyles);
  const isSelected = selectedBlockId === blockId;
  const isContainer = ['section', 'container', 'card'].includes(block.type);

  const [dragOverSelf, setDragOverSelf] = useState(false);
  const [popupFormId, setPopupFormId] = useState<string | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (isEditing && onSelect) {
      e.stopPropagation();
      onSelect(blockId);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!isEditing || !isContainer) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverSelf(true);
  };

  const handleDragLeave = () => setDragOverSelf(false);

  const handleDrop = (e: React.DragEvent) => {
    if (!isEditing || !isContainer) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverSelf(false);
    const bt = e.dataTransfer.getData('blockType') as BlockType;
    if (bt && onDropInto) onDropInto(blockId, bt);
  };

  const editorOutline: React.CSSProperties = isEditing ? {
    outline: isSelected ? '2px solid #6366f1' : dragOverSelf ? '2px dashed #6366f1' : '1px dashed transparent',
    outlineOffset: '1px',
    cursor: 'pointer',
    position: 'relative' as const,
  } : {};

  const sharedDropProps = isContainer && isEditing ? {
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  } : {};

  const renderChildren = () => (
    <>
      {block.children.map(childId => (
        <BlockRenderer
          key={childId}
          blockId={childId}
          layout={layout}
          breakpoint={breakpoint}
          selectedBlockId={selectedBlockId}
          onSelect={onSelect}
          isEditing={isEditing}
          tenantSlug={tenantSlug}
          onDropInto={onDropInto}
          tableSelections={tableSelections}
          onTableRowSelect={onTableRowSelect}
          onFormSubmit={onFormSubmit}
        />
      ))}
    </>
  );

  switch (block.type) {
    case 'section': {
      const props = block.props as SectionProps;
      return (
        <div onClick={handleClick} {...sharedDropProps} style={{ ...cssStyles, ...editorOutline, position: 'relative' }} data-block-id={blockId}>
          {isEditing && isSelected && <BlockLabel label={block.label ?? 'Section'} />}
          {isEditing && dragOverSelf && <DropOverlay />}
          <div style={props.fullWidth ? {} : { maxWidth: props.containerMaxWidth ?? '1200px', margin: '0 auto', width: '100%' }}>
            {renderChildren()}
            {isEditing && block.children.length === 0 && <EmptyDropZone />}
          </div>
        </div>
      );
    }

    case 'container':
    case 'card': {
      return (
        <div onClick={handleClick} {...sharedDropProps} style={{ ...cssStyles, ...editorOutline }} data-block-id={blockId}>
          {isEditing && isSelected && <BlockLabel label={block.label ?? (block.type === 'card' ? 'Card' : 'Container')} />}
          {isEditing && dragOverSelf && <DropOverlay />}
          {renderChildren()}
          {isEditing && block.children.length === 0 && <EmptyDropZone />}
        </div>
      );
    }

    case 'heading': {
      const props = block.props as HeadingProps;
      const Tag = (`h${props.level ?? 2}`) as React.ElementType;
      return (
        <Tag onClick={handleClick} style={{ ...cssStyles, ...editorOutline }} data-block-id={blockId}>
          {isEditing && isSelected && <BlockLabel label="Heading" />}
          {props.content ?? 'Heading'}
        </Tag>
      );
    }

    case 'text': {
      const props = block.props as TextProps;
      const Tag = (props.tag ?? 'p') as React.ElementType;
      return (
        <Tag onClick={handleClick} style={{ ...cssStyles, ...editorOutline }} data-block-id={blockId}>
          {isEditing && isSelected && <BlockLabel label="Text" />}
          {props.content ?? 'Text content'}
        </Tag>
      );
    }

    case 'button': {
      const props = block.props as ButtonProps;
      const handleButtonClick = (e: React.MouseEvent) => {
        if (isEditing) { e.stopPropagation(); onSelect?.(blockId); return; }
        if (props.action === 'popup-form' && props.formId) {
          setPopupFormId(props.formId);
        } else if (props.action === 'link' && props.href) {
          window.open(props.href, '_blank');
        }
      };
      const variantStyles: React.CSSProperties = props.variant === 'primary'
        ? { backgroundColor: '#6366f1', color: '#fff', border: 'none' }
        : props.variant === 'secondary'
        ? { backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }
        : props.variant === 'outline'
        ? { backgroundColor: 'transparent', color: '#6366f1', border: '1px solid #6366f1' }
        : { backgroundColor: 'transparent', color: '#6366f1', border: 'none' };
      const sizeStyles: React.CSSProperties = props.size === 'sm'
        ? { padding: '6px 12px', fontSize: '13px' }
        : props.size === 'lg'
        ? { padding: '14px 28px', fontSize: '17px' }
        : { padding: '10px 20px', fontSize: '15px' };
      return (
        <>
          <button onClick={handleButtonClick} style={{ ...cssStyles, ...editorOutline, ...variantStyles, ...sizeStyles, borderRadius: '8px', cursor: 'pointer', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '6px' }} data-block-id={blockId}>
            {isEditing && isSelected && <BlockLabel label="Button" />}
            {props.label ?? 'Button'}
          </button>
          {popupFormId && (
            <FormPopup formId={popupFormId} tenantSlug={tenantSlug ?? ''} onClose={() => setPopupFormId(null)} />
          )}
        </>
      );
    }

    case 'image': {
      const props = block.props as ImageProps;
      return (
        <div onClick={handleClick} style={{ ...cssStyles, ...editorOutline, overflow: 'hidden' }} data-block-id={blockId}>
          {isEditing && isSelected && <BlockLabel label="Image" />}
          {props.src ? (
            <img src={props.src} alt={props.alt ?? ''} style={{ width: '100%', height: '100%', objectFit: props.objectFit ?? 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', minHeight: '120px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '14px' }}>
              {isEditing ? 'Set image URL in Inspector' : ''}
            </div>
          )}
        </div>
      );
    }

    case 'image-carousel': {
      const props = block.props as ImageCarouselProps;
      return <ImageCarouselBlock props={props} cssStyles={cssStyles} editorOutline={editorOutline} onClick={handleClick} blockId={blockId} isEditing={isEditing} isSelected={isSelected} />;
    }

    case 'stat-card': {
      const props = block.props as StatCardProps;
      const TrendIcon = props.trend === 'up' ? TrendingUp : props.trend === 'down' ? TrendingDown : Minus;
      const trendColor = props.trend === 'up' ? '#10b981' : props.trend === 'down' ? '#ef4444' : '#9ca3af';
      return (
        <div onClick={handleClick} style={{ ...cssStyles, ...editorOutline }} data-block-id={blockId}>
          {isEditing && isSelected && <BlockLabel label="Stat Card" />}
          <p style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500', marginBottom: '8px', marginTop: 0 }}>{props.title ?? 'Metric'}</p>
          <p style={{ fontSize: '32px', fontWeight: '700', color: props.color ?? '#111827', margin: '0' }}>
            {props.value ?? '--'}{props.unit && <span style={{ fontSize: '16px', fontWeight: '400', marginLeft: '4px' }}>{props.unit}</span>}
          </p>
          {props.trendValue && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
              <TrendIcon style={{ width: '14px', height: '14px', color: trendColor }} />
              <span style={{ fontSize: '13px', color: trendColor }}>{props.trendValue}</span>
            </div>
          )}
        </div>
      );
    }

    case 'divider': {
      const props = block.props as DividerProps;
      return (
        <div onClick={handleClick} style={{ ...cssStyles, ...editorOutline }} data-block-id={blockId}>
          {isEditing && isSelected && <BlockLabel label="Divider" />}
          <hr style={{ border: 'none', borderTop: `${props.thickness ?? '1px'} ${props.style ?? 'solid'} ${props.color ?? '#e5e7eb'}`, margin: '0' }} />
        </div>
      );
    }

    case 'spacer': {
      const props = block.props as SpacerProps;
      return (
        <div onClick={handleClick} style={{ ...editorOutline, height: props.height ?? '40px', width: '100%', position: 'relative' }} data-block-id={blockId}>
          {isEditing && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#9ca3af' }}>Spacer ({props.height})</div>}
        </div>
      );
    }

    case 'form-embed': {
      const props = block.props as FormEmbedProps;
      return (
        <div onClick={handleClick} style={{ ...cssStyles, ...editorOutline }} data-block-id={blockId}>
          {isEditing && isSelected && <BlockLabel label="Form" />}
          {props.formId ? (
            <FormEmbedBlock formId={props.formId} tenantSlug={tenantSlug ?? ''} showTitle={props.showTitle ?? true} compact={props.compact ?? false} isEditing={isEditing} onSubmit={(data) => onFormSubmit?.(blockId, data)} />
          ) : (
            <div style={{ padding: '32px', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '8px', border: '2px dashed #e5e7eb', color: '#9ca3af' }}>
              {isEditing ? 'Select a form in the Inspector panel \u2192' : 'Form not configured'}
            </div>
          )}
        </div>
      );
    }

    case 'table-embed': {
      const props = block.props as TableEmbedProps;
      return (
        <div onClick={handleClick} style={{ ...cssStyles, ...editorOutline }} data-block-id={blockId}>
          {isEditing && isSelected && <BlockLabel label="Data Table" />}
          {props.sourceTable || props.formId ? (
            <div style={{ position: 'relative' }}>
              {isEditing && (
                <div style={{ position: 'absolute', top: '-20px', left: 0, backgroundColor: '#6366f1', color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '3px', zIndex: 10, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                  {props.title ?? 'Table'} — {props.sourceTable ?? 'form submissions'}
                </div>
              )}
              <TableEmbedBlock props={props} tenantSlug={tenantSlug ?? ''} isEditing={false} onRowSelect={(row) => onTableRowSelect?.(blockId, row)} />
            </div>
          ) : (
            <div style={{ padding: '32px', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '8px', border: '2px dashed #e5e7eb', color: '#9ca3af' }}>
              {isEditing ? 'Select a data source in the Inspector panel \u2192' : 'Table not configured'}
            </div>
          )}
        </div>
      );
    }

    case 'html': {
      const props = block.props as HtmlProps;
      return (
        <div onClick={handleClick} style={{ ...cssStyles, ...editorOutline }} data-block-id={blockId}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(props.html ?? '') }} />
      );
    }

    default:
      return (
        <div onClick={handleClick} style={{ ...cssStyles, ...editorOutline, padding: '12px', backgroundColor: '#fee2e2', borderRadius: '6px', fontSize: '13px', color: '#991b1b' }}>
          Unknown: {block.type}
        </div>
      );
  }
}

function BlockLabel({ label }: { label: string }) {
  return (
    <div style={{ position: 'absolute', top: '-20px', left: '0', zIndex: 100, backgroundColor: '#6366f1', color: '#fff', fontSize: '10px', fontWeight: '600', padding: '2px 6px', borderRadius: '3px 3px 0 0', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
      {label}
    </div>
  );
}

function EmptyDropZone() {
  return (
    <div style={{ padding: '24px', textAlign: 'center', border: '2px dashed #c1c5cb', borderRadius: '8px', color: '#9ca3af', fontSize: '13px', margin: '8px' }}>
      Drop blocks here or click a block in the left panel
    </div>
  );
}

function DropOverlay() {
  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(99,102,241,0.1)', border: '2px dashed #6366f1', borderRadius: '4px', zIndex: 50, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ backgroundColor: '#6366f1', color: '#fff', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>Drop here</span>
    </div>
  );
}

function ImageCarouselBlock({ props, cssStyles, editorOutline, onClick, blockId, isEditing, isSelected }: {
  props: ImageCarouselProps; cssStyles: React.CSSProperties; editorOutline: React.CSSProperties;
  onClick: (e: React.MouseEvent) => void; blockId: string; isEditing: boolean; isSelected: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const images = props.images ?? [];
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (props.autoplay && images.length > 1) {
      intervalRef.current = setInterval(() => setCurrent(c => (c + 1) % images.length), props.autoplayDelay ?? 3000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [props.autoplay, props.autoplayDelay, images.length]);

  return (
    <div onClick={onClick} style={{ ...cssStyles, ...editorOutline, position: 'relative', overflow: 'hidden', minHeight: '200px' }} data-block-id={blockId}>
      {isEditing && isSelected && <BlockLabel label="Image Carousel" />}
      {images.length === 0 ? (
        <div style={{ width: '100%', height: '100%', minHeight: '200px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
          {isEditing ? 'Add images in Inspector' : ''}
        </div>
      ) : (
        <>
          <img src={images[current]?.src} alt={images[current]?.alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {props.showArrows && images.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); setCurrent(c => (0 - 1 + images.length) % images.length); }} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronLeft style={{ width: '18px', height: '18px' }} />
              </button>
              <button onClick={e => { e.stopPropagation(); setCurrent(c => (c + 1) % images.length); }} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.4)', color: '#fff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronRight style={{ width: '18px', height: '18px' }} />
              </button>
            </>
          )}
          </>
      )}
    </div>
  );
}

function FormEmbedBlock({ formId, tenantSlug, showTitle, compact, isEditing, onSubmit }: {
  formId: string; tenantSlug: string; showTitle: boolean; compact: boolean;
  isEditing: boolean; onSubmit?: (data: unknown) => void;
}) {
  const [form, setForm] = useState<{ name: string; fields: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!formId || !tenantSlug) return;
    Promise.all([
      fetch(`/api/tenant/form-builder/${formId}?tenant=${tenantSlug}`).then(r => r.json()),
      fetch(`/api/tenant/form-builder/${formId}/fields?tenant=${tenantSlug}`).then(r => r.json()),
    ]).then(([formData, fieldsData]) => {
      setForm({ ...formData.form, fields: fieldsData.fields ?? [] });
    }).catch(() => setForm(null)).finally(() => setLoading(false));
  }, [formId, tenantSlug]);

  if (loading) return <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Loading form...</div>;
  if (!form) return <div style={{ padding: '24px', textAlign: 'center', color: '#ef4444' }}>Form not found</div>;

  if (isEditing) {
    return (
      <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
        <p style={{ fontSize: '13px', color: '#1d4ed8', fontWeight: '600', margin: '0 0 4px' }}>Form:  {form.name}</p>
        <p style={{ fontSize: '12px', color: '#3b82f6', margin: '0' }}>{form.fields.length} fields - visible in preview</p>
      </div>
    );
  }

  return (
    <div>
      {showTitle && <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>{form.name}</h3>}
      <DynamicFormWrapper form={form as { id: string; name: string; fields: unknown[] }} tenantSlug={tenantSlug} onSubmit={onSubmit} />
    </div>
  );
}

function DynamicFormWrapper({ form, tenantSlug, onSubmit }: {
  form: { id: string; name: string; fields: unknown[] }; tenantSlug: string; onSubmit?: (data: unknown) => void;
}) {
  const [DynamicForm, setDynamicForm] = useState<React.ComponentType<{ form: typeof form; tenantSlug: string; onSubmit: (data: unknown) => void; onCancel: () => void }> | null>(null);
  useEffect(() => {
    import('@/components/forms/DynamicForm').then(m => setDynamicForm(() => m.DynamicForm as unknown as React.ComponentType<{ form: typeof form; tenantSlug: string; onSubmit: (data: unknown) => void; onCancel: () => void }>));
  }, []);
  if (!DynamicForm) return <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>;
  return <DynamicForm form={form as never} tenantSlug={tenantSlug} onSubmit={onSubmit as never} onCancel={() => {}} />;
}

function TableEmbedBlock({ props, tenantSlug, isEditing, onRowSelect }: {
  props: TableEmbedProps; tenantSlug: string; isEditing: boolean;
  onRowSelect?: (row: Record<string, unknown>) => void;
}) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantSlug) return;
    const source = props.sourceTable ?? props.formId;
    if (!source) { setLoading(false); return; }
    let url = '';
    if (props.formId) {
      url = `/api/tenant/form-builder/submissions?tenant=${tenantSlug}&formId=${props.formId}&page=1&pageSize=${props.pageSize ?? 20}`;
    } else {
        const selectedCols = props.columns?.map((c: {key: string}) => c.key) ?? [];
      const colParam = selectedCols.length ? `&columns=${encodeURIComponent(JSON.stringify(selectedCols))}` : '';
      url = `/api/tenant/ui-builder/widget-data?tenant=${tenantSlug}&table=${props.sourceTable}&pageSize=${props.pageSize ?? 20}${colParam}`;
    }
    fetch(url).then(r => r.json()).then(d => {
      setData(d.submissions ?? d.rows ?? d.data ?? []);
    }).catch(() => setData([])).finally(() => setLoading(false));
  }, [props.sourceTable, props.formId, tenantSlug, props.pageSize]);

  const columns = props.columns?.length ? props.columns : (data[0] ? Object.keys(data[0]).slice(0, 6).map(k => ({ key: k, label: k })) : []);

  // In editing mode, show real data with an "editing" overlay indicator
  // (don't return early - fall through to render the actual table)

  if (loading) return <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Loading data...</div>;

  return (
    <div>
      {props.title && <h4 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>{props.title}</h4>}
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: props.headerBgColor ?? '#f9fafb' }}>
              {columns.map(col => (
                <th key={col.key} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} onClick={() => onRowSelect?.(row)} style={{ backgroundColor: props.stripeRows && i % 2 === 1 ? '#f9fafb' : '#fff', cursor: onRowSelect ? 'pointer' : 'default' }}>
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '10px 16px', color: '#374151', borderBottom: '1px solid #f3f4f6' }}>{String(row[col.key] ?? '')}</td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormPopup({ formId, tenantSlug, onClose }: { formId: string; tenantSlug: string; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', backgroundColor: '#fff', borderRadius: '12px', padding: '32px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#6b7280', lineHeight: 1 }}>
          &times;
        </button>
        <FormEmbedBlock formId={formId} tenantSlug={tenantSlug} showTitle={true} compact={false} isEditing={false} onSubmit={() => onClose()} />
      </div>
    </div>
  );
}


export function PageRenderer({
  layout, breakpoint = 'desktop', isEditing = false, selectedBlockId, onSelect,
  tenantSlug, onDropInto, tableSelections, onTableRowSelect, onFormSubmit,
}: {
  layout: PageLayoutConfig; breakpoint?: Breakpoint; isEditing?: boolean;
  selectedBlockId?: string | null; onSelect?: (id: string) => void; tenantSlug?: string;
  onDropInto?: (parentId: string, blockType: BlockType) => void;
  tableSelections?: Record<string, Record<string, unknown>>;
  onTableRowSelect?: (tableBlockId: string, row: Record<string, unknown>) => void;
  onFormSubmit?: (formBlockId: string, data: unknown) => void;
}) {
  return (
    <div onClick={() => isEditing && onSelect?.(null as unknown as string)} style={{ minHeight: '100%' }}>
      {layout.rootIds.map(id => (
        <BlockRenderer key={id} blockId={id} layout={layout} breakpoint={breakpoint} selectedBlockId={selectedBlockId} onSelect={onSelect} isEditing={isEditing} tenantSlug={tenantSlug} onDropInto={onDropInto} tableSelections={tableSelections} onTableRowSelect={onTableRowSelect} onFormSubmit={onFormSubmit} />
      ))}
      {isEditing && layout.rootIds.length === 0 && (
        <div style={{ padding: '80px 24px', textAlign: 'center', color: '#9ca3af' }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>Empty page</p>
          <p style={{ fontSize: '14px' }}>Drag blocks from the left panel, or click to add them</p>
        </div>
      )}
    </div>
  );
}
