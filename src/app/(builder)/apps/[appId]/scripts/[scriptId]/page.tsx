'use client';

/**
 * Script editor page — builder UI for viewing/editing a tenant script.
 * Route: /apps/[appId]/scripts/[scriptId]
 */

import React, { useEffect, useState, Suspense, lazy } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

// Monaco editor loaded lazily (optional peer dep — falls back to textarea if not installed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _dynamicImport = new Function('m', 'return import(m)') as (mod: string) => Promise<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MonacoEditor = lazy((): Promise<{ default: React.ComponentType<any> }> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _dynamicImport('@monaco-editor/react')
    .then((m: { default: React.ComponentType<any> }) => ({ default: m.default }))
    .catch(() => ({
      default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
        <textarea
          className="w-full h-64 font-mono text-sm p-2 border rounded bg-gray-900 text-gray-100"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ),
    }))
);

interface RunResult {
  success: boolean;
  output?: unknown;
  logs: string[];
  durationMs: number;
  error?: string;
}

interface TestResultItem {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

interface ScriptTemplate {
  id: string;
  name: string;
  code: string;
  category: string;
}

export default function ScriptEditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const appId = params.appId as string;
  const scriptId = params.scriptId as string;
  const tenant = searchParams.get('tenant') ?? '';

  const [code, setCode] = useState('// Loading...');
  const [scriptName, setScriptName] = useState('');
  const [loading, setLoading] = useState(true);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [testResults, setTestResults] = useState<TestResultItem[] | null>(null);
  const [running, setRunning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'editor' | 'logs' | 'tests'>('editor');
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);

  const apiBase = `/api/builder/apps/${appId}/scripts/${scriptId}`;
  const qs = tenant ? `?tenant=${tenant}` : '';

  // Load script
  useEffect(() => {
    fetch(`${apiBase}${qs}`)
      .then((r) => r.json())
      .then((data) => {
        setCode(data.code ?? '');
        setScriptName(data.name ?? scriptId);
      })
      .catch(() => setCode('// Error loading script'))
      .finally(() => setLoading(false));
  }, [apiBase, qs, scriptId]);

  // Load templates
  useEffect(() => {
    fetch(`/api/builder/apps/${appId}/scripts/templates`)
      .then((r) => r.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => {});
  }, [appId]);

  async function handleRun() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch(`${apiBase}/run${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      });
      const data = await res.json();
      setRunResult(data);
      setTab('logs');
    } finally {
      setRunning(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await fetch(`${apiBase}/test${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCases: [] }),
      });
      const data = await res.json();
      setTestResults(data.results ?? []);
      setTab('tests');
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`${apiBase}${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
    } finally {
      setSaving(false);
    }
  }

  function loadTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (tpl) setCode(tpl.code);
  }

  if (loading) {
    return <div className="p-8 text-gray-500">Loading script...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white">
        <h1 className="text-lg font-semibold">{scriptName || scriptId}</h1>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <select
              className="text-sm border rounded px-2 py-1"
              defaultValue=""
              onChange={(e) => loadTemplate(e.target.value)}
            >
              <option value="" disabled>Load template...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded border"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-3 py-1 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200"
          >
            {testing ? 'Testing...' : 'Run Tests'}
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded"
          >
            {running ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-gray-50 text-sm">
        {(['editor', 'logs', 'tests'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 capitalize ${tab === t ? 'border-b-2 border-blue-500 text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'editor' && (
          <Suspense fallback={<div className="p-4 text-gray-400">Loading editor...</div>}>
            <MonacoEditor
              height="100%"
              defaultLanguage="javascript"
              value={code}
              onChange={(v: string | undefined) => setCode(v ?? '')}
              theme="vs-dark"
              options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2 }}
            />
          </Suspense>
        )}

        {tab === 'logs' && (
          <div className="p-4 font-mono text-sm">
            {!runResult && <p className="text-gray-400">Run the script to see output here.</p>}
            {runResult && (
              <>
                <div className={`mb-3 font-semibold ${runResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {runResult.success ? 'Success' : 'Failed'} &mdash; {runResult.durationMs}ms
                </div>
                {runResult.error && (
                  <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700">
                    {runResult.error}
                  </div>
                )}
                {runResult.output !== undefined && (
                  <div className="mb-3">
                    <div className="text-gray-500 mb-1">Output:</div>
                    <pre className="p-2 bg-gray-800 text-gray-100 rounded overflow-auto text-xs">
                      {JSON.stringify(runResult.output, null, 2)}
                    </pre>
                  </div>
                )}
                {runResult.logs.length > 0 && (
                  <div>
                    <div className="text-gray-500 mb-1">Logs:</div>
                    {runResult.logs.map((l, i) => (
                      <div key={i} className="text-gray-700 py-0.5">{l}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'tests' && (
          <div className="p-4">
            {!testResults && <p className="text-gray-400 text-sm">Click &quot;Run Tests&quot; to execute test cases.</p>}
            {testResults && testResults.length === 0 && (
              <p className="text-gray-400 text-sm">No test cases defined for this script.</p>
            )}
            {testResults && testResults.map((r, i) => (
              <div key={i} className={`mb-2 p-3 rounded border text-sm ${r.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2">
                  <span className={r.passed ? 'text-green-600' : 'text-red-600'}>
                    {r.passed ? '\u2713' : '\u00d7'}
                  </span>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-gray-400 text-xs ml-auto">{r.durationMs}ms</span>
                </div>
                {r.error && <div className="mt-1 text-red-600 text-xs">{r.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
