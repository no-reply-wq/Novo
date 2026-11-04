'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Package,
  Receipt, Settings, ChevronLeft, ChevronRight, LogOut,
  Layers, Sliders, Building2, Truck, BarChart3, Database,
  ClipboardList, PackageCheck, Palette, Globe
} from 'lucide-react';

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  isCustom?: boolean;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  'layout-dashboard': <LayoutDashboard className="w-5 h-5" />,
  'users': <Users className="w-5 h-5" />,
  'file-text': <FileText className="w-5 h-5" />,
  'shopping-cart': <ShoppingCart className="w-5 h-5" />,
  'package': <Package className="w-5 h-5" />,
  'receipt': <Receipt className="w-5 h-5" />,
  'settings': <Settings className="w-5 h-5" />,
  'layers': <Layers className="w-5 h-5" />,
  'sliders': <Sliders className="w-5 h-5" />,
  'building': <Building2 className="w-5 h-5" />,
  'truck': <Truck className="w-5 h-5" />,
  'bar-chart': <BarChart3 className="w-5 h-5" />,
};

function getIcon(iconName?: string): React.ReactNode {
  if (!iconName) return <Layers className="w-5 h-5" />;
  return ICON_MAP[iconName] ?? <Layers className="w-5 h-5" />;
}

const STATIC_NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { key: 'table-builder', label: 'Table Builder', href: 'table-builder', icon: <Database className="w-5 h-5" /> },
];

const BOTTOM_NAV: NavItem[] = [
  { key: 'nav-builder', label: 'Nav Builder', href: 'nav-builder', icon: <Layers className="w-5 h-5" /> },
  { key: 'form-builder', label: 'Form Builder', href: 'form-builder', icon: <Layers className="w-5 h-5" /> },
  { key: 'ui-builder', label: 'UI Builder', href: 'ui-builder', icon: <Sliders className="w-5 h-5" /> },
  { key: 'settings', label: 'Settings', href: 'settings', icon: <Settings className="w-5 h-5" /> },
  { key: 'settings/branding', label: 'Branding', href: 'settings/branding', icon: <Palette className="w-5 h-5" /> },
  { key: 'settings/domain', label: 'Custom domain', href: 'settings/domain', icon: <Globe className="w-5 h-5" /> },
];

interface TenantLayoutProps {
  children?: React.ReactNode;
  tenantSlug: string;
  tenantName: string;
  tenantColor?: string;
  logoUrl?: string;
  userEmail: string;
  userName: string;
}

