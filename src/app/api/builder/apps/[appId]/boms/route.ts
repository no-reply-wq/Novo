/**
 * GET  /api/builder/apps/[appId]/boms  — list BOMs for an app
 * POST /api/builder/apps/[appId]/boms  — create a new BOM
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import type { BOMHeaderRow, BOMLineRow } from '@/platform/manufacturing/types';

// ─── Helper: assemble BOMHeader from DB rows ──────────────────────────────────

function assembleHeader(
  header: BOMHeaderRow,
  lines: BOMLineRow[]
) {
  const components = lines
    .filter((l) => !l.is_by_product)
    .sort((a, b) => a.display_order - b.display_order)
    .map((l) => ({
      id: l.id,
      bomId: l.bom_id,
      componentId: l.component_id,
      componentName: l.component_name,
      qtyPerUnit: parseFloat(l.qty_per_unit),
      unit: l.unit,
      wastePercent: parseFloat(l.waste_percent),
      isOptional: l.is_optional,
      substituteIds: l.substitute_ids,
    }));

  const byProducts = lines
    .filter((l) => l.is_by_product)
    .sort((a, b) => a.display_order - b.display_order)
    .map((l) => ({
      id: l.id,
      bomId: l.bom_id,
      componentId: l.component_id,
      componentName: l.component_name,
      qtyPerUnit: parseFloat(l.qty_per_unit),
      unit: l.unit,
      wastePercent: parseFloat(l.waste_percent),
      isOptional: l.is_optional,
      substituteIds: l.substitute_ids,
    }));

  return {
    id: header.id,
    appId: header.app_id,
    productId: header.product_id,
    productName: header.product_name,
    unit: header.unit,
    version: header.version,
    isActive: header.is_active,
    notes: header.notes,
    components,
    byProducts,
    createdAt: header.created_at,
    updatedAt: header.updated_at,
  };
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;

  const headers = await prisma.$queryRaw<BOMHeaderRow[]>`
    SELECT * FROM platform.bom_headers
    WHERE app_id = ${appId}::uuid
    ORDER BY product_name, version
  `;

  if (headers.length === 0) {
    return NextResponse.json({ boms: [] });
  }

  const headerIds = headers.map((h) => h.id);

  const lines = await prisma.$queryRaw<BOMLineRow[]>`
    SELECT * FROM platform.bom_lines
    WHERE bom_id = ANY(${headerIds}::uuid[])
    ORDER BY display_order
  `;

  const linesByBomId = new Map<string, BOMLineRow[]>();
  for (const line of lines) {
    const existing = linesByBomId.get(line.bom_id) ?? [];
    existing.push(line);
    linesByBomId.set(line.bom_id, existing);
  }

  const boms = headers.map((h) =>
    assembleHeader(h, linesByBomId.get(h.id) ?? [])
  );

  return NextResponse.json({ boms });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

interface CreateBOMBody {
  productId: string;
  productName: string;
  unit: string;
  version?: string;
  notes?: string;
  components: Array<{
    componentId: string;
    componentName: string;
    qtyPerUnit: number;
    unit: string;
    wastePercent?: number;
    isOptional?: boolean;
    substituteIds?: string[];
  }>;
  byProducts?: Array<{
    componentId: string;
    componentName: string;
    qtyPerUnit: number;
    unit: string;
  }>;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const body = (await req.json()) as CreateBOMBody;

  if (!body.productId || !body.productName || !body.unit) {
    return NextResponse.json(
      { error: 'productId, productName, and unit are required' },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.components) || body.components.length === 0) {
    return NextResponse.json(
      { error: 'At least one component is required' },
      { status: 400 }
    );
  }

  const version = body.version ?? 'R0';

  // Create header
  const [newHeader] = await prisma.$queryRaw<BOMHeaderRow[]>`
    INSERT INTO platform.bom_headers
      (app_id, product_id, product_name, unit, version, notes)
    VALUES
      (${appId}::uuid, ${body.productId}, ${body.productName},
       ${body.unit}, ${version}, ${body.notes ?? null})
    RETURNING *
  `;

  if (!newHeader) {
    return NextResponse.json({ error: 'Failed to create BOM' }, { status: 500 });
  }

  // Insert components
  const allLines: BOMLineRow[] = [];

  for (let i = 0; i < body.components.length; i++) {
    const comp = body.components[i];
    const [line] = await prisma.$queryRaw<BOMLineRow[]>`
      INSERT INTO platform.bom_lines
        (bom_id, component_id, component_name, qty_per_unit, unit,
         waste_percent, is_optional, is_by_product, substitute_ids, display_order)
      VALUES
        (${newHeader.id}::uuid, ${comp.componentId}, ${comp.componentName},
         ${comp.qtyPerUnit}, ${comp.unit},
         ${comp.wastePercent ?? 0}, ${comp.isOptional ?? false},
         false, ${comp.substituteIds ?? []}, ${i})
      RETURNING *
    `;
    if (line) allLines.push(line);
  }

  // Insert by-products
  for (let i = 0; i < (body.byProducts ?? []).length; i++) {
    const bp = body.byProducts![i];
    const [line] = await prisma.$queryRaw<BOMLineRow[]>`
      INSERT INTO platform.bom_lines
        (bom_id, component_id, component_name, qty_per_unit, unit,
         waste_percent, is_optional, is_by_product, substitute_ids, display_order)
      VALUES
        (${newHeader.id}::uuid, ${bp.componentId}, ${bp.componentName},
         ${bp.qtyPerUnit}, ${bp.unit},
         0, false, true, ${[]}, ${i})
      RETURNING *
    `;
    if (line) allLines.push(line);
  }

  const bom = assembleHeader(newHeader, allLines);
  return NextResponse.json({ bom }, { status: 201 });
}
