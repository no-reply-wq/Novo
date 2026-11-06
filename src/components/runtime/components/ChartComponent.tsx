'use client';

import React, { useMemo, useState } from 'react';
import type { Row } from '@/types/runtime';

export interface ChartSeries {
  field: string;
  label: string;
  color?: string;
}

export interface ChartProps {
  data: Row[];
  chartType: 'bar' | 'line' | 'pie' | 'area' | 'number';
  xField?: string;
  yField?: string;
  series?: ChartSeries[];
  title?: string;
  height?: number;
}

/** Computes a "nice" scale (min/max) for a set of values. Exported for testing. */
export function autoScale(values: number[]): { min: number; max: number; step: number } {
  if (values.length === 0) return { min: 0, max: 10, step: 2 };
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  if (dataMin === dataMax) {
    return { min: 0, max: Math.max(dataMax * 1.2, 10), step: Math.max(dataMax / 5, 2) };
  }
  const range = dataMax - dataMin;
  const rawStep = range / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  const step = niceSteps.map((s) => s * magnitude).find((s) => s >= rawStep) ?? magnitude * 10;
  const min = dataMin >= 0 ? 0 : Math.floor(dataMin / step) * step;
  const max = Math.ceil(dataMax / step) * step;
  return { min, max, step };
}

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  value: number;
}

/** Computes bar rects for a bar chart. Exported for testing. */
export function dataToBars(
  data: Row[],
  xField: string,
  yField: string,
  chartWidth: number,
  chartHeight: number,
): BarRect[] {
  if (data.length === 0) return [];
  const values = data.map((r) => Number(r[yField] ?? 0));
  const { min, max } = autoScale(values);
  const range = max - min || 1;
  const barW = Math.floor((chartWidth / data.length) * 0.7);
  const gap = Math.floor((chartWidth / data.length) * 0.3);
  return data.map((row, i) => {
    const val = Number(row[yField] ?? 0);
    const h = Math.max(1, ((val - min) / range) * chartHeight);
    return {
      x: i * (barW + gap) + gap / 2,
      y: chartHeight - h,
      width: barW,
      height: h,
      label: String(row[xField] ?? ''),
      value: val,
    };
  });
}

export interface PieSlice {
  startAngle: number;
  endAngle: number;
  label: string;
  value: number;
  percentage: number;
}

/** Computes pie slices. Exported for testing. */
export function pieSlices(data: Row[], field: string): PieSlice[] {
  const total = data.reduce((sum, r) => sum + Number(r[field] ?? 0), 0);
  if (total === 0) return [];
  let angle = -Math.PI / 2; // start at top
  return data.map((row) => {
    const val = Number(row[field] ?? 0);
    const pct = val / total;
    const sweep = pct * 2 * Math.PI;
    const slice: PieSlice = {
      startAngle: angle,
      endAngle: angle + sweep,
      label: String(row['label'] ?? row['name'] ?? ''),
      value: val,
      percentage: Math.round(pct * 100),
    };
    angle += sweep;
    return slice;
  });
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

const DEFAULT_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];

interface ChartPoint { x: number; y: number; val: number; label: string; }

const PAD = { top: 20, right: 20, bottom: 40, left: 50 };

