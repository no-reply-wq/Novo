'use client';

import React, { useMemo, useRef, useState } from 'react';
import type { Row } from '@/types/runtime';

export interface TimelineProps {
  data: Row[];
  startField: string;
  endField: string;
  titleField: string;
  groupField?: string;
  colorField?: string;
  onBarClick?: (row: Row) => void;
}

/** Maps a date to a pixel x-position within [0, width]. Exported for testing. */
export function dateToPixel(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date,
  width: number,
): number {
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  if (totalMs <= 0) return 0;
  const offset = date.getTime() - rangeStart.getTime();
  return Math.max(0, Math.min(width, (offset / totalMs) * width));
}

/** Groups rows by a field value. Exported for testing. */
export function groupByField(rows: Row[], field: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row[field] ?? '(ungrouped)');
    const existing = map.get(key);
    if (existing) {
      existing.push(row);
    } else {
      map.set(key, [row]);
    }
  }
  return map;
}

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

const BAR_COLORS: string[] = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316',
];

function colorForIndex(i: number): string {
  return BAR_COLORS[i % BAR_COLORS.length];
}

const ROW_HEIGHT = 36;
const LABEL_WIDTH = 160;
const CHART_WIDTH = 700;
const HEADER_HEIGHT = 32;

export function TimelineComponent({
  data,
  startField,
  endField,
  titleField,
  groupField,
  colorField,
  onBarClick,
}: TimelineProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const { rangeStart, rangeEnd, groups } = useMemo(() => {
    const rows = data.filter((r) => parseDate(r[startField]) && parseDate(r[endField]));
    const dates = rows.flatMap((r) => [parseDate(r[startField])!, parseDate(r[endField])!]);
    if (dates.length === 0) {
      const now = new Date();
      const end = new Date(now); end.setDate(now.getDate() + 30);
      return { rangeStart: now, rangeEnd: end, groups: new Map<string, Row[]>() };
    }
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    // pad 1 day each side
    minDate.setDate(minDate.getDate() - 1);
    maxDate.setDate(maxDate.getDate() + 1);

    const grps = groupField
      ? groupByField(rows, groupField)
      : new Map<string, Row[]>([['', rows]]);

    return { rangeStart: minDate, rangeEnd: maxDate, groups: grps };
  }, [data, startField, endField, groupField]);

  const today = new Date();
  const todayX = dateToPixel(today, rangeStart, rangeEnd, CHART_WIDTH);

  // Build date ticks (roughly every 7 days)
  const totalDays = (rangeEnd.getTime() - rangeStart.getTime()) / 86400000;
  const tickInterval = Math.max(1, Math.round(totalDays / 10));
  const ticks: { x: number; label: string }[] = [];
  const tickDate = new Date(rangeStart);
  while (tickDate <= rangeEnd) {
    ticks.push({
      x: dateToPixel(tickDate, rangeStart, rangeEnd, CHART_WIDTH),
      label: tickDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    });
    tickDate.setDate(tickDate.getDate() + tickInterval);
  }

  // Flatten rows in group order for y positioning
  const allRows: { row: Row; groupLabel: string; colorIdx: number }[] = [];
  let colorIdx = 0;
  for (const [groupLabel, rows] of groups.entries()) {
    for (const row of rows) {
      allRows.push({ row, groupLabel, colorIdx });
    }
    colorIdx++;
  }

  const totalHeight = HEADER_HEIGHT + allRows.length * ROW_HEIGHT + 16;

  return (
    <div className="relative overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2">
      <div style={{ position: 'relative', display: 'inline-block', minWidth: LABEL_WIDTH + CHART_WIDTH + 16 }}>
        <svg
          width={LABEL_WIDTH + CHART_WIDTH}
          height={totalHeight}
          viewBox={`0 0 ${LABEL_WIDTH + CHART_WIDTH} ${totalHeight}`}
          className="font-sans"
        >
          {/* Tick marks and date headers */}
          {ticks.map((tick, i) => (
            <g key={i}>
              <line
                x1={LABEL_WIDTH + tick.x}
                y1={HEADER_HEIGHT}
                x2={LABEL_WIDTH + tick.x}
                y2={totalHeight - 8}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={LABEL_WIDTH + tick.x}
                y={HEADER_HEIGHT - 6}
                fontSize={9}
                textAnchor="middle"
                fill="#9ca3af"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Today marker */}
          {today >= rangeStart && today <= rangeEnd && (
            <line
              x1={LABEL_WIDTH + todayX}
              y1={HEADER_HEIGHT}
              x2={LABEL_WIDTH + todayX}
              y2={totalHeight - 8}
              stroke="#6366f1"
              strokeWidth={2}
              strokeDasharray="4 2"
            />
          )}

          {/* Row bars */}
          {allRows.map(({ row, groupLabel, colorIdx: ci }, rowIdx) => {
            const y = HEADER_HEIGHT + rowIdx * ROW_HEIGHT + 4;
            const start = parseDate(row[startField]);
            const end = parseDate(row[endField]);
            if (!start || !end) return null;

            const x1 = dateToPixel(start, rangeStart, rangeEnd, CHART_WIDTH);
            const x2 = dateToPixel(end, rangeStart, rangeEnd, CHART_WIDTH);
            const barWidth = Math.max(4, x2 - x1);
            const rawColor = colorField ? String(row[colorField] ?? '') : '';
            const fillColor = rawColor || colorForIndex(ci);
            const title = String(row[titleField] ?? '');

            const isFirstInGroup = groupField
              ? allRows.findIndex((r) => r.groupLabel === groupLabel) === rowIdx
              : false;

            return (
              <g key={rowIdx}>
                {/* Group label */}
                {isFirstInGroup && (
                  <text x={4} y={y + 14} fontSize={10} fontWeight="600" fill="#6b7280" className="select-none">
                    {groupLabel}
                  </text>
                )}

                {/* Row label */}
                <text
                  x={groupField ? 16 : 4}
                  y={y + 14}
                  fontSize={11}
                  fill="#374151"
                  className="select-none"
                  clipPath={`url(#clip-label-${rowIdx})`}
                >
                  {title}
                </text>
                <clipPath id={`clip-label-${rowIdx}`}>
                  <rect x={groupField ? 16 : 4} y={y} width={LABEL_WIDTH - 20} height={ROW_HEIGHT} />
                </clipPath>

                {/* Bar */}
                <rect
                  x={LABEL_WIDTH + x1}
                  y={y + 2}
                  width={barWidth}
                  height={ROW_HEIGHT - 10}
                  rx={4}
                  fill={fillColor}
                  opacity={0.85}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onBarClick?.(row)}
                  onMouseEnter={(e: React.MouseEvent<SVGRectElement>) => {
                    const rect = (e.target as SVGRectElement).getBoundingClientRect();
                    setTooltip({
                      text: `${title}\n${start.toLocaleDateString('en-IN')} – ${end.toLocaleDateString('en-IN')}`,
                      x: rect.left,
                      y: rect.top - 36,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />

                {/* Bar label (if wide enough) */}
                {barWidth > 40 && (
                  <text
                    x={LABEL_WIDTH + x1 + 4}
                    y={y + ROW_HEIGHT - 10}
                    fontSize={10}
                    fill="white"
                    className="select-none pointer-events-none"
                  >
                    {title.length > 20 ? title.slice(0, 18) + '…' : title}
                  </text>
                )}

                {/* Row separator */}
                <line
                  x1={0}
                  y1={y + ROW_HEIGHT - 2}
                  x2={LABEL_WIDTH + CHART_WIDTH}
                  y2={y + ROW_HEIGHT - 2}
                  stroke="#f3f4f6"
                  strokeWidth={1}
                />
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            ref={tooltipRef}
            className="fixed z-50 rounded bg-gray-900 text-white text-xs px-2 py-1 pointer-events-none whitespace-pre"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </div>
  );
}
