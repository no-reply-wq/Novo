'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { IframeMessage, CustomComponentDefinition } from '@/platform/custom-components/types';

export interface CustomComponentProps {
  componentSlug: string;
  tenantSlug: string;
  props: Record<string, unknown>;        // resolved bindings from parent page
  onEvent: (event: string, payload: unknown) => void;  // fires page action chain
}

const NOVO_SDK_SCRIPT = `
<script>
(function() {
  var _propsHandlers = [];
  var _readyHandlers = [];

  window.novo = {
    onReady: function(fn) {
      _readyHandlers.push(fn);
    },
    receiveProps: function(fn) {
      _propsHandlers.push(fn);
    },
    emit: function(event, payload) {
      parent.postMessage({ type: 'NOVO_EVENT', event: event, payload: payload }, '*');
    },
    resize: function(h) {
      parent.postMessage({ type: 'NOVO_RESIZE', height: h }, '*');
    }
  };

  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'NOVO_PROPS') {
      _propsHandlers.forEach(function(fn) { fn(e.data.props); });
    }
  });

  // Signal ready after DOM loads
  document.addEventListener('DOMContentLoaded', function() {
    _readyHandlers.forEach(function(fn) { fn(); });
    parent.postMessage({ type: 'NOVO_READY' }, '*');
  });

  // Catch uncaught errors
  window.addEventListener('error', function(e) {
    parent.postMessage({ type: 'NOVO_ERROR', message: e.message || 'Unknown error' }, '*');
  });
})();
</script>
`;

function buildSrcdoc(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: system-ui, sans-serif; }
</style>
${NOVO_SDK_SCRIPT}
</head>
<body>
${code}
</body>
</html>`;
}

interface ComponentError {
  message: string;
}

export function CustomComponent({
  componentSlug,
  tenantSlug,
  props,
  onEvent,
}: CustomComponentProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const [definition, setDefinition] = useState<CustomComponentDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ComponentError | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Stable reference to avoid re-subscribing on every render
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // Fetch component definition
  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsReady(false);

    fetch(`/api/builder/custom-components?tenant=${encodeURIComponent(tenantSlug)}`)
      .then(res => res.json())
      .then((data: { components?: CustomComponentDefinition[]; error?: string }) => {
        if (data.error) {
          setError({ message: data.error });
          return;
        }
        const found = (data.components ?? []).find(c => c.slug === componentSlug);
        if (!found) {
          setError({ message: `Component "${componentSlug}" not found` });
          return;
        }
        setDefinition(found);
      })
      .catch((err: Error) => {
        setError({ message: err.message });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [componentSlug, tenantSlug]);

  // Send props to iframe when ready or props change
  const sendProps = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !isReady) return;

    const message: IframeMessage = { type: 'NOVO_PROPS', props };
    iframe.contentWindow.postMessage(message, '*');
  }, [props, isReady]);

  useEffect(() => {
    sendProps();
  }, [sendProps]);

  // Listen for messages from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Only accept messages from our iframe
      if (!iframeRef.current) return;
      if (event.source !== iframeRef.current.contentWindow) return;

      const data = event.data as IframeMessage;
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;

      switch (data.type) {
        case 'NOVO_READY': {
          setIsReady(true);
          // Send initial props now that iframe is ready
          const iframe = iframeRef.current;
          if (iframe?.contentWindow) {
            const message: IframeMessage = { type: 'NOVO_PROPS', props };
            iframe.contentWindow.postMessage(message, '*');
          }
          break;
        }
        case 'NOVO_EVENT': {
          onEventRef.current(data.event, data.payload);
          break;
        }
        case 'NOVO_RESIZE': {
          if (typeof data.height === 'number' && data.height > 0) {
            setHeight(data.height);
          }
          break;
        }
        case 'NOVO_ERROR': {
          setError({ message: data.message });
          break;
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [props]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24 bg-gray-50 rounded border border-gray-200">
        <span className="text-sm text-gray-500">Loading component…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
        <span className="font-medium">Component error:</span>
        <span>{error.message}</span>
      </div>
    );
  }

  if (!definition) return null;

  return (
    <iframe
      ref={iframeRef}
      title={definition.name}
      sandbox="allow-scripts"
      srcDoc={buildSrcdoc(definition.code)}
      style={{ width: '100%', height: `${height}px`, border: 'none', display: 'block' }}
    />
  );
}

// Export srcdoc builder for testing
export { buildSrcdoc };
