'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { FileSpreadsheet, Upload, CheckCircle, AlertCircle, Loader } from 'lucide-react';

interface AppInfo {
  id: string;
  tenant_slug: string;
  slug: string;
  name: string;
}

interface ImportResult {
  imported: number;
  columns: string[];
  error?: string;
}

export default function ImportGoogleSheetsPage() {
  const params = useParams<{ appId: string }>();
  const appId = params.appId;

  const [app, setApp] = useState<AppInfo | null>(null);
  const [loadingApp, setLoadingApp] = useState(true);
  const [appError, setAppError] = useState<string | null>(null);

  const [sheetUrl, setSheetUrl] = useState('');
  const [tableName, setTableName] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!appId) return;
    setLoadingApp(true);
    fetch(`/api/builder/apps/${appId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setAppError(data.error); return; }
        setApp(data);
      })
      .catch((e: Error) => setAppError(e.message))
      .finally(() => setLoadingApp(false));
  }, [appId]);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!app) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/portal2/${app.tenant_slug}/${app.slug}/import/google-sheets`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheetUrl, tableName, hasHeader }),
        },
      );
      const data = (await res.json()) as ImportResult;
      setResult(data);
    } catch (err) {
      setResult({ imported: 0, columns: [], error: (err as Error).message });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: '#009A8A' }}
          >
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Import from Google Sheets
            </h1>
            {app && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                App: <span className="font-medium">{app.name}</span>
              </p>
            )}
          </div>
        </div>

        {loadingApp && (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading app...</span>
          </div>
        )}

        {appError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-sm">{appError}</span>
          </div>
        )}

        {!loadingApp && app && (
          <form
            onSubmit={(e) => { void handleImport(e); }}
            className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 space-y-5"
          >
            {/* Sheet URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Google Sheets URL
              </label>
              <input
                type="url"
                required
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': '#009A8A' } as React.CSSProperties}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The sheet must be publicly readable (Share &gt; Anyone with the link).
              </p>
            </div>

            {/* Target table */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Target table name
              </label>
              <input
                type="text"
                required
                value={tableName}
                onChange={(e) => setTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="e.g. products"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Rows will be inserted into <code>tenant_{app.tenant_slug}.{tableName || '...'}</code>. Table is created if it does not exist.
              </p>
            </div>

            {/* Has header */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: '#009A8A' }}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                First row is a header row
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={importing}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-white text-sm font-medium transition-opacity disabled:opacity-60"
              style={{ backgroundColor: importing ? '#00786B' : '#009A8A' }}
            >
              {importing ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import rows
                </>
              )}
            </button>

            {/* Result */}
            {result && !result.error && (
              <div className="flex items-start gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">
                    {result.imported} row{result.imported !== 1 ? 's' : ''} imported
                  </p>
                  {result.columns.length > 0 && (
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                      Columns: {result.columns.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {result?.error && (
              <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-400">{result.error}</p>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
