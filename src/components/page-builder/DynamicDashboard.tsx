'use client';

import { PageRenderer } from './BlockRenderer';
import { PageLayoutConfig } from '@/lib/page-builder/types';

export function DynamicDashboard({ layout, tenantSlug }: { layout: PageLayoutConfig; tenantSlug: string }) {
  return (
    <div className="p-6">
      <PageRenderer
        layout={layout}
        breakpoint="desktop"
        isEditing={false}
        tenantSlug={tenantSlug}
      />
    </div>
  );
}
