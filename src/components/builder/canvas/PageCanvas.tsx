'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import { GripVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ComponentInstance, CanvasPage, PaletteDragItem, CanvasDragItem,
  DND_TYPE_PALETTE, DND_TYPE_CANVAS, PaletteEntry,
} from '@/platform/ui/canvas/types';
import { PALETTE } from './ComponentPalette';

const uid = () => crypto.randomUUID();

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function entryForType(type: string): PaletteEntry | undefined { return PALETTE.find((e) => e.type === type); }

function makeInstance(entry: PaletteEntry, col: number, row: number): ComponentInstance {
  return {
    id: uid(), type: entry.type,
    layout: { col: clamp(col, 0, 11), row, colSpan: clamp(entry.defaultColSpan, 1, 12 - col), rowSpan: 1 },
    props: { ...entry.defaultProps }, bindings: {}, events: {},
  };
}

function ComponentPreview({ type }: { type: string }) {
  const entry = entryForType(type);
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[48px] text-slate-400 dark:text-slate-500 select-none pointer-events-none">
      <span className="text-[10px] font-semibold uppercase tracking-widest">{entry?.label ?? type}</span>
    </div>
  );
}

function CanvasCell({ component, selected, onSelect, onDelete }: {
  component: ComponentInstance; selected: boolean; onSelect: () => void; onDelete: () => void;
}) {
  const { layout } = component;
  const col = layout.col ?? 0; const row = layout.row ?? 0;
  const colSpan = layout.colSpan ?? 1; const rowSpan = layout.rowSpan ?? 1;

  const [{ isDragging }, drag, preview] = useDrag<CanvasDragItem, void, { isDragging: boolean }>({
    type: DND_TYPE_CANVAS,
    item: { kind: DND_TYPE_CANVAS, id: component.id, col, row, colSpan, rowSpan },
    collect: (m) => ({ isDragging: m.isDragging() }),
  });

  return (
    <div
      ref={preview as unknown as React.Ref<HTMLDivElement>}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onKeyDown={(e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); onDelete(); } }}
      style={{ gridColumn: `${col + 1} / span ${colSpan}`, gridRow: `${row + 1} / span ${rowSpan}` }}
      className={cn('relative group rounded border-2 transition-colors cursor-pointer focus:outline-none',
        selected ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 shadow-sm'
          : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-900',
        isDragging && 'opacity-30')}
    >
      <div ref={drag as unknown as React.Ref<HTMLDivElement>}
        className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab p-0.5 rounded bg-white dark:bg-slate-800 shadow z-10">
        <GripVertical size={12} className="text-slate-400" />
      </div>
      {selected && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-1 right-1 p-0.5 rounded bg-white dark:bg-slate-800 shadow z-10 hover:text-red-500 text-slate-400">
          <Trash2 size={12} />
        </button>
      )}
      {selected && (
        <>
          <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-blue-500 z-10" />
          <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 z-10" />
          <div className="absolute -bottom-1 -left-1 w-2 h-2 rounded-full bg-blue-500 z-10" />
          <div className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-blue-500 z-10" />
        </>
      )}
      <ComponentPreview type={component.type} />
    </div>
  );
}

function DropZoneCell({ col, row, onDrop }: { col: number; row: number; onDrop: (item: PaletteDragItem | CanvasDragItem, col: number, row: number) => void }) {
  const [{ isOver, canDrop }, drop] = useDrop<PaletteDragItem | CanvasDragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: [DND_TYPE_PALETTE, DND_TYPE_CANVAS],
    drop: (item) => onDrop(item, col, row),
    collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
  });
  return (
    <div ref={drop as unknown as React.Ref<HTMLDivElement>}
      style={{ gridColumn: `${col + 1} / span 1`, gridRow: `${row + 1} / span 1` }}
      className={cn('rounded border-2 border-dashed transition-colors min-h-[40px]',
        isOver && canDrop ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-800')} />
  );
}

export interface PageCanvasProps {
  page: CanvasPage;
  onChange: (page: CanvasPage) => void;
  selectedId: string | null;
  onSelectComponent: (id: string | null) => void;
}

export function PageCanvas({ page, onChange, selectedId, onSelectComponent }: PageCanvasProps) {
  const COLS = 12;
  const rows = Math.max(4, ...page.components.map((c) => (c.layout.row ?? 0) + (c.layout.rowSpan ?? 1))) + 2;
  const [isDraggingAny, setIsDraggingAny] = useState(false);

  const addComponent = useCallback((entry: PaletteEntry, col: number, row: number) => {
    onChange({ ...page, components: [...page.components, makeInstance(entry, col, row)] });
  }, [page, onChange]);

  const moveComponent = useCallback((id: string, col: number, row: number) => {
    onChange({ ...page, components: page.components.map((c) => c.id !== id ? c : { ...c, layout: { ...c.layout, col, row } }) });
  }, [page, onChange]);

  const deleteComponent = useCallback((id: string) => {
    onChange({ ...page, components: page.components.filter((c) => c.id !== id) });
    if (selectedId === id) onSelectComponent(null);
  }, [page, onChange, selectedId, onSelectComponent]);

  const handleDrop = useCallback((item: PaletteDragItem | CanvasDragItem, col: number, row: number) => {
    if (item.kind === DND_TYPE_PALETTE) addComponent(item.entry, col, row);
    else moveComponent(item.id, col, row);
  }, [addComponent, moveComponent]);

  const [, canvasDrop] = useDrop<PaletteDragItem | CanvasDragItem, void, void>({
    accept: [DND_TYPE_PALETTE, DND_TYPE_CANVAS],
    drop: () => undefined,
    hover: () => setIsDraggingAny(true),
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
        deleteComponent(selectedId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, deleteComponent]);

  return (
    <div ref={canvasDrop as unknown as React.Ref<HTMLDivElement>} onClick={() => onSelectComponent(null)} onDragLeave={() => setIsDraggingAny(false)}
      className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 p-4">
      <div
        style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(60px, auto))`, gap: '8px', minWidth: '800px' }}
        className="relative bg-white dark:bg-slate-950 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 p-3">
        {isDraggingAny && Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: COLS }).map((_, c) => (
            <DropZoneCell key={`dz-${c}-${r}`} col={c} row={r} onDrop={handleDrop} />
          ))
        )}
        {page.components.map((comp) => (
          <CanvasCell key={comp.id} component={comp}
            selected={selectedId === comp.id}
            onSelect={() => onSelectComponent(comp.id)}
            onDelete={() => deleteComponent(comp.id)} />
        ))}
        {page.components.length === 0 && !isDraggingAny && (
          <div style={{ gridColumn: '1 / span 12', gridRow: '1 / span 3' }}
            className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 py-12 select-none">
            <p className="text-sm font-medium mb-1">Drag components here</p>
            <p className="text-xs">Use the palette on the left to add components to the page</p>
          </div>
        )}
      </div>
    </div>
  );
}
