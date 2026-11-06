'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { ChildTableConfig } from '@/platform/data/child-tables';
import type { RecordWithChildren, ChildGroup } from '@/platform/data/nested-fetcher';
import type { ChildRowInput, ChildGroupInput } from '@/platform/data/nested-saver';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ColumnDef {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'checkbox';
  readOnly?: boolean;
}

export interface NestedChildTableProps {
  /** Config for the child table(s) attached to this parent */
  childGroups: ChildGroup[];
  /** Column definitions per child tableId */
  columnDefs: Record<string, ColumnDef[]>;
  /** Called when user edits; parent can lift state up */
  onChange?: (groups: ChildGroupInput[]) => void;
  /** Display mode: tabs = one tab per child table, stack = all stacked */
  displayMode?: 'tabs' | 'stack';
  /** Depth limit for grandchild expansion (0 = no grandchildren shown) */
  grandchildDepthLimit?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyRow(config: ChildTableConfig, cols: ColumnDef[]): ChildRowInput {
  const data: Record<string, unknown> = {};
  for (const col of cols) {
    data[col.key] = col.type === 'checkbox' ? false : col.type === 'number' ? 0 : '';
  }
  return { data, children: [] };
}

function recordToInput(record: RecordWithChildren): ChildRowInput {
  return {
    id: record.id,
    data: { ...record.data },
    children: record.children.map((g) => ({
      config: g.config,
      rows: g.rows.map(recordToInput),
    })),
  };
}

// ─── Single child group editor ────────────────────────────────────────────────

interface ChildGroupEditorProps {
  config: ChildTableConfig;
  rows: ChildRowInput[];
  cols: ColumnDef[];
  grandchildGroups: ChildGroup[];
  columnDefs: Record<string, ColumnDef[]>;
  grandchildDepthLimit: number;
  onChange: (rows: ChildRowInput[]) => void;
}

function ChildGroupEditor({
  config,
  rows,
  cols,
  grandchildGroups,
  columnDefs,
  grandchildDepthLimit,
  onChange,
}: ChildGroupEditorProps) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const addRow = useCallback(() => {
    onChange([...rows, emptyRow(config, cols)]);
  }, [rows, config, cols, onChange]);

  const deleteRow = useCallback(
    (index: number) => {
      onChange(rows.filter((_, i) => i !== index));
    },
    [rows, onChange],
  );

  const updateCell = useCallback(
    (rowIndex: number, key: string, value: unknown) => {
      onChange(
        rows.map((row, i) =>
          i === rowIndex ? { ...row, data: { ...row.data, [key]: value } } : row,
        ),
      );
    },
    [rows, onChange],
  );

  const updateChildGroups = useCallback(
    (rowIndex: number, groups: ChildGroupInput[]) => {
      onChange(
        rows.map((row, i) => (i === rowIndex ? { ...row, children: groups } : row)),
      );
    },
    [rows, onChange],
  );

  const toggleExpand = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const moveRow = useCallback(
    (from: number, to: number) => {
      if (!config.allowReorder) return;
      const next = [...rows];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      onChange(next);
    },
    [rows, config.allowReorder, onChange],
  );

  const hasGrandchildren = grandchildGroups.length > 0 && grandchildDepthLimit > 0;

