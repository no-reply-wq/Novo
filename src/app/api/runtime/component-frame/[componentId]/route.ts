import { NextRequest, NextResponse } from 'next/server';
import { pgPool } from '@/lib/db/client';

interface ComponentRow {
  id: string;
  source_code: string;
  compiled_code: string | null;
  name: string;
  app_id: string;
}

function buildHtmlShell(component: ComponentRow): string {
  const code = component.compiled_code ?? component.source_code;
  // Escape </script> sequences in tenant code to prevent injection
  const safeCode = code.replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${component.name}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: system-ui, sans-serif; }
</style>
<script>
(function() {
  'use strict';
  var _propsHandlers = [];
  var _readyHandlers = [];
  var _currentProps = {};

  window.novo = {
    get props() { return _currentProps; },
    onReady: function(fn) { _readyHandlers.push(fn); },
    receiveProps: function(fn) { _propsHandlers.push(fn); },
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
      _currentProps = e.data.payload || {};
      _propsHandlers.forEach(function(fn) { try { fn(_currentProps); } catch(err) { /* ignore */ } });
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    _readyHandlers.forEach(function(fn) { try { fn(); } catch(err) { /* ignore */ } });
    parent.postMessage({ type: 'novo:ready', payload: null }, '*');
  });

  window.addEventListener('error', function(e) {
    parent.postMessage({ type: 'novo:error', payload: { message: e.message || 'Unknown error' } }, '*');
  });
})();
</script>
</head>
<body>
${safeCode}
</body>
</html>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ componentId: string }> },
): Promise<NextResponse> {
  const { componentId } = await params;

  if (!componentId || typeof componentId !== 'string') {
    return new NextResponse('Bad request', { status: 400 });
  }

  // Validate that the componentId looks like a UUID
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(componentId)) {
    return new NextResponse('Not found', { status: 404 });
  }

  let component: ComponentRow | null = null;
  try {
    const result = await pgPool.query<ComponentRow>(
      `SELECT id, source_code, compiled_code, name, app_id
       FROM platform.custom_components_v2
       WHERE id = $1`,
      [componentId],
    );
    component = result.rows[0] ?? null;
  } catch {
    return new NextResponse('Database error', { status: 500 });
  }

  if (!component) {
    return new NextResponse('Component not found', { status: 404 });
  }

  const html = buildHtmlShell(component);

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "script-src 'self' 'unsafe-inline'; frame-ancestors 'self'",
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store',
    },
  });
}
