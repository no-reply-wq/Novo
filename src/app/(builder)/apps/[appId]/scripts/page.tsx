'use client';

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import type { ScriptDef } from '@/platform/contracts/rules';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScriptSummary {
  id: string;
  name: string;
  description?: string;
  language: 'javascript';
  version: number;
  updatedAt: string;
  testStatus?: 'pass' | 'fail' | 'untested';
}

interface TestResult {
  output: unknown;
  logs: string[];
  durationMs: number;
  error?: string;
}

// ─── SDK reference ────────────────────────────────────────────────────────────

const SDK_DOCS = [
  {
    name: 'sdk.db',
    methods: [
      'sdk.db.query(sql, params?) → rows[]',
      'sdk.db.insert(table, data) → row',
      'sdk.db.update(table, id, data) → row',
      'sdk.db.delete(table, id) → void',
    ],
  },
  {
    name: 'sdk.http',
    methods: [
      'sdk.http.get(url, headers?) → response',
      'sdk.http.post(url, body, headers?) → response',
      'sdk.http.put(url, body, headers?) → response',
      'sdk.http.delete(url, headers?) → response',
    ],
  },
  {
    name: 'sdk.secrets',
    methods: ['sdk.secrets.get(name) → string'],
  },
  {
    name: 'sdk.log',
    methods: [
      'sdk.log.info(msg, ...args)',
      'sdk.log.warn(msg, ...args)',
      'sdk.log.error(msg, ...args)',
    ],
  },
  {
    name: 'Formatting',
    methods: [
      'formatINR(amount: number) → string',
      'amountInWords(amount: number) → string',
    ],
  },
];

// ─── CodeMirror JS editor ─────────────────────────────────────────────────────

interface JsEditorProps {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}