  return (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            {config.allowReorder && <th className="w-6 px-2 py-1" />}
            {hasGrandchildren && <th className="w-6 px-2 py-1" />}
            {cols.map((col) => (
              <th key={col.key} className="px-3 py-1 text-left font-medium text-muted-foreground">
                {col.label}
              </th>
            ))}
            {config.allowDelete && <th className="w-10 px-2 py-1" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <React.Fragment key={row.id ?? `new-${idx}`}>
              <tr
                className={cn(
                  'border-t',
                  idx % 2 === 0 ? 'bg-background' : 'bg-muted/30',
                )}
                draggable={config.allowReorder}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(idx))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                  moveRow(from, idx);
                }}
              >
                {config.allowReorder && (
                  <td className="px-2 py-1 text-muted-foreground cursor-grab select-none">
                    ⠿
                  </td>
                )}
                {hasGrandchildren && (
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() => toggleExpand(idx)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {expandedRows.has(idx) ? '▼' : '▶'}
                    </button>
                  </td>
                )}
                {cols.map((col) => (
                  <td key={col.key} className="px-3 py-1">
                    {col.readOnly ? (
                      <span className="text-muted-foreground">{String(row.data[col.key] ?? '')}</span>
                    ) : col.type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(row.data[col.key])}
                        onChange={(e) => updateCell(idx, col.key, e.target.checked)}
                        className="h-4 w-4"
                      />
                    ) : (
                      <input
                        type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                        value={String(row.data[col.key] ?? '')}
                        onChange={(e) =>
                          updateCell(
                            idx,
                            col.key,
                            col.type === 'number' ? parseFloat(e.target.value) : e.target.value,
                          )
                        }
                        className="w-full border-0 bg-transparent focus:ring-1 focus:ring-ring rounded px-1"
                      />
                    )}
                  </td>
                ))}
                {config.allowDelete && (
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => deleteRow(idx)}
                      className="text-destructive hover:text-destructive/80 text-xs"
                      aria-label="Delete row"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
              {hasGrandchildren && expandedRows.has(idx) && (
                <tr>
                  <td
                    colSpan={cols.length + (config.allowDelete ? 1 : 0) + 2}
                    className="px-4 py-2 bg-muted/20"
                  >
                    <NestedChildTable
                      childGroups={
                        (row.children ?? []).map((g) => ({
                          config: g.config,
                          rows: g.rows.map((r) => ({
                            id: r.id,
                            tableId: r.id,
                            data: r.data,
                            children: [],
                          })),
                        })) as ChildGroup[]
                      }
                      columnDefs={columnDefs}
                      grandchildDepthLimit={grandchildDepthLimit - 1}
                      displayMode="stack"
                      onChange={(groups) => updateChildGroups(idx, groups)}
                    />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={cols.length + (config.allowDelete ? 1 : 0) + (config.allowReorder ? 1 : 0) + (hasGrandchildren ? 1 : 0)}
                className="px-3 py-4 text-center text-muted-foreground text-sm"
              >
                No rows yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {config.allowAdd && (
        <div className="border-t px-3 py-2">
          <button
            type="button"
            onClick={addRow}
            className="text-sm text-primary hover:underline"
          >
            + Add row
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NestedChildTable({
  childGroups,
  columnDefs,
  onChange,
  displayMode = 'tabs',
  grandchildDepthLimit = 2,
}: NestedChildTableProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [localGroups, setLocalGroups] = useState<ChildGroupInput[]>(() =>
    childGroups.map((g) => ({
      config: g.config,
      rows: g.rows.map(recordToInput),
    })),
  );

  const updateGroup = useCallback(
    (index: number, rows: ChildRowInput[]) => {
      const next = localGroups.map((g, i) => (i === index ? { ...g, rows } : g));
      setLocalGroups(next);
      onChange?.(next);
    },
    [localGroups, onChange],
  );

  if (localGroups.length === 0) {
    return <p className="text-sm text-muted-foreground">No child tables configured.</p>;
  }

  if (displayMode === 'stack') {
    return (
      <div className="space-y-4">
        {localGroups.map((group, i) => {
          const cols = columnDefs[group.config.childTableId] ?? [];
          const grandchildGroupsForTable = childGroups[i]?.rows[0]?.children ?? [];
          return (
            <div key={group.config.id}>
              <h4 className="text-sm font-medium mb-1">{group.config.label}</h4>
              <ChildGroupEditor
                config={group.config}
                rows={group.rows}
                cols={cols}
                grandchildGroups={grandchildGroupsForTable}
                columnDefs={columnDefs}
                grandchildDepthLimit={grandchildDepthLimit}
                onChange={(rows) => updateGroup(i, rows)}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // Tabs mode
  const active = localGroups[activeTab];
  const activeCols = columnDefs[active.config.childTableId] ?? [];
  const grandchildGroupsForActive = childGroups[activeTab]?.rows[0]?.children ?? [];

  return (
    <div>
      <div className="flex border-b mb-3 gap-1">
        {localGroups.map((g, i) => (
          <button
            key={g.config.id}
            type="button"
            onClick={() => setActiveTab(i)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors',
              i === activeTab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {g.config.label}
            <span className="ml-1.5 text-xs text-muted-foreground">({g.rows.length})</span>
          </button>
        ))}
      </div>
      <ChildGroupEditor
        config={active.config}
        rows={active.rows}
        cols={activeCols}
        grandchildGroups={grandchildGroupsForActive}
        columnDefs={columnDefs}
        grandchildDepthLimit={grandchildDepthLimit}
        onChange={(rows) => updateGroup(activeTab, rows)}
      />
    </div>
  );
}

export default NestedChildTable;
