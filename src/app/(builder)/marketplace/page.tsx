'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  icon: string;
  features: string[];
  version: string;
  author: string;
  downloads: number;
}

// ─── Static template data (from built-in templates) ───────────────────────────

const TEMPLATES: TemplateSummary[] = [
  {
    id: 'tpl-crm-001',
    name: 'CRM',
    slug: 'crm',
    description: 'Complete CRM for sales teams — manage leads, contacts, companies, and deals through a visual pipeline.',
    category: 'crm',
    icon: '🤝',
    features: [
      'Kanban lead pipeline with status tracking',
      'Contact and company management',
      'Deal tracking with win probability',
      'Activity log (calls, emails, meetings)',
      'Automated lead assignment notifications',
      'Dashboard with pipeline metrics',
    ],
    version: '1.0.0',
    author: 'Novo Marketplace',
    downloads: 1240,
  },
  {
    id: 'tpl-inv-001',
    name: 'Inventory Management',
    slug: 'inventory',
    description: 'Complete inventory management system with stock tracking, purchase orders, warehouses, and automatic low-stock alerts.',
    category: 'inventory',
    icon: '📦',
    features: [
      'Multi-warehouse stock tracking with FIFO/FEFO',
      'Purchase order management with line items',
      'Automatic stock movement on PO receipt',
      'Low stock alerts via workflow',
      'Product catalog with SKU and categories',
      'Dashboard with real-time stock levels',
    ],
    version: '1.0.0',
    author: 'Novo Marketplace',
    downloads: 980,
  },
  {
    id: 'tpl-hrms-001',
    name: 'HRMS',
    slug: 'hrms',
    description: 'Complete HR management system with employee directory, leave management, attendance tracking, and payroll.',
    category: 'hrms',
    icon: '👥',
    features: [
      'Employee directory with photo and profile',
      'Leave request and approval workflow',
      'Visual leave calendar',
      'Daily attendance tracking',
      'Monthly payroll management',
      'Department hierarchy management',
    ],
    version: '1.0.0',
    author: 'Novo Marketplace',
    downloads: 760,
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Templates' },
  { id: 'crm', label: 'CRM' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'hrms', label: 'HR Management' },
  { id: 'erp', label: 'ERP' },
  { id: 'helpdesk', label: 'Helpdesk' },
  { id: 'education', label: 'Education' },
];

// ─── Install Modal ─────────────────────────────────────────────────────────────

interface InstallModalProps {
  template: TemplateSummary;
  tenantSlug: string;
  onClose: () => void;
  onInstalled: (appId: string) => void;
}

function InstallModal({ template, tenantSlug, onClose, onInstalled }: InstallModalProps) {
  const [appName, setAppName] = useState(template.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInstall() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/templates/${template.slug}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantSlug, appName }),
      });
      const data = (await res.json()) as { appId?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Installation failed');
        return;
      }
      if (data.appId) {
        onInstalled(data.appId);
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Install {template.name}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Customize the app name before installing.
        </p>

        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          App Name
        </label>
        <input
          type="text"
          value={appName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          placeholder="App name"
        />

        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleInstall}
            disabled={loading || !appName.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Installing…' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Detail Panel ─────────────────────────────────────────────────────

interface TemplateDetailProps {
  template: TemplateSummary;
  onInstall: () => void;
  onBack: () => void;
}

function TemplateDetail({ template, onInstall, onBack }: TemplateDetailProps) {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <button
        onClick={onBack}
        className="mb-6 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1"
      >
        ← Back to templates
      </button>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-start gap-4 mb-6">
          <span className="text-5xl">{template.icon}</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{template.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              by {template.author} · v{template.version} · {template.downloads.toLocaleString()} installs
            </p>
            <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full capitalize">
              {template.category}
            </span>
          </div>
        </div>

        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-6">
          {template.description}
        </p>

        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">What&apos;s included</h2>
        <ul className="space-y-2 mb-8">
          {template.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="text-green-500 mt-0.5">✓</span>
              {feature}
            </li>
          ))}
        </ul>

        <button
          onClick={onInstall}
          className="w-full py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Install {template.name}
        </button>
      </div>
    </div>
  );
}

// ─── Template Card ─────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: TemplateSummary;
  onClick: () => void;
}

function TemplateCard({ template, onClick }: TemplateCardProps) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all duration-150 group"
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl">{template.icon}</span>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {template.name}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
            {template.category} · {template.downloads.toLocaleString()} installs
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
        {template.description}
      </p>
      <ul className="space-y-1">
        {template.features.slice(0, 3).map((f, i) => (
          <li key={i} className="text-xs text-gray-500 dark:text-gray-500 flex items-start gap-1.5">
            <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
            {f}
          </li>
        ))}
        {template.features.length > 3 && (
          <li className="text-xs text-gray-400 dark:text-gray-500">
            +{template.features.length - 3} more features
          </li>
        )}
      </ul>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSummary | null>(null);
  const [installTarget, setInstallTarget] = useState<TemplateSummary | null>(null);

  const tenantSlug = (session?.user as { tenantSlug?: string } | undefined)?.tenantSlug ?? '';

  const filtered = selectedCategory === 'all'
    ? TEMPLATES
    : TEMPLATES.filter((t) => t.category === selectedCategory);

  if (selectedTemplate) {
    return (
      <>
        <TemplateDetail
          template={selectedTemplate}
          onInstall={() => setInstallTarget(selectedTemplate)}
          onBack={() => setSelectedTemplate(null)}
        />
        {installTarget && (
          <InstallModal
            template={installTarget}
            tenantSlug={tenantSlug}
            onClose={() => setInstallTarget(null)}
            onInstalled={(appId) => {
              setInstallTarget(null);
              router.push(`/builder/apps/${appId}`);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Template Marketplace</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Start faster with pre-built app packages. Install any template and customize it for your needs.
        </p>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={[
              'px-3 py-1.5 text-sm font-medium rounded-full border transition-colors',
              selectedCategory === cat.id
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400',
            ].join(' ')}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No templates available for this category yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onClick={() => setSelectedTemplate(template)}
            />
          ))}
        </div>
      )}

      {/* Install modal when triggered from card (future: quick install) */}
      {installTarget && (
        <InstallModal
          template={installTarget}
          tenantSlug={tenantSlug}
          onClose={() => setInstallTarget(null)}
          onInstalled={(appId) => {
            setInstallTarget(null);
            router.push(`/builder/apps/${appId}`);
          }}
        />
      )}
    </div>
  );
}
