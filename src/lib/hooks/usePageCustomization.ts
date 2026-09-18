'use client';

/**
 * usePageCustomization
 *
 * The shared mechanism that was supposed to make UI Builder work
 * generically on any page, but was never actually wired into any of the
 * built-in module pages (Leads, Quotations, etc.) — the API existed,
 * saved data correctly, and just had nowhere to render.
 *
 * Any page calls this with its own page key and gets back the buttons,
 * table widgets, and column-visibility rules an admin configured for it
 * in UI Builder, already filtered to what's relevant. Rendering them is
 * handled by the companion components below — a page just needs to
 * drop <PageToolbarButtons> and <PageTableWidgets> in the right spots,
 * and pass hiddenColumns to whatever table component it's already using.
 */

import { useEffect, useState } from 'react';

export interface UIButtonConfig {
  id: string;
  label: string;
  icon: string;
  placement: 'toolbar' | 'row_actions';
  form_id: string;
  form_slug?: string;
  prefill_field: string;
}

export interface UITableWidgetConfig {
  id: string;
  title: string;
  source_table: string;
  columns: Array<{ key: string; label: string; type: string }>;
  filters: Array<{ column: string; value: string }>;
  show_sum_row: boolean;
  sum_columns: string[];
  collapsible: boolean;
  default_collapsed: boolean;
}

export interface PageCustomization {
  loading: boolean;
  toolbarButtons: UIButtonConfig[];
  rowButtons: UIButtonConfig[];
  tableWidgets: UITableWidgetConfig[];
  hiddenColumns: string[];
}

export function usePageCustomization(tenantSlug: string, pageKey: string): PageCustomization {
  const [state, setState] = useState<PageCustomization>({
    loading: true,
    toolbarButtons: [],
    rowButtons: [],
    tableWidgets: [],
    hiddenColumns: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    fetch(`/api/tenant/ui-builder?tenant=${tenantSlug}&pageKey=${encodeURIComponent(pageKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const buttons: UIButtonConfig[] = d.buttons ?? [];
        setState({
          loading: false,
          toolbarButtons: buttons.filter((b) => b.placement === 'toolbar'),
          rowButtons: buttons.filter((b) => b.placement === 'row_actions'),
          tableWidgets: d.tables ?? [],
          hiddenColumns: (d.visibility ?? []).map((v: { column_label: string }) => v.column_label),
        });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      });

    return () => { cancelled = true; };
  }, [tenantSlug, pageKey]);

  return state;
}
