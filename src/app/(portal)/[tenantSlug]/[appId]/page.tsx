/**
 * Customer portal page — read-only view of the customer's own records.
 * Access via: /[tenantSlug]/[appId]?token=<portalToken>
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface PortalConfig {
  appId: string;
  enabled: boolean;
  allowedTables: string[];
  filterField: string;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    companyName?: string;
  };
}

interface PortalState {
  loading: boolean;
  error: string | null;
  config: PortalConfig | null;
  customerEmail: string | null;
  records: Record<string, Record<string, unknown>[]>;
}

export default function PortalPage() {
  const params = useParams<{ tenantSlug: string; appId: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const appId = params.appId;

  const [state, setState] = useState<PortalState>({
    loading: true,
    error: null,
    config: null,
    customerEmail: null,
    records: {},
  });

  useEffect(() => {
    if (!token) {
      setState((s) => ({ ...s, loading: false, error: 'No access token provided.' }));
      return;
    }
    async function load() {
      try {
        const metaRes = await fetch(`/api/portal/${appId}?token=${encodeURIComponent(token)}`);
        if (!metaRes.ok) {
          const e = (await metaRes.json()) as { error?: string };
          setState((s) => ({ ...s, loading: false, error: e.error ?? 'Access denied' }));
          return;
        }
        const meta = (await metaRes.json()) as { config: PortalConfig; customer: { email: string } };
        const config = meta.config;
        const email = meta.customer.email;

        // Fetch records for each allowed table
        const recordsByTable: Record<string, Record<string, unknown>[]> = {};
        await Promise.all(
          (config?.allowedTables ?? []).map(async (tbl) => {
            const res = await fetch(`/api/portal/${appId}/records/${tbl}?token=${encodeURIComponent(token)}`);
            if (res.ok) {
              const data = (await res.json()) as { records: Record<string, unknown>[] };
              recordsByTable[tbl] = data.records ?? [];
            }
          }),
        );

        setState({ loading: false, error: null, config, customerEmail: email, records: recordsByTable });
      } catch (err) {
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Error' }));
      }
    }
    void load();
  }, [token, appId]);

  const { loading, error, config, customerEmail, records } = state;
  const primaryColor = config?.branding?.primaryColor ?? '#2563eb';
  const companyName = config?.branding?.companyName ?? 'Portal';
  const logoUrl = config?.branding?.logoUrl;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b7280' }}>Loading your portal…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#dc2626' }}>Access Error</h1>
          <p style={{ color: '#6b7280', marginTop: 8 }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <header style={{ background: primaryColor, color: '#fff', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 16 }}>
        {logoUrl && <img src={logoUrl} alt="logo" style={{ height: 36, borderRadius: 4 }} />}
        <span style={{ fontSize: 20, fontWeight: 700 }}>{companyName}</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, opacity: 0.85 }}>{customerEmail}</span>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 960, margin: '32px auto', padding: '0 24px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 24 }}>Your Records</h2>
        {(config?.allowedTables ?? []).map((tbl) => {
          const rows = records[tbl] ?? [];
          const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
          return (
            <section key={tbl} style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 12, textTransform: 'capitalize' }}>
                {tbl.replace(/_/g, ' ')}
              </h3>
              {rows.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: 14 }}>No records found.</p>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        {cols.map((col) => (
                          <th key={col} style={{ padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          {cols.map((col) => (
                            <td key={col} style={{ padding: '10px 14px', color: '#111827' }}>
                              {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
