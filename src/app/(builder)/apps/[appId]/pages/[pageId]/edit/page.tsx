'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ChevronRight, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CanvasPage, ComponentInstance, PageStateVar } from '@/platform/ui/canvas/types';
import { ComponentPalette } from '@/components/builder/canvas/ComponentPalette';
import { PageCanvas } from '@/components/builder/canvas/PageCanvas';
import { PropertyPanel } from '@/components/builder/canvas/PropertyPanel';
import { PageStatePanel } from '@/components/builder/canvas/PageStatePanel';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span className={cn('flex items-center gap-1 text-xs',
      status === 'saving' && 'text-slate-400', status === 'saved' && 'text-green-600', status === 'error' && 'text-red-500')}>
      {status === 'saving' && <Loader2 size={12} className="animate-spin" />}
      {status === 'saved' && <CheckCircle2 size={12} />}
      {status === 'error' && <AlertCircle size={12} />}
      {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save failed'}
    </span>
  );
}

export default function PageEditorPage() {
  const params = useParams();
  const appId = params.appId as string;
  const pageId = params.pageId as string;
  const router = useRouter();

  const [page, setPage] = useState<CanvasPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/builder/apps/${appId}/pages/${pageId}`)
      .then((r) => { if (!r.ok) throw new Error('Not found'); return r.json() as Promise<CanvasPage>; })
      .then((data) => { setPage(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [appId, pageId]);

  const save = useCallback(async (p: CanvasPage) => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/builder/apps/${appId}/pages/${pageId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      });
      setSaveStatus(res.ok ? 'saved' : 'error');
    } catch { setSaveStatus('error'); }
    setTimeout(() => setSaveStatus('idle'), 2500);
  }, [appId, pageId]);

  const handleChange = useCallback((updated: CanvasPage) => {
    setPage(updated);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(updated), 2000);
  }, [save]);

  const handleSaveNow = () => {
    if (!page) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    save(page);
  };

  const selectedComponent = page?.components.find((c) => c.id === selectedId) ?? null;

  const handleUpdateComponent = useCallback((updated: ComponentInstance) => {
    if (!page) return;
    handleChange({ ...page, components: page.components.map((c) => c.id === updated.id ? updated : c) });
  }, [page, handleChange]);

  const handleUpdatePageState = useCallback((vars: PageStateVar[]) => {
    if (!page) return;
    handleChange({ ...page, pageState: vars });
  }, [page, handleChange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-400">
        <Loader2 size={24} className="animate-spin mr-2" /> Loading page…
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-2 text-slate-500">
        <AlertCircle size={32} />
        <p>Page not found</p>
        <button onClick={() => router.back()} className="text-sm text-blue-500 hover:underline">Go back</button>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex flex-col h-screen overflow-hidden bg-slate-100 dark:bg-slate-900">
        <header className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <nav className="flex items-center gap-1 text-xs text-slate-500 mr-4">
            <button onClick={() => router.push(`/apps/${appId}/pages`)} className="hover:text-slate-700 dark:hover:text-slate-200">Pages</button>
            <ChevronRight size={12} />
            <span className="font-medium text-slate-700 dark:text-slate-200">{page.name}</span>
          </nav>
          <div className="flex-1" />
          <SaveIndicator status={saveStatus} />
          <button onClick={handleSaveNow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            <Save size={13} /> Save
          </button>
          {/* Preview control removed: it pointed at /apps/[appId]/preview, which
              does not exist (404). The live app is served by the runtime route
              /[tenantSlug]/[appSlug]/p/[pageSlug], whose tenant and app slugs
              are not available in this builder editor context, so there is no
              correct target to link to from here. */}
        </header>
        <div className="flex flex-1 overflow-hidden">
          <ComponentPalette />
          <PageCanvas page={page} onChange={handleChange} selectedId={selectedId} onSelectComponent={setSelectedId} />
          <div className="flex flex-col w-[280px] shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-y-auto">
            <PropertyPanel component={selectedComponent} onUpdate={handleUpdateComponent} onDeselect={() => setSelectedId(null)} />
            <PageStatePanel vars={page.pageState} onChange={handleUpdatePageState} />
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
