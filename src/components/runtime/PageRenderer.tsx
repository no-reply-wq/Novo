'use client';

import React, { useState, useCallback, useEffect } from 'react';
import type { AppPage, ComponentInstance, BindingContext, QueryResult, Row } from '@/types/runtime';
import { resolveBindings, buildBindingContext } from '@/lib/runtime/binding';
import { runActionChain } from '@/lib/runtime/actions';
import type { ActionContext } from '@/lib/runtime/actions';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
// Note: PageRenderer must be rendered inside <ToastProvider> (AppShell provides this)
import { TableComponent } from './components/TableComponent';
import { FormComponent } from './components/FormComponent';
import { StatCardComponent } from './components/StatCardComponent';
import { ButtonComponent } from './components/ButtonComponent';
import { KanbanComponent } from './components/KanbanComponent';
import { CalendarComponent } from './components/CalendarComponent';
import { TimelineComponent } from './components/TimelineComponent';
import { ChartComponent } from './components/ChartComponent';
import { LineItemGridComponent } from './components/LineItemGridComponent';
import { ScannerComponent } from './components/ScannerComponent';
import { EInvoiceButton } from './components/EInvoiceButton';
import { EWayBillButton } from './components/EWayBillButton';
import { GSTR1Panel } from './components/GSTR1Panel';

export interface PageRendererProps {
  page: AppPage;
  tenantSlug: string;
  appSlug: string;
}

export function PageRenderer({ page, tenantSlug, appSlug }: PageRendererProps) {
  const router = useRouter();
  const toast = useToast();

  const [queryResults, setQueryResults] = useState<Record<string, QueryResult>>({});
  const [pageState, setPageStateStore] = useState<Record<string, unknown>>({});
  const [openModalId, setOpenModalId] = useState<string | null>(null);

  // Execute all queries on mount (and when page changes)
  useEffect(() => {
    if (page.queries.length === 0) return;

    const fetchAll = async () => {
      const results: Record<string, QueryResult> = {};
      await Promise.all(
        page.queries.map(async (q) => {
          try {
            const res = await fetch('/api/runtime/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ definition: q }),
            });
            if (res.ok) {
              results[q.name] = (await res.json()) as QueryResult;
            }
          } catch {
            results[q.name] = { data: [], total: 0, page: 1, selectedRow: null };
          }
        }),
      );
      setQueryResults(results);
    };

    void fetchAll();
  }, [page.id]);

  // Helpers used by action runner
  const user = { id: '', name: '', role: '', locations: [] as string[] };

  const buildCtx = useCallback(
    (urlParams: Record<string, string> = {}): BindingContext =>
      buildBindingContext(queryResults, pageState, user, urlParams),
    [queryResults, pageState],
  );

  const refreshQuery = useCallback(
    async (queryId: string) => {
      const def = page.queries.find((q) => q.id === queryId || q.name === queryId);
      if (!def) return;
      try {
        const res = await fetch('/api/runtime/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ definition: def }),
        });
        if (res.ok) {
          const result = (await res.json()) as QueryResult;
          setQueryResults((prev: Record<string, QueryResult>) => ({ ...prev, [def.name]: result }));
        }
      } catch {
        // silent
      }
    },
    [page.queries],
  );

  const makeActionCtx = useCallback(
    (): ActionContext => ({
      tenantSlug,
      appSlug,
      bindingContext: buildCtx(),
      navigate: (pg, params) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        router.push(`/${tenantSlug}/${appSlug}/p/${pg}${qs}`);
      },
      openModal: (id) => setOpenModalId(id),
      submitForm: async () => { /* handled by FormComponent */ },
      refreshQuery,
      setPageState: (key, value) => setPageStateStore((prev: Record<string, unknown>) => ({ ...prev, [key]: value })),
      showToast: (message, variant) => toast.add({ message, variant }),
      runWorkflow: async (workflowId, input) => {
        await fetch('/api/platform/workflows/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflowId, input }),
        });
      },
    }),
    [tenantSlug, appSlug, buildCtx, refreshQuery, router, toast],
  );

  const { columns, rowHeight, gap } = page.layout;

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridAutoRows: `${rowHeight}px`,
    gap: `${gap}px`,
    padding: `${gap}px`,
  };

  return (
    <div style={gridStyle} className="w-full min-h-full">
      {page.components.map((component) => (
        <ComponentWrapper
          key={component.id}
          component={component}
          bindingContext={buildCtx()}
          makeActionCtx={makeActionCtx}
          queryResults={queryResults}
          onRowSelect={(queryName, row) => {
            setQueryResults((prev: Record<string, QueryResult>) => ({
              ...prev,
              [queryName]: { ...prev[queryName], selectedRow: row },
            }));
          }}
        />
      ))}
    </div>
  );
}

// ─── Component wrapper ────────────────────────────────────────────────────────

interface ComponentWrapperProps {
  component: ComponentInstance;
  bindingContext: BindingContext;
  makeActionCtx: () => ActionContext;
  queryResults: Record<string, QueryResult>;
  onRowSelect: (queryName: string, row: Row) => void;
}

