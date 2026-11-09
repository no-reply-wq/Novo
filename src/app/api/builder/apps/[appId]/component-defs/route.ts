import { NextRequest, NextResponse } from "next/server";
import { requireBuilderApp } from "@/lib/auth/tenant-session";
import { pgPool } from "@/lib/db/client";
import { listComponents, saveComponent } from "@/platform/components/store";
import { validateComponentCode } from "@/platform/components/validator";
import type { CustomComponentDef } from "@/platform/components/types";

type Params = { params: Promise<{ appId: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const components = await listComponents(appId, pgPool);
  return NextResponse.json({ components });
}

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { appId } = await params;
  const ctx = await requireBuilderApp(appId, new URL(req.url).searchParams);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json()) as Partial<Omit<CustomComponentDef, "id" | "appId" | "version" | "createdAt" | "updatedAt">>;
  if (!body.name || !body.apiKey || !body.code) {
    return NextResponse.json({ error: "name, apiKey and code are required" }, { status: 400 });
  }
  const validation = await validateComponentCode(body.code);
  if (!validation.valid) {
    return NextResponse.json({ error: "Validation failed", errors: validation.errors, warnings: validation.warnings }, { status: 422 });
  }
  const component = await saveComponent(
    { appId, name: body.name, apiKey: body.apiKey, description: body.description, code: body.code, propsSchema: body.propsSchema ?? [], previewProps: body.previewProps },
    pgPool,
  );
  return NextResponse.json({ component }, { status: 201 });
}
