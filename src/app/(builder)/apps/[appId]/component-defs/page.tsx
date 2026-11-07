"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { CustomComponentDef } from "@/platform/components/types";

export default function ComponentDefsListPage() {
  const { appId } = useParams<{ appId: string }>();
  const router = useRouter();
  const [components, setComponents] = useState<CustomComponentDef[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/builder/apps/${appId}/component-defs`);
      const data = await res.json() as { components: CustomComponentDef[] };
      setComponents(data.components ?? []);
    } finally { setLoading(false); }
  }, [appId]);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`/api/builder/apps/${appId}/component-defs/${id}`, { method: "DELETE" });
    await load();
  };

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Custom Components</h1>
        <button onClick={() => router.push(`/apps/${appId}/component-defs/new`)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700">
          + New Component
        </button>
      </div>
      {components.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No custom components yet.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {components.map((c) => (
            <div key={c.id} className="border border-gray-200 rounded-lg p-4 flex items-start justify-between hover:border-indigo-300 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{c.name}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{c.apiKey}</span>
                  <span className="text-xs text-gray-400">v{c.version}</span>
                </div>
                {c.description && <p className="text-sm text-gray-500 mt-1 truncate">{c.description}</p>}
                <p className="text-xs text-gray-400 mt-1">Updated {new Date(c.updatedAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <button onClick={() => router.push(`/apps/${appId}/component-defs/${c.id}`)} className="text-xs text-indigo-600 hover:underline">Edit</button>
                <button onClick={() => void handleDelete(c.id, c.name)} className="text-xs text-red-500 hover:underline">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
