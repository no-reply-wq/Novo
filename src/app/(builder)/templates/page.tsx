"use client";

/**
 * Template Gallery — /templates
 *
 * Shows all available starter templates with filter bar and install modal.
 */

import React, { useState } from 'react';
import type { AppTemplate } from '@/platform/templates/types';
import { TEMPLATES } from '@/platform/templates';

type Category = 'all' | AppTemplate['category'];

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  erp: 'ERP',
  hrms: 'HRMS',
  lms: 'LMS',
  crm: 'CRM',
  inventory: 'Inventory',
  custom: 'Custom',
};

function TemplateCard({
  template,
  onPreview,
}: {
  template: AppTemplate;
  onPreview: (t: AppTemplate) => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden">
      <div className="h-2 w-full" style={{ backgroundColor: template.color }} />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-3">
          <span
            className="text-3xl w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${template.color}22` }}
            aria-hidden="true"
          >
            {template.icon}
          </span>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">{template.name}</h3>
            {template.industry && (
              <p className="text-xs text-gray-500 mt-0.5">{template.industry}</p>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{template.description}</p>
        <ul className="space-y-1 flex-1">
          {template.features.slice(0, 4).map((f) => (
            <li key={f} className="flex items-start gap-1.5 text-xs text-gray-600">
              <span className="text-green-500 mt-0.5 shrink-0">&#10003;</span>
              <span>{f}</span>
            </li>
          ))}
          {template.features.length > 4 && (
            <li className="text-xs text-gray-400">+{template.features.length - 4} more features</li>
          )}
        </ul>
        <button
          onClick={() => onPreview(template)}
          className="mt-2 w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: template.color }}
        >
          Use this template
        </button>
      </div>
    </div>
  );
}

function InstallModal({
  template,
  onClose,
  onInstall,
  installing,
}: {
  template: AppTemplate;
  onClose: () => void;
  onInstall: (template: AppTemplate, name: string) => Promise<void>;
  installing: boolean;
}) {
  const [name, setName] = useState(template.name);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: template.color }} />
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <span
              className="text-4xl w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${template.color}22` }}
            >
              {template.icon}
            </span>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{template.name}</h2>
              {template.industry && <p className="text-sm text-gray-500">{template.industry}</p>}
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{template.description}</p>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              What&apos;s included
            </p>
            <ul className="space-y-1.5">
              {template.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-green-500 mt-0.5 shrink-0">&#10003;</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label
              className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1"
              htmlFor="app-name"
            >
              App name
            </label>
            <input
              id="app-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void onInstall(template, name)}
              disabled={installing || !name.trim()}
              className="flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: template.color }}
            >
              {installing ? 'Installing…' : 'Create app'}
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
          aria-label="Close"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [preview, setPreview] = useState<AppTemplate | null>(null);
  const [installing, setInstalling] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const categories = [
    'all',
    ...Array.from(new Set(TEMPLATES.map((t) => t.category))),
  ] as Category[];

  const filtered =
    activeCategory === 'all'
      ? TEMPLATES
      : TEMPLATES.filter((t) => t.category === activeCategory);

  async function handleInstall(template: AppTemplate, name: string) {
    setInstalling(true);
    try {
      const tenantSlug =
        typeof window !== 'undefined' ? (window as Window & { __TENANT_SLUG__?: string }).__TENANT_SLUG__ ?? '' : '';
      const res = await fetch(`/api/builder/templates/${template.id}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: tenantSlug, name }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const { app } = (await res.json()) as { app: { id: string; name: string } };
      setPreview(null);
      setFlash({ type: 'success', message: `"${app.name}" created! Redirecting…` });
      setTimeout(() => {
        window.location.href = `/builder?app=${app.id}`;
      }, 1200);
    } catch (err) {
      setFlash({
        type: 'error',
        message: err instanceof Error ? err.message : 'Install failed',
      });
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Template Gallery</h1>
          <p className="mt-1 text-gray-500">
            Start your app from a battle-tested template. Customize everything after.
          </p>
        </div>

        {flash && (
          <div
            className={`mb-6 rounded-xl px-4 py-3 text-sm font-medium ${
              flash.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {flash.message}
          </div>
        )}

        <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
              }`}
            >
              {CATEGORY_LABELS[cat] ?? cat.toUpperCase()}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-gray-400 text-center py-20">No templates in this category yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <TemplateCard key={t.id} template={t} onPreview={setPreview} />
            ))}
          </div>
        )}
      </div>

      {preview && (
        <InstallModal
          template={preview}
          onClose={() => setPreview(null)}
          onInstall={handleInstall}
          installing={installing}
        />
      )}
    </div>
  );
}
