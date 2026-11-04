import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery, pgPool } from '@/lib/db/client';
import { sendEmail } from '@/lib/integrations/email';

interface SmtpConfig { host: string; port?: number | string; secure?: boolean | string; user: string; pass: string; from?: string; }

// This endpoint is called by an external cron job or workflow trigger.
// It runs all overdue scheduled reports across all active tenants.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-report-secret');
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenants = await pgPool.query(
    `SELECT id, slug, schema_name FROM public.tenants WHERE active = true`
  );

  let ran = 0;
  for (const tenant of tenants.rows) {
    try {
      const reports = await tenantQuery(tenant.schema_name, `
        SELECT * FROM "${tenant.schema_name}".scheduled_reports
        WHERE is_active = true AND next_run_at <= NOW()
      `, []);

      for (const report of reports.rows) {
        await runReport(tenant.schema_name, report);
        ran++;
      }
    } catch (e) {
      console.error(`Report runner error for tenant ${tenant.slug}:`, e);
    }
  }

  return NextResponse.json({ ran });
}

async function runReport(schemaName: string, report: Record<string, unknown>) {
  let rows: Record<string, unknown>[] = [];

  if (report.report_type === 'form_submissions' && report.form_id) {
    const result = await tenantQuery(schemaName, `
      SELECT header_data, submitted_at, status, revision_number
      FROM "${schemaName}".form_submissions
      WHERE form_id = $1 AND is_latest = true
      ORDER BY submitted_at DESC LIMIT 500
    `, [report.form_id]);
    rows = result.rows;
  } else if (report.report_type === 'leads') {
    const result = await tenantQuery(schemaName, `
      SELECT l.title, l.expected_value, ls.name as stage, c.company as client
      FROM "${schemaName}".leads l
      LEFT JOIN "${schemaName}".lead_stages ls ON ls.id = l.stage_id
      LEFT JOIN "${schemaName}".clients c ON c.id = l.client_id
      ORDER BY l.created_at DESC LIMIT 500
    `, []);
    rows = result.rows;
  } else if (report.report_type === 'quotations') {
    const result = await tenantQuery(schemaName, `
      SELECT q.quote_number, q.status, q.total, q.valid_until, c.company as client
      FROM "${schemaName}".quotations q
      LEFT JOIN "${schemaName}".clients c ON c.id = q.client_id
      ORDER BY q.created_at DESC LIMIT 500
    `, []);
    rows = result.rows;
  } else if (report.report_type === 'inventory') {
    const result = await tenantQuery(schemaName, `
      SELECT p.name, p.sku, p.unit_price, COALESCE(SUM(il.quantity), 0) as stock
      FROM "${schemaName}".products p
      LEFT JOIN "${schemaName}".inventory_levels il ON il.product_id = p.id
      GROUP BY p.id, p.name, p.sku, p.unit_price
      ORDER BY p.name LIMIT 500
    `, []);
    rows = result.rows;
  }

  if (rows.length === 0) {
    rows = [{ message: 'No records found for this period.' }];
  }

  const headers = Object.keys(rows[0]);
  const tableHtml = `
    <h2 style="font-family:sans-serif">${report.name}</h2>
    <p style="font-family:sans-serif;color:#666">Generated: ${new Date().toLocaleString()}</p>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
      <thead><tr>${headers.map(h => `<th style="background:#f5f5f5;text-transform:capitalize">${h.replace(/_/g, ' ')}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row =>
        `<tr>${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}</tr>`
      ).join('')}</tbody>
    </table>
  `;

  // Get SMTP config from company settings
  const smtpResult = await tenantQuery(schemaName, `
    SELECT value FROM "${schemaName}".company_settings WHERE key = 'smtp_config'
  `, []);
  const smtp = smtpResult.rows[0]?.value as SmtpConfig | null;

  if (smtp?.host) {
    await sendEmail({ ...smtp, port: smtp.port !== undefined ? Number(smtp.port) : undefined }, {
      to: report.send_to as string,
      subject: report.subject as string,
      body_html: tableHtml,
    });
  } else {
    console.log(`[Scheduled Report] Would send "${report.name}" to ${report.send_to} (${rows.length} rows) — no SMTP configured`);
  }

  // Advance next_run_at
  const schedule = report.schedule as string;
  const next = new Date();
  if (schedule === 'daily') next.setDate(next.getDate() + 1);
  else if (schedule === 'weekly') next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  next.setHours(8, 0, 0, 0);

  await tenantQuery(schemaName, `
    UPDATE "${schemaName}".scheduled_reports
    SET last_sent_at = NOW(), next_run_at = $1
    WHERE id = $2
  `, [next.toISOString(), report.id]);
}
