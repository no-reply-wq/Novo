'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2, Eye, EyeOff, Save, GripVertical, ChevronDown, ChevronRight, LayoutDashboard, Type, Image as ImageIcon, Table, Columns, AlignLeft, ToggleLeft, Calendar, BarChart3, Square, Link, MousePointer, FormInput, Box, Grid, Layers, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ComponentType =
  | 'container' | 'grid' | 'stack' | 'divider'
  | 'heading' | 'text' | 'badge' | 'image' | 'stat_card'
  | 'text_input' | 'textarea' | 'select' | 'checkbox' | 'date_picker' | 'file_upload'
  | 'table' | 'card_list' | 'kanban' | 'calendar' | 'chart'
  | 'button' | 'link_button' | 'icon_button'
  | 'form';

interface ComponentProps {
  label?: string;
  text?: string;
  placeholder?: string;
  required?: boolean;
  tableId?: string;
  action?: 'navigate' | 'submit' | 'custom';
  href?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  columns?: number;
  chartType?: 'bar' | 'line' | 'pie';
}

interface CanvasComponent {
  id: string;
  type: ComponentType;
  props: ComponentProps;
  children?: CanvasComponent[];
}

interface AppPage {
  id: string;
  name: string;
  slug: string;
  layout: CanvasComponent[];
  createdAt?: string;
}

interface TableMeta {
  id: string;
  label: string;
  slug: string;
}

// ─── Palette definition ────────────────────────────────────────────────────────

interface PaletteItem {
  type: ComponentType;
  label: string;
  icon: React.ReactNode;
  defaultProps: ComponentProps;
}

