'use client';

import React from 'react';

export interface WorkerAction {
  id: string;
  label: string;
  icon: string;
  color: string;
  onClick: () => void;
}

export interface RecentItem {
  id: string;
  label: string;
  timestamp: Date;
}

export interface WorkerModeTemplateProps {
  title: string;
  actions: WorkerAction[];
  recentItems?: RecentItem[];
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function WorkerModeTemplate({ title, actions, recentItems = [] }: WorkerModeTemplateProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 text-center">{title}</h1>
      </header>

      {/* Action Grid */}
      <main className="flex-1 p-4">
        <div className="grid grid-cols-2 gap-3">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={action.onClick}
              className="rounded-2xl flex flex-col items-center justify-center gap-2 py-5 px-3 font-semibold text-white text-base shadow-md active:scale-95 transition-transform select-none"
              style={{
                backgroundColor: action.color,
                minHeight: '80px',
              }}
            >
              <span className="text-3xl" aria-hidden="true">{action.icon}</span>
              <span className="text-sm leading-tight text-center">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Recent Items */}
        {recentItems.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
              Recent
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden shadow-sm">
              {recentItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-gray-800 truncate max-w-[70%]">{item.label}</span>
                  <span className="text-xs text-gray-400 ml-2 shrink-0">{formatRelativeTime(item.timestamp)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
