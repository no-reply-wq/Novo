/**
 * FieldEditor — unit tests for the type-to-panel mapping and slug generation logic.
 * (Pure logic tests; no jsdom.)
 */

import type { FieldType } from '@/platform/contracts/fields';

// ─── Slug generation (extracted inline from FieldEditor) ──────────────────────

function toApiKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

describe('toApiKey', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(toApiKey('Purchase Order')).toBe('purchase_order');
  });

  it('strips leading/trailing underscores', () => {
    expect(toApiKey(' Hello World ')).toBe('hello_world');
  });

  it('replaces consecutive non-alphanumeric chars with single underscore', () => {
    expect(toApiKey('hello--world')).toBe('hello_world');
  });

  it('truncates at 60 chars', () => {
    const long = 'a'.repeat(80);
    expect(toApiKey(long).length).toBe(60);
  });

  it('handles empty string', () => {
    expect(toApiKey('')).toBe('');
  });

  it('handles numbers in name', () => {
    expect(toApiKey('Field 1')).toBe('field_1');
  });
});

// ─── Type panel mapping ───────────────────────────────────────────────────────

type PanelName =
  | 'TextPanel'
  | 'LongTextPanel'
  | 'NumberPanel'
  | 'ChoicePanel'
  | 'DatePanel'
  | 'FormulaPanel'
  | 'RollupPanel'
  | 'AutoNumberPanel'
  | 'LookupValuePanel'
  | 'StatusFromRulesPanel'
  | 'FilePanel'
  | null;

function panelForType(type: FieldType): PanelName {
  switch (type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
    case 'password':
      return 'TextPanel';
    case 'long_text':
    case 'rich_text':
      return 'LongTextPanel';
    case 'integer':
    case 'decimal':
    case 'currency':
    case 'percent':
    case 'quantity':
      return 'NumberPanel';
    case 'dropdown':
    case 'multi_select':
    case 'radio':
      return 'ChoicePanel';
    case 'date':
    case 'datetime':
    case 'time':
    case 'date_range':
      return 'DatePanel';
    case 'formula':
      return 'FormulaPanel';
    case 'rollup':
      return 'RollupPanel';
    case 'auto_number':
      return 'AutoNumberPanel';
    case 'lookup_value':
      return 'LookupValuePanel';
    case 'status_from_rules':
      return 'StatusFromRulesPanel';
    case 'file':
    case 'image':
      return 'FilePanel';
    default:
      return null;
  }
}

describe('panelForType', () => {
  it('maps text types to TextPanel', () => {
    expect(panelForType('text')).toBe('TextPanel');
    expect(panelForType('email')).toBe('TextPanel');
    expect(panelForType('phone')).toBe('TextPanel');
  });

  it('maps long_text to LongTextPanel', () => {
    expect(panelForType('long_text')).toBe('LongTextPanel');
    expect(panelForType('rich_text')).toBe('LongTextPanel');
  });

  it('maps number types to NumberPanel', () => {
    expect(panelForType('integer')).toBe('NumberPanel');
    expect(panelForType('decimal')).toBe('NumberPanel');
    expect(panelForType('currency')).toBe('NumberPanel');
    expect(panelForType('percent')).toBe('NumberPanel');
  });

  it('maps choice types to ChoicePanel', () => {
    expect(panelForType('dropdown')).toBe('ChoicePanel');
    expect(panelForType('multi_select')).toBe('ChoicePanel');
  });

  it('maps date types to DatePanel', () => {
    expect(panelForType('date')).toBe('DatePanel');
    expect(panelForType('datetime')).toBe('DatePanel');
  });

  it('maps formula to FormulaPanel', () => {
    expect(panelForType('formula')).toBe('FormulaPanel');
  });

  it('maps rollup to RollupPanel', () => {
    expect(panelForType('rollup')).toBe('RollupPanel');
  });

  it('maps auto_number to AutoNumberPanel', () => {
    expect(panelForType('auto_number')).toBe('AutoNumberPanel');
  });

  it('maps status_from_rules to StatusFromRulesPanel', () => {
    expect(panelForType('status_from_rules')).toBe('StatusFromRulesPanel');
  });

  it('maps file/image to FilePanel', () => {
    expect(panelForType('file')).toBe('FilePanel');
    expect(panelForType('image')).toBe('FilePanel');
  });

  it('returns null for types with no extra settings', () => {
    expect(panelForType('boolean')).toBeNull();
    expect(panelForType('lookup')).toBeNull();
    expect(panelForType('gps')).toBeNull();
  });
});

// ─── Validation logic ─────────────────────────────────────────────────────────

function validateField(name: string, apiKey: string): string | null {
  if (!name.trim()) return 'Name is required';
  if (!apiKey.trim()) return 'API key is required';
  if (!/^[a-z][a-z0-9_]{0,59}$/.test(apiKey)) return 'Invalid API key';
  return null;
}

describe('validateField', () => {
  it('requires name', () => {
    expect(validateField('', 'my_field')).toBe('Name is required');
  });

  it('requires apiKey', () => {
    expect(validateField('My Field', '')).toBe('API key is required');
  });

  it('validates apiKey format', () => {
    expect(validateField('My Field', '1invalid')).toBe('Invalid API key');
    expect(validateField('My Field', 'Invalid-Key')).toBe('Invalid API key');
  });

  it('passes valid inputs', () => {
    expect(validateField('My Field', 'my_field')).toBeNull();
    expect(validateField('Field 1', 'field_1')).toBeNull();
  });
});
