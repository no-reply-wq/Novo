import { NextRequest, NextResponse } from "next/server";
import { pgPool } from "@/lib/db/client";
import { getComponent } from "@/platform/components/store";
import { renderCustomComponent, buildDefaultSandbox } from "@/platform/components/renderer";

type Params = { params: Promise<{ appId: string; componentId: string }> };

export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { componentId } = await params;
  const component = await getComponent(componentId, pgPool);
  if (!component) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { props?: Record<string, unknown> };
  const props = body.props ?? component.previewProps ?? {};
  const sandbox = await buildDefaultSandbox(pgPool);
  const html = await renderCustomComponent(component, props, sandbox);
  return NextResponse.json({ html });
}
