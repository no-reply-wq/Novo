"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { CustomComponentDef, ComponentPropSchema } from "@/platform/components/types";

type PropType = ComponentPropSchema["type"];
const PROP_TYPES: PropType[] = ["string", "number", "boolean", "record", "records", "expression"];

function PropSchemaEditor({ schema, onChange }: { schema: ComponentPropSchema[]; onChange: (s: ComponentPropSchema[]) => void }) {
  const add = () => onChange([...schema, { name: "", type: "string", label: "", required: false }]);
  const update = (i: number, patch: Partial<ComponentPropSchema>) => onChange(schema.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const remove = (i: number) => onChange(schema.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Props Schema</span>
        <button type="button" onClick={add} className="text-xs text-indigo-600 hover:underline">+ Add prop</button>
      </div>
      {schema.length === 0 && <p className="text-xs text-gray-400">No props defined yet.</p>}
      {schema.map((prop, i) => (
        <div key={i} className="grid grid-cols-5 gap-2 items-center">
          <input type="text" placeholder="name" value={prop.name} onChange={e => update(i, { name: e.target.value })} className="col-span-1 text-xs border border-gray-300 rounded px-2 py-1" />
          <input type="text" placeholder="label" value={prop.label} onChange={e => update(i, { label: e.target.value })} className="col-span-1 text-xs border border-gray-300 rounded px-2 py-1" />
          <select value={prop.type} onChange={e => update(i, { type: e.target.value as PropType })} className="col-span-1 text-xs border border-gray-300 rounded px-2 py-1">
            {PROP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="col-span-1 flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" checked={prop.required ?? false} onChange={e => update(i, { required: e.target.checked })} /> required
          </label>
          <button type="button" onClick={() => remove(i)} className="col-span-1 text-xs text-gray-400 hover:text-red-500">Remove</button>
        </div>
      ))}
    </div>
  );
}

export default function ComponentDefEditorPage() {
  const { appId, componentId } = useParams<{ appId: string; componentId: string }>();
  const router = useRouter();
  const isNew = componentId === "new";
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("// Export a default React component\nexport default function MyComponent(props) {\n  return <div>Hello from {props.title ?? \'custom component\'}</div>;\n}\n");
  const [propsSchema, setPropsSchema] = useState<ComponentPropSchema[]>([]);
  const [previewPropsJson, setPreviewPropsJson] = useState("{}");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : componentId);

  const loadExisting = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/component-defs/${componentId}`);
      if (!res.ok) { router.push(`/apps/${appId}/component-defs`); return; }
      const data = await res.json() as { component: CustomComponentDef };
      const c = data.component;
      setSavedId(c.id); setName(c.name); setApiKey(c.apiKey); setDescription(c.description ?? "");
      setCode(c.code); setPropsSchema(c.propsSchema);
      setPreviewPropsJson(c.previewProps ? JSON.stringify(c.previewProps, null, 2) : "{}");
    } finally { setLoading(false); }
  }, [appId, componentId, isNew, router]);

  useEffect(() => { void loadExisting(); }, [loadExisting]);

  const handleValidate = async () => {
    const res = await fetch(`/api/builder/apps/${appId}/component-defs`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "__validate__", apiKey: apiKey || "__validate__", code }),
    });
    const data = await res.json() as { errors?: string[]; warnings?: string[] };
    if (!res.ok) { setValidationErrors(data.errors ?? []); setValidationWarnings(data.warnings ?? []); }
    else { setValidationErrors([]); setValidationWarnings(data.warnings ?? []); }
  };

  const handlePreview = async () => {
    if (!savedId) return;
    let props: Record<string, unknown> = {};
    try { props = JSON.parse(previewPropsJson) as Record<string, unknown>; } catch { /* noop */ }
    const res = await fetch(`/api/builder/apps/${appId}/component-defs/${savedId}/preview`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ props }),
    });
    const data = await res.json() as { html?: string };
    setPreviewHtml(data.html ?? "");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let previewProps: Record<string, unknown> | undefined;
      try { previewProps = JSON.parse(previewPropsJson) as Record<string, unknown>; } catch { /* noop */ }
      const payload = { name, apiKey, description: description || undefined, code, propsSchema, previewProps };
      const url = isNew ? `/api/builder/apps/${appId}/component-defs` : `/api/builder/apps/${appId}/component-defs/${savedId}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json() as { errors?: string[]; component?: CustomComponentDef };
      if (!res.ok) { setValidationErrors(data.errors ?? ["Save failed"]); return; }
      setValidationErrors([]);
      if (isNew && data.component) router.push(`/apps/${appId}/component-defs/${data.component.id}`);
      else await loadExisting();
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{isNew ? "New Custom Component" : `Edit: ${name}`}</h1>
        <div className="flex gap-2">
          <button onClick={() => router.push(`/apps/${appId}/component-defs`)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">Back</button>
          <button onClick={() => void handleSave()} disabled={saving} className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Display Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="GST Summary Box" className="w-full text-sm border border-gray-300 rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">API Key (snake_case)</label>
          <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="gst_summary_box" className="w-full text-sm border border-gray-300 rounded px-3 py-2 font-mono" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" className="w-full text-sm border border-gray-300 rounded px-3 py-2" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700">Component Code (ESM React)</label>
          <button type="button" onClick={() => void handleValidate()} className="text-xs text-indigo-600 hover:underline">Validate</button>
        </div>
        <textarea value={code} onChange={e => setCode(e.target.value)} rows={16} spellCheck={false} className="w-full text-sm border border-gray-300 rounded px-3 py-2 font-mono leading-relaxed" />
        {validationErrors.length > 0 && <div className="mt-2 space-y-1">{validationErrors.map((e, i) => <p key={i} className="text-xs text-red-600">x {e}</p>)}</div>}
        {validationWarnings.length > 0 && <div className="mt-2 space-y-1">{validationWarnings.map((w, i) => <p key={i} className="text-xs text-yellow-600">! {w}</p>)}</div>}
      </div>
      <div className="border border-gray-200 rounded-lg p-4">
        <PropSchemaEditor schema={propsSchema} onChange={setPropsSchema} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Preview Props (JSON)</label>
          <textarea value={previewPropsJson} onChange={e => setPreviewPropsJson(e.target.value)} rows={6} spellCheck={false} className="w-full text-sm border border-gray-300 rounded px-3 py-2 font-mono" />
          {savedId && <button type="button" onClick={() => void handlePreview()} className="mt-2 text-xs text-indigo-600 hover:underline">Render Preview</button>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Preview</label>
          {previewHtml != null
            ? <div className="border border-gray-200 rounded p-3 min-h-32 text-sm" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            : <div className="border border-dashed border-gray-200 rounded p-3 min-h-32 flex items-center justify-center text-xs text-gray-400">Save first, then click Render Preview</div>
          }
        </div>
      </div>
    </div>
  );
}
