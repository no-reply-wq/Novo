// Quick test of the provision flow
import pg from './node_modules/pg/lib/index.js';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgresql://aniketpattanayak@localhost:5432/novo' });

try {
  const client = await pool.connect();
  
  // Test 1: Check lrbc_user
  const r1 = await client.query("SELECT rolname FROM pg_roles WHERE rolname = 'lrbc_user'");
  console.log('lrbc_user exists:', r1.rows.length > 0);
  
  // Test 2: Check public.apps exists
  const r2 = await client.query("SELECT table_name FROM information_schema.tables WHERE table_name='apps' AND table_schema IN ('public','platform')");
  console.log('apps table:', r2.rows);
  
  // Test 3: Try creating a test schema  
  await client.query('DROP SCHEMA IF EXISTS tenant_provtest CASCADE');
  await client.query('CREATE SCHEMA tenant_provtest');
  console.log('Schema created ok');
  
  // Test 4: Check gen_random_uuid
  const r3 = await client.query("SELECT gen_random_uuid()::text as id");
  console.log('gen_random_uuid ok:', r3.rows[0].id);
  
  await client.query('DROP SCHEMA IF EXISTS tenant_provtest CASCADE');
  client.release();
  console.log('ALL BASIC TESTS PASSED');
} catch(e) {
  console.error('ERROR:', e.message);
}
await pool.end();
