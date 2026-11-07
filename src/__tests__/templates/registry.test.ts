/**
 * Template registry tests
 * Verifies all templates parse correctly and have required fields.
 */
import { TEMPLATES, getTemplate, listTemplates } from '@/platform/templates';

describe('TEMPLATES registry', () => {
  it('contains at least 3 templates', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });

  it.each(TEMPLATES)('template $id has all required top-level fields', (template) => {
    expect(template.id).toBeTruthy();
    expect(template.name).toBeTruthy();
    expect(template.description).toBeTruthy();
    expect(['erp', 'hrms', 'lms', 'crm', 'inventory', 'custom']).toContain(template.category);
    expect(template.icon).toBeTruthy();
    expect(template.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(Array.isArray(template.features)).toBe(true);
    expect(template.features.length).toBeGreaterThan(0);
    expect(template.bundle).toBeDefined();
    expect(template.createdAt).toBeTruthy();
  });

  it.each(TEMPLATES)('template $id bundle has required sections', (template) => {
    const { bundle } = template;
    expect(bundle.schemaVersion).toBeTruthy();
    expect(bundle.app.id).toBe(template.id);
    expect(bundle.app.name).toBeTruthy();
    expect(Array.isArray(bundle.schema.tables)).toBe(true);
    expect((bundle.schema.tables as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(bundle.ui.pages)).toBe(true);
    expect((bundle.ui.pages as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(bundle.logic.workflows)).toBe(true);
  });

  it.each(TEMPLATES)('template $id tables each have id, name, and fields', (template) => {
    const tables = template.bundle.schema.tables as Array<{ id?: unknown; name?: unknown; fields?: unknown[] }>;
    for (const table of tables) {
      expect(table.id).toBeTruthy();
      expect(table.name).toBeTruthy();
      expect(Array.isArray(table.fields)).toBe(true);
    }
  });
});

describe('getTemplate', () => {
  it('returns a template by id', () => {
    const t = getTemplate('lms-starter');
    expect(t).toBeDefined();
    expect(t!.id).toBe('lms-starter');
  });

  it('returns undefined for unknown id', () => {
    expect(getTemplate('nonexistent')).toBeUndefined();
  });
});

describe('listTemplates', () => {
  it('returns all templates when no category supplied', () => {
    expect(listTemplates()).toHaveLength(TEMPLATES.length);
  });

  it('filters by category', () => {
    const lms = listTemplates('lms');
    expect(lms.every((t) => t.category === 'lms')).toBe(true);
    expect(lms.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown category', () => {
    expect(listTemplates('unknown_category')).toHaveLength(0);
  });
});