function ComponentWrapper({
  component,
  bindingContext,
  makeActionCtx,
  queryResults,
  onRowSelect,
}: ComponentWrapperProps) {
  const { gridArea, style } = component;
  const resolvedProps = resolveBindings(component.props, bindingContext);

  const wrapperStyle: React.CSSProperties = {
    gridColumnStart: gridArea.colStart,
    gridColumnEnd: gridArea.colEnd,
    gridRowStart: gridArea.rowStart,
    gridRowEnd: gridArea.rowEnd,
    ...style,
  };

  const handleEvent = useCallback(
    (eventName: string) => {
      const binding = component.events.find((e) => e.event === eventName);
      if (!binding) return;
      void runActionChain(binding.actions, makeActionCtx());
    },
    [component.events, makeActionCtx],
  );

  return (
    <div style={wrapperStyle}>
      <RuntimeComponent
        component={component}
        resolvedProps={resolvedProps}
        queryResults={queryResults}
        onEvent={handleEvent}
        onRowSelect={onRowSelect}
      />
    </div>
  );
}

// ─── Component dispatch ───────────────────────────────────────────────────────

interface RuntimeComponentProps {
  component: ComponentInstance;
  resolvedProps: Record<string, unknown>;
  queryResults: Record<string, QueryResult>;
  onEvent: (eventName: string) => void;
  onRowSelect: (queryName: string, row: Row) => void;
}

