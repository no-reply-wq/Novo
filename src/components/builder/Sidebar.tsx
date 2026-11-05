'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Database,
  Columns,
  Link2,
  LayoutDashboard,
  Component,
  Palette,
  GitBranch,
  CheckSquare,
  Code,
  Plug,
  Webhook,
  Mail,
  MessageCircle,
  Settings,
  Users,
  Shield,
  MapPin,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  key: string;
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  appId?: string;
  className?: string;
}

function buildNavSections(appId: string | undefined): NavSection[] {
  const base = appId ? `/builder/apps/${appId}` : '/builder';
  return [
    {
      key: 'data',
      label: 'Data',
      items: [
        { key: 'tables', label: 'Tables', href: `${base}/tables`, icon: <Database className="w-4 h-4" /> },
        { key: 'fields', label: 'Fields', href: `${base}/fields`, icon: <Columns className="w-4 h-4" /> },
        { key: 'relations', label: 'Relations', href: `${base}/relations`, icon: <Link2 className="w-4 h-4" /> },
      ],
    },
    {
      key: 'ui',
      label: 'UI',
      items: [
        { key: 'pages', label: 'Pages', href: `${base}/pages`, icon: <LayoutDashboard className="w-4 h-4" /> },
        { key: 'components', label: 'Components', href: `${base}/components`, icon: <Component className="w-4 h-4" /> },
        { key: 'themes', label: 'Themes', href: `${base}/themes`, icon: <Palette className="w-4 h-4" /> },
      ],
    },
    {
      key: 'logic',
      label: 'Logic',
      items: [
        { key: 'workflows', label: 'Workflows', href: `${base}/workflows`, icon: <GitBranch className="w-4 h-4" /> },
        { key: 'approvals', label: 'Approvals', href: `${base}/approvals`, icon: <CheckSquare className="w-4 h-4" /> },
        { key: 'scripts', label: 'Scripts', href: `${base}/scripts`, icon: <Code className="w-4 h-4" /> },
      ],
    },
    {
      key: 'integrations',
      label: 'Integrations',
      items: [
        { key: 'connectors', label: 'Connectors', href: `${base}/connectors`, icon: <Plug className="w-4 h-4" /> },
        { key: 'webhooks', label: 'Webhooks', href: `${base}/webhooks`, icon: <Webhook className="w-4 h-4" /> },
        { key: 'email', label: 'Email', href: `${base}/email`, icon: <Mail className="w-4 h-4" /> },
        { key: 'whatsapp', label: 'WhatsApp', href: `${base}/whatsapp`, icon: <MessageCircle className="w-4 h-4" /> },
      ],
    },
    {
      key: 'settings',
      label: 'Settings',
      items: [
        { key: 'app-settings', label: 'App Settings', href: `${base}/settings`, icon: <Settings className="w-4 h-4" /> },
        { key: 'members', label: 'Members', href: `${base}/members`, icon: <Users className="w-4 h-4" /> },
        { key: 'roles', label: 'Roles', href: `${base}/roles`, icon: <Shield className="w-4 h-4" /> },
        { key: 'locations', label: 'Locations', href: `${base}/locations`, icon: <MapPin className="w-4 h-4" /> },
      ],
    },
  ];
}

function NavSectionView({
  section,
  pathname,
  defaultOpen,
}: {
  section: NavSection;
  pathname: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasActive = section.items.some((item) => pathname.startsWith(item.href));

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors',
          'text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)]',
          hasActive && 'text-[var(--color-fg-base)]'
        )}
        aria-expanded={open}
      >
        <span>{section.label}</span>
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
      </button>
      {open && (
        <ul role="list" className="mt-0.5 space-y-0.5">
          {section.items.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                    isActive
                      ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium'
                      : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg-base)] hover:bg-[var(--color-bg-muted)]'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Sidebar({ appId, className }: SidebarProps) {
  const pathname = usePathname();
  const sections = buildNavSections(appId);

  return (
    <aside
      className={cn(
        'flex flex-col w-60 shrink-0 h-full border-r border-[var(--color-border)] bg-[var(--color-bg-surface)] overflow-y-auto',
        className
      )}
      aria-label="Builder navigation"
    >
      <nav className="flex-1 p-3 space-y-1">
        {sections.map((section, i) => (
          <NavSectionView
            key={section.key}
            section={section}
            pathname={pathname}
            defaultOpen={i === 0}
          />
        ))}
      </nav>
    </aside>
  );
}
