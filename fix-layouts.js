const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://aniketpattanayak@localhost:5432/novo' });
const APP_ID = '598c915b-a09f-440e-a9b6-22b8e1ca2c4c';
const SCHEMA = 'tenant_colorplas';

async function main() {
  // Check current state
  const before = await pool.query(`SELECT id, label, app_id FROM ${SCHEMA}._tables ORDER BY created_at`);
  console.log('Tables before fix:');
  before.rows.forEach(r => console.log(`  ${r.label}: app_id="${r.app_id}"`));

  // Update all tables that have empty or null app_id to use the Colorplas ERP app ID
  const result = await pool.query(
    `UPDATE ${SCHEMA}._tables SET app_id = $1 WHERE app_id = '' OR app_id IS NULL RETURNING id, label`,
    [APP_ID]
  );
  console.log(`\nUpdated ${result.rows.length} tables:`);
  result.rows.forEach(r => console.log(`  [OK] ${r.label}`));

  // Verify
  const after = await pool.query(`SELECT COUNT(*) FROM ${SCHEMA}._tables WHERE app_id = $1`, [APP_ID]);
  console.log(`\nTables linked to app: ${after.rows[0].count}`);
  console.log('Done! Now refresh the builder page — table dropdown will be populated.');
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });