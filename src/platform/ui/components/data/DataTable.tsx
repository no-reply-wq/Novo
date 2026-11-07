'use client';

import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type ExpandedState,
  type RowSelectionState,
  type ColumnOrderState,
  type ColumnSizingState,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';

export type Row = Record<string, unknown>;

export interface SavedView {
  id: string;
  name: string;
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
}

export interface BulkAction {
  label: string;
  icon?: string;
  onClick: (selectedRows: Row[]) => void;
}

export interface DataTableProps {
  columns: ColumnDef<Row>[];
  data: Row[];
  loading?: boolean;
  pageSize?: number;
  serverSideTotal?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: Row) => void;
  expandedContent?: (row: Row) => React.ReactNode;
  bulkActions?: BulkAction[];
  onInlineEdit?: (rowId: string, field: string, value: unknown) => Promise<void>;
  savedViews?: SavedView[];
  onSavedViewChange?: (views: SavedView[]) => void;
  totals?: Record<string, 'sum' | 'avg' | 'count'>;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
}

function exportCsv(headers: string[], rows: Row[]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'export.csv'; a.click();
  URL.revokeObjectURL(url);
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-[var(--border)]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <div className="h-3 w-full animate-pulse rounded bg-[var(--surface-2)]" />
        </td>
      ))}
    </tr>
  );
}

interface EditCellProps {
  value: unknown;
  onSave: (v: unknown) => void;
  onCancel: () => void;
}

function EditCell({ value, onSave, onCancel }: EditCellProps) {
  const [val, setVal] = useState(String(value ?? ''));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const isNumber = typeof value === 'number';
  return (
    <input
      ref={ref}
      type={isNumber ? 'number' : 'text'}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onSave(isNumber ? Number(val) : val)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave(isNumber ? Number(val) : val);
        if (e.key === 'Escape') onCancel();
      }}
      className="w-full rounded border border-[var(--accent)] bg-[var(--surface)] px-1 py-0.5 text-xs outline-none"
    />
  );
}