export function ChartComponent({ data, chartType, xField, yField, series, title, height = 300 }: ChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const W = 500;
  const H = height;
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const effectiveYField = yField ?? series?.[0]?.field ?? '';
  const effectiveXField = xField ?? '';

  const values = useMemo(
    () => data.map((r) => Number(r[effectiveYField] ?? 0)),
    [data, effectiveYField],
  );

  const { min, max, step } = useMemo(() => autoScale(values), [values]);
  const range = max - min || 1;

  const bars = useMemo(
    () => (chartType === 'bar' ? dataToBars(data, effectiveXField, effectiveYField, cw, ch) : []),
    [chartType, data, effectiveXField, effectiveYField, cw, ch],
  );

  const points = useMemo(() => {
    if (chartType !== 'line' && chartType !== 'area') return [];
    return data.map((r, i) => {
      const val = Number(r[effectiveYField] ?? 0);
      const x = data.length > 1 ? (i / (data.length - 1)) * cw : cw / 2;
      const y = ch - ((val - min) / range) * ch;
      return { x, y, val, label: String(r[effectiveXField] ?? '') };
    });
  }, [chartType, data, effectiveYField, effectiveXField, cw, ch, min, range]);

  const slices = useMemo(
    () => (chartType === 'pie' ? pieSlices(data, effectiveYField) : []),
    [chartType, data, effectiveYField],
  );

  // Y-axis ticks
  const yTicks: number[] = [];
  for (let v = min; v <= max + step * 0.01; v += step) {
    yTicks.push(Math.round(v * 100) / 100);
  }

  if (chartType === 'number') {
    const total = values.reduce((a: number, b: number) => a + b, 0);
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6" style={{ height }}>
        {title && <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{title}</p>}
        <p className="text-5xl font-bold text-gray-900 dark:text-gray-100">
          {total.toLocaleString('en-IN')}
        </p>
      </div>
    );
  }

  if (chartType === 'pie') {
    const cx = W / 2 - 60;
    const cy = H / 2;
    const r = Math.min(cx, cy) - 20;
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2">
        {title && <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 px-2 pb-1">{title}</p>}
        <div className="flex items-center gap-4 flex-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: H }}>
            {slices.map((s: PieSlice, i: number) => (
              <path
                key={i}
                d={arcPath(cx, cy, r, s.startAngle, s.endAngle)}
                fill={series?.[i]?.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                stroke="white"
                strokeWidth={2}
                opacity={hoveredIdx === i ? 1 : 0.85}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <title>{`${s.label}: ${s.value} (${s.percentage}%)`}</title>
              </path>
            ))}
          </svg>
          <div className="flex flex-col gap-1">
            {slices.map((s: PieSlice, i: number) => (
              <div key={i} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: series?.[i]?.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }} />
                {s.label} ({s.percentage}%)
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2">
      {title && <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 px-2 pb-1">{title}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: H }}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Gridlines */}
          {yTicks.map((v, i) => {
            const y = ch - ((v - min) / range) * ch;
            return (
              <g key={i}>
                <line x1={0} y1={y} x2={cw} y2={y} stroke="#f3f4f6" strokeWidth={1} />
                <text x={-6} y={y + 4} fontSize={9} textAnchor="end" fill="#9ca3af">{v}</text>
              </g>
            );
          })}

          {/* Axes */}
          <line x1={0} y1={0} x2={0} y2={ch} stroke="#d1d5db" strokeWidth={1} />
          <line x1={0} y1={ch} x2={cw} y2={ch} stroke="#d1d5db" strokeWidth={1} />

          {/* Bar chart */}
          {chartType === 'bar' && bars.map((b: BarRect, i: number) => {
            const color = series?.[0]?.color ?? DEFAULT_COLORS[0];
            return (
              <g key={i}>
                <rect
                  x={b.x} y={b.y} width={b.width} height={b.height}
                  fill={color}
                  opacity={hoveredIdx === i ? 1 : 0.8}
                  rx={2}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <title>{`${b.label}: ${b.value}`}</title>
                </rect>
                <text x={b.x + b.width / 2} y={ch + 14} fontSize={9} textAnchor="middle" fill="#9ca3af">
                  {b.label.length > 8 ? b.label.slice(0, 7) + '…' : b.label}
                </text>
              </g>
            );
          })}

          {/* Line / Area chart */}
          {(chartType === 'line' || chartType === 'area') && points.length > 0 && (() => {
            const pts = points.map((p: ChartPoint) => `${p.x},${p.y}`).join(' ');
            const color = series?.[0]?.color ?? DEFAULT_COLORS[0];
            return (
              <>
                {chartType === 'area' && (
                  <polygon
                    points={`0,${ch} ${pts} ${points[points.length - 1].x},${ch}`}
                    fill={color}
                    opacity={0.15}
                  />
                )}
                <polyline points={pts} fill="none" stroke={color} strokeWidth={2} />
                {points.map((p: ChartPoint, i: number) => (
                  <g key={i}>
                    <circle
                      cx={p.x} cy={p.y} r={4}
                      fill={color}
                      opacity={hoveredIdx === i ? 1 : 0.7}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    >
                      <title>{`${p.label}: ${p.val}`}</title>
                    </circle>
                    {data.length <= 12 && (
                      <text x={p.x} y={ch + 14} fontSize={9} textAnchor="middle" fill="#9ca3af">
                        {p.label.length > 8 ? p.label.slice(0, 7) + '…' : p.label}
                      </text>
                    )}
                  </g>
                ))}
              </>
            );
          })()}
        </g>
      </svg>
    </div>
  );
}
