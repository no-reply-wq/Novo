import { NextRequest, NextResponse } from 'next/server'
import { pgPool } from '@/lib/db/client'

interface ComponentRow {
  id: string
  source_code: string
  compiled_code: string | null
  name: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ componentId: string }> }
): Promise<NextResponse> {
  const { componentId } = await params

  if (!UUID_RE.test(componentId)) {
    return NextResponse.json({ error: 'Invalid componentId' }, { status: 400 })
  }

  const r = await pgPool.query<ComponentRow>(
    `SELECT id, source_code, compiled_code, name FROM platform.custom_components_v2 WHERE id = $1`,
    [componentId]
  )

  if (r.rows.length === 0) {
    return NextResponse.json({ error: 'Component not found' }, { status: 404 })
  }

  const component = r.rows[0]!
  const code = component.compiled_code ?? component.source_code
  // Escape </script> in tenant code to prevent XSS
  const safeCode = code.replace(/<\/script>/gi, '<\\/script>')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${component.name}</title>
<style>* { box-sizing: border-box; } body { margin: 0; padding: 0; font-family: system-ui, sans-serif; }</style>
<script>
(function () {
  'use strict';
  var _props = {};
  window.novo = {
    get props() { return _props; },
    emit: function(eventName, data) {
      parent.postMessage({ type: 'novo:event', payload: { eventName: eventName, data: data } }, '*');
    },
    resize: function(height) {
      parent.postMessage({ type: 'novo:resize', payload: height }, '*');
    }
  };
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'novo:props') {
      _props = e.data.payload || {};
      if (typeof window.onNovoProps === 'function') window.onNovoProps(_props);
    }
  });
  window.addEventListener('load', function() {
    parent.postMessage({ type: 'novo:ready', payload: {} }, '*');
  });
})();
<\/script>
</head>
<body>
<script>
${safeCode}
<\/script>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "script-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}
