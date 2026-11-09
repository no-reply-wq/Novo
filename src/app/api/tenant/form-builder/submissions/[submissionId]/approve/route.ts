import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/tenant-session';
import { tenantQuery } from '@/lib/db/client';
import { MODULE } from '@/lib/auth/modules';
import { writeAudit } from '@/lib/audit';
import { z } from 'zod';

const ApproveSchema = z.object({
  action: z.enum(['approve', 'reject', 'assign', 'request_review']),
  note: z.string().max(2000).optional(),
  assignTo: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get('tenant') ?? '';
    const ctx = await requirePermission(tenantSlug, MODULE.FORM_BUILDER, 'edit');
    if (ctx instanceof NextResponse) return ctx;

    const { submissionId } = await params;
    const body = ApproveSchema.parse(await req.json());

    const statusMap: Record<string, string> = {
      approve: 'approved',
      reject: 'rejected',
      request_review: 'in_review',
      assign: 'in_review',
    };

    const newStatus = statusMap[body.action];
    const userId = ctx.tenantUserId;

    let sql: string;
    let sqlParams: unknown[];

    if (body.action === 'assign') {
      if (!body.assignTo)
        return NextResponse.json({ error: 'assignTo required' }, { status: 400 });
      sql = `UPDATE "${ctx.schemaName}".form_submissions
             SET assigned_to = $1, status = $2, updated_at = NOW()
             WHERE id = $3 AND is_latest = true
             RETURNING id, status, assigned_to`;
      sqlParams = [body.assignTo, newStatus, submissionId];
    } else if (body.action === 'approve' || body.action === 'reject') {
      sql = `UPDATE "${ctx.schemaName}".form_submissions
             SET status = $1, approved_by = $2, approved_at = NOW(), approval_note = $3, updated_at = NOW()
             WHERE id = $4 AND is_latest = true
             RETURNING id, status, approved_by, approved_at, approval_note`;
      sqlParams = [newStatus, userId, body.note ?? null, submissionId];
    } else {
      sql = `UPDATE "${ctx.schemaName}".form_submissions
             SET status = $1, updated_at = NOW()
             WHERE id = $2 AND is_latest = true
             RETURNING id, status`;
      sqlParams = [newStatus, submissionId];
    }

    const result = await tenantQuery(ctx.schemaName, sql, sqlParams);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    // Notify assigned user on assign action
    if (body.action === 'assign' && body.assignTo) {
      await tenantQuery(ctx.schemaName, `
        INSERT INTO "${ctx.schemaName}".notifications (user_id, title, message, type, entity_id, entity_type)
        VALUES ($1, $2, $3, 'assignment', $4, 'form_submission')
      `, [
        body.assignTo,
        'Submission assigned to you',
        'A submission has been assigned to you for review.',
        submissionId,
      ]).catch(console.error);
    }

    // Notify submitter on approve/reject
    if (body.action === 'approve' || body.action === 'reject') {
      const subResult = await tenantQuery(ctx.schemaName, `
        SELECT submitted_by FROM "${ctx.schemaName}".form_submissions WHERE id = $1
      `, [submissionId]);
      const submittedBy = subResult.rows[0]?.submitted_by;
      if (submittedBy && submittedBy !== userId) {
        await tenantQuery(ctx.schemaName, `
          INSERT INTO "${ctx.schemaName}".notifications (user_id, title, message, type, entity_id, entity_type)
          VALUES ($1, $2, $3, $4, $5, 'form_submission')
        `, [
          submittedBy,
          newStatus === 'approved' ? 'Submission approved' : 'Submission rejected',
          body.note ?? (newStatus === 'approved' ? 'Your submission was approved.' : 'Your submission was rejected.'),
          newStatus,
          submissionId,
        ]).catch(console.error);
      }
    }

    writeAudit(
      ctx.schemaName,
      userId ?? null,
      'approve',
      'form_submission',
      submissionId,
      { after: { note: body.note, assignTo: body.assignTo, newStatus } }
    ).catch(() => {});

    return NextResponse.json({ success: true, submission: result.rows[0] });
  } catch (e: unknown) {
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.issues }, { status: 400 });
    console.error('Approve submission error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
