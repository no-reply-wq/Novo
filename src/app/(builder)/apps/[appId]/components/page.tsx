'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { CustomComponentDefinition, ComponentPropDef, ComponentEventDef } from '@/platform/custom-components/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppInfo {
  id: string;
  tenantSlug: string;
  name: string;
}

type PropType = ComponentPropDef['type'];

// ─── Component list item ──────────────────────────────────────────────────────

function ComponentListItem({
  component,
  selected,
  onSelect,
}: {
  component: CustomComponentDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors',
        selected ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : '',
      ].join(' ')}
    >
      <div className="font-medium text-sm text-gray-900">{component.name}</div>
      <div className="text-xs text-gray-500 mt-0.5">{component.slug} · v{component.version}</div>
      {component.description && (
        <div className="text-xs text-gray-400 mt-1 truncate">{component.description}</div>
      )}
    </button>
  );
}

// ─── Prop editor ──────────────────────────────────────────────────────────────

function PropEditor({
  props,
  onChange,
}: {
  props: ComponentPropDef[];
  onChange: (props: ComponentPropDef[]) => void;
}) {
  const propTypes: PropType[] = ['string', 'number', 'boolean', 'array', 'object'];

  const addProp = () => {
    onChange([...props, { name: '', type: 'string', required: false }]);
  };

  const updateProp = (index: number, field: keyof ComponentPropDef, value: unknown) => {
    const updated = props.map((p, i) => (i === index ? { ...p, [field]: value } : p));
    onChange(updated);
  };

  const removeProp = (index: number) => {
    onChange(props.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Props</span>
        <button
          type="button"
          onClick={addProp}
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
        >
          + Add prop
        </button>
      </div>
      {props.map((prop, index) => (
        <div key={index} className="flex gap-2 items-start">
          <input
            type="text"
            placeholder="name"
            value={prop.name}
            onChange={e => updateProp(index, 'name', e.target.value)}
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <select
            value={prop.type}
            onChange={e => updateProp(index, 'type', e.target.value as PropType)}
            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {propTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={prop.required}
              onChange={e => updateProp(index, 'required', e.target.checked)}
              className="rounded"
            />
            required
          </label>
          <button
            type="button"
            onClick={() => removeProp(index)}
            className="text-gray-400 hover:text-red-500 text-xs"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Event editor ─────────────────────────────────────────────────────────────

function EventEditor({
  events,
  onChange,
}: {
  events: ComponentEventDef[];
  onChange: (events: ComponentEventDef[]) => void;
}) {
  const addEvent = () => {
    onChange([...events, { name: '', payloadSchema: [] }]);
  };

  const updateEvent = (index: number, field: keyof ComponentEventDef, value: unknown) => {
    const updated = events.map((e, i) => (i === index ? { ...e, [field]: value } : e));
    onChange(updated);
  };

  const removeEvent = (index: number) => {
    onChange(events.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Events</span>
        <button
          type="button"
          onClick={addEvent}
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
        >
          + Add event
        </button>
      </div>
      {events.map((event, index) => (
        <div key={index} className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="onEventName"
            value={event.name}
            onChange={e => updateEvent(index, 'name', e.target.value)}
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="text"
            placeholder='payload JSON e.g. {"id":"string"}'
            value={JSON.stringify(event.payloadSchema ?? [])}
            onChange={e => {
              try {
                const parsed = JSON.parse(e.target.value) as Record<string, string>;
                updateEvent(index, 'payloadSchema', parsed);
              } catch {
                // ignore parse errors during typing
              }
            }}
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
          />
          <button
            type="button"
            onClick={() => removeEvent(index)}
            className="text-gray-400 hover:text-red-500 text-xs"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CustomComponentsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  const [app, setApp] = useState<AppInfo | null>(null);
  const [components, setComponents] = useState<CustomComponentDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Editor state
  const [editorName, setEditorName] = useState('');
  const [editorSlug, setEditorSlug] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorCode, setEditorCode] = useState('');
  const [editorProps, setEditorProps] = useState<ComponentPropDef[]>([]);
  const [editorEvents, setEditorEvents] = useState<ComponentEventDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedComponent = components.find(c => c.id === selectedId) ?? null;

  // Load app info
  useEffect(() => {
    fetch(`/api/builder/apps/${appId}`)
      .then(res => res.json())
      .then((data: { app?: AppInfo }) => {
        if (data.app) setApp(data.app);
      })
      .catch(() => null);
  }, [appId]);

  // Load components
  const loadComponents = useCallback((tenantSlug: string) => {
    fetch(`/api/builder/custom-components?tenant=${encodeURIComponent(tenantSlug)}`)
      .then(res => res.json())
      .then((data: { components?: CustomComponentDefinition[] }) => {
        setComponents(data.components ?? []);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (app?.tenantSlug) loadComponents(app.tenantSlug);
  }, [app, loadComponents]);

  // Populate editor when selecting a component
  useEffect(() => {
    if (selectedComponent) {
      setEditorName(selectedComponent.name);
      setEditorSlug(selectedComponent.slug);
      setEditorDescription(selectedComponent.description);
      setEditorCode(selectedComponent.code);
      setEditorProps(selectedComponent.props);
      setEditorEvents(selectedComponent.events);
      setCreating(false);
      setSaveError(null);
    }
  }, [selectedComponent]);

  const startNew = () => {
    setSelectedId(null);
    setCreating(true);
    setEditorName('');
    setEditorSlug('');
    setEditorDescription('');
    setEditorCode('<div>\n  <!-- Your component HTML/JS here -->\n  <button onclick="window.novo.emit(\'onClick\', {})">Click me</button>\n</div>');
    setEditorProps([]);
    setEditorEvents([]);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!app) return;
    setSaving(true);
    setSaveError(null);

    try {
      const payload = {
        tenantSlug: app.tenantSlug,
        name: editorName,
        slug: editorSlug,
        description: editorDescription,
        code: editorCode,
        props: editorProps,
        events: editorEvents,
      };

      let res: Response;
      if (creating) {
        res = await fetch('/api/builder/custom-components', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/builder/custom-components/${selectedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editorName, description: editorDescription, code: editorCode, props: editorProps, events: editorEvents }),
        });
      }

      const data = await res.json() as { component?: CustomComponentDefinition; error?: unknown };
      if (!res.ok) {
        setSaveError('Save failed');
        return;
      }

      if (data.component) {
        setSelectedId(data.component.id);
        setCreating(false);
        loadComponents(app.tenantSlug);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !app) return;
    if (!confirm('Delete this component?')) return;

    await fetch(`/api/builder/custom-components/${selectedId}`, { method: 'DELETE' });
    setSelectedId(null);
    setCreating(false);
    loadComponents(app.tenantSlug);
  };

  const isEditing = creating || selectedId !== null;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-72 border-r border-gray-200 flex flex-col bg-white">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Custom Components</h2>
          <button
            type="button"
            onClick={startNew}
            className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
          >
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {components.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No components yet. Create your first one!
            </div>
          )}
          {components.map(c => (
            <ComponentListItem
              key={c.id}
              component={c}
              selected={c.id === selectedId}
              onSelect={() => setSelectedId(c.id)}
            />
          ))}
        </div>
      </aside>

      {/* Editor + preview */}
      {isEditing ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-3 bg-white">
            <input
              type="text"
              placeholder="Component name"
              value={editorName}
              onChange={e => setEditorName(e.target.value)}
              className="text-sm font-medium border-b border-transparent focus:border-indigo-400 focus:outline-none flex-1 max-w-xs"
            />
            {creating && (
              <input
                type="text"
                placeholder="slug (e.g. my-scanner)"
                value={editorSlug}
                onChange={e => setEditorSlug(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            )}
            <div className="flex-1" />
            {saveError && <span className="text-xs text-red-600">{saveError}</span>}
            {!creating && (
              <button
                type="button"
                onClick={handleDelete}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {/* Two-pane editor */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: code + meta */}
            <div className="w-1/2 flex flex-col border-r border-gray-200 overflow-auto">
              <div className="p-4 border-b border-gray-100">
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input
                  type="text"
                  value={editorDescription}
                  onChange={e => setEditorDescription(e.target.value)}
                  placeholder="What does this component do?"
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex-1 p-4 flex flex-col min-h-0">
                <label className="block text-xs text-gray-500 mb-1">Component Code (HTML / JS)</label>
                <textarea
                  value={editorCode}
                  onChange={e => setEditorCode(e.target.value)}
                  spellCheck={false}
                  className="flex-1 font-mono text-xs border border-gray-300 rounded p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none min-h-48"
                />
              </div>
              <div className="p-4 space-y-4 border-t border-gray-100">
                <PropEditor props={editorProps} onChange={setEditorProps} />
                <EventEditor events={editorEvents} onChange={setEditorEvents} />
              </div>
            </div>

            {/* Right: live preview */}
            <div className="w-1/2 flex flex-col bg-gray-50 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Live Preview</span>
                <span className="text-xs text-gray-400">(sandboxed iframe)</span>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <iframe
                  key={editorCode} // re-render on code change
                  title="Component preview"
                  sandbox="allow-scripts"
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>* { box-sizing: border-box; } body { margin: 0; padding: 8px; font-family: system-ui, sans-serif; }</style></head><body>${editorCode}</body></html>`}
                  className="w-full border border-gray-200 rounded bg-white"
                  style={{ minHeight: '200px' }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Select a component or create a new one
        </div>
      )}
    </div>
  );
}
