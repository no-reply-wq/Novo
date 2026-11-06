import { ALL_TEMPLATES, getTemplateBySlug, getTemplatesByCategory } from '../index';
import { crmTemplate } from '../templates/crm-template';
import { inventoryTemplate } from '../templates/inventory-template';
import { hrmsTemplate } from '../templates/hrms-template';
import type { AppTemplate } from '../types';

// ─── Helper: validate required fields ────────────────────────────────────────

function assertTemplateShape(template: AppTemplate) {
  expect(template.id).toBeTruthy();
  expect(template.name).toBeTruthy();
  expect(template.slug).toBeTruthy();
  expect(template.description).toBeTruthy();
  expect(template.category).toBeTruthy();
  expect(template.package).toBeDefined();
  expect(template.package.app).toBeDefined();
  expect(template.package.tables).toBeInstanceOf(Array);
  expect(template.package.pages).toBeInstanceOf(Array);
  expect(template.package.workflows).toBeInstanceOf(Array);
}

// ─── ALL_TEMPLATES ────────────────────────────────────────────────────────────

describe('ALL_TEMPLATES', () => {
  it('contains the 3 built-in templates', () => {
    expect(ALL_TEMPLATES).toHaveLength(3);
    const slugs = ALL_TEMPLATES.map((t) => t.slug);
    expect(slugs).toContain('crm');
    expect(slugs).toContain('inventory');
    expect(slugs).toContain('hrms');
  });

  it('every template has required fields (name, slug, package)', () => {
    for (const template of ALL_TEMPLATES) {
      assertTemplateShape(template);
    }
  });
});

// ─── CRM template ─────────────────────────────────────────────────────────────

describe('CRM template', () => {
  it('has at least 3 tables', () => {
    expect(crmTemplate.package.tables.length).toBeGreaterThanOrEqual(3);
  });

  it('has at least 2 pages', () => {
    expect(crmTemplate.package.pages.length).toBeGreaterThanOrEqual(2);
  });

  it('has at least 1 workflow', () => {
    expect(crmTemplate.package.workflows.length).toBeGreaterThanOrEqual(1);
  });

  it('has correct category', () => {
    expect(crmTemplate.category).toBe('crm');
  });

  it('tables have required fields using type (not fieldType)', () => {
    for (const table of crmTemplate.package.tables) {
      for (const field of table.fields) {
        expect(field.type).toBeTruthy();
      }
    }
  });
});

// ─── Inventory template ───────────────────────────────────────────────────────

describe('Inventory template', () => {
  it('has at least 3 tables', () => {
    expect(inventoryTemplate.package.tables.length).toBeGreaterThanOrEqual(3);
  });

  it('has at least 2 pages', () => {
    expect(inventoryTemplate.package.pages.length).toBeGreaterThanOrEqual(2);
  });

  it('has correct category', () => {
    expect(inventoryTemplate.category).toBe('inventory');
  });

  it('stock movements table has stockEngine configured', () => {
    const mvTable = inventoryTemplate.package.tables.find((t) => t.apiKey === 'stock_movements');
    expect(mvTable).toBeDefined();
    expect(mvTable?.stockEngine?.enabled).toBe(true);
  });
});

// ─── HRMS template ────────────────────────────────────────────────────────────

describe('HRMS template', () => {
  it('has at least 3 tables', () => {
    expect(hrmsTemplate.package.tables.length).toBeGreaterThanOrEqual(3);
  });

  it('has at least 2 pages', () => {
    expect(hrmsTemplate.package.pages.length).toBeGreaterThanOrEqual(2);
  });

  it('has correct category', () => {
    expect(hrmsTemplate.category).toBe('hrms');
  });

  it('has leave request and attendance tables', () => {
    const tableKeys = hrmsTemplate.package.tables.map((t) => t.apiKey);
    expect(tableKeys).toContain('leave_requests');
    expect(tableKeys).toContain('attendance');
  });
});

// ─── getTemplateBySlug ────────────────────────────────────────────────────────

describe('getTemplateBySlug', () => {
  it('returns template for valid slug', () => {
    const t = getTemplateBySlug('crm');
    expect(t).toBeDefined();
    expect(t?.slug).toBe('crm');
  });

  it('returns undefined for unknown slug', () => {
    expect(getTemplateBySlug('nonexistent')).toBeUndefined();
  });
});

// ─── getTemplatesByCategory ───────────────────────────────────────────────────

describe('getTemplatesByCategory', () => {
  it('filters by category correctly', () => {
    const crms = getTemplatesByCategory('crm');
    expect(crms.every((t) => t.category === 'crm')).toBe(true);
    expect(crms.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for unknown category', () => {
    expect(getTemplatesByCategory('education')).toHaveLength(0);
  });
});

// ─── installTemplate (mocked importApp) ──────────────────────────────────────

jest.mock('@/platform/packages/importer', () => ({
  importApp: jest.fn().mockResolvedValue({ appId: 'new-app-id', warnings: [] }),
}));

describe('installTemplate via importApp', () => {
  it('calls importApp with the template package and app name', async () => {
    const { importApp } = await import('@/platform/packages/importer');
    const mockDb = {} as Parameters<typeof importApp>[3];

    await importApp('test-tenant', crmTemplate.package, { overwrite: false, newAppName: 'My CRM' }, mockDb);

    expect(importApp).toHaveBeenCalledWith(
      'test-tenant',
      crmTemplate.package,
      { overwrite: false, newAppName: 'My CRM' },
      mockDb
    );
  });

  it('importApp returns appId and warnings', async () => {
    const { importApp } = await import('@/platform/packages/importer');
    const mockDb = {} as Parameters<typeof importApp>[3];
    const result = await importApp('test-tenant', inventoryTemplate.package, { overwrite: false }, mockDb);

    expect(result.appId).toBe('new-app-id');
    expect(result.warnings).toBeInstanceOf(Array);
  });
});
