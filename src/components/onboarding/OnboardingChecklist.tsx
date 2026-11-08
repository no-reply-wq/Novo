'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

interface Props {
  tenantSlug: string;
  stats: {
    totalForms: number;
    totalSubmissions: number;
    activeUsers: number;
  };
}

export function OnboardingChecklist({ tenantSlug, stats }: Props) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const d = localStorage.getItem(`onboarding-dismissed-${tenantSlug}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (d === 'true') setDismissed(true);
    } catch {}
  }, [tenantSlug]);

  const items: ChecklistItem[] = [
    {
      id: 'first_form',
      label: 'Create your first form',
      description: 'Build a custom form to collect data from your team.',
      href: `/${tenantSlug}/form-builder`,
      done: stats.totalForms > 0,
    },
    {
      id: 'first_submission',
      label: 'Submit a record',
      description: 'Fill out your form and see it in the submissions list.',
      href: `/${tenantSlug}/form-builder`,
      done: stats.totalSubmissions > 0,
    },
    {
      id: 'invite_user',
      label: 'Invite a team member',
      description: 'Add your colleagues so they can collaborate.',
      href: `/${tenantSlug}/settings?tab=users`,
      done: stats.activeUsers > 1,
    },
    {
      id: 'configure_integration',
      label: 'Connect an integration',
      description: 'Set up email or webhook to automate notifications.',
      href: `/${tenantSlug}/integrations`,
      done: false,
    },
  ];

  const doneCount = items.filter(i => i.done).length;

  // Hide if dismissed
  if (dismissed) return null;

  // Only show for new tenants (less than 3 forms and 5 submissions)
  if (stats.totalForms >= 3 && stats.totalSubmissions >= 5) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(`onboarding-dismissed-${tenantSlug}`, 'true'); } catch {}
  };

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 border border-indigo-100 dark:border-indigo-900 rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-indigo-900 dark:text-indigo-100">
            Get started with Novo
          </h2>
          <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-0.5">
            {doneCount} of {items.length} steps complete
          </p>
        </div>
        <button
          onClick={dismiss}
          className="text-indigo-400 hover:text-indigo-600 text-sm"
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-indigo-100 dark:bg-indigo-900 rounded-full h-1.5 mb-4">
        <div
          className="bg-indigo-500 h-1.5 rounded-full transition-all"
          style={{ width: `${(doneCount / items.length) * 100}%` }}
        />
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
              item.done
                ? 'bg-green-500 border-green-500'
                : 'border-indigo-300 dark:border-indigo-600'
            }`}>
              {item.done && <span className="text-white text-xs">✓</span>}
            </div>
            <div className="flex-1 min-w-0">
              {item.done ? (
                <span className="text-sm text-slate-400 line-through">{item.label}</span>
              ) : (
                <Link href={item.href} className="text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline">
                  {item.label}
                </Link>
              )}
              {!item.done && (
                <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
