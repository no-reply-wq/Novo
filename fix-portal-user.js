const { Pool } = require('pg');
const { scrypt, randomBytes, timingSafeEqual } = require('crypto');
const { promisify } = require('util');

const pool = new Pool({ connectionString: 'postgresql://aniketpattanayak@localhost:5432/novo' });
const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, hash) {
  const [salt, stored] = hash.split(':');
  if (!salt || !stored) return false;
  try {
    const derivedKey = await scryptAsync(password, salt, 64);
    const storedBuffer = Buffer.from(stored, 'hex');
    if (derivedKey.length !== storedBuffer.length) return false;
    return timingSafeEqual(derivedKey, storedBuffer);
  } catch {
    return false;
  }
}

async function main() {
  // Check current state
  const portals = await pool.query('SELECT id, slug, tenant_slug, app_id FROM platform.portals');
  console.log('portals:', JSON.stringify(portals.rows, null, 2));
  
  const users = await pool.query('SELECT id, email, portal_id, is_active, LEFT(password_hash, 20) as hash_preview FROM platform.portal_users');
  console.log('portal_users:', JSON.stringify(users.rows, null, 2));

  // Find the colorplas-erp portal
  const portal = portals.rows.find(p => p.slug === 'colorplas-erp');
  if (!portal) {
    console.error('Portal colorplas-erp not found! Creating it...');
    
    // Find the app
    const apps = await pool.query("SELECT id FROM public.apps WHERE slug = 'colorplas-erp' OR name ILIKE '%colorplas%' LIMIT 1");
    console.log('apps:', JSON.stringify(apps.rows));
    const appId = apps.rows[0]?.id;
    
    const newPortal = await pool.query(
      `INSERT INTO platform.portals (tenant_slug, slug, name, type, app_id, config) 
       VALUES ('colorplas', 'colorplas-erp', 'Colorplas ERP', 'erp', $1, '{}') 
       RETURNING id`,
      [appId]
    );
    console.log('Created portal:', newPortal.rows[0]);
  }

  // Get portal id
  const portalResult = await pool.query("SELECT id FROM platform.portals WHERE tenant_slug='colorplas' AND slug='colorplas-erp'");
  const portalId = portalResult.rows[0]?.id;
  if (!portalId) { console.error('No portal found'); process.exit(1); }
  console.log('Portal ID:', portalId);

  // Hash password with scrypt (what the app expects)
  const password = 'Colorplas@123';
  const newHash = await hashPassword(password);
  console.log('New scrypt hash preview:', newHash.substring(0, 30));
  
  // Verify our hash works
  const verified = await verifyPassword(password, newHash);
  console.log('Hash verification:', verified);

  // Delete old user and create fresh with correct hash
  await pool.query("DELETE FROM platform.portal_users WHERE email = 'admin@colorplas.com'");
  
  const result = await pool.query(
    `INSERT INTO platform.portal_users (portal_id, tenant_slug, email, name, password_hash, is_active)
     VALUES ($1, 'colorplas', 'admin@colorplas.com', 'Colorplas Admin', $2, true)
     RETURNING id, email, is_active`,
    [portalId, newHash]
  );
  console.log('Created portal user:', JSON.stringify(result.rows[0]));

  await pool.end();
  console.log('\nDone! Portal user created with correct scrypt password hash.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
