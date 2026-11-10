import { NextRequest, NextResponse } from "next/server";
import { requireBuilderApp } from "@/lib/auth/tenant-session";
import { pgPool } from "@/lib/db/client";
import { getComponent, saveComponent, deleteComponent } from "@/platform/components/store";
import { validateComponentCode } from "@/platform/components/validator";
import type { CustomComponentDef } from "@/platform/components/types";

type Params = { params: Promise<{ appId: string; componentId: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { appId, componentId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const component = await getComponent(componentId, pgPool);
  if (!component) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ component });
}

export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { appId, componentId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const existing = await getComponent(componentId, pgPool);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as Partial<Omit<CustomComponentDef, "id" | "appId" | "version" | "createdAt" | "updatedAt">>;
  if (body.code) {
    const validation = await validateComponentCode(body.code);
    if (!validation.valid) {
      return NextResponse.json({ error: "Validation failed", errors: validation.errors }, { status: 422 });
    }
  }
  const updated = await saveComponent(
    { appId, name: body.name ?? existing.name, apiKey: body.apiKey ?? existing.apiKey, description: body.description ?? existing.description, code: body.code ?? existing.code, propsSchema: body.propsSchema ?? existing.propsSchema, previewProps: body.previewProps ?? existing.previewProps },
    pgPool,
  );
  return NextResponse.json({ component: updated });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { appId, componentId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const existing = await getComponent(componentId, pgPool);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteComponent(componentId, pgPool);
  return NextResponse.json({ ok: true });
}