const PALETTE_SECTIONS: { title: string; items: PaletteItem[] }[] = [
  {
    title: 'Layout',
    items: [
      { type: 'container', label: 'Container', icon: <Box className="w-4 h-4" />, defaultProps: {} },
      { type: 'grid', label: 'Grid', icon: <Grid className="w-4 h-4" />, defaultProps: { columns: 2 } },
      { type: 'stack', label: 'Stack', icon: <Layers className="w-4 h-4" />, defaultProps: {} },
      { type: 'divider', label: 'Divider', icon: <Minus className="w-4 h-4" />, defaultProps: {} },
    ],
  },
  {
    title: 'Display',
    items: [
      { type: 'heading', label: 'Heading', icon: <Type className="w-4 h-4" />, defaultProps: { text: 'Heading' } },
      { type: 'text', label: 'Text', icon: <AlignLeft className="w-4 h-4" />, defaultProps: { text: 'Text block' } },
      { type: 'badge', label: 'Badge', icon: <Square className="w-4 h-4" />, defaultProps: { label: 'Badge' } },
      { type: 'image', label: 'Image', icon: <ImageIcon className="w-4 h-4" />, defaultProps: { label: 'Image' } },
      { type: 'stat_card', label: 'Stat Card', icon: <LayoutDashboard className="w-4 h-4" />, defaultProps: { label: 'Metric', text: '0' } },
    ],
  },
  {
    title: 'Input',
    items: [
      { type: 'text_input', label: 'Text Input', icon: <FormInput className="w-4 h-4" />, defaultProps: { label: 'Label', placeholder: 'Enter value…' } },
      { type: 'textarea', label: 'Textarea', icon: <AlignLeft className="w-4 h-4" />, defaultProps: { label: 'Label', placeholder: 'Enter text…' } },
      { type: 'select', label: 'Select', icon: <ChevronDown className="w-4 h-4" />, defaultProps: { label: 'Label', placeholder: 'Choose…' } },
      { type: 'checkbox', label: 'Checkbox', icon: <ToggleLeft className="w-4 h-4" />, defaultProps: { label: 'Check this' } },
      { type: 'date_picker', label: 'Date Picker', icon: <Calendar className="w-4 h-4" />, defaultProps: { label: 'Date' } },
      { type: 'file_upload', label: 'File Upload', icon: <Layers className="w-4 h-4" />, defaultProps: { label: 'Upload file' } },
    ],
  },
  {
    title: 'Data',
    items: [
      { type: 'table', label: 'Table', icon: <Table className="w-4 h-4" />, defaultProps: { label: 'Table' } },
      { type: 'card_list', label: 'Card List', icon: <Columns className="w-4 h-4" />, defaultProps: { label: 'Cards' } },
      { type: 'kanban', label: 'Kanban Board', icon: <Columns className="w-4 h-4" />, defaultProps: { label: 'Kanban' } },
      { type: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" />, defaultProps: { label: 'Calendar' } },
      { type: 'chart', label: 'Chart', icon: <BarChart3 className="w-4 h-4" />, defaultProps: { label: 'Chart', chartType: 'bar' } },
    ],
  },
  {
    title: 'Action',
    items: [
      { type: 'button', label: 'Button', icon: <MousePointer className="w-4 h-4" />, defaultProps: { label: 'Click me', action: 'navigate', variant: 'primary' } },
      { type: 'link_button', label: 'Link Button', icon: <Link className="w-4 h-4" />, defaultProps: { label: 'Go to…', href: '/' } },
      { type: 'icon_button', label: 'Icon Button', icon: <Square className="w-4 h-4" />, defaultProps: { label: 'Action' } },
    ],
  },
  {
    title: 'Form',
    items: [
      { type: 'form', label: 'Form', icon: <FormInput className="w-4 h-4" />, defaultProps: { label: 'Form' } },
    ],
  },
];

// ─── Canvas component preview ─────────────────────────────────────────────────

function ComponentPreview({ component, tables }: { component: CanvasComponent; tables: TableMeta[] }) {
  const { type, props } = component;

  switch (type) {
    case 'heading':
      return <h2 className="text-xl font-bold text-gray-800">{props.text || 'Heading'}</h2>;
    case 'text':
      return <p className="text-sm text-gray-600">{props.text || 'Text block'}</p>;
    case 'badge':
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">{props.label || 'Badge'}</span>;
    case 'image':
      return (
        <div className="flex items-center justify-center bg-gray-100 rounded-lg h-24 text-gray-400 text-xs">
          <ImageIcon className="w-6 h-6 mr-2" /> {props.label || 'Image'}
        </div>
      );
    case 'stat_card':
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-xs text-gray-500 font-medium">{props.label || 'Metric'}</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{props.text || '0'}</div>
        </div>
      );
    case 'text_input':
      return (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">{props.label || 'Label'}{props.required && <span className="text-red-500 ml-1">*</span>}</label>
          <input readOnly placeholder={props.placeholder || 'Enter value…'} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-400" />
        </div>
      );
    case 'textarea':
      return (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">{props.label || 'Label'}</label>
          <textarea readOnly placeholder={props.placeholder || 'Enter text…'} rows={3} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-400 resize-none" />
        </div>
      );
    case 'select':
      return (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">{props.label || 'Label'}</label>
          <div className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-400 flex items-center justify-between">
            <span>{props.placeholder || 'Choose…'}</span>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      );
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <div className="w-4 h-4 border border-gray-300 rounded" />
          {props.label || 'Check this'}
        </label>
      );
    case 'date_picker':
      return (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-700">{props.label || 'Date'}</label>
          <div className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-400 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Pick a date…
          </div>
        </div>
      );
    case 'file_upload':
      return (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
          <div className="text-xs text-gray-400">{props.label || 'Upload file'}</div>
        </div>
      );
    case 'table': {
      const tbl = tables.find((t) => t.id === props.tableId);
      return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <Table className="w-3.5 h-3.5" /> {tbl ? tbl.label : (props.label || 'Table')}
          </div>
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-3 py-2 text-xs text-gray-300">Row {i}</div>
            ))}
          </div>
        </div>
      );
    }
    case 'card_list':
      return (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2].map((i) => (
            <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-400">Card {i}</div>
          ))}
        </div>
      );
    case 'kanban':
      return (
        <div className="flex gap-2 overflow-hidden">
          {['To Do', 'In Progress', 'Done'].map((col) => (
            <div key={col} className="flex-1 bg-gray-50 rounded-lg p-2 min-w-0">
              <div className="text-xs font-medium text-gray-500 mb-1.5">{col}</div>
              <div className="bg-white border border-gray-200 rounded p-2 text-xs text-gray-300">Card</div>
            </div>
          ))}
        </div>
      );
    case 'calendar':
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Calendar View</div>
          <div className="grid grid-cols-7 gap-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={`h-${i}`} className="text-center text-xs text-gray-400 font-medium">{d}</div>
            ))}
            {Array.from({ length: 28 }, (_, i) => (
              <div key={i} className="text-center text-xs text-gray-300 py-0.5 rounded hover:bg-gray-200">{i + 1}</div>
            ))}
          </div>
        </div>
      );
    case 'chart':
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 h-24 flex items-end gap-1">
          {[40, 65, 50, 80, 55, 70, 45].map((h, i) => (
            <div key={i} className="flex-1 bg-indigo-200 rounded-t" style={{ height: `${h}%` }} />
          ))}
        </div>
      );
    case 'button':
      return (
        <button type="button" className={cn(
          'px-4 py-2 rounded-lg text-sm font-medium',
          props.variant === 'danger' ? 'bg-red-600 text-white' :
          props.variant === 'secondary' ? 'bg-gray-100 text-gray-700' :
          'bg-indigo-600 text-white'
        )}>
          {props.label || 'Button'}
        </button>
      );
    case 'link_button':
      return (
        <a className="inline-flex items-center gap-1 text-sm text-indigo-600 underline">
          <Link className="w-3.5 h-3.5" /> {props.label || 'Go to…'}
        </a>
      );
    case 'icon_button':
      return (
        <button type="button" className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
          <MousePointer className="w-4 h-4" />
        </button>
      );
    case 'form':
      return (
        <div className="border border-gray-200 rounded-lg p-3">
          <div className="text-xs font-medium text-gray-500 mb-2">{props.label || 'Form'}</div>
          <div className="text-xs text-gray-300 italic">Drop inputs here…</div>
        </div>
      );
    case 'container':
      return (
        <div className="border border-dashed border-gray-300 rounded-lg p-3 min-h-[48px]">
          <div className="text-xs text-gray-300 italic">Container</div>
        </div>
      );
    case 'grid':
      return (
        <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${props.columns || 2}, minmax(0, 1fr))` }}>
          {Array.from({ length: props.columns || 2 }, (_, i) => (
            <div key={i} className="border border-dashed border-gray-300 rounded p-3 min-h-[40px] text-xs text-gray-300 italic">Col {i + 1}</div>
          ))}
        </div>
      );
    case 'stack':
      return (
        <div className="border border-dashed border-gray-300 rounded-lg p-3 space-y-2 min-h-[48px]">
          <div className="text-xs text-gray-300 italic">Stack</div>
        </div>
      );
    case 'divider':
      return <hr className="border-gray-200" />;
    default:
      return <div className="text-xs text-gray-400 italic">{type}</div>;
  }
}

// ─── Property editor ───────────────────────────────────────────────────────────

function PropertyEditor({
  component,
  tables,
  onChange,
}: {
  component: CanvasComponent;
  tables: TableMeta[];
  onChange: (props: ComponentProps) => void;
}) {
  const { type, props } = component;

  const field = (key: keyof ComponentProps, label: string, inputType: string = 'text') => (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      <input
        type={inputType}
        value={String(props[key] ?? '')}
        onChange={(e) => onChange({ ...props, [key]: e.target.value })}
        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>
  );

  const toggle = (key: keyof ComponentProps, label: string) => (
    <label className="flex items-center gap-2 text-xs text-gray-700">
      <input
        type="checkbox"
        checked={Boolean(props[key])}
        onChange={(e) => onChange({ ...props, [key]: e.target.checked })}
        className="rounded"
      />
      {label}
    </label>
  );

  return (
    <div className="space-y-3 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{type.replace(/_/g, ' ')}</div>

      {/* Common: label */}
      {['heading', 'text', 'stat_card', 'badge'].includes(type) && field('text', 'Text')}
      {['text_input', 'textarea', 'select', 'checkbox', 'date_picker', 'file_upload',
        'table', 'card_list', 'kanban', 'calendar', 'chart', 'form', 'stat_card', 'image'].includes(type) && field('label', 'Label')}
      {['text_input', 'textarea', 'select'].includes(type) && field('placeholder', 'Placeholder')}
      {['text_input', 'textarea', 'select', 'checkbox', 'date_picker', 'file_upload'].includes(type) && toggle('required', 'Required')}

      {/* Table: source */}
      {type === 'table' && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600">Table source</label>
          <select
            value={props.tableId ?? ''}
            onChange={(e) => onChange({ ...props, tableId: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">— Select table —</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Button */}
      {['button', 'link_button', 'icon_button'].includes(type) && field('label', 'Label')}
      {type === 'button' && (
        <>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">Action</label>
            <select
              value={props.action ?? 'navigate'}
              onChange={(e) => onChange({ ...props, action: e.target.value as ComponentProps['action'] })}
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="navigate">Navigate</option>
              <option value="submit">Submit form</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">Variant</label>
            <select
              value={props.variant ?? 'primary'}
              onChange={(e) => onChange({ ...props, variant: e.target.value as ComponentProps['variant'] })}
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="danger">Danger</option>
            </select>
          </div>
        </>
      )}
      {['button', 'link_button'].includes(type) && props.action === 'navigate' && field('href', 'URL / Path')}

      {/* Grid */}
      {type === 'grid' && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600">Columns</label>
          <select
            value={props.columns ?? 2}
            onChange={(e) => onChange({ ...props, columns: Number(e.target.value) })}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {/* Chart */}
      {type === 'chart' && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600">Chart type</label>
          <select
            value={props.chartType ?? 'bar'}
            onChange={(e) => onChange({ ...props, chartType: e.target.value as ComponentProps['chartType'] })}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="pie">Pie</option>
          </select>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function PagesBuilderPage() {
  const { appId } = useParams<{ appId: string }>();
  const toaster = useToast();

  // Pages list
  const [pages, setPages] = useState<AppPage[]>([]);
  const [activePage, setActivePage] = useState<AppPage | null>(null);
  const [pagesLoading, setPagesLoading] = useState(true);

  // Canvas
  const [layout, setLayout] = useState<CanvasComponent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Tables for data bindings
  const [tables, setTables] = useState<TableMeta[]>([]);

  // Palette section open/closed
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ Layout: true, Display: true, Input: false, Data: false, Action: false, Form: false });

  // Drag state
  const dragPaletteType = useRef<ComponentType | null>(null);
  const dragCanvasIdx = useRef<number | null>(null);

  // ─── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!appId) return;
    void (async () => {
      try {
        const [pRes, tRes] = await Promise.all([
          fetch(`/api/builder/apps/${appId}/pages`),
          fetch(`/api/builder/apps/${appId}/tables`),
        ]);
        if (pRes.ok) {
          const data = (await pRes.json()) as { pages: AppPage[] };
          setPages(data.pages ?? []);
          if (data.pages?.length) {
            const first = data.pages[0];
            setActivePage(first);
            setLayout(first.layout ?? []);
          }
        }
        if (tRes.ok) {
          const data = (await tRes.json()) as { tables: TableMeta[] };
          setTables(data.tables ?? []);
        }
      } catch {
        // non-fatal
      } finally {
        setPagesLoading(false);
      }
    })();
  }, [appId]);

  // ─── Page management ────────────────────────────────────────────────────────

  const addPage = useCallback(() => {
    const name = `Page ${pages.length + 1}`;
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const newPage: AppPage = { id: genId(), name, slug, layout: [] };
    setPages((prev) => [...prev, newPage]);
    setActivePage(newPage);
    setLayout([]);
    setSelectedId(null);
  }, [pages.length]);

  const switchPage = useCallback((page: AppPage) => {
    // Auto-save current before switching
    setActivePage(page);
    setLayout(page.layout ?? []);
    setSelectedId(null);
  }, []);

  // ─── Canvas drag & drop ─────────────────────────────────────────────────────

  const handlePaletteDragStart = (type: ComponentType) => {
    dragPaletteType.current = type;
    dragCanvasIdx.current = null;
  };

  const handleCanvasDragStart = (idx: number) => {
    dragCanvasIdx.current = idx;
    dragPaletteType.current = null;
  };

  const handleCanvasDrop = (dropIdx: number) => {
    if (dragPaletteType.current) {
      // Adding from palette
      const palette = PALETTE_SECTIONS.flatMap((s) => s.items).find((i) => i.type === dragPaletteType.current);
      if (!palette) return;
      const newComp: CanvasComponent = { id: genId(), type: dragPaletteType.current, props: { ...palette.defaultProps } };
      setLayout((prev) => {
        const next = [...prev];
        next.splice(dropIdx, 0, newComp);
        return next;
      });
      setSelectedId(newComp.id);
    } else if (dragCanvasIdx.current !== null && dragCanvasIdx.current !== dropIdx) {
      // Reordering
      setLayout((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragCanvasIdx.current!, 1);
        const targetIdx = dragCanvasIdx.current! < dropIdx ? dropIdx - 1 : dropIdx;
        next.splice(targetIdx, 0, moved);
        return next;
      });
    }
    dragPaletteType.current = null;
    dragCanvasIdx.current = null;
    setDragOverIdx(null);
  };

  const removeComponent = useCallback((id: string) => {
    setLayout((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const updateProps = useCallback((id: string, props: ComponentProps) => {
    setLayout((prev) => prev.map((c) => c.id === id ? { ...c, props } : c));
  }, []);

  // Keyboard delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
        removeComponent(selectedId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, removeComponent]);

  // ─── Save ───────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!activePage || !appId) return;
    setSaving(true);
    try {
      const updatedPage = { ...activePage, layout };
      const res = await fetch(`/api/builder/apps/${appId}/pages`, {
        method: activePage.id.length < 20 ? 'POST' : 'PUT', // temp IDs are short
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPage),
      });
      if (res.ok) {
        const data = (await res.json()) as { page: AppPage };
        const saved = data.page ?? updatedPage;
        setPages((prev) => prev.map((p) => p.id === activePage.id ? saved : p));
        setActivePage(saved);
        toaster.success('Page saved');
      } else {
        toaster.error('Save failed');
      }
    } catch {
      toaster.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ─── Selected component ──────────────────────────────────────────────────────

  const selectedComponent = layout.find((c) => c.id === selectedId) ?? null;

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (pagesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">Pages</span>
          {activePage && (
            <>
              <span className="text-gray-300">/</span>
              <span className="text-sm text-gray-600">{activePage.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewMode((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            {previewMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {previewMode ? 'Edit' : 'Preview'}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !activePage}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg"
          >
            {saving ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left panel: pages list + palette */}
        {!previewMode && (
          <div className="w-56 bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0">

            {/* Pages list */}
            <div className="border-b border-gray-200">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pages</span>
                <button
                  type="button"
                  onClick={addPage}
                  className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  title="Add page"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {pages.length === 0 && (
                <div className="px-3 pb-3 text-xs text-gray-400 italic">No pages yet</div>
              )}
              {pages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => switchPage(page)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs border-b border-gray-100 hover:bg-gray-50 transition-colors',
                    activePage?.id === page.id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <LayoutDashboard className="w-3 h-3 shrink-0" />
                    <span className="truncate">{page.name}</span>
                  </div>
                  <div className="text-gray-400 text-[10px] mt-0.5 pl-4">/{page.slug}</div>
                </button>
              ))}
            </div>

            {/* Component palette */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                Components
              </div>
              {PALETTE_SECTIONS.map((section) => (
                <div key={section.title}>
                  <button
                    type="button"
                    onClick={() => setOpenSections((prev) => ({ ...prev, [section.title]: !prev[section.title] }))}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    {section.title}
                    {openSections[section.title] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                  {openSections[section.title] && (
                    <div className="pb-1">
                      {section.items.map((item) => (
                        <div
                          key={item.type}
                          draggable
                          onDragStart={() => handlePaletteDragStart(item.type)}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-grab active:cursor-grabbing select-none"
                        >
                          <span className="text-gray-400">{item.icon}</span>
                          {item.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Center: canvas */}
        <div
          className="flex-1 overflow-y-auto p-6"
          onDragOver={(e) => { e.preventDefault(); }}
          onClick={() => setSelectedId(null)}
        >
          {!activePage ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <LayoutDashboard className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 font-medium">No page selected</p>
              <p className="text-xs text-gray-400 mt-1">Add a page from the left panel to start building</p>
              <button
                type="button"
                onClick={addPage}
                className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                <Plus className="w-4 h-4" /> Add first page
              </button>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              {/* Drop zone at top */}
              {!previewMode && (
                <div
                  className={cn(
                    'h-8 rounded-lg border-2 border-dashed mb-2 transition-colors',
                    dragOverIdx === 0 ? 'border-indigo-400 bg-indigo-50' : 'border-transparent'
                  )}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(0); }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={(e) => { e.stopPropagation(); handleCanvasDrop(0); }}
                />
              )}

              {layout.length === 0 && (
                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl p-16 text-center"
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(0); }}
                  onDrop={(e) => { e.stopPropagation(); handleCanvasDrop(0); }}
                >
                  <Layers className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Drag components here to build your page</p>
                </div>
              )}

              {layout.map((comp, idx) => (
                <React.Fragment key={comp.id}>
                  <div
                    draggable={!previewMode}
                    onDragStart={() => handleCanvasDragStart(idx)}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(comp.id); }}
                    className={cn(
                      'relative group rounded-lg p-3 mb-1 transition-all',
                      !previewMode && 'cursor-pointer hover:outline hover:outline-2 hover:outline-indigo-200',
                      selectedId === comp.id && !previewMode ? 'outline outline-2 outline-indigo-500 bg-white shadow-sm' : 'bg-transparent',
                    )}
                  >
                    {!previewMode && (
                      <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 cursor-grab">
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}
                    {!previewMode && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeComponent(comp.id); }}
                        className="absolute -right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <ComponentPreview component={comp} tables={tables} />
                  </div>

                  {/* Drop zone between components */}
                  {!previewMode && (
                    <div
                      className={cn(
                        'h-6 rounded-lg border-2 border-dashed mb-1 transition-colors',
                        dragOverIdx === idx + 1 ? 'border-indigo-400 bg-indigo-50' : 'border-transparent hover:border-gray-200'
                      )}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx + 1); }}
                      onDragLeave={() => setDragOverIdx(null)}
                      onDrop={(e) => { e.stopPropagation(); handleCanvasDrop(idx + 1); }}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Right panel: property editor */}
        {!previewMode && selectedComponent && (
          <div className="w-56 bg-white border-l border-gray-200 overflow-y-auto shrink-0">
            <div className="px-4 py-2.5 border-b border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Properties</span>
            </div>
            <PropertyEditor
              component={selectedComponent}
              tables={tables}
              onChange={(props) => updateProps(selectedComponent.id, props)}
            />
          </div>
        )}

        {/* Right panel placeholder when nothing selected */}
        {!previewMode && !selectedComponent && activePage && (
          <div className="w-56 bg-white border-l border-gray-200 flex items-center justify-center shrink-0">
            <div className="text-center px-4">
              <MousePointer className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Click a component to edit its properties</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
