'use client';

/**
 * Extracted from layout.tsx because lucide-react's icon components use
 * React.createContext internally, which fails at module-evaluation
 * time when imported directly into a Server Component - the error
 * shows up as "createContext only works in Client Components" even
 * though nothing in the layout itself was using context. Standard
 * Next.js App Router fix: keep server-only logic (the auth check,
 * getServerSession) in the layout, and push anything touching a
 * client-side library into its own small client component.
 */

import Link from 'next/link';
import { Building2, Users, Shield, Activity, LogOut } from 'lucide-react';

export function PlatformAdminSidebar({ userName, userEmail }: { userName: string; userEmail: string }) {
  return (
    <aside className="w-60 flex-shrink-0 bg-slate-900 text-white flex flex-col">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="font-semibold text-sm">LRBC Admin</p>
          <p className="text-xs text-slate-400">Super Admin Panel</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {[
          { href: '/admin/platform', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
          { href: '/admin/platform/tenants', label: 'Clients', icon: <Building2 className="w-4 h-4" /> },
          { href: '/admin/platform/admins', label: 'Platform staff', icon: <Users className="w-4 h-4" /> },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-800">
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-white truncate">{userName}</p>
          <p className="text-xs text-slate-400 truncate">{userEmail}</p>
        </div>
        <a href="/api/auth/signout" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mt-1">
          <LogOut className="w-4 h-4" />
          Sign out
        </a>
      </div>
    </aside>
  );
}