function RuntimeComponent({
  component,
  resolvedProps,
  queryResults,
  onEvent,
  onRowSelect,
}: RuntimeComponentProps) {
  switch (component.type) {
    case 'text':
      return <p className="text-sm text-gray-700">{String(resolvedProps['content'] ?? '')}</p>;

    case 'heading':
      return (
        <h2 className="text-xl font-semibold text-gray-900">
          {String(resolvedProps['content'] ?? '')}
        </h2>
      );

    case 'divider':
      return <hr className="border-gray-200" />;

    case 'image':
      return resolvedProps['src'] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={String(resolvedProps['src'])}
          alt={String(resolvedProps['alt'] ?? '')}
          className="max-w-full h-auto"
        />
      ) : null;

    case 'statcard':
      return (
        <StatCardComponent
          value={resolvedProps['value']}
          label={String(resolvedProps['label'] ?? '')}
          trend={resolvedProps['trend'] as 'up' | 'down' | undefined}
        />
      );

    case 'button':
      return (
        <ButtonComponent
          label={String(resolvedProps['label'] ?? 'Button')}
          variant={resolvedProps['variant'] as 'primary' | 'secondary' | 'ghost' | 'danger' | undefined}
          disabled={Boolean(resolvedProps['disabled'])}
          onClick={() => onEvent('onClick')}
        />
      );

    case 'table': {
      const queryName = String(resolvedProps['queryName'] ?? '');
      const qr = queryResults[queryName];
      return (
        <TableComponent
          queryResult={qr ?? { data: [], total: 0, page: 1, selectedRow: null }}
          onRowClick={(row) => {
            onRowSelect(queryName, row);
            onEvent('onRowClick');
          }}
        />
      );
    }

    case 'form': {
      const tableId = String(resolvedProps['tableId'] ?? '');
      return (
        <FormComponent
          tableId={tableId}
          onSubmit={() => onEvent('onSubmit')}
        />
      );
    }

    case 'kanban': {
      const queryName = String(resolvedProps['queryName'] ?? '');
      const qr = queryResults[queryName];
      return (
        <KanbanComponent
          data={qr?.data ?? []}
          groupByField={String(resolvedProps['groupByField'] ?? 'status')}
          columns={Array.isArray(resolvedProps['columns']) ? (resolvedProps['columns'] as string[]) : undefined}
          titleField={String(resolvedProps['titleField'] ?? 'title')}
          subtitleField={resolvedProps['subtitleField'] ? String(resolvedProps['subtitleField']) : undefined}
          colorField={resolvedProps['colorField'] ? String(resolvedProps['colorField']) : undefined}
          onCardClick={(row) => { onRowSelect(queryName, row); onEvent('onCardClick'); }}
          onCardMove={(_rowId, _newStatus) => onEvent('onCardMove')}
        />
      );
    }

    case 'calendar': {
      const queryName = String(resolvedProps['queryName'] ?? '');
      const qr = queryResults[queryName];
      return (
        <CalendarComponent
          data={qr?.data ?? []}
          dateField={String(resolvedProps['dateField'] ?? 'date')}
          endDateField={resolvedProps['endDateField'] ? String(resolvedProps['endDateField']) : undefined}
          titleField={String(resolvedProps['titleField'] ?? 'title')}
          colorField={resolvedProps['colorField'] ? String(resolvedProps['colorField']) : undefined}
          view={(resolvedProps['view'] as 'month' | 'week') ?? 'month'}
          onEventClick={(row) => { onRowSelect(queryName, row); onEvent('onEventClick'); }}
          onDateClick={(_date) => onEvent('onDateClick')}
        />
      );
    }

    case 'timeline': {
      const queryName = String(resolvedProps['queryName'] ?? '');
      const qr = queryResults[queryName];
      return (
        <TimelineComponent
          data={qr?.data ?? []}
          startField={String(resolvedProps['startField'] ?? 'startDate')}
          endField={String(resolvedProps['endField'] ?? 'endDate')}
          titleField={String(resolvedProps['titleField'] ?? 'title')}
          groupField={resolvedProps['groupField'] ? String(resolvedProps['groupField']) : undefined}
          colorField={resolvedProps['colorField'] ? String(resolvedProps['colorField']) : undefined}
          onBarClick={(row) => { onRowSelect(queryName, row); onEvent('onBarClick'); }}
        />
      );
    }

    case 'chart': {
      const queryName = String(resolvedProps['queryName'] ?? '');
      const qr = queryResults[queryName];
      return (
        <ChartComponent
          data={qr?.data ?? []}
          chartType={(resolvedProps['chartType'] as 'bar' | 'line' | 'pie' | 'area' | 'number') ?? 'bar'}
          xField={resolvedProps['xField'] ? String(resolvedProps['xField']) : undefined}
          yField={resolvedProps['yField'] ? String(resolvedProps['yField']) : undefined}
          title={resolvedProps['title'] ? String(resolvedProps['title']) : undefined}
          height={resolvedProps['height'] ? Number(resolvedProps['height']) : undefined}
        />
      );
    }

    case 'line_item_grid': {
      const queryName = String(resolvedProps['queryName'] ?? '');
      const qr = queryResults[queryName];
      const gridColumns = Array.isArray(resolvedProps['columns'])
        ? (resolvedProps['columns'] as import('./components/LineItemGridComponent').GridColumn[])
        : [];
      return (
        <LineItemGridComponent
          rows={qr?.data ?? []}
          columns={gridColumns}
          onRowChange={(_rowId, _field, _value) => onEvent('onRowChange')}
          onRowAdd={() => onEvent('onRowAdd')}
          onRowDelete={(_rowId) => onEvent('onRowDelete')}
          totalsRow={Boolean(resolvedProps['totalsRow'])}
        />
      );
    }

    case 'scanner': {
      return (
        <ScannerComponent
          onScan={(_code, _format) => onEvent('onScan')}
          continuous={Boolean(resolvedProps['continuous'])}
          formats={Array.isArray(resolvedProps['formats']) ? (resolvedProps['formats'] as string[]) : undefined}
          placeholder={resolvedProps['placeholder'] ? String(resolvedProps['placeholder']) : undefined}
        />
      );
    }

    case 'einvoice_button': {
      return (
        <EInvoiceButton
          tenantSlug={tenantSlug}
          tableId={String(resolvedProps['tableId'] ?? '')}
          recordId={String(resolvedProps['recordId'] ?? '')}
          currentIrn={resolvedProps['currentIrn'] ? String(resolvedProps['currentIrn']) : undefined}
          currentStatus={resolvedProps['currentStatus'] ? String(resolvedProps['currentStatus']) : undefined}
        />
      );
    }

    case 'ewaybill_button': {
      return (
        <EWayBillButton
          tenantSlug={String(resolvedProps['tenantSlug'] ?? '')}
          tableId={String(resolvedProps['tableId'] ?? '')}
          recordId={String(resolvedProps['recordId'] ?? '')}
          currentEwbNo={resolvedProps['currentEwbNo'] ? String(resolvedProps['currentEwbNo']) : undefined}
          validTill={resolvedProps['validTill'] ? String(resolvedProps['validTill']) : undefined}
          currentStatus={resolvedProps['currentStatus'] ? String(resolvedProps['currentStatus']) : undefined}
        />
      );
    }

    case 'container':
      return (
        <div className="rounded border border-gray-200 bg-white p-3">
          {String(resolvedProps['label'] ?? '')}
        </div>
      );

    case 'badge':
      return (
        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
          {String(resolvedProps['label'] ?? '')}
        </span>
      );

    case 'progress': {
      const pct = Math.min(100, Math.max(0, Number(resolvedProps['value'] ?? 0)));
      return (
        <div className="w-full">
          {resolvedProps['label'] && (
            <p className="mb-1 text-xs text-gray-500">{String(resolvedProps['label'])}</p>
          )}
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    }

    case 'gstr1_panel': {
      const gstr1TenantSlug = String(resolvedProps['tenantSlug'] ?? tenantSlug);
      const gstr1AppId = String(resolvedProps['appId'] ?? '');
      return <GSTR1Panel tenantSlug={gstr1TenantSlug} appId={gstr1AppId} />;
    }

    default:
      return (
        <div className="rounded border border-dashed border-gray-300 p-2 text-xs text-gray-400">
          [{component.type}]
        </div>
      );
  }
}
