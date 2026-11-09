'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import type { Row } from '@/types/runtime';

export interface GridColumn {
  field: string;
  header: string;
  type: 'text' | 'number' | 'currency' | 'dropdown' | 'date' | 'formula';
  width?: number;
  options?: string[];
  readOnly?: boolean;
}

export interface LineItemGridProps {
  rows: Row[];
  columns: GridColumn[];
  onRowChange: (rowId: string, field: string, value: unknown) => void;
  onRowAdd: () => void;
  onRowDelete: (rowId: string) => void;
  formulaColumns?: string[];
  totalsRow?: boolean;
}

/** Format a number as Indian currency (₹ with lakh/crore commas). Exported for testing. */
export function formatCurrency(value: number): string {
  const [intPart, decPart] = Math.abs(value).toFixed(2).split('.');
  const sign = value < 0 ? '-' : '';
  // Indian number system: last 3, then groups of 2
  const len = intPart.length;
  if (len <= 3) {
    return `${sign}₹${intPart}.${decPart}`;
  }
  const last3 = intPart.slice(len - 3);
  const rest = intPart.slice(0, len - 3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  return `${sign}₹${formatted}.${decPart}`;
}

/** Compute column totals for numeric columns. Exported for testing. */
export function computeTotals(rows: Row[], columns: GridColumn[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const col of columns) {
    if (col.type === 'number' || col.type === 'currency') {
      totals[col.field] = rows.reduce((sum, row) => sum + (Number(row[col.field]) || 0), 0);
    }
  }
  return totals;
}

/** Returns next cell position for tab navigation. Exported for testing. */
export function nextCell(
  row: number,
  col: number,
  totalRows: number,
  totalCols: number,
): { row: number; col: number } {
  const nextCol = col + 1;
  if (nextCol < totalCols) return { row, col: nextCol };
  const nextRow = row + 1;
  if (nextRow < totalRows) return { row: nextRow, col: 0 };
  return { row, col }; // stay at last cell
}

function getRowId(row: Row): string {
  return String(row['id'] ?? row['_id'] ?? JSON.stringify(row));
}

export function LineItemGridComponent({
  rows,
  columns,
  onRowChange,
  onRowAdd,
  onRowDelete,
  formulaColumns = [],
  totalsRow = false,
}: LineItemGridProps) {
  const [editCell, setEditCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  const totals = useMemo(() => computeTotals(rows, columns), [rows, columns]);

  const startEdit = useCallback((rowId: string, field: string, currentValue: unknown) => {
    setEditCell({ rowId, field });
    setEditValue(String(currentValue ?? ''));
    setTimeout(() => (inputRef.current as HTMLInputElement | null)?.focus(), 0);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editCell) return;
    onRowChange(editCell.rowId, editCell.field, editValue);
    setEditCell(null);
  }, [editCell, editValue, onRowChange]);

  const cancelEdit = useCallback(() => {
    setEditCell(null);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit();
        const { row: nextRow, col: nextCol } = nextCell(
          rowIdx,
          colIdx,
          rows.length,
          columns.length,
        );
        const targetRow = rows[nextRow];
        const targetCol = columns[nextCol];
        if (targetRow && targetCol && !targetCol.readOnly && targetCol.type !== 'formula' && !formulaColumns.includes(targetCol.field)) {
          startEdit(getRowId(targetRow), targetCol.field, targetRow[targetCol.field]);
        }
      }
    },
    [commitEdit, cancelEdit, rows, columns, formulaColumns, startEdit],
  );

  const displayValue = (row: Row, col: GridColumn): string => {
    const val = row[col.field];
    if (col.type === 'currency') return formatCurrency(Number(val) || 0);
    return String(val ?? '');
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-auto max-h-[500px]">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.field}
                  className="text-left text-xs font-semibold text-gray-600 dark:text-gray-300 px-3 py-2 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap"
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
              <th className="w-8 border-b border-gray-200 dark:border-gray-700" />
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900">
            {rows.map((row, rowIdx) => {
              const rowId = getRowId(row);
              const isHovered = hoveredRowId === rowId;
              return (
                <tr
                  key={rowId}
                  onMouseEnter={() => setHoveredRowId(rowId)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  {columns.map((col, colIdx) => {
                    const isEditing =
                      editCell?.rowId === rowId && editCell?.field === col.field;
                    const isFormula =
                      col.type === 'formula' || formulaColumns.includes(col.field);
                    const isReadOnly = col.readOnly || isFormula;

                    return (
                      <td
                        key={col.field}
                        className={`px-3 py-1.5 align-middle ${isFormula ? 'bg-gray-50 dark:bg-gray-800/50 text-gray-500' : ''}`}
                        style={{ width: col.width }}
                        onClick={() => {
                          if (!isReadOnly && !isEditing) {
                            startEdit(rowId, col.field, row[col.field]);
                          }
                        }}
                      >
                        {isEditing ? (
                          col.type === 'dropdown' && col.options ? (
                            <select
                              ref={inputRef as React.RefObject<HTMLSelectElement>}
                              value={editValue}
                              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e: React.KeyboardEvent<HTMLSelectElement>) => handleKeyDown(e, rowIdx, colIdx)}
                              className="w-full border border-indigo-400 rounded px-1 py-0.5 text-sm bg-white dark:bg-gray-900 dark:text-gray-100 focus:outline-none"
                            >
                              {col.options.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              ref={inputRef as React.RefObject<HTMLInputElement>}
                              type={col.type === 'number' || col.type === 'currency' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                              value={editValue}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => handleKeyDown(e, rowIdx, colIdx)}
                              className="w-full border border-indigo-400 rounded px-1 py-0.5 text-sm bg-white dark:bg-gray-900 dark:text-gray-100 focus:outline-none"
                            />
                          )
                        ) : (
                          <span className={`block truncate ${isReadOnly ? 'cursor-default' : 'cursor-text'}`}>
                            {displayValue(row, col)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1 py-1 w-8 text-center">
                    {isHovered && (
                      <button
                        onClick={() => onRowDelete(rowId)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                        aria-label="Delete row"
                      >
                        x
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {totalsRow && (
            <tfoot className="bg-gray-50 dark:bg-gray-800 border-t-2 border-gray-200 dark:border-gray-700 sticky bottom-0">
              <tr>
                {columns.map((col, i) => (
                  <td key={col.field} className="px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-200">
                    {i === 0
                      ? 'Total'
                      : totals[col.field] !== undefined
                        ? col.type === 'currency'
                          ? formatCurrency(totals[col.field])
                          : totals[col.field].toLocaleString('en-IN')
                        : ''}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2">
        <button
          onClick={onRowAdd}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium flex items-center gap-1"
        >
          + Add row
        </button>
      </div>
    </div>
  );
}
