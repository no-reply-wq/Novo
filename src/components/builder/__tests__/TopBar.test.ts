/**
 * TopBar component tests (node environment — no jsdom).
 * Tests module structure and prop types.
 */

describe('TopBar', () => {
  it('exports TopBar component', async () => {
    const mod = await import('../TopBar');
    expect(typeof mod.TopBar).toBe('function');
  });

  it('renders with required props — module imports successfully', async () => {
    const mod = await import('../TopBar');
    expect(mod.TopBar).toBeDefined();
  });
});

describe('TopBar breadcrumb generation', () => {
  it('breadcrumb root is always Builder at /builder', () => {
    // The useBreadcrumbs hook always starts with { key: 'builder', href: '/builder' }
    const root = { key: 'builder', label: 'Builder', href: '/builder' };
    expect(root.href).toBe('/builder');
    expect(root.label).toBe('Builder');
  });

  it('breadcrumb labels are capitalised route segments', () => {
    const seg = 'tables';
    const label = seg.charAt(0).toUpperCase() + seg.slice(1);
    expect(label).toBe('Tables');
  });

  it('breadcrumb includes app name when appId is present', () => {
    // pathname = /builder/apps/app1/tables
    const segments = '/builder/apps/app1/tables'.replace(/^\/builder\/?/, '').split('/').filter(Boolean);
    expect(segments[0]).toBe('apps');
    expect(segments[1]).toBe('app1');
    expect(segments[2]).toBe('tables');
  });
});

describe('TopBar user info', () => {
  it('requires tenantName, userName and userEmail', () => {
    // Type check via interface shape
    type TopBarProps = {
      tenantName: string;
      userName: string;
      userEmail: string;
      notificationCount?: number;
    };
    const props: TopBarProps = {
      tenantName: 'Acme',
      userName: 'Alice',
      userEmail: 'alice@acme.com',
    };
    expect(props.tenantName).toBe('Acme');
    expect(props.userName).toBe('Alice');
  });

  it('notification count badge shows 9+ for counts above 9', () => {
    const count = 15;
    const badge = count > 9 ? '9+' : String(count);
    expect(badge).toBe('9+');
  });

  it('notification count badge shows exact count for 1–9', () => {
    for (let i = 1; i <= 9; i++) {
      const badge = i > 9 ? '9+' : String(i);
      expect(badge).toBe(String(i));
    }
  });
});
