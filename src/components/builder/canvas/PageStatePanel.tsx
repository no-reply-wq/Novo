'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PageStateVar, PageStateVarType, PropValue } from '@/platform/ui/canvas/types';

const VAR_TYPES: PageStateVarType[] = ['string', 'number', 'boolean', 'object', 'array'];

export interface PageStatePanelProps {
  vars: PageStateVar[];
  onChange: (vars: PageStateVar[]) => void;
}

export function PageStatePanel({ vars, onChange }: PageStatePanelProps) {
  const add = () => onChange([...vars, { name: `var${vars.length + 1}`, type: 'string', defaultValue: '' }]);
  const remove = (i: number) => onChange(vars.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<PageStateVar>) => {
    const next = [...vars]; next[i] = { ...next[i], ...patch }; onChange(next);
  };

  return (
    <div className="p-3 border-t border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Page State</span>
        <button onClick={add} className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
          <Plus size={12} /> Add
        </button>
      </div>
      {vars.length === 0 && (
        <p className="text-xs text-slate-400">No variables. Add one to use in bindings as <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">pageState.name</code>.</p>
      )}
      {vars.map((v, i) => (
        <div key={i} className="flex flex-col gap-1 mb-2 border border-slate-200 dark:border-slate-700 rounded p-2">
          <div className="flex items-center gap-1">
            <input type="text" value={v.name} onChange={(e) => update(i, { name: e.target.value })}
              placeholder="varName"
              className="flex-1 text-xs px-2 py-1 border rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono" />
            <select value={v.type} onChange={(e) => update(i, { type: e.target.value as PageStateVarType })}
              className="text-xs px-1 py-1 border rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none">
              {VAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => remove(i)} className="p-0.5 hover:text-red-500 text-slate-400"><Trash2 size={12} /></button>
          </div>
          <input
            type="text"
            value={v.defaultValue === null || v.defaultValue === undefined ? '' : typeof v.defaultValue === 'object' ? JSON.stringify(v.defaultValue) : String(v.defaultValue)}
            onChange={(e) => {
              let val: PropValue = e.target.value;
              if (v.type === 'number') val = Number(e.target.value);
              else if (v.type === 'boolean') val = e.target.value === 'true';
              update(i, { defaultValue: val });
            }}
            placeholder="Default value"
            className="text-xs px-2 py-1 border rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
      ))}
    </div>
  );
}
