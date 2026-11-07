'use client';

import React, { useState } from 'react';
import { useDrag } from 'react-dnd';
import { cn } from '@/lib/utils';
import {
  Square, Type, Image, Star, Badge, Activity, Table, List, Grid,
  Calendar, Clock, BarChart2, TrendingUp, PieChart, TrendingDown,
  FormInput, TextCursor, ChevronDown, CheckSquare, ToggleLeft,
  Camera, Scan, PenLine, MapPin,
  FileCode, Printer, QrCode, Minus, Layers, Maximize, ChevronRight,
  LucideIcon,
} from 'lucide-react';
import {
  DND_TYPE_PALETTE,
  PaletteEntry,
  PaletteGroup,
  PaletteDragItem,
} from '@/platform/ui/canvas/types';

const PALETTE: PaletteEntry[] = [
  // Layout
  { type: 'container',      label: 'Container',       icon: 'Square',       group: 'Layout',  defaultProps: { padding: 16 },              defaultColSpan: 12 },
  { type: 'tabs',           label: 'Tabs',             icon: 'Layers',       group: 'Layout',  defaultProps: { tabs: ['Tab 1','Tab 2'] }, defaultColSpan: 12 },
  { type: 'accordion',      label: 'Accordion',        icon: 'ChevronRight', group: 'Layout',  defaultProps: { title: 'Section' },         defaultColSpan: 12 },
  { type: 'modal',          label: 'Modal Trigger',    icon: 'Maximize',     group: 'Layout',  defaultProps: { label: 'Open Modal' },      defaultColSpan: 3  },
  { type: 'divider',        label: 'Divider',          icon: 'Minus',        group: 'Layout',  defaultProps: {},                            defaultColSpan: 12 },
  // Display
  { type: 'text',           label: 'Text',             icon: 'Type',         group: 'Display', defaultProps: { text: 'Text block' },       defaultColSpan: 6  },
  { type: 'heading',        label: 'Heading',          icon: 'Type',         group: 'Display', defaultProps: { text: 'Heading', level: 2 },defaultColSpan: 12 },
  { type: 'image',          label: 'Image',            icon: 'Image',        group: 'Display', defaultProps: { src: '', alt: '' },         defaultColSpan: 6  },
  { type: 'icon',           label: 'Icon',             icon: 'Star',         group: 'Display', defaultProps: { name: 'Star', size: 24 },   defaultColSpan: 1  },
  { type: 'badge',          label: 'Badge',            icon: 'Badge',        group: 'Display', defaultProps: { text: 'Badge' },            defaultColSpan: 2  },
  { type: 'card',           label: 'Card',             icon: 'Square',       group: 'Display', defaultProps: { title: 'Card title' },      defaultColSpan: 4  },
  { type: 'status_pill',    label: 'Status Pill',      icon: 'Activity',     group: 'Display', defaultProps: { label: 'Active' },          defaultColSpan: 2  },
  // Data
  { type: 'table',          label: 'Table',            icon: 'Table',        group: 'Data',    defaultProps: { pageSize: 10 },             defaultColSpan: 12 },
  { type: 'list',           label: 'List / Repeater',  icon: 'List',         group: 'Data',    defaultProps: {},                            defaultColSpan: 6  },
  { type: 'cards',          label: 'Cards Grid',       icon: 'Grid',         group: 'Data',    defaultProps: { columns: 3 },               defaultColSpan: 12 },
  { type: 'kanban',         label: 'Kanban',           icon: 'Grid',         group: 'Data',    defaultProps: { statusField: '' },          defaultColSpan: 12 },
  { type: 'calendar',       label: 'Calendar',         icon: 'Calendar',     group: 'Data',    defaultProps: { view: 'month' },            defaultColSpan: 12 },
  { type: 'timeline',       label: 'Timeline',         icon: 'Clock',        group: 'Data',    defaultProps: {},                            defaultColSpan: 12 },
  { type: 'chart_bar',      label: 'Bar Chart',        icon: 'BarChart2',    group: 'Data',    defaultProps: { title: 'Chart' },           defaultColSpan: 6  },
  { type: 'chart_line',     label: 'Line Chart',       icon: 'TrendingUp',   group: 'Data',    defaultProps: { title: 'Chart' },           defaultColSpan: 6  },
  { type: 'chart_pie',      label: 'Pie Chart',        icon: 'PieChart',     group: 'Data',    defaultProps: { title: 'Chart' },           defaultColSpan: 6  },
  { type: 'kpi',            label: 'KPI / Stat',       icon: 'TrendingDown', group: 'Data',    defaultProps: { label: 'Metric', value: '0' }, defaultColSpan: 3 },
  // Input
  { type: 'form',           label: 'Form',             icon: 'FormInput',    group: 'Input',   defaultProps: {},                            defaultColSpan: 12 },
  { type: 'button',         label: 'Button',           icon: 'Square',       group: 'Input',   defaultProps: { label: 'Click me' },        defaultColSpan: 2  },
  { type: 'field_input',    label: 'Text Input',       icon: 'TextCursor',   group: 'Input',   defaultProps: { label: 'Label' },           defaultColSpan: 6  },
  { type: 'select',         label: 'Select',           icon: 'ChevronDown',  group: 'Input',   defaultProps: { label: 'Select' },          defaultColSpan: 6  },
  { type: 'date_picker',    label: 'Date Picker',      icon: 'Calendar',     group: 'Input',   defaultProps: { label: 'Date' },            defaultColSpan: 4  },
  { type: 'checkbox',       label: 'Checkbox',         icon: 'CheckSquare',  group: 'Input',   defaultProps: { label: 'Check me' },        defaultColSpan: 3  },
  { type: 'switch',         label: 'Switch',           icon: 'ToggleLeft',   group: 'Input',   defaultProps: { label: 'Toggle' },          defaultColSpan: 3  },
  // Capture
  { type: 'photo_capture',  label: 'Camera',           icon: 'Camera',       group: 'Capture', defaultProps: {},                            defaultColSpan: 6  },
  { type: 'barcode_scanner',label: 'Barcode Scanner',  icon: 'Scan',         group: 'Capture', defaultProps: {},                            defaultColSpan: 6  },
  { type: 'signature_pad',  label: 'Signature',        icon: 'PenLine',      group: 'Capture', defaultProps: { label: 'Sign here' },       defaultColSpan: 6  },
  { type: 'gps_capture',    label: 'GPS',              icon: 'MapPin',       group: 'Capture', defaultProps: {},                            defaultColSpan: 4  },
  // Document
  { type: 'pdf_viewer',     label: 'PDF Viewer',       icon: 'FileCode',     group: 'Document',defaultProps: {},                            defaultColSpan: 12 },
  { type: 'print_button',   label: 'Print Button',     icon: 'Printer',      group: 'Document',defaultProps: { label: 'Print' },           defaultColSpan: 2  },
  { type: 'label_print',    label: 'QR Label',         icon: 'QrCode',       group: 'Document',defaultProps: {},                            defaultColSpan: 3  },
];

