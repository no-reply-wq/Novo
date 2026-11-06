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
  Sparkles,
  Store,
  FileCheck,
  Package,
  Box,
  HardDrive,
  FileText,
  Globe,
  Layers,
  BarChart3,
  Receipt,
  CreditCard,
  FileBarChart,
  History,
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
        { key: 'rest-connectors', label: 'REST Connectors', href: `${base}/rest-connectors`, icon: <Globe className="w-4 h-4" /> },
        { key: 'custom-components', label: 'Custom Components', href: `${base}/custom-components`, icon: <Layers className="w-4 h-4" /> },
      ],
    },
    {
      key: 'manufacturing',
      label: 'Manufacturing',
      items: [
        { key: 'boms', label: 'Bill of Materials', href: `${base}/boms`, icon: <Box className="w-4 h-4" /> },
      ],
    },
    {
      key: 'documents',
      label: 'Documents',
      items: [
        { key: 'pdf-templates', label: 'PDF Templates', href: `${base}/pdf-templates`, icon: <FileText className="w-4 h-4" /> },
        { key: 'storage', label: 'Storage', href: `${base}/integrations/storage`, icon: <HardDrive className="w-4 h-4" /> },
      ],
    },
    {
      key: 'integrations',
      label: 'Integrations',
      items: [
        { key: 'email', label: 'Email', href: `${base}/integrations/email`, icon: <Mail className="w-4 h-4" /> },
        { key: 'whatsapp', label: 'WhatsApp', href: `${base}/integrations/whatsapp`, icon: <MessageCircle className="w-4 h-4" /> },
        { key: 'einvoice', label: 'E-Invoice', href: `${base}/integrations/einvoice`, icon: <FileCheck className="w-4 h-4" /> },
        { key: 'ewaybill', label: 'E-Waybill', href: `${base}/integrations/ewaybill`, icon: <Receipt className="w-4 h-4" /> },
        { key: 'bankrecon', label: 'Bank Recon', href: `${base}/integrations/bankrecon`, icon: <CreditCard className="w-4 h-4" /> },
        { key: 'gstr1', label: 'GSTR-1', href: `${base}/integrations/gstr1`, icon: <FileBarChart className="w-4 h-4" /> },
        { key: 'tds', label: 'TDS', href: `${base}/integrations/tds`, icon: <BarChart3 className="w-4 h-4" /> },
      ],
    },
    {
      key: 'ai',
      label: 'AI',
      items: [
        {
          key: 'ai-generate',
          label: 'Generate App',
          href: '/builder/ai-generate',
          icon: <Sparkles className="w-4 h-4" />,
        },
      ],
    },
    {
      key: 'marketplace',
      label: 'Marketplace',
      items: [
        {
          key: 'marketplace-templates',
          label: 'Templates',
          href: '/builder/marketplace',
          icon: <Store className="w-4 h-4" />,
        },
      ],
    },
    {
      key: 'settings',
      label: 'Settings',
      items: [
        { key: 'app-settings', label: 'App Settings', href: `${base}/settings`, icon: <Settings className="w-4 h-4" /> },
        { key: 'theme', label: 'Theme', href: `${base}/theme`, icon: <Palette className="w-4 h-4" /> },
        { key: 'portals', label: 'Portals', href: `${base}/portals`, icon: <Users className="w-4 h-4" /> },
        { key: 'members', label: 'Members', href: `${base}/members`, icon: <Users className="w-4 h-4" /> },
        { key: 'roles', label: 'Roles', href: `${base}/roles`, icon: <Shield className="w-4 h-4" /> },
        { key: 'locations', label: 'Locations', href: `${base}/locations`, icon: <MapPin className="w-4 h-4" /> },
        { key: 'versions', label: 'Versions', href: `${base}/versions`, icon: <History className="w-4 h-4" /> },
      ],
    },
    {
      key: 'platform',
      label: 'Platform',
      items: [
        { key: 'all-apps', label: 'All Apps', href: '/builder', icon: <Package className="w-4 h-4" /> },
        { key: 'admin', label: 'Admin Panel', href: '/admin/platform', icon: <Shield className="w-4 h-4" /> },
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
      {/* No app selected — show hint */}
      {!appId && (
        <div className="p-3 mx-3 mt-3 mb-2 rounded-xl bg-[var(--color-bg-muted)] border border-[var(--color-border)] text-xs text-[var(--color-fg-muted)] leading-relaxed">
          <span className="font-semibold text-[var(--color-fg-base)] block mb-0.5">No app selected</span>
          Select an app from the home screen to access its builder tools.
        </div>
      )}
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
