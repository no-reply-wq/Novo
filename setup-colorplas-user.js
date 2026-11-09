const {Pool}=require('pg');
const bcrypt=require('bcryptjs');
const pool=new Pool({connectionString:'postgresql://aniketpattanayak@localhost:5432/novo'});
async function main(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_colorplas.roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      permissions JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_colorplas.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id UUID REFERENCES tenant_colorplas.roles(id),
      active BOOLEAN DEFAULT true,
      token_version INT DEFAULT 0,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  const roleRes = await pool.query(`INSERT INTO tenant_colorplas.roles (name, permissions) VALUES ('Admin', '{"all": true}') ON CONFLICT DO NOTHING RETURNING id`);
  let roleId = roleRes.rows[0]?.id;
  if (!roleId) { const r = await pool.query("SELECT id FROM tenant_colorplas.roles WHERE name='Admin'"); roleId = r.rows[0].id; }
  console.log('Role id:', roleId);
  const ph = await bcrypt.hash('Colorplas@123', 12);
  await pool.query(`INSERT INTO tenant_colorplas.users (name, email, password_hash, role_id, active, token_version) VALUES ('Admin', 'admin@colorplas.com', $1, $2, true, 0) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, active=true`, [ph, roleId]);
  console.log('Done! User created.');
  const u = await pool.query('SELECT id,email,active FROM tenant_colorplas.users');
  console.log(JSON.stringify(u.rows));
  await pool.end();
}
main().catch(console.error);
