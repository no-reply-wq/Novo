const {Pool}=require('pg');
const bcrypt=require('bcryptjs');
const pool=new Pool({connectionString:'postgresql://aniketpattanayak@localhost:5432/novo'});
async function main(){
  // Create portal record
  const portalRes = await pool.query(`
    INSERT INTO platform.portals (app_id, tenant_slug, name, slug, type, config)
    VALUES ('598c915b-a09f-440e-a9b6-22b8e1ca2c4c', 'colorplas', 'Colorplas ERP', 'colorplas-erp', 'internal', '{}')
    ON CONFLICT DO NOTHING RETURNING id
  `);
  let portalId = portalRes.rows[0]?.id;
  if (!portalId) {
    const r = await pool.query("SELECT id FROM platform.portals WHERE tenant_slug='colorplas' AND slug='colorplas-erp'");
    portalId = r.rows[0]?.id;
  }
  console.log('Portal ID:', portalId);

  // Create portal user
  const ph = await bcrypt.hash('Colorplas@123', 12);
  await pool.query(`
    INSERT INTO platform.portal_users (portal_id, tenant_slug, email, name, password_hash, is_active)
    VALUES ($1, 'colorplas', 'admin@colorplas.com', 'Admin', $2, true)
    ON CONFLICT DO NOTHING
  `, [portalId, ph]);
  console.log('Portal user created!');

  const u = await pool.query("SELECT id,email,is_active FROM platform.portal_users WHERE email='admin@colorplas.com'");
  console.log('User:', JSON.stringify(u.rows));
  await pool.end();
}
main().catch(console.error);
