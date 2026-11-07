'use client';

import React, { useState, useCallback } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { Trash2, GripVertical, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActionChain, ActionStep, ActionStepType } from '@/platform/ui/canvas/types';

const uid = () => crypto.randomUUID();

const STEP_LABELS: Record<ActionStepType, string> = {
  navigate: 'Navigate', openModal: 'Open Modal', closeModal: 'Close Modal',
  setPageState: 'Set Page State', submitForm: 'Submit Form', refreshQuery: 'Refresh Query',
  runWorkflow: 'Run Workflow', showToast: 'Show Toast', callApi: 'Call API', runScript: 'Run Script',
};

const STEP_TYPES: ActionStepType[] = [
  'navigate','openModal','closeModal','setPageState',
  'submitForm','refreshQuery','runWorkflow','showToast','callApi','runScript',
];

function cfg<T extends Record<string,unknown>>(step: ActionStep): T { return step.config as T; }

function field(
  label: string,
  value: string,
  onChange: (v: string) => void,
  placeholder = '',
  type: 'text' | 'select' = 'text',
  options?: string[],
) {
  return (
    <div className="flex flex-col gap-0.5 mb-1">
      <label className="text-xs text-slate-500">{label}</label>
      {type === 'select' && options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="text-xs px-2 py-1 border rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none">
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="text-xs px-2 py-1 border rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-400" />
      )}
    </div>
  );
}

function StepConfigEditor({ step, onChange }: { step: ActionStep; onChange: (s: ActionStep) => void }) {
  const upd = (patch: Record<string,unknown>) => onChange({ ...step, config: { ...step.config, ...patch } });
  switch (step.type) {
    case 'navigate':
      return field('URL / Path', (cfg(step).url as string) ?? '', (v) => upd({ url: v }), '/page or {{ expr }}');
    case 'showToast':
      return <>{field('Message', (cfg(step).message as string) ?? '', (v) => upd({ message: v }))}
              {field('Type', (cfg(step).type as string) ?? 'success', (v) => upd({ type: v }), '', 'select', ['success','warning','error','info'])}</>;
    case 'setPageState':
      return <>{field('Variable', (cfg(step).variable as string) ?? '', (v) => upd({ variable: v }), 'pageState.myVar')}
              {field('Value', (cfg(step).value as string) ?? '', (v) => upd({ value: v }), '{{ expr }}')}</>;
    case 'openModal':
    case 'closeModal':
      return field('Modal ID', (cfg(step).modalId as string) ?? '', (v) => upd({ modalId: v }), 'modal-id');
    case 'runWorkflow':
      return field('Workflow ID', (cfg(step).workflowId as string) ?? '', (v) => upd({ workflowId: v }), 'wf-...');
    default:
      return (
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-slate-500">Config (JSON)</label>
          <textarea
            defaultValue={JSON.stringify(step.config, null, 2)}
            onBlur={(e) => { try { onChange({ ...step, config: JSON.parse(e.target.value) as Record<string,unknown> }); } catch { /* ignore */ } }}
            rows={3}
            className="text-xs px-2 py-1 border rounded border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono focus:outline-none resize-none" />
        </div>
      );
  }
}

const DND_STEP = 'ACTION_STEP';
interface StepDragItem { index: number }

function StepRow({ step, index, onUpdate, onDelete, onMove }: {
  step: ActionStep; index: number;
  onUpdate: (s: ActionStep) => void; onDelete: () => void; onMove: (from: number, to: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [{ isDragging }, drag] = useDrag<StepDragItem, void, { isDragging: boolean }>({
    type: DND_STEP, item: { index }, collect: (m) => ({ isDragging: m.isDragging() }),
  });
  const [{ isOver }, drop] = useDrop<StepDragItem, void, { isOver: boolean }>({
    accept: DND_STEP, drop: (item) => { if (item.index !== index) onMove(item.index, index); },
    collect: (m) => ({ isOver: m.isOver() }),
  });
  const ref = useCallback((node: HTMLDivElement | null) => { drag(node); drop(node); }, [drag, drop]);

  return (
    <div ref={ref as unknown as React.Ref<HTMLDivElement>} className={cn('border rounded mb-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700',
      isDragging && 'opacity-40', isOver && 'border-blue-400')}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <GripVertical size={12} className="text-slate-400 cursor-grab shrink-0" />
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 flex-1">{STEP_LABELS[step.type] ?? step.type}</span>
        <button onClick={() => setExpanded((v) => !v)} className="p-0.5 hover:text-blue-500">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <button onClick={onDelete} className="p-0.5 hover:text-red-500"><Trash2 size={12} /></button>
      </div>
      {expanded && (
        <div className="px-3 pb-2 border-t border-slate-100 dark:border-slate-800 pt-2">
          <StepConfigEditor step={step} onChange={onUpdate} />
        </div>
      )}
    </div>
  );
}

function StepPicker({ onAdd }: { onAdd: (type: ActionStepType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 mt-1">
        <Plus size={12} /> Add step
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-md min-w-[160px]">
          {STEP_TYPES.map((t) => (
            <button key={t} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              onClick={() => { onAdd(t); setOpen(false); }}>
              {STEP_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface ActionChainEditorProps { chain: ActionChain; onChange: (chain: ActionChain) => void; }

export function ActionChainEditor({ chain, onChange }: ActionChainEditorProps) {
  const updateStep = (index: number, updated: ActionStep) => {
    const steps = [...chain.steps]; steps[index] = updated; onChange({ steps });
  };
  const deleteStep = (index: number) => onChange({ steps: chain.steps.filter((_, i) => i !== index) });
  const addStep = (type: ActionStepType) => onChange({ steps: [...chain.steps, { id: uid(), type, config: {} }] });
  const moveStep = (from: number, to: number) => {
    const steps = [...chain.steps]; const [item] = steps.splice(from, 1); steps.splice(to, 0, item); onChange({ steps });
  };

  return (
    <div className="flex flex-col">
      {chain.steps.length === 0 && <p className="text-xs text-slate-400 mb-1">No steps yet.</p>}
      {chain.steps.map((step, i) => (
        <StepRow key={step.id} step={step} index={i}
          onUpdate={(s) => updateStep(i, s)} onDelete={() => deleteStep(i)} onMove={moveStep} />
      ))}
      <StepPicker onAdd={addStep} />
    </div>
  );
}
