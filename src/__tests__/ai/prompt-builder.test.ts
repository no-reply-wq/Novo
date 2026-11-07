/**
 * Tests for src/platform/ai/prompt-builder.ts
 */

import { buildSystemPrompt, buildUserPrompt } from '@/platform/ai/prompt-builder';

describe('buildSystemPrompt', () => {
  let sp: string;
  beforeAll(() => { sp = buildSystemPrompt(); });

  test('returns a non-empty string', () => {
    expect(typeof sp).toBe('string');
    expect(sp.length).toBeGreaterThan(100);
  });
  test('instructs model to return only JSON', () => { expect(sp).toMatch(/only.*json|return.*json/i); });
  test('mentions autonumber', () => { expect(sp).toMatch(/autonumber/i); });
  test('mentions status field', () => { expect(sp).toMatch(/status/i); });
  test('mentions created_at', () => { expect(sp).toMatch(/created_at/i); });
  test('mentions 15 field limit', () => { expect(sp).toMatch(/15|max.*field|field.*max/i); });
  test('includes appName schema key', () => { expect(sp).toMatch(/"appName"/); });
  test('includes tables schema key', () => { expect(sp).toMatch(/"tables"/); });
  test('includes warnings schema key', () => { expect(sp).toMatch(/"warnings"/); });
  test('mentions currency type', () => { expect(sp).toMatch(/currency/i); });
  test('mentions formula type', () => { expect(sp).toMatch(/formula/i); });
  test('mentions snake_case naming', () => { expect(sp).toMatch(/snake_case|apiKey/i); });
});

describe('buildUserPrompt', () => {
  test('includes description verbatim', () => {
    const d = 'I need a purchase order system with vendor management';
    expect(buildUserPrompt({ description: d })).toContain(d);
  });
  test('includes industry when provided', () => {
    expect(buildUserPrompt({ description: 'Inventory', industry: 'manufacturing' })).toMatch(/manufacturing/i);
  });
  test('omits industry section when not provided', () => {
    expect(buildUserPrompt({ description: 'Inventory' })).not.toMatch(/industry context/i);
  });
  test('mentions existing tables', () => {
    const p = buildUserPrompt({ description: 'POs', existingTables: ['vendors', 'products'] });
    expect(p).toMatch(/vendors/i);
    expect(p).toMatch(/products/i);
  });
  test('omits existing tables when not provided', () => {
    expect(buildUserPrompt({ description: 'CRM' })).not.toMatch(/already has these tables/i);
  });
  test('instructs return only JSON', () => {
    expect(buildUserPrompt({ description: 'App' })).toMatch(/only.*json|json.*object/i);
  });
});
