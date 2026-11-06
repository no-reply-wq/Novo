import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import type { BOMHeaderRow, BOMLineRow } from '@/platform/manufacturing/types';

// GET /api/builder/apps/[appId]/boms/[bomId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; bomId: string }> }
) {
  const { appId, bomId } = await params;

  const [header] = await prisma.$queryRaw<BOMHeaderRow[]>`
    SELECT * FROM platform.bom_headers
    WHERE id = ${bomId}::uuid AND app_id = ${appId}::uuid
  `;
  if (!header) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const lines = await prisma.$queryRaw<BOMLineRow[]>`
    SELECT * FROM platform.bom_lines
    WHERE bom_id = ${bomId}::uuid
    ORDER BY is_by_product, display_order
  `;

  return NextResponse.json({
    id: header.id,
    appId: header.app_id,
    productId: header.product_id,
    productName: header.product_name,
    unit: header.unit,
    version: header.version,
    isActive: header.is_active,
    notes: header.notes,
    components: lines
      .filter((l: BOMLineRow) => !l.is_by_product)
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
      .filter((l: BOMLineRow) => l.is_by_product)
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
  });
}

// PUT /api/builder/apps/[appId]/boms/[bomId]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; bomId: string }> }
) {
  const { appId, bomId } = await params;
  const body = await req.json();

  const { productId, productName, unit, version, notes, isActive, components = [], byProducts = [] } = body;

  const [existing] = await prisma.$queryRaw<BOMHeaderRow[]>`
    SELECT id FROM platform.bom_headers WHERE id = ${bomId}::uuid AND app_id = ${appId}::uuid
  `;
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$executeRaw`
    UPDATE platform.bom_headers SET
      product_id   = ${productId},
      product_name = ${productName},
      unit         = ${unit},
      version      = ${version},
      notes        = ${notes ?? null},
      is_active    = ${isActive ?? true},
      updated_at   = NOW()
    WHERE id = ${bomId}::uuid
  `;

  // Replace lines
  await prisma.$executeRaw`DELETE FROM platform.bom_lines WHERE bom_id = ${bomId}::uuid`;

  const allLines = [
    ...components.map((c: { componentId: string; componentName: string; qtyPerUnit: number; unit: string; wastePercent: number; isOptional: boolean; substituteIds?: string[] }, i: number) => ({ ...c, isByProduct: false, order: i })),
    ...byProducts.map((c: { componentId: string; componentName: string; qtyPerUnit: number; unit: string; wastePercent: number; isOptional: boolean; substituteIds?: string[] }, i: number) => ({ ...c, isByProduct: true, order: i })),
  ];

  for (const line of allLines) {
    await prisma.$executeRaw`
      INSERT INTO platform.bom_lines
        (bom_id, component_id, component_name, qty_per_unit, unit, waste_percent, is_optional, is_by_product, substitute_ids, display_order)
      VALUES
        (${bomId}::uuid, ${line.componentId}, ${line.componentName},
         ${line.qtyPerUnit}, ${line.unit ?? 'EA'}, ${line.wastePercent ?? 0},
         ${line.isOptional ?? false}, ${line.isByProduct},
         ${line.substituteIds ?? null}, ${line.order})
    `;
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/builder/apps/[appId]/boms/[bomId]
// Soft-delete: sets is_active = false to preserve audit trail and WO references
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; bomId: string }> }
) {
  const { appId, bomId } = await params;

  const [existing] = await prisma.$queryRaw<BOMHeaderRow[]>`
    SELECT id FROM platform.bom_headers WHERE id = ${bomId}::uuid AND app_id = ${appId}::uuid
  `;
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$executeRaw`
    UPDATE platform.bom_headers
    SET is_active = false, updated_at = NOW()
    WHERE id = ${bomId}::uuid
  `;

  return NextResponse.json({ ok: true });
}