export function DataTable({
  columns,
  data,
  loading = false,
  pageSize = 20,
  serverSideTotal,
  onPageChange,
  onRowClick,
  expandedContent,
  bulkActions = [],
  onInlineEdit,
  savedViews: externalSavedViews,
  onSavedViewChange,
  totals,
  emptyMessage = 'No data to display.',
  emptyAction,
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [savedViews, setSavedViews] = useState<SavedView[]>(externalSavedViews ?? []);
  const [newViewName, setNewViewName] = useState('');
  const [showViewPanel, setShowViewPanel] = useState(false);
  const [showColPanel, setShowColPanel] = useState(false);
  const dragCol = useRef<string | null>(null);

  const enhancedColumns = useMemo<ColumnDef<Row>[]>(() => {
    const base: ColumnDef<Row>[] = [];
    if (bulkActions.length > 0) {
      base.push({
        id: '__select', size: 36,
        header: ({ table }) => (
          <input type="checkbox" checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()} className="cursor-pointer" aria-label="Select all" />
        ),
        cell: ({ row }) => (
          <input type="checkbox" checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()} onClick={(e) => e.stopPropagation()} className="cursor-pointer" aria-label="Select row" />
        ),
        enableSorting: false, enableResizing: false,
      });
    }
    if (expandedContent) {
      base.push({
        id: '__expand', size: 32,
        header: () => null,
        cell: ({ row }) => (
          <button onClick={(e) => { e.stopPropagation(); row.toggleExpanded(); }}
            className="text-xs text-[var(--muted)] hover:text-[var(--fg)]" aria-label={row.getIsExpanded() ? 'Collapse' : 'Expand'}>
            {row.getIsExpanded() ? '▾' : '▸'}
          </button>
        ),
        enableSorting: false, enableResizing: false,
      });
    }
    return [...base, ...columns];
  }, [columns, bulkActions.length, expandedContent]);

  const isServerSide = serverSideTotal !== undefined;

  const table = useReactTable<Row>({
    data, columns: enhancedColumns,
    state: { sorting, columnFilters, columnVisibility, expanded, rowSelection, columnOrder, columnSizing, pagination: { pageIndex: 0, pageSize } },
    enableRowSelection: bulkActions.length > 0,
    enableMultiSort: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    manualPagination: isServerSide,
    rowCount: isServerSide ? serverSideTotal : undefined,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => !!expandedContent,
  });

  const { rows } = table.getRowModel();

  const selectedRows = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowSelection, data],
  );

  const totalsRow = useMemo(() => {
    if (!totals) return null;
    const result: Record<string, string> = {};
    const allRows = table.getFilteredRowModel().rows;
    for (const [field, op] of Object.entries(totals)) {
      const nums = allRows.map((r) => Number(r.original[field] ?? 0)).filter(isFinite);
      if (op === 'sum') result[field] = nums.reduce((a, b) => a + b, 0).toLocaleString();
      else if (op === 'avg') result[field] = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '0';
      else result[field] = String(nums.length);
    }
    return result;
  }, [totals, table]);

  const applyView = useCallback((view: SavedView) => {
    setSorting(view.sorting);
    setColumnFilters(view.columnFilters);
    setColumnVisibility(view.columnVisibility);
  }, []);

  const saveCurrentView = useCallback(() => {
    if (!newViewName.trim()) return;
    const view: SavedView = { id: Date.now().toString(), name: newViewName.trim(), sorting, columnFilters, columnVisibility };
    const next = [...savedViews, view];
    setSavedViews(next); onSavedViewChange?.(next); setNewViewName('');
  }, [newViewName, sorting, columnFilters, columnVisibility, savedViews, onSavedViewChange]);

  const deleteView = useCallback((id: string) => {
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next); onSavedViewChange?.(next);
  }, [savedViews, onSavedViewChange]);

  const handleDragStart = (colId: string) => { dragCol.current = colId; };
  const handleDrop = (targetColId: string) => {
    if (!dragCol.current || dragCol.current === targetColId) return;
    const order = table.getAllLeafColumns().map((c) => c.id);
    const from = order.indexOf(dragCol.current);
    const to = order.indexOf(targetColId);
    if (from < 0 || to < 0) return;
    const newOrder = [...order];
    newOrder.splice(from, 1); newOrder.splice(to, 0, dragCol.current!);
    setColumnOrder(newOrder); dragCol.current = null;
  };

  const visibleCols = table.getVisibleLeafColumns();
  const headerGroups = table.getHeaderGroups();
  const { pageIndex } = table.getState().pagination;
  const pageCount = isServerSide ? Math.ceil((serverSideTotal ?? 0) / pageSize) : table.getPageCount();

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="relative">
          <button onClick={() => { setShowViewPanel(!showViewPanel); setShowColPanel(false); }}
            className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs hover:bg-[var(--surface-3)]">
            Views {savedViews.length > 0 && `(${savedViews.length})`}
          </button>
          {showViewPanel && (
            <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
              {savedViews.map((v) => (
                <div key={v.id} className="flex items-center gap-1 py-0.5">
                  <button onClick={() => { applyView(v); setShowViewPanel(false); }} className="flex-1 text-left text-xs hover:text-[var(--accent)]">{v.name}</button>
                  <button onClick={() => deleteView(v.id)} className="text-xs text-[var(--muted)] hover:text-red-500">×</button>
                </div>
              ))}
              <div className="mt-1 flex gap-1 border-t border-[var(--border)] pt-1">
                <input value={newViewName} onChange={(e) => setNewViewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCurrentView()}
                  placeholder="View name…" className="flex-1 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 py-0.5 text-xs outline-none" />
                <button onClick={saveCurrentView} className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-xs text-white hover:bg-[var(--accent-hover)]">Save</button>
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => { setShowColPanel(!showColPanel); setShowViewPanel(false); }}
            className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs hover:bg-[var(--surface-3)]">
            Columns
          </button>
          {showColPanel && (
            <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
              {table.getAllLeafColumns().filter((c) => c.id !== '__select' && c.id !== '__expand').map((col) => (
                <label key={col.id} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-xs">
                  <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} />
                  {String(col.columnDef.header ?? col.id)}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">{table.getFilteredRowModel().rows.length} rows</span>
          <button onClick={() => {
            const headers = visibleCols.filter((c) => c.id !== '__select' && c.id !== '__expand').map((c) => c.id);
            exportCsv(headers, table.getFilteredRowModel().rows.map((r) => r.original));
          }} className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs hover:bg-[var(--surface-3)]">
            Export CSV
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedRows.length > 0 && bulkActions.length > 0 && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--accent)]/10 px-3 py-1.5">
          <span className="text-xs font-medium text-[var(--accent)]">{selectedRows.length} selected</span>
          {bulkActions.map((action, i) => (
            <button key={i} onClick={() => { action.onClick(selectedRows); setRowSelection({}); }}
              className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs text-white hover:bg-[var(--accent-hover)]">
              {action.icon && <span className="mr-1">{action.icon}</span>}{action.label}
            </button>
          ))}
        </div>
      )}

      {/* Table scroll area */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed', width: table.getTotalSize() || '100%' }}>
          <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
            {headerGroups.map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const col = header.column;
                  const canSort = col.getCanSort();
                  const sorted = col.getIsSorted();
                  return (
                    <th key={header.id} style={{ width: header.getSize() }}
                      className="relative border-b border-[var(--border)] px-3 py-2 text-left text-xs font-semibold text-[var(--muted)] select-none"
                      draggable onDragStart={() => handleDragStart(col.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(col.id)}>
                      <div className="flex flex-col gap-0.5">
                        <button onClick={canSort ? col.getToggleSortingHandler() : undefined}
                          className={cn('flex items-center gap-1 text-left', canSort && 'cursor-pointer hover:text-[var(--fg)]')}>
                          {header.isPlaceholder ? null : flexRender(col.columnDef.header, header.getContext())}
                          {sorted === 'asc' && <span>↑</span>}
                          {sorted === 'desc' && <span>↓</span>}
                        </button>
                        {col.getCanFilter() && col.id !== '__select' && col.id !== '__expand' && (
                          <input value={(col.getFilterValue() as string) ?? ''} onChange={(e) => col.setFilterValue(e.target.value || undefined)}
                            placeholder="Filter…" onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 h-5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-1 text-xs font-normal text-[var(--fg)] outline-none focus:border-[var(--accent)]" />
                        )}
                      </div>
                      <div onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()}
                        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-[var(--accent)]" />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} cols={visibleCols.length} />)
              : rows.length === 0
              ? (
                <tr>
                  <td colSpan={visibleCols.length} className="py-16 text-center">
                    <p className="text-sm text-[var(--muted)]">{emptyMessage}</p>
                    {emptyAction && (
                      <button onClick={emptyAction.onClick} className="mt-2 rounded bg-[var(--accent)] px-3 py-1 text-xs text-white">{emptyAction.label}</button>
                    )}
                  </td>
                </tr>
              )
              : rows.map((row) => (
                <React.Fragment key={row.id}>
                  <tr onClick={() => onRowClick?.(row.original)}
                    className={cn('border-b border-[var(--border)] transition-colors', onRowClick && 'cursor-pointer hover:bg-[var(--surface-2)]', row.getIsSelected() && 'bg-[var(--accent)]/5')}>
                    {row.getVisibleCells().map((cell) => {
                      const isEditing = editingCell?.rowId === row.id && editingCell?.field === cell.column.id;
                      const canEdit = !!onInlineEdit && cell.column.id !== '__select' && cell.column.id !== '__expand';
                      return (
                        <td key={cell.id} style={{ width: cell.column.getSize() }}
                          className="max-w-xs truncate px-3 py-1.5 text-xs text-[var(--fg)]"
                          onDoubleClick={() => { if (canEdit) setEditingCell({ rowId: row.id, field: cell.column.id }); }}>
                          {isEditing ? (
                            <EditCell value={row.original[cell.column.id]} onSave={async (v) => { await onInlineEdit?.(row.id, cell.column.id, v); setEditingCell(null); }} onCancel={() => setEditingCell(null)} />
                          ) : (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {row.getIsExpanded() && expandedContent && (
                    <tr className="bg-[var(--surface-2)]">
                      <td colSpan={visibleCols.length} className="p-3">{expandedContent(row.original)}</td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
          </tbody>
          {totalsRow && (
            <tfoot className="sticky bottom-0 bg-[var(--surface-2)]">
              <tr className="border-t-2 border-[var(--border)]">
                {visibleCols.map((col) => (
                  <td key={col.id} className="px-3 py-1.5 text-xs font-semibold text-[var(--fg)]">{totalsRow[col.id] ?? ''}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
          <button onClick={() => { table.previousPage(); onPageChange?.(pageIndex - 1); }}
            disabled={!table.getCanPreviousPage()} className="rounded px-2 py-0.5 hover:bg-[var(--surface-2)] disabled:opacity-40">← Prev</button>
          <span>Page {pageIndex + 1} of {pageCount}</span>
          <button onClick={() => { table.nextPage(); onPageChange?.(pageIndex + 1); }}
            disabled={!table.getCanNextPage()} className="rounded px-2 py-0.5 hover:bg-[var(--surface-2)] disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
