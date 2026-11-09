import { NextRequest, NextResponse } from 'next/server';
import { requireBuilderApp } from '@/lib/auth/tenant-session';
import { prisma } from '@/lib/db/client';
import type { BOMHeaderRow, BOMLineRow } from '@/platform/manufacturing/types';

// GET /api/builder/apps/[appId]/boms
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;

  const headers = await prisma.$queryRaw<BOMHeaderRow[]>`
    SELECT * FROM platform.bom_headers
    WHERE app_id = ${appId}::uuid
    ORDER BY product_name, version
  `;

  const lines = await prisma.$queryRaw<BOMLineRow[]>`
    SELECT l.* FROM platform.bom_lines l
    JOIN platform.bom_headers h ON h.id = l.bom_id
    WHERE h.app_id = ${appId}::uuid
    ORDER BY l.bom_id, l.is_by_product, l.display_order
  `;

  const boms = headers.map((h: BOMHeaderRow) => ({
    id: h.id,
    appId: h.app_id,
    productId: h.product_id,
    productName: h.product_name,
    unit: h.unit,
    version: h.version,
    isActive: h.is_active,
    notes: h.notes,
    components: lines
      .filter((l: BOMLineRow) => l.bom_id === h.id && !l.is_by_product)
      .map((l: BOMLineRow) => ({
        id: l.id,
        bomId: l.bom_id,
        componentId: l.component_id,
        componentName: l.component_name,
        qtyPerUnit: parseFloat(l.qty_per_unit),
        unit: l.unit,
        wastePercent: parseFloat(l.waste_percent),
        isOptional: l.is_optional,
        substituteIds: l.substitute_ids ?? [],
      })),
    byProducts: lines
      .filter((l: BOMLineRow) => l.bom_id === h.id && l.is_by_product)
      .map((l: BOMLineRow) => ({
        id: l.id,
        bomId: l.bom_id,
        componentId: l.component_id,
        componentName: l.component_name,
        qtyPerUnit: parseFloat(l.qty_per_unit),
        unit: l.unit,
        wastePercent: parseFloat(l.waste_percent),
        isOptional: l.is_optional,
        substituteIds: l.substitute_ids ?? [],
      })),
  }));

  return NextResponse.json(boms);
}

// POST /api/builder/apps/[appId]/boms
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> }
) {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const body = await req.json();

  const { productId, productName, unit = 'EA', version = 'R0', notes, components = [], byProducts = [] } = body;

  if (!productId || !productName) {
    return NextResponse.json({ error: 'productId and productName are required' }, { status: 400 });
  }

  const [header] = await prisma.$queryRaw<BOMHeaderRow[]>`
    INSERT INTO platform.bom_headers (app_id, product_id, product_name, unit, version, notes)
    VALUES (${appId}::uuid, ${productId}, ${productName}, ${unit}, ${version}, ${notes ?? null})
    RETURNING *
  `;

  const allLines = [
    ...components.map((c: { componentId: string; componentName: string; qtyPerUnit: number; unit: string; wastePercent: number; isOptional: boolean; substituteIds?: string[] }, i: number) => ({ ...c, isByProduct: false, order: i })),
    ...byProducts.map((c: { componentId: string; componentName: string; qtyPerUnit: number; unit: string; wastePercent: number; isOptional: boolean; substituteIds?: string[] }, i: number) => ({ ...c, isByProduct: true, order: i })),
  ];

  for (const line of allLines) {
    await prisma.$executeRaw`
      INSERT INTO platform.bom_lines
        (bom_id, component_id, component_name, qty_per_unit, unit, waste_percent, is_optional, is_by_product, substitute_ids, display_order)
      VALUES
        (${header.id}::uuid, ${line.componentId}, ${line.componentName},
         ${line.qtyPerUnit}, ${line.unit ?? 'EA'}, ${line.wastePercent ?? 0},
         ${line.isOptional ?? false}, ${line.isByProduct},
         ${line.substituteIds ?? null}, ${line.order})
    `;
  }

  return NextResponse.json({ id: header.id }, { status: 201 });
}
