/**
 * POST /api/builder/admin/run-platform-migration
 * One-time: creates platform.table_relations if it doesn't exist
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export async function POST(): Promise<NextResponse> {
  try {
    // Create without FK to platform.apps (apps live in public.apps in this setup)
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS platform.table_relations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        app_id uuid NOT NULL,
        name text NOT NULL,
        type text NOT NULL CHECK (type IN ('one_to_many', 'many_to_many', 'self')),
        source_table_id uuid NOT NULL,
        target_table_id uuid NOT NULL,
        source_field text NOT NULL,
        target_field text,
        junction_table text,
        cascade_on_delete text NOT NULL DEFAULT 'restrict' CHECK (cascade_on_delete IN ('restrict', 'cascade', 'set_null')),
        cascade_on_update text NOT NULL DEFAULT 'restrict' CHECK (cascade_on_update IN ('restrict', 'cascade', 'set_null')),
        inverse_label text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS table_relations_app_id_idx ON platform.table_relations(app_id)`;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS table_relations_source_idx ON platform.table_relations(source_table_id)`;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS table_relations_target_idx ON platform.table_relations(target_table_id)`;
    return NextResponse.json({ ok: true, message: 'platform.table_relations created/verified' });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