function JsEditor({ value, onChange, readOnly = false }: JsEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        lineNumbers(),
        highlightActiveLine(),
        javascript(),
        oneDark,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.theme({
          '&': { height: '400px', borderRadius: '6px', overflow: 'hidden' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={containerRef} data-testid="js-editor" />;
}

// ─── Script detail ────────────────────────────────────────────────────────────

interface ScriptDetailProps {
  appId: string;
  scriptId: string;
  onBack: () => void;
}

function ScriptDetail({ appId, scriptId, onBack }: ScriptDetailProps) {
  const [script, setScript] = useState<ScriptDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testInput, setTestInput] = useState('{}');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [sdkOpen, setSdkOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/scripts/${scriptId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { script: ScriptDef };
      setScript(data.script);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [appId, scriptId]);

  const loadScriptRef = useRef(load);
  useLayoutEffect(() => { loadScriptRef.current = load; }, [load]);
  useEffect(() => {
    loadScriptRef.current().catch((e: unknown) => setError(String(e)));
  }, [appId, scriptId]);

  async function saveScript() {
    if (!script) return;
    setSaving(true);
    try {
      await fetch(`/api/builder/apps/${appId}/scripts/${scriptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: script.code }),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    if (!script) return;
    setTesting(true);
    setTestResult(null);
    try {
      let inputData: unknown = {};
      try {
        inputData = JSON.parse(testInput) as unknown;
      } catch {
        setError('Invalid JSON in test input');
        return;
      }
      const res = await fetch(`/api/builder/apps/${appId}/scripts/${scriptId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputData, code: script.code }),
      });
      const data = (await res.json()) as TestResult;
      setTestResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-fg, #64748b)' }}>
        Loading…
      </div>
    );
  }

  if (!script) {
    return (
      <div style={{ padding: 24, color: '#dc2626' }}>
        {error ?? 'Script not found'}
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: 'var(--muted-fg, #64748b)',
            padding: '4px 8px',
          }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, flex: 1 }}>{script.name}</h1>
        {saving && (
          <span style={{ fontSize: 12, color: 'var(--muted-fg, #64748b)' }}>Saving…</span>
        )}
        <button
          onClick={() => void saveScript()}
          disabled={saving}
          style={{
            padding: '7px 14px',
            background: 'var(--accent, #6366f1)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 500,
            fontSize: 13,
            cursor: saving ? 'wait' : 'pointer',
          }}
        >
          Save
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#dc2626',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        {/* Editor column */}
        <div>
          <div
            style={{
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 8,
              overflow: 'hidden',
              marginBottom: 16,
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--border, #e2e8f0)',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                color: 'var(--muted-fg, #64748b)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Script — JavaScript</span>
              <span>v{script.version}</span>
            </div>
            <JsEditor
              value={script.code}
              onChange={(code) => setScript({ ...script, code })}
            />
          </div>

          {/* Test panel */}
          <div
            style={{
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 8,
              background: 'var(--card-bg, #fff)',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border, #e2e8f0)',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Test
            </div>
            <div style={{ padding: 14 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--muted-fg, #64748b)',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Input (JSON)
              </label>
              <textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  background: 'var(--input-bg, #f8fafc)',
                  color: 'var(--foreground, #0f172a)',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => void runTest()}
                disabled={testing}
                style={{
                  marginTop: 8,
                  padding: '7px 14px',
                  background: testing ? 'var(--muted-fg, #64748b)' : '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 500,
                  fontSize: 13,
                  cursor: testing ? 'wait' : 'pointer',
                }}
              >
                {testing ? 'Running…' : '▶ Run Test'}
              </button>

              {testResult && (
                <div style={{ marginTop: 12 }}>
                  {testResult.error && (
                    <div
                      style={{
                        padding: 10,
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 6,
                        color: '#dc2626',
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', monospace",
                        marginBottom: 8,
                      }}
                    >
                      {testResult.error}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      marginBottom: 6,
                      fontSize: 11,
                      color: 'var(--muted-fg, #64748b)',
                    }}
                  >
                    <span>Duration: {testResult.durationMs}ms</span>
                    {!testResult.error && (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: '#dcfce7',
                          color: '#166534',
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        OK
                      </span>
                    )}
                  </div>
                  {testResult.logs.length > 0 && (
                    <div
                      style={{
                        padding: 8,
                        background: '#1e293b',
                        borderRadius: 6,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11,
                        color: '#94a3b8',
                        marginBottom: 8,
                        maxHeight: 120,
                        overflowY: 'auto',
                      }}
                    >
                      {testResult.logs.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                    </div>
                  )}
                  <div>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--muted-fg, #64748b)',
                        display: 'block',
                        marginBottom: 4,
                      }}
                    >
                      Output
                    </label>
                    <pre
                      style={{
                        margin: 0,
                        padding: 10,
                        background: '#f8fafc',
                        border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: 6,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11,
                        overflowX: 'auto',
                        color: 'var(--foreground, #0f172a)',
                      }}
                    >
                      {JSON.stringify(testResult.output, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SDK reference */}
        <div
          style={{
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 8,
            background: 'var(--card-bg, #fff)',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setSdkOpen(!sdkOpen)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--foreground, #0f172a)',
              borderBottom: sdkOpen ? '1px solid var(--border, #e2e8f0)' : 'none',
            }}
          >
            <span>SDK Reference</span>
            <span style={{ fontSize: 11, color: 'var(--muted-fg, #64748b)' }}>
              {sdkOpen ? '▲' : '▼'}
            </span>
          </button>
          {sdkOpen && (
            <div style={{ padding: 14 }}>
              {SDK_DOCS.map((section) => (
                <div key={section.name} style={{ marginBottom: 16 }}>
                  <p
                    style={{
                      margin: '0 0 6px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--accent, #6366f1)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {section.name}
                  </p>
                  {section.methods.map((m) => (
                    <code
                      key={m}
                      style={{
                        display: 'block',
                        fontSize: 11,
                        color: 'var(--foreground, #0f172a)',
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: '2px 0',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}
                    >
                      {m}
                    </code>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ScriptsPage() {
  const { appId } = useParams<{ appId: string }>();
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/scripts`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { scripts: ScriptSummary[] };
      setScripts(data.scripts);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const loadListRef = useRef(load);
  useLayoutEffect(() => { loadListRef.current = load; }, [load]);
  useEffect(() => {
    loadListRef.current().catch((e: unknown) => setError(String(e)));
  }, [appId]);

  async function createScript() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          code: `// ${newName.trim()}\nasync function main(input, sdk) {\n  // your code here\n  return {};\n}\n`,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { script: ScriptSummary };
      setScripts((s) => [...s, data.script]);
      setSelectedScriptId(data.script.id);
      setShowNew(false);
      setNewName('');
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  const statusColor = (s?: string) =>
    s === 'pass' ? '#22c55e' : s === 'fail' ? '#ef4444' : '#94a3b8';

  if (selectedScriptId) {
    return (
      <ScriptDetail
        appId={appId}
        scriptId={selectedScriptId}
        onBack={() => {
          setSelectedScriptId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Scripts</h1>
          <p style={{ color: 'var(--muted-fg, #64748b)', fontSize: 13, margin: '4px 0 0' }}>
            Custom JavaScript functions for use in workflows.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{
            padding: '8px 14px',
            background: 'var(--accent, #6366f1)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontWeight: 500,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          + New Script
        </button>
      </div>

      {showNew && (
        <div
          style={{
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            background: 'var(--card-bg, #fff)',
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createScript();
                if (e.key === 'Escape') setShowNew(false);
              }}
              placeholder="Script name…"
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 6,
                fontSize: 13,
                background: 'var(--input-bg, #f8fafc)',
                color: 'var(--foreground, #0f172a)',
              }}
            />
            <button
              onClick={() => void createScript()}
              disabled={creating || !newName.trim()}
              style={{
                padding: '8px 14px',
                background: 'var(--accent, #6366f1)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 500,
                fontSize: 13,
                cursor: creating ? 'wait' : 'pointer',
                opacity: !newName.trim() ? 0.6 : 1,
              }}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => setShowNew(false)}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 6,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--muted-fg, #64748b)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#dc2626',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-fg, #64748b)' }}>
          Loading…
        </div>
      )}

      {!loading && scripts.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            border: '1px dashed var(--border, #e2e8f0)',
            borderRadius: 8,
            color: 'var(--muted-fg, #64748b)',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚙️</div>
          <p style={{ margin: 0, fontWeight: 500 }}>No scripts yet</p>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            Create a script to run custom logic in workflows.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {scripts.map((script) => (
          <div
            key={script.id}
            onClick={() => setSelectedScriptId(script.id)}
            style={{
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 8,
              padding: '14px 16px',
              background: 'var(--card-bg, #fff)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColor(script.testStatus),
                flexShrink: 0,
              }}
              title={script.testStatus ?? 'untested'}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{script.name}</p>
              {script.description && (
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted-fg, #64748b)' }}>
                  {script.description}
                </p>
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--muted-fg, #64748b)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              v{script.version} · {new Date(script.updatedAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
