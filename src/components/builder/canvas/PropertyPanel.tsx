'use client';

import React, { useState } from 'react';
import { X, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ComponentInstance, ActionChain, PropValue } from '@/platform/ui/canvas/types';
import { ActionChainEditor } from './ActionChainEditor';
import { ExpressionEditor } from '@/components/builder/ExpressionEditor';

type Tab = 'props' | 'bindings' | 'events' | 'style';
const TABS: { id: Tab; label: string }[] = [
  { id: 'props', label: 'Props' }, { id: 'bindings', label: 'Bindings' },
  { id: 'events', label: 'Events' }, { id: 'style', label: 'Style' },
];

function PropRow({ name, value, onChange }: { name: string; value: PropValue; onChange: (v: PropValue) => void }) {
  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-slate-600 dark:text-slate-400">{name}</span>
        <button onClick={() => onChange(!value)} className="text-blue-500">
          {value ? <ToggleRight size={18} /> : <ToggleLeft size={18} className="text-slate-400" />}
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-1">
      <label className="text-xs text-slate-600 dark:text-slate-400 w-24 shrink-0 truncate">{name}</label>
      <input
        type={typeof value === 'number' ? 'number' : 'text'}
        value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
        onChange={(e) => onChange(typeof value === 'number' ? Number(e.target.value) : e.target.value)}
        className="flex-1 text-xs px-2 py-1 border rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400" />
    </div>
  );
}

function BindingRow({ name, expression, onChangeExpr, isActive, onToggle }: {
  name: string; expression: string; onChangeExpr: (expr: string) => void; isActive: boolean; onToggle: () => void;
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-slate-600 dark:text-slate-400 flex-1 truncate">{name}</span>
        <button onClick={onToggle} className={cn('text-xs px-2 py-0.5 rounded border',
          isActive ? 'border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-950' : 'border-slate-200 text-slate-400')}>
          {isActive ? '{{ expr }}' : 'static'}
        </button>
      </div>
      {isActive && <ExpressionEditor value={expression} onChange={onChangeExpr} />}
    </div>
  );
}

interface StyleConfig { padding?: number; margin?: number; backgroundColor?: string; border?: string; borderRadius?: number; }

function StyleEditor({ style, onChange }: { style: StyleConfig; onChange: (s: StyleConfig) => void }) {
  const field = (key: keyof StyleConfig, label: string, type: 'number' | 'text' = 'text') => (
    <div className="flex items-center gap-2 py-1" key={key}>
      <label className="text-xs text-slate-600 dark:text-slate-400 w-28 shrink-0">{label}</label>
      <input type={type} value={(style[key] ?? '') as string | number}
        onChange={(e) => onChange({ ...style, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
        className="flex-1 text-xs px-2 py-1 border rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400" />
    </div>
  );
  return (
    <div className="flex flex-col">
      {field('padding', 'Padding (px)', 'number')}
      {field('margin', 'Margin (px)', 'number')}
      {field('backgroundColor', 'Background')}
      {field('border', 'Border')}
      {field('borderRadius', 'Border radius', 'number')}
    </div>
  );
}

const COMMON_EVENTS = ['onClick', 'onChange', 'onLoad', 'onSubmit', 'onRowClick', 'onSelect'];

function EventsEditor({ component, onChange }: { component: ComponentInstance; onChange: (c: ComponentInstance) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {COMMON_EVENTS.map((evt) => {
        const chain: ActionChain = component.events[evt] ?? { steps: [] };
        return (
          <div key={evt}>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{evt}</p>
            <ActionChainEditor chain={chain}
              onChange={(updated) => onChange({ ...component, events: { ...component.events, [evt]: updated } })} />
          </div>
        );
      })}
    </div>
  );
}

export interface PropertyPanelProps {
  component: ComponentInstance | null;
  onUpdate: (c: ComponentInstance) => void;
  onDeselect: () => void;
}

export function PropertyPanel({ component, onUpdate, onDeselect }: PropertyPanelProps) {
  const [tab, setTab] = useState<Tab>('props');

  if (!component) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-xs text-slate-400">Select a component to edit its properties</p>
      </div>
    );
  }

  const updateProp = (key: string, value: PropValue) => onUpdate({ ...component, props: { ...component.props, [key]: value } });
  const updateBinding = (key: string, expr: string) => onUpdate({ ...component, bindings: { ...component.bindings, [key]: expr } });
  const toggleBinding = (key: string) => {
    const bindings = { ...component.bindings };
    if (bindings[key] !== undefined) delete bindings[key]; else bindings[key] = '';
    onUpdate({ ...component, bindings });
  };
  const style = (component.props.__style ?? {}) as StyleConfig;
  const updateStyle = (s: StyleConfig) => updateProp('__style', s as unknown as PropValue);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 capitalize">{component.type}</span>
        <button onClick={onDeselect} className="p-0.5 hover:text-slate-700 text-slate-400"><X size={14} /></button>
      </div>
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex-1 text-xs py-1.5 transition-colors',
              tab === t.id ? 'border-b-2 border-blue-500 text-blue-600 font-medium' : 'text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'props' && (
          <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {Object.entries(component.props).filter(([k]) => k !== '__style').map(([key, val]) => (
              <PropRow key={key} name={key} value={val as PropValue} onChange={(v) => updateProp(key, v)} />
            ))}
            {Object.keys(component.props).filter((k) => k !== '__style').length === 0 && (
              <p className="text-xs text-slate-400">No props for this component.</p>
            )}
          </div>
        )}
        {tab === 'bindings' && (
          <div>
            {Object.keys(component.props).filter((k) => k !== '__style').map((key) => (
              <BindingRow key={key} name={key} expression={component.bindings[key] ?? ''}
                isActive={component.bindings[key] !== undefined}
                onToggle={() => toggleBinding(key)} onChangeExpr={(expr) => updateBinding(key, expr)} />
            ))}
          </div>
        )}
        {tab === 'events' && <EventsEditor component={component} onChange={onUpdate} />}
        {tab === 'style' && <StyleEditor style={style} onChange={updateStyle} />}
      </div>
    </div>
  );
}
