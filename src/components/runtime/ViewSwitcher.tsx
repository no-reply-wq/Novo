'use client';

/**
 * ViewSwitcher — toggle between Grid, Kanban, Calendar, and List views for a table.
 * Persists the user's choice in localStorage (per table).
 */

import React, { useEffect, useState } from 'react';
import {
  LayoutGrid,
  Columns3,
  Calendar,
  List,
} from 'lucide-react';
import { KanbanView, type KanbanViewProps } from './KanbanView';
import { CalendarView, type CalendarViewProps } from './CalendarView';

type ViewMode = 'grid' | 'kanban' | 'calendar' | 'list';

interface ViewButton {
  key: ViewMode;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const VIEWS: ViewButton[] = [
  { key: 'grid', label: 'Grid', Icon: LayoutGrid },
  { key: 'kanban', label: 'Kanban', Icon: Columns3 },
  { key: 'calendar', label: 'Calendar', Icon: Calendar },
  { key: 'list', label: 'List', Icon: List },
];

/** Config needed only when switching to Kanban. */
export interface KanbanConfig extends Omit<KanbanViewProps, 'tenantSlug' | 'tableId' | 'tableSlug'> {
  tableSlug: string;
}

/** Config needed only when switching to Calendar. */
export interface CalendarConfig extends Omit<CalendarViewProps, 'tenantSlug' | 'tableId'> {}

export interface ViewSwitcherProps {
  tenantSlug: string;
  tableId: string;
  /** Rendered for Grid and List modes (the caller supplies the actual table/list UI). */
  gridContent: React.ReactNode;
  listContent?: React.ReactNode;
  /** If not provided, Kanban button is disabled. */
  kanbanConfig?: KanbanConfig;
  /** If not provided, Calendar button is disabled. */
  calendarConfig?: CalendarConfig;
  /** localStorage key suffix — defaults to tableId. */
  storageKey?: string;
}

function getStoredView(key: string): ViewMode {
  try {
    const v = localStorage.getItem(`view_pref_${key}`);
    if (v === 'grid' || v === 'kanban' || v === 'calendar' || v === 'list') return v;
  } catch {
    // localStorage unavailable (private browsing / blocked)
  }
  return 'grid';
}

function setStoredView(key: string, view: ViewMode): void {
  try {
    localStorage.setItem(`view_pref_${key}`, view);
  } catch {
    // ignore
  }
}

export function ViewSwitcher({
  tenantSlug,
  tableId,
  gridContent,
  listContent,
  kanbanConfig,
  calendarConfig,
  storageKey,
}: ViewSwitcherProps) {
  const prefKey = storageKey ?? tableId;
  const [activeView, setActiveView] = useState<ViewMode>('grid');

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setActiveView(getStoredView(prefKey));
  }, [prefKey]);

  const handleSwitch = (view: ViewMode) => {
    setActiveView(view);
    setStoredView(prefKey, view);
  };

  const isDisabled = (key: ViewMode): boolean => {
    if (key === 'kanban') return !kanbanConfig;
    if (key === 'calendar') return !calendarConfig;
    return false;
  };

  return (
    <div>
      {/* View toggle bar */}
      <div className="flex gap-1 mb-3">
        {VIEWS.map(({ key, label, Icon }) => {
          const disabled = isDisabled(key);
          const active = activeView === key;
          return (
            <button
              key={key}
              disabled={disabled}
              onClick={() => !disabled && handleSwitch(key)}
              title={disabled ? `${label} view requires configuration` : label}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : disabled
                  ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeView === 'grid' && gridContent}

      {activeView === 'list' && (listContent ?? gridContent)}

      {activeView === 'kanban' && kanbanConfig && (
        <KanbanView
          tenantSlug={tenantSlug}
          tableId={tableId}
          tableSlug={kanbanConfig.tableSlug}
          groupByField={kanbanConfig.groupByField}
          titleField={kanbanConfig.titleField}
          subtitleField={kanbanConfig.subtitleField}
          statusOptions={kanbanConfig.statusOptions}
        />
      )}

      {activeView === 'calendar' && calendarConfig && (
        <CalendarView
          tenantSlug={tenantSlug}
          tableId={tableId}
          dateField={calendarConfig.dateField}
          titleField={calendarConfig.titleField}
          colorField={calendarConfig.colorField}
        />
      )}
    </div>
  );
}
