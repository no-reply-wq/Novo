/**
 * GET /api/builder/templates
 * List all available app templates, optionally filtered by category.
 *
 * Query params:
 *   category — optional, one of: erp | hrms | lms | crm | inventory | custom
 */
import { NextRequest, NextResponse } from 'next/server';
import { listTemplates } from '@/platform/templates';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? undefined;

  const templates = listTemplates(category);

  // Strip the full bundle from the list view to keep payloads small
  const summary = templates.map(({ bundle: _bundle, ...rest }) => rest);

  return NextResponse.json({ templates: summary });
}
