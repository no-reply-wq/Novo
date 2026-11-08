'use client';

import React, { useMemo, useRef, useState } from 'react';

export interface ChartDataPoint {
  label: string;
  value: number;
  series?: string;
}

export interface ChartProps {
  type: 'bar' | 'line' | 'pie' | 'area' | 'number';
  data: ChartDataPoint[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  showLegend?: boolean;
  colors?: string[];
  trend?: 'up' | 'down' | 'flat';
  /** Called when a bar is clicked; receives the bar's label and value. Enables drill-down navigation. */
  onBarClick?: (label: string, value: number) => void;
}

const DEFAULT_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [0, max || 10];
  const range = max - min;
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1,2,2.5,5,10].map((s) => s * mag).find((s) => s >= raw) ?? mag * 10;
  const lo = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= max + step / 2; t += step) ticks.push(parseFloat(t.toFixed(10)));
  return ticks;
}

export function ChartComponent({ type, data, title, xAxisLabel, yAxisLabel, showLegend = false, colors = DEFAULT_COLORS, trend, onBarClick }: ChartProps) {
  const containerRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const seriesNames = useMemo(() => Array.from(new Set(data.map((d) => d.series ?? ''))), [data]);
  const colorMap = useMemo(() => Object.fromEntries(seriesNames.map((s, i) => [s, colors[i % colors.length]])), [seriesNames, colors]);

  if (type === 'number') {
    const val = data[0]?.value ?? 0;
    const formatted = val >= 1e9 ? `${(val/1e9).toFixed(1)}B` : val >= 1e6 ? `${(val/1e6).toFixed(1)}M` : val >= 1e3 ? `${(val/1e3).toFixed(1)}K` : val.toLocaleString();
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {title && <div className="mb-1 text-xs font-medium text-[var(--muted)] uppercase tracking-wide">{title}</div>}
        <div className="text-4xl font-bold text-[var(--fg)]">{formatted}</div>
        {trend && (
          <div className={`mt-1 text-sm font-medium ${trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-[var(--muted)]'}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </div>
        )}
      </div>
    );
  }

  if (type === 'pie') {
    const total = data.reduce((s, d) => s + d.value, 0);
    let angle = -Math.PI / 2;
    const slices = data.map((d, i) => {
      const pct = total ? d.value / total : 0;
      const sweep = pct * 2 * Math.PI;
      const x1 = 50 + 40 * Math.cos(angle);
      const y1 = 50 + 40 * Math.sin(angle);
      angle += sweep;
      const x2 = 50 + 40 * Math.cos(angle);
      const y2 = 50 + 40 * Math.sin(angle);
      const large = sweep > Math.PI ? 1 : 0;
      return { d: `M50,50 L${x1},${y1} A40,40 0 ${large} 1 ${x2},${y2} Z`, color: colors[i % colors.length], label: d.label, pct: (pct * 100).toFixed(1) };
    });
    return (
      <div className="flex flex-col h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
        {title && <div className="mb-2 text-xs font-semibold text-[var(--fg)]">{title}</div>}
        <div className="flex flex-1 items-center gap-4">
          <svg viewBox="0 0 100 100" className="h-full max-h-48 w-auto flex-shrink-0">
            {slices.map((s, i) => (
              <path key={i} d={s.d} fill={s.color} stroke="var(--surface)" strokeWidth="0.5"
                onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, text: `${s.label}: ${s.pct}%` })}
                onMouseLeave={() => setTooltip(null)} className="cursor-pointer hover:opacity-80" />
            ))}
          </svg>
          {showLegend && (
            <div className="flex flex-col gap-1">
              {slices.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-[var(--fg)]">
                  <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                  {s.label} ({s.pct}%)
                </div>
              ))}
            </div>
          )}
        </div>
        {tooltip && (
          <div className="fixed z-50 rounded bg-black/80 px-2 py-1 text-xs text-white pointer-events-none" style={{ left: tooltip.x + 8, top: tooltip.y - 24 }}>{tooltip.text}</div>
        )}
      </div>
    );
  }

  // Bar, Line, Area
  const W = 500, H = 240, PAD = { top: 20, right: 20, bottom: 50, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const labels = Array.from(new Set(data.map((d) => d.label)));
  const groups = seriesNames.map((s) => ({
    series: s,
    color: colorMap[s],
    values: labels.map((l) => data.find((d) => d.label === l && d.series === s)?.value ?? 0),
  }));

  const allVals = data.map((d) => d.value);
  const ticks = niceTicks(0, Math.max(...allVals, 1));
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const yRange = yMax - yMin || 1;

  const toY = (v: number) => PAD.top + plotH - ((v - yMin) / yRange) * plotH;
  const toX = (i: number) => PAD.left + (labels.length > 1 ? (i / (labels.length - 1)) * plotW : plotW / 2);

  const barW = Math.max(4, Math.min(40, plotW / (labels.length * groups.length) - 4));

  return (
    <div className="flex flex-col h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      {title && <div className="mb-2 text-xs font-semibold text-[var(--fg)]">{title}</div>}
      <svg ref={containerRef} viewBox={`0 0 ${W} ${H}`} className="w-full flex-1 overflow-visible"
        onMouseLeave={() => setTooltip(null)}>
        {/* Y grid + ticks */}
        {ticks.map((t, i) => {
          const y = toY(t);
          return (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--border)" strokeWidth={0.5} />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--muted)">{t >= 1000 ? `${(t/1000).toFixed(0)}k` : t}</text>
            </g>
          );
        })}
        {/* X labels */}
        {labels.map((l, i) => (
          <text key={i} x={toX(i)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize={9} fill="var(--muted)">{l}</text>
        ))}
        {/* Y axis label */}
        {yAxisLabel && <text x={10} y={H / 2} textAnchor="middle" fontSize={9} fill="var(--muted)" transform={`rotate(-90, 10, ${H/2})`}>{yAxisLabel}</text>}
        {/* X axis label */}
        {xAxisLabel && <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--muted)">{xAxisLabel}</text>}

        {/* Axes */}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--border)" strokeWidth={1} />
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="var(--border)" strokeWidth={1} />

        {/* Data */}
        {groups.map((g, gi) => {
          if (type === 'bar') {
            const totalW = groups.length * (barW + 2);
            return g.values.map((v, i) => {
              const bx = toX(i) - totalW / 2 + gi * (barW + 2);
              const by = toY(v);
              return (
                <rect key={i} x={bx} y={by} width={barW} height={Math.max(0, H - PAD.bottom - by)}
                  fill={g.color} rx={2} className="cursor-pointer hover:opacity-80"
                  onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, text: `${labels[i]}${g.series ? ` (${g.series})` : ''}: ${v}` })}
                  onClick={() => onBarClick?.(labels[i], v)} />
              );
            });
          }
          if (type === 'line') {
            const pts = g.values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
            return <polyline key={gi} points={pts} fill="none" stroke={g.color} strokeWidth={2} strokeLinejoin="round" />;
          }
          if (type === 'area') {
            const pts = g.values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
            const first = `${toX(0)},${H - PAD.bottom}`;
            const last = `${toX(g.values.length - 1)},${H - PAD.bottom}`;
            return (
              <g key={gi}>
                <polygon points={`${first} ${pts} ${last}`} fill={g.color} opacity={0.2} />
                <polyline points={pts} fill="none" stroke={g.color} strokeWidth={2} />
              </g>
            );
          }
          return null;
        })}
      </svg>

      {showLegend && seriesNames.some((s) => s) && (
        <div className="flex flex-wrap gap-3 mt-1">
          {seriesNames.map((s, i) => (
            <div key={i} className="flex items-center gap-1 text-xs text-[var(--fg)]">
              <span className="h-2 w-4 rounded-sm" style={{ background: colorMap[s] }} />{s}
            </div>
          ))}
        </div>
      )}

      {tooltip && (
        <div className="fixed z-50 rounded bg-black/80 px-2 py-1 text-xs text-white pointer-events-none" style={{ left: tooltip.x + 8, top: tooltip.y - 24 }}>{tooltip.text}</div>
      )}
    </div>
  );
}
