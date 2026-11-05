import { NextRequest, NextResponse } from 'next/server';

interface RlsPolicy {
  roleId: string;
  expr: string;
}

type Permission = 'read' | 'create' | 'update' | 'delete';

interface TableRls {
  tableId: string;
  tableLabel: string;
  policies: Record<Permission, RlsPolicy[]>;
  fieldPermissions: Record<string, Record<string, 'read_write' | 'read_only' | 'hidden'>>;
}

const rlsStore = new Map<string, TableRls[]>();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const tables = rlsStore.get(appId) ?? [];
  return NextResponse.json({ tables });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params;
  const body = (await req.json()) as { tableId: string; policies: Record<Permission, RlsPolicy[]> };
  const existing = rlsStore.get(appId) ?? [];
  const updated = existing.map((t) =>
    t.tableId === body.tableId ? { ...t, policies: body.policies } : t,
  );
  if (!updated.find((t) => t.tableId === body.tableId)) {
    updated.push({
      tableId: body.tableId,
      tableLabel: body.tableId,
      policies: body.policies,
      fieldPermissions: {},
    });
  }
  rlsStore.set(appId, updated);
  return NextResponse.json({ ok: true });
}
