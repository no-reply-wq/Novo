import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';
interface ComponentRow { id: string; source_code: string; compiled_code: string | null; name: string; app_id: string; }
function buildHtmlShell(c: ComponentRow): string {
  const code = (c.compiled_code ?? c.source_code).replace(/<\/script>/gi, '<\\/script>');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${c.name}</title><style>* { box-sizing: border-box; } body { margin: 0; padding: 0; font-family: system-ui, sans-serif; }</style><script>(function(){'use strict';var ph=[],rh=[],cp={};window.novo={get props(){return cp;},onReady:function(f){rh.push(f);},receiveProps:function(f){ph.push(f);},emit:function(n,d){parent.postMessage({type:'novo:event',payload:{eventName:n,data:d}},'*');},resize:function(h){parent.postMessage({type:'novo:resize',payload:h},'*');}};window.addEventListener('message',function(e){if(!e.data||typeof e.data!=='object')return;if(e.data.type==='novo:props'){cp=e.data.payload||{};ph.forEach(function(f){try{f(cp);}catch(e){}});}});document.addEventListener('DOMContentLoaded',function(){rh.forEach(function(f){try{f();}catch(e){}});parent.postMessage({type:'novo:ready',payload:null},'*');});window.addEventListener('error',function(e){parent.postMessage({type:'novo:error',payload:{message:e.message||'Unknown error'}},'*');});})();<\/script></head><body>${code}</body></html>`;
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ componentId: string }> }): Promise<NextResponse> {
  const { componentId } = await params;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!componentId || !UUID_RE.test(componentId)) return new NextResponse('Not found', { status: 404 });
  let component: ComponentRow | null = null;
  try {
    const r = await pgPool.query<ComponentRow>(`SELECT id, source_code, compiled_code, name, app_id FROM platform.custom_components_v2 WHERE id = $1`, [componentId]);
    component = r.rows[0] ?? null;
  } catch { return new NextResponse('Database error', { status: 500 }); }
  if (!component) return new NextResponse('Component not found', { status: 404 });
  return new NextResponse(buildHtmlShell(component), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "script-src 'self' 'unsafe-inline'; frame-ancestors 'self'", 'X-Frame-Options': 'SAMEORIGIN', 'Cache-Control': 'no-store' } });
}