export function TenantLayout({
  children,
  tenantSlug,
  tenantName,
  tenantColor = '#6366f1',
  logoUrl,
  userEmail,
  userName,
}: TenantLayoutProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [customTabs, setCustomTabs] = useState<NavItem[]>([]);
  const [allowedFeatures, setAllowedFeatures] = useState<string[]>([]);
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [dynamicNav, setDynamicNav] = useState<Array<{id:string;label:string;href:string;icon:string;section:string;sort_order:number}>>([]);

  useEffect(() => {
    // Fetch dynamic custom tabs
    fetch(`/api/tenant/config?tenant=${tenantSlug}`).then(r=>r.json()).then(d=>{setAllowedFeatures(d.allowedFeatures??[]);setHiddenModules(d.hiddenModules??[]);}).catch(()=>{});
    fetch(`/api/platform/nav?tenant=${tenantSlug}`).then(r=>r.json()).then(d=>setDynamicNav(d.items??[])).catch(()=>{});
    fetch(`/api/tenant/form-builder?tenant=${tenantSlug}`)
      .then((r) => r.json())
      .then((data) => {
        const tabs = (data.forms ?? [])
          .filter((f: { show_as_tab: boolean }) => f.show_as_tab)
          .sort((a: { tab_sort_order: number }, b: { tab_sort_order: number }) => a.tab_sort_order - b.tab_sort_order)
          .map((f: { slug: string; tab_label: string; tab_icon: string }) => ({
            key: `custom:${f.slug}`,
            label: f.tab_label || f.slug,
            href: `custom/${f.slug}`,
            icon: getIcon(f.tab_icon),
            isCustom: true,
          }));
        setCustomTabs(tabs);
      })
      .catch(() => {}); // Fail silently — sidebar still works
  }, [tenantSlug]);

  const basePath = `/${tenantSlug}`;

  function isActive(href: string) {
    return pathname === `/${tenantSlug}/${href}` || pathname.startsWith(`/${tenantSlug}/${href}/`);
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col bg-slate-900 text-white transition-all duration-200 flex-shrink-0',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800">
          {logoUrl ? (
            <img src={logoUrl} alt={tenantName} className="w-8 h-8 rounded object-contain flex-shrink-0" />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: tenantColor }}
            >
              {tenantName.charAt(0).toUpperCase()}
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{tenantName}</p>
              <p className="text-xs text-slate-400 truncate">ERP Platform</p>
            </div>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          <div className="space-y-1">
            {STATIC_NAV.map((item) => (
              <NavLink key={item.key} item={item} basePath={basePath} collapsed={collapsed} active={isActive(item.href)} activeColor={tenantColor} />
            ))}
          </div>

          {/* Dynamic nav - main section */}
          {dynamicNav.filter(i => i.section === 'main').length > 0 && (
            <>
              {!collapsed && <p className="px-2 pt-4 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Modules</p>}
              <div className="space-y-1 mt-1">
                {dynamicNav.filter(i => i.section === 'main').sort((a,b) => a.sort_order - b.sort_order).map(item => {
                  // Smart href: if href is "data/X" convert to "module/X", otherwise use as-is
                  const smartHref = item.href.startsWith('data/') ? item.href.replace('data/', 'module/') : item.href;
                  return <NavLink key={item.id} item={{key:item.id, label:item.label, href:smartHref, icon:<Layers className="w-5 h-5" />}} basePath={basePath} collapsed={collapsed} active={isActive(smartHref)} activeColor={tenantColor} />;
                })}
              </div>
            </>
          )}

          {/* Custom tabs */}
          {customTabs.length > 0 && (
            <>
              {!collapsed && (
                <p className="px-2 pt-5 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Custom
                </p>
              )}
              <div className="space-y-1 mt-2">
                {customTabs.map((item) => (
                  <NavLink key={item.key} item={item} basePath={basePath} collapsed={collapsed} active={isActive(item.href)} activeColor={tenantColor} />
                ))}
              </div>
            </>
          )}

          {/* Tools */}
          {!collapsed && (
            <p className="px-2 pt-5 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Tools
            </p>
          )}
          <div className="space-y-1 mt-2">
            {BOTTOM_NAV.map((item) => (
              <NavLink key={item.key} item={item} basePath={basePath} collapsed={collapsed} active={isActive(item.href)} activeColor={tenantColor} />
            ))}
          </div>
        </nav>

        {/* User + collapse */}
        <div className="border-t border-slate-800 p-3 space-y-2">
          {!collapsed && (
            <div className="px-2 py-1">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-xs text-slate-400 truncate">{userEmail}</p>
            </div>
          )}
          <div className="flex gap-2">
            <a
              href="/api/auth/signout"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!collapsed && 'Sign out'}
            </a>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

function NavLink({
  item,
  basePath,
  collapsed,
  active,
  activeColor = '#6366f1',
}: {
  item: NavItem;
  basePath: string;
  collapsed: boolean;
  active: boolean;
  activeColor?: string;
}) {
  return (
    <Link
      href={`${basePath}/${item.href}`}
      className={cn(
        'flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-sm',
        active
          ? 'text-white'
          : 'text-slate-400 hover:text-white hover:bg-slate-800',
        collapsed && 'justify-center px-2'
      )}
      style={active ? { backgroundColor: activeColor } : undefined}
      title={collapsed ? item.label : undefined}
    >
      <span className="flex-shrink-0">{item.icon}</span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────
// Page header (used inside pages)
// ─────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className="bg-white border-b border-slate-200 px-6 py-4">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          {breadcrumb.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span>/</span>}
              {item.href ? (
                <Link href={item.href} className="hover:text-slate-700">{item.label}</Link>
              ) : (
                <span className="text-slate-700">{item.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
