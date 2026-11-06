/**
 * GET    /api/builder/apps/[appId]/boms/[bomId]  — get one BOM
 * PUT    /api/builder/apps/[appId]/boms/[bomId]  — update BOM
 * DELETE /api/builder/apps/[appId]/boms/[bomId]  — deactivate BOM
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import type { BOMHeaderRow, BOMLineRow } from '@/platform/manufacturing/types';

function assembleHeader(header: BOMHeaderRow, lines: BOMLineRow[]) {
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

async function fetchBOM(appId: string, bomId: string) {
  const headers = await prisma.$queryRaw<BOMHeaderRow[]>`
    SELECT * FROM platform.bom_headers
    WHERE id = ${bomId}::uuid AND app_id = ${appId}::uuid
  `;

  if (headers.length === 0) return null;

  const lines = await prisma.$queryRaw<BOMLineRow[]>`
    SELECT * FROM platform.bom_lines WHERE bom_id = ${bomId}::uuid ORDER BY display_order
  `;

  return assembleHeader(headers[0], lines);
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; bomId: string }> }
) {
  const { appId, bomId } = await params;
  const bom = await fetchBOM(appId, bomId);

  if (!bom) {
    return NextResponse.json({ error: 'BOM not found' }, { status: 404 });
  }

  return NextResponse.json({ bom });
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

interface UpdateBOMBody {
  productName?: string;
  unit?: string;
  version?: string;
  isActive?: boolean;
  notes?: string;
  components?: Array<{
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; bomId: string }> }
) {
  const { appId, bomId } = await params;
  const body = (await req.json()) as UpdateBOMBody;

  // Verify BOM exists and belongs to this app
  const existing = await fetchBOM(appId, bomId);
  if (!existing) {
    return NextResponse.json({ error: 'BOM not found' }, { status: 404 });
  }

  // Update header fields
  await prisma.$queryRaw`
    UPDATE platform.bom_headers
    SET
      product_name = COALESCE(${body.productName ?? null}, product_name),
      unit = COALESCE(${body.unit ?? null}, unit),
      version = COALESCE(${body.version ?? null}, version),
      is_active = COALESCE(${body.isActive ?? null}, is_active),
      notes = COALESCE(${body.notes ?? null}, notes),
      updated_at = now()
    WHERE id = ${bomId}::uuid AND app_id = ${appId}::uuid
  `;

  // Replace lines if provided
  if (body.components !== undefined || body.byProducts !== undefined) {
    await prisma.$queryRaw`
      DELETE FROM platform.bom_lines WHERE bom_id = ${bomId}::uuid
    `;

    const components = body.components ?? [];
    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      await prisma.$queryRaw`
        INSERT INTO platform.bom_lines
          (bom_id, component_id, component_name, qty_per_unit, unit,
           waste_percent, is_optional, is_by_product, substitute_ids, display_order)
        VALUES
          (${bomId}::uuid, ${comp.componentId}, ${comp.componentName},
           ${comp.qtyPerUnit}, ${comp.unit},
           ${comp.wastePercent ?? 0}, ${comp.isOptional ?? false},
           false, ${comp.substituteIds ?? []}, ${i})
      `;
    }

    const byProducts = body.byProducts ?? [];
    for (let i = 0; i < byProducts.length; i++) {
      const bp = byProducts[i];
      await prisma.$queryRaw`
        INSERT INTO platform.bom_lines
          (bom_id, component_id, component_name, qty_per_unit, unit,
           waste_percent, is_optional, is_by_product, substitute_ids, display_order)
        VALUES
          (${bomId}::uuid, ${bp.componentId}, ${bp.componentName},
           ${bp.qtyPerUnit}, ${bp.unit},
           0, false, true, ${[]}, ${i})
      `;
    }
  }

  const updated = await fetchBOM(appId, bomId);
  return NextResponse.json({ bom: updated });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string; bomId: string }> }
) {
  const { appId, bomId } = await params;

  const existing = await fetchBOM(appId, bomId);
  if (!existing) {
    return NextResponse.json({ error: 'BOM not found' }, { status: 404 });
  }

  // Soft-delete: deactivate rather than hard delete
  await prisma.$queryRaw`
    UPDATE platform.bom_headers
    SET is_active = false, updated_at = now()
    WHERE id = ${bomId}::uuid AND app_id = ${appId}::uuid
  `;

  return NextResponse.json({ success: true });
}
