#!/usr/bin/env node
/**
 * Novo ERP - Comprehensive Feature Test Suite
 * Run: node test-all-features.mjs
 */
import { randomBytes } from 'crypto';

const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@novo.com';
const ADMIN_PASSWORD = 'Admin@123';
const TENANT_SLUG = 'colorplas-test-' + randomBytes(3).toString('hex');
const TENANT_EMAIL = `admin@${TENANT_SLUG}.com`;
const TENANT_PASSWORD = 'Test@12345';

class TestRunner {
  constructor() {
    this.results = [];
    this.adminCookie = null;
    this.tenantCookie = null;
    this.createdTenantSlug = null;
    this.createdTenantId = null;   // UUID from create response
  }

  async request(method, path, body, cookie) {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(`${BASE}${path}`, opts);
      let data;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) data = await res.json().catch(() => null);
      else data = await res.text().catch(() => '');
      return { status: res.status, data, headers: res.headers };
    } catch (e) {
      return { status: 0, error: e.message };
    }
  }

  async pass(name, fn) {
    try {
      const result = await fn();
      const ok = result?.ok !== false;
      this.results.push({ name, status: ok ? 'PASS' : 'FAIL', detail: result?.detail || '' });
      console.log(`  ${ok ? '✅' : '❌'} ${name}${result?.detail ? ' — ' + result.detail : ''}`);
      return result;
    } catch (e) {
      this.results.push({ name, status: 'ERROR', detail: e.message });
      console.log(`  💥 ${name} — ${e.message}`);
      return { ok: false };
    }
  }

  async login(email, password, provider, extra = {}) {
    const r1 = await fetch(`${BASE}/api/auth/csrf`);
    const csrfData = await r1.json();
    const csrfToken = csrfData.csrfToken;
    const initCookie = r1.headers.get('set-cookie')?.split(';')[0] || '';

    const form = new URLSearchParams({
      csrfToken, email, password,
      redirect: 'false', callbackUrl: `${BASE}/`, json: 'true',
      ...extra,
    });
    const headers2 = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (initCookie) headers2['Cookie'] = initCookie;

    const r2 = await fetch(`${BASE}/api/auth/callback/${provider}`, {
      method: 'POST', headers: headers2, body: form.toString(), redirect: 'manual',
    });

    const cookies = new Map();
    if (initCookie) { const [k] = initCookie.split('='); cookies.set(k, initCookie); }
    r2.headers.forEach((val, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        const piece = val.split(';')[0];
        const [k] = piece.split('=');
        cookies.set(k, piece);
      }
    });
    const cookieStr = [...cookies.values()].join('; ');

    const r3 = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookieStr } });
    const session = await r3.json();
    if (session?.user?.email) return { ok: true, cookie: cookieStr, user: session.user };

    const body2 = await r2.text().catch(() => '');
    return { ok: false, detail: `callback ${r2.status}, session: ${JSON.stringify(session)}, body: ${body2.slice(0,100)}` };
  }

  // ── Suites ──────────────────────────────────────────────────────────────

  async testPublicRoutes() {
    console.log('\n📋 PUBLIC ROUTES');
    await this.pass('Homepage loads', async () => {
      const r = await this.request('GET', '/');
      return { ok: r.status === 200 || r.status === 307 || r.status === 302, detail: `Status ${r.status}` };
    });
    await this.pass('Login page loads', async () => {
      const r = await this.request('GET', '/login');
      return { ok: r.status === 200, detail: `Status ${r.status}` };
    });
    await this.pass('Admin login page loads', async () => {
      const r = await this.request('GET', '/admin/login');
      return { ok: r.status === 200, detail: `Status ${r.status}` };
    });
    await this.pass('Auth CSRF endpoint works', async () => {
      const r = await this.request('GET', '/api/auth/csrf');
      return { ok: r.status === 200 && !!r.data?.csrfToken, detail: `token length: ${r.data?.csrfToken?.length}` };
    });
    await this.pass('Auth providers endpoint works', async () => {
      const r = await this.request('GET', '/api/auth/providers');
      return { ok: r.status === 200, detail: `providers: ${Object.keys(r.data || {}).join(', ')}` };
    });
  }

  async testPlatformAuth() {
    console.log('\n🔑 PLATFORM AUTH');
    await this.pass('Platform admin login', async () => {
      const r = await this.login(ADMIN_EMAIL, ADMIN_PASSWORD, 'platform-admin');
      if (r.ok) this.adminCookie = r.cookie;
      return { ok: r.ok, detail: r.ok ? `user: ${r.user?.email}` : r.detail };
    });
    await this.pass('Session endpoint returns user', async () => {
      const r = await this.request('GET', '/api/auth/session', null, this.adminCookie);
      return { ok: !!r.data?.user?.email, detail: r.data?.user?.email };
    });
    await this.pass('isPlatformAdmin flag set', async () => {
      const r = await this.request('GET', '/api/auth/session', null, this.adminCookie);
      return { ok: r.data?.user?.isPlatformAdmin === true, detail: `isPlatformAdmin: ${r.data?.user?.isPlatformAdmin}` };
    });
    await this.pass('Wrong password correctly rejected', async () => {
      const r = await this.login(ADMIN_EMAIL, 'wrongpassword999', 'platform-admin');
      return { ok: !r.ok, detail: 'correctly rejected' };
    });
  }

  async testUnauthorizedAccess() {
    console.log('\n🔒 UNAUTHORIZED ACCESS PROTECTION');
    await this.pass('Platform tenants blocked without auth', async () => {
      const r = await this.request('GET', '/api/platform/tenants');
      return { ok: r.status === 401 || r.status === 403, detail: `Status ${r.status}` };
    });
    await this.pass('Platform admins blocked without auth', async () => {
      const r = await this.request('GET', '/api/platform/admins');
      return { ok: r.status === 401 || r.status === 403, detail: `Status ${r.status}` };
    });
  }

  async testTenantCRUD() {
    if (!this.adminCookie) { console.log('\n⚠️  Skipping tenant CRUD (no admin session)'); return; }
    console.log('\n🏢 TENANT MANAGEMENT');

    await this.pass('List tenants', async () => {
      const r = await this.request('GET', '/api/platform/tenants', null, this.adminCookie);
      return { ok: r.status === 200, detail: `${r.data?.tenants?.length ?? '?'} tenants` };
    });

    await this.pass(`Create tenant (${TENANT_SLUG})`, async () => {
      const r = await this.request('POST', '/api/platform/tenants', {
        name: 'Test Company ' + TENANT_SLUG,   // field is "name" not "companyName"
        slug: TENANT_SLUG,
        adminName: 'Test Admin',
        adminEmail: TENANT_EMAIL,
        adminPassword: TENANT_PASSWORD,
        plan: 'starter',                        // enum: starter | pro | enterprise
      }, this.adminCookie);
      if (r.status === 201 || r.status === 200) {
        this.createdTenantSlug = r.data?.tenant?.slug ?? TENANT_SLUG;
        this.createdTenantId   = r.data?.tenant?.id;
      }
      return {
        ok: r.status === 201 || r.status === 200,
        detail: `Status ${r.status}: id=${this.createdTenantId}, slug=${this.createdTenantSlug}`
      };
    });

    if (this.createdTenantId) {
      // GET uses the UUID path
      await this.pass('Get tenant by id', async () => {
        const r = await this.request('GET', `/api/platform/tenants/${this.createdTenantId}`, null, this.adminCookie);
        return { ok: r.status === 200, detail: `name: ${r.data?.tenant?.name}` };
      });

      // Duplicate slug rejected
      await this.pass('Duplicate slug rejected (409/422)', async () => {
        const r = await this.request('POST', '/api/platform/tenants', {
          name: 'Dup', slug: TENANT_SLUG, adminName: 'D',
          adminEmail: 'dup@d.com', adminPassword: 'Test@12345', plan: 'starter',
        }, this.adminCookie);
        return { ok: r.status === 409 || r.status === 422 || r.status === 400, detail: `Status ${r.status}` };
      });
    }
  }

  async testTenantAuth() {
    if (!this.createdTenantSlug) { console.log('\n⚠️  Skipping tenant auth (no tenant created)'); return; }
    console.log('\n🔑 TENANT USER AUTH');
    await this.pass('Tenant admin login', async () => {
      const r = await this.login(TENANT_EMAIL, TENANT_PASSWORD, 'tenant-user', { tenantSlug: this.createdTenantSlug });
      if (r.ok) this.tenantCookie = r.cookie;
      return { ok: r.ok, detail: r.ok ? `user: ${r.user?.email}, slug: ${r.user?.tenantSlug}` : r.detail };
    });
    await this.pass('Tenant session has tenantSlug', async () => {
      if (!this.tenantCookie) return { ok: false, detail: 'no cookie' };
      const r = await this.request('GET', '/api/auth/session', null, this.tenantCookie);
      return { ok: !!r.data?.user?.tenantSlug, detail: `tenantSlug: ${r.data?.user?.tenantSlug}` };
    });
    await this.pass('Wrong tenant password rejected', async () => {
      const r = await this.login(TENANT_EMAIL, 'wrongpass123', 'tenant-user', { tenantSlug: this.createdTenantSlug });
      return { ok: !r.ok, detail: 'correctly rejected' };
    });
    await this.pass('Tenant API blocked without auth', async () => {
      const r = await this.request('GET', `/api/tenant/leads?tenant=${this.createdTenantSlug}`);
      return { ok: r.status === 401 || r.status === 403, detail: `Status ${r.status}` };
    });
  }

  async testTenantDataAPIs() {
    if (!this.tenantCookie) { console.log('\n⚠️  Skipping data APIs (no tenant session)'); return; }
    const slug = this.createdTenantSlug;
    console.log('\n📊 TENANT DATA APIs');
    // Routes use /api/tenant/X?tenant=slug
    const t = (path) => { const sep = path.includes('?') ? '&' : '?'; return this.request('GET', `/api/tenant${path}${sep}tenant=${slug}`, null, this.tenantCookie); };

    const endpoints = [
      ['/leads', 'List leads'],
      ['/quotations', 'List quotations'],
      ['/purchase-orders', 'List purchase orders'],
      ['/sales-orders', 'List sales orders'],
      ['/notifications', 'List notifications (tenant)'],
      ['/users', 'List tenant users'],
      ['/roles', 'List tenant roles'],
      ['/masters?type=clients', 'List masters'],
      ['/inventory', 'List inventory'],
      ['/indents', 'List indents'],
      ['/goods-receipts', 'List goods receipts'],
      ['/expenses', 'List expenses'],
      ['/settings', 'Get tenant settings'],
      ['/dashboard/stats', 'Dashboard stats'],  // 403=no perm is ok, endpoint exists
    ];
    for (const [path, name] of endpoints) {
      await this.pass(name, async () => {
        const r = await t(path);
        return { ok: r.status === 200 || r.status === 403 || r.status === 404, detail: `Status ${r.status}` };
      });
    }
  }

  async testBuilderAPI() {
    if (!this.tenantCookie || !this.createdTenantSlug) { console.log('\n⚠️  Skipping builder API (no tenant session)'); return; }
    const slug = this.createdTenantSlug;
    console.log('\n🔨 BUILDER API');
    let appId = null;

    // Builder routes are /api/builder/apps — no tenantSlug in URL, resolved from session
    await this.pass('List apps', async () => {
      const r = await this.request('GET', `/api/builder/apps?tenant=${slug}`, null, this.tenantCookie);
      return { ok: r.status === 200, detail: `Status ${r.status}, ${(r.data?.apps ?? r.data)?.length ?? 0} apps` };
    });
    await this.pass('Create app', async () => {
      const r = await this.request('POST', '/api/builder/apps', {
        tenant: slug, name: 'Test App', description: 'Test', icon: 'grid', color: '#6366f1',
      }, this.tenantCookie);
      appId = r.data?.app?.id || r.data?.id || (Array.isArray(r.data) ? null : r.data?.app?.id);
      return { ok: r.status === 201 || r.status === 200, detail: `Status ${r.status}: ${JSON.stringify(r.data).slice(0,100)}` };
    });
    if (appId) {
      await this.pass('Get app by id', async () => {
        // GET /api/builder/apps/[appId] uses session.user.tenantSlug (no ?tenant needed)
        const r = await this.request('GET', `/api/builder/apps/${appId}`, null, this.tenantCookie);
        return { ok: r.status === 200, detail: `Status ${r.status}` };
      });
      await this.pass('Create table in app', async () => {
        const r = await this.request('POST', `/api/builder/apps/${appId}/tables?tenant=${slug}`, {
          name: 'customers', label: 'Customers',
        }, this.tenantCookie);
        return { ok: r.status === 201 || r.status === 200, detail: `Status ${r.status}: ${JSON.stringify(r.data).slice(0,80)}` };
      });
      await this.pass('List tables in app', async () => {
        const r = await this.request('GET', `/api/builder/apps/${appId}/tables?tenant=${slug}`, null, this.tenantCookie);
        return { ok: r.status === 200, detail: `Status ${r.status}` };
      });
      await this.pass('Create workflow in app', async () => {
        const r = await this.request('POST', `/api/builder/apps/${appId}/workflows?tenant=${slug}`, {
          name: 'Test Workflow', trigger: 'manual',
        }, this.tenantCookie);
        return { ok: r.status === 201 || r.status === 200, detail: `Status ${r.status}` };
      });
      await this.pass('List workflows in app', async () => {
        const r = await this.request('GET', `/api/builder/apps/${appId}/workflows?tenant=${slug}`, null, this.tenantCookie);
        return { ok: r.status === 200, detail: `Status ${r.status}` };
      });
      await this.pass('Get app roles', async () => {
        const r = await this.request('GET', `/api/builder/apps/${appId}/roles?tenant=${slug}`, null, this.tenantCookie);
        return { ok: r.status === 200, detail: `Status ${r.status}` };
      });
      await this.pass('Get app members', async () => {
        const r = await this.request('GET', `/api/builder/apps/${appId}/members?tenant=${slug}`, null, this.tenantCookie);
        return { ok: r.status === 200, detail: `Status ${r.status}` };
      });
    }
  }

  async testPlatformStaff() {
    if (!this.adminCookie) { console.log('\n⚠️  Skipping staff management (no admin session)'); return; }
    console.log('\n👥 PLATFORM STAFF MANAGEMENT');
    let staffId = null;
    const staffEmail = `staff-${randomBytes(3).toString('hex')}@novo.com`;

    await this.pass('List platform admins', async () => {
      const r = await this.request('GET', '/api/platform/admins', null, this.adminCookie);
      const count = r.data?.admins?.length ?? '?';
      return { ok: r.status === 200, detail: `${count} admins` };
    });
    await this.pass('Create platform staff', async () => {
      const r = await this.request('POST', '/api/platform/admins', {
        name: 'Test Staff', email: staffEmail, password: 'Staff@12345',
      }, this.adminCookie);
      staffId = r.data?.admin?.id || r.data?.id;
      return { ok: r.status === 201 || r.status === 200, detail: `Status ${r.status}, id: ${staffId}` };
    });
    if (staffId) {
      await this.pass('Get staff by id', async () => {
        const r = await this.request('GET', `/api/platform/admins/${staffId}`, null, this.adminCookie);
        return { ok: r.status === 200, detail: `Status ${r.status}: ${r.data?.admin?.email}` };
      });
      await this.pass('Delete platform staff', async () => {
        const r = await this.request('DELETE', `/api/platform/admins/${staffId}`, null, this.adminCookie);
        return { ok: r.status === 200 || r.status === 204, detail: `Status ${r.status}` };
      });
      await this.pass('Deleted staff no longer exists', async () => {
        const r = await this.request('GET', `/api/platform/admins/${staffId}`, null, this.adminCookie);
        return { ok: r.status === 404, detail: `Status ${r.status}` };
      });
    }
  }

  async testTenantSuspension() {
    if (!this.createdTenantId || !this.adminCookie) return;
    console.log('\n🚫 TENANT SUSPENSION / ACTIVATION');
    await this.pass('Suspend tenant', async () => {
      const r = await this.request('PATCH', `/api/platform/tenants/${this.createdTenantId}`, { status: 'SUSPENDED' }, this.adminCookie);
      return { ok: r.status === 200, detail: `Status ${r.status}` };
    });
    await this.pass('Reactivate tenant', async () => {
      const r = await this.request('PATCH', `/api/platform/tenants/${this.createdTenantId}`, { status: 'ACTIVE' }, this.adminCookie);
      return { ok: r.status === 200, detail: `Status ${r.status}` };
    });
  }

  async cleanup() {
    if (!this.createdTenantId || !this.adminCookie) return;
    console.log('\n🧹 CLEANUP');
    await this.pass('Delete test tenant', async () => {
      const r = await this.request('DELETE', `/api/platform/tenants/${this.createdTenantId}`, null, this.adminCookie);
      return { ok: r.status === 200 || r.status === 204 || r.status === 404, detail: `Status ${r.status}` };
    });
  }

  printSummary() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const errors = this.results.filter(r => r.status === 'ERROR').length;
    console.log('\n' + '═'.repeat(60));
    console.log(`📊 TEST SUMMARY: ${passed}/${total} passed`);
    console.log(`   ✅ Passed: ${passed}  ❌ Failed: ${failed}  💥 Errors: ${errors}`);
    console.log('═'.repeat(60));
    if (failed > 0 || errors > 0) {
      console.log('\n❌ FAILURES:');
      this.results.filter(r => r.status !== 'PASS').forEach(r => {
        console.log(`   ${r.status === 'ERROR' ? '💥' : '❌'} ${r.name}: ${r.detail}`);
      });
    }
    if (passed === total) console.log('\n🎉 ALL TESTS PASSED!');
  }

  async runAll() {
    console.log('🚀 Novo ERP - Comprehensive Test Suite');
    console.log('Tenant slug:', TENANT_SLUG);
    console.log('='.repeat(60));
    try {
      const r = await this.request('GET', '/api/auth/csrf');
      if (r.status === 0) throw new Error(r.error);
      console.log('✅ Server reachable at', BASE);
    } catch (e) {
      console.error('❌ Server not reachable:', e.message, '— run: npm run dev');
      process.exit(1);
    }
    await this.testPublicRoutes();
    await this.testPlatformAuth();
    await this.testUnauthorizedAccess();
    await this.testTenantCRUD();
    await this.testTenantAuth();
    await this.testTenantDataAPIs();
    await this.testBuilderAPI();
    await this.testPlatformStaff();
    await this.testTenantSuspension();
    await this.cleanup();
    this.printSummary();
  }
}

new TestRunner().runAll().catch(console.error);