const GROUPS: PaletteGroup[] = ['Layout', 'Display', 'Data', 'Input', 'Capture', 'Document'];

const ICON_MAP: Record<string, LucideIcon> = {
  Square, Type, Image, Star, Badge, Activity, Table, List, Grid,
  Calendar, Clock, BarChart2, TrendingUp, PieChart, TrendingDown,
  FormInput, TextCursor, ChevronDown, CheckSquare, ToggleLeft,
  Camera, Scan, PenLine, MapPin, FileCode, Printer, QrCode,
  Minus, Layers, Maximize, ChevronRight,
};

function PaletteIcon({ name }: { name: string }) {
  const Comp = ICON_MAP[name] ?? Square;
  return <Comp size={14} />;
}

function PaletteItem({ entry }: { entry: PaletteEntry }) {
  const [{ isDragging }, drag] = useDrag<PaletteDragItem, void, { isDragging: boolean }>({
    type: DND_TYPE_PALETTE,
    item: { kind: DND_TYPE_PALETTE, entry },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  return (
    <div
      ref={drag as unknown as React.Ref<HTMLDivElement>}
      title={entry.label}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 rounded cursor-grab text-xs',
        'border border-transparent hover:border-blue-300 hover:bg-blue-50',
        'dark:hover:border-blue-700 dark:hover:bg-blue-950',
        'select-none transition-colors',
        isDragging && 'opacity-40 cursor-grabbing',
      )}
    >
      <span className="text-slate-500 dark:text-slate-400 shrink-0">
        <PaletteIcon name={entry.icon} />
      </span>
      <span className="truncate text-slate-700 dark:text-slate-200">{entry.label}</span>
    </div>
  );
}

export function ComponentPalette() {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = search
    ? PALETTE.filter((e) => e.label.toLowerCase().includes(search.toLowerCase()))
    : PALETTE;

  const toggle = (group: string) =>
    setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }));

  return (
    <aside className="w-[200px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col overflow-y-auto">
      <div className="p-2 border-b border-slate-200 dark:border-slate-800">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {search ? (
          <div className="px-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 p-2">No components found</p>
            ) : (
              filtered.map((e) => <PaletteItem key={e.type} entry={e} />)
            )}
          </div>
        ) : (
          GROUPS.map((group) => {
            const items = PALETTE.filter((e) => e.group === group);
            if (items.length === 0) return null;
            const isCollapsed = collapsed[group];
            return (
              <div key={group} className="mb-0.5">
                <button
                  onClick={() => toggle(group)}
                  className="flex items-center gap-1 w-full px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hover:text-slate-700"
                >
                  <ChevronRight size={12} className={cn('transition-transform', !isCollapsed && 'rotate-90')} />
                  {group}
                </button>
                {!isCollapsed && (
                  <div className="px-1">
                    {items.map((e) => <PaletteItem key={e.type} entry={e} />)}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

export { PALETTE };
export type { PaletteEntry };
