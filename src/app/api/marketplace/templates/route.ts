/**
 * GET /api/marketplace/templates
 * List all available templates, optionally filtered by category.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ALL_TEMPLATES } from '@/platform/marketplace';
import type { TemplateCategory } from '@/platform/marketplace/types';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') as TemplateCategory | null;

  const templates = category
    ? ALL_TEMPLATES.filter((t) => t.category === category)
    : ALL_TEMPLATES;

  // Strip the full package from list responses to keep payloads small
  const result = templates.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    category: t.category,
    icon: t.icon,
    previewImages: t.previewImages,
    features: t.features,
    version: t.version,
    author: t.author,
    downloads: t.downloads,
  }));

  return NextResponse.json({ templates: result });
}
