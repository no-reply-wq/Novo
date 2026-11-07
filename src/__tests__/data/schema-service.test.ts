/**
 * Unit tests for schema-service.ts DDL generation.
 *
 * No database connection required — we just test the SQL strings produced.
 */

import { generateCreateDDL, generateAlterDDL } from '@/platform/data/schema-service';
import type { TableDef, FieldDef } from '@/platform/contracts';

function makeField(overrides: Partial<FieldDef> = {}): FieldDef {
  return {
    id: 'fld-1',
    tableId: 'tbl-1',
    name: 'My Field',
    apiKey: 'my_field',
    type: 'text',
    rank: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeTable(fields: FieldDef[] = []): TableDef {
  return {
    id: 'tbl-1',
    appId: 'app-1',
    name: 'Test Table',
    apiKey: 'test_table',
    fields,
    relations: [],
    schemaVersion: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };
}

describe('generateCreateDDL', () => {
  it('includes system columns', () => {
    const sql = generateCreateDDL('acme', makeTable());
    expect(sql).toContain('id              UUID         PRIMARY KEY');
    expect(sql).toContain('deleted_at');
    expect(sql).toContain('deleted_by');
    expect(sql).toContain('delete_reason');
    expect(sql).toContain('_created_at');
    expect(sql).toContain('_updated_at');
  });

  it('uses correct schema and table name', () => {
    const sql = generateCreateDDL('myorg', makeTable());
    expect(sql).toContain('"tenant_myorg"."test_table"');
  });

  it('maps text field to TEXT', () => {
    const field = makeField({ apiKey: 'title', type: 'text' });
    const sql = generateCreateDDL('acme', makeTable([field]));
    expect(sql).toContain('"title" TEXT');
  });

  it('maps integer to BIGINT', () => {
    const field = makeField({ apiKey: 'qty', type: 'integer' });
    const sql = generateCreateDDL('acme', makeTable([field]));
    expect(sql).toContain('"qty" BIGINT');
  });

  it('maps decimal to NUMERIC', () => {
    const field = makeField({ apiKey: 'price', type: 'decimal' });
    const sql = generateCreateDDL('acme', makeTable([field]));
    expect(sql).toContain('"price" NUMERIC');
  });

  it('maps datetime to TIMESTAMPTZ', () => {
    const field = makeField({ apiKey: 'created_on', type: 'datetime' });
    const sql = generateCreateDDL('acme', makeTable([field]));
    expect(sql).toContain('"created_on" TIMESTAMPTZ');
  });

  it('maps yes_no / boolean to TEXT', () => {
    const field = makeField({ apiKey: 'active', type: 'boolean' });
    const sql = generateCreateDDL('acme', makeTable([field]));
    expect(sql).toContain('"active" TEXT');
  });

  it('maps file/image to JSONB', () => {
    const field = makeField({ apiKey: 'docs', type: 'file' });
    const sql = generateCreateDDL('acme', makeTable([field]));
    expect(sql).toContain('"docs" JSONB');
  });

  it('maps gps to JSONB', () => {
    const field = makeField({ apiKey: 'location_gps', type: 'gps' });
    const sql = generateCreateDDL('acme', makeTable([field]));
    expect(sql).toContain('"location_gps" JSONB');
  });

  it('omits virtual fields (formula)', () => {
    const field = makeField({
      apiKey: 'computed_total',
      type: 'formula',
      options: { expression: 'qty * price', returnType: 'number' },
    });
    const sql = generateCreateDDL('acme', makeTable([field]));
    expect(sql).not.toContain('computed_total');
  });

  it('omits virtual rollup field', () => {
    const field = makeField({
      apiKey: 'line_total',
      type: 'rollup',
      options: {
        sourceRelationId: 'rel-1',
        sourceFieldId: 'fld-2',
        aggregation: 'sum',
      },
    });
    const sql = generateCreateDDL('acme', makeTable([field]));
    expect(sql).not.toContain('line_total');
  });

  it('maps auto_number to TEXT UNIQUE', () => {
    const field = makeField({ apiKey: 'po_number', type: 'auto_number', options: { prefix: 'PO-', padding: 5 } });
    const sql = generateCreateDDL('acme', makeTable([field]));
    expect(sql).toContain('"po_number" TEXT');
    expect(sql).toContain('UNIQUE');
  });
});

describe('generateAlterDDL', () => {
  it('adds new column for new field', () => {
    const existing: FieldDef[] = [];
    const newField = makeField({ apiKey: 'notes', type: 'long_text' });
    const result = generateAlterDDL('acme', makeTable([newField]), existing);
    expect(result.statements.length).toBeGreaterThan(0);
    expect(result.statements[0]).toContain('ADD COLUMN IF NOT EXISTS');
    expect(result.statements[0]).toContain('"notes" TEXT');
  });

  it('issues no statements when fields unchanged', () => {
    const field = makeField({ apiKey: 'name', type: 'text' });
    const result = generateAlterDDL('acme', makeTable([field]), [field]);
    expect(result.statements).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns (not drops) when field is removed', () => {
    const field = makeField({ apiKey: 'old_col', type: 'text' });
    const result = generateAlterDDL('acme', makeTable([]), [field]);
    expect(result.statements).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('old_col');
  });
import { generateCreateDDL, generateAlterDDL } from '@/platform/data/schema-service';
import type { TableDef, FieldDef } from '@/platform/contracts';
function mf(o: Partial<FieldDef> = {}): FieldDef { return { id:'f1',tableId:'t1',name:'F',apiKey:'f',type:'text',rank:0,createdAt:new Date(),updatedAt:new Date(),...o }; }
function mt(fields: FieldDef[] = []): TableDef { return { id:'t1',appId:'a1',name:'T',apiKey:'t_tbl',fields,relations:[],schemaVersion:1,createdAt:new Date(),updatedAt:new Date() }; }
describe('generateCreateDDL', () => {
  it('has system columns', () => { const s = generateCreateDDL('a', mt()); expect(s).toContain('id              UUID         PRIMARY KEY'); expect(s).toContain('deleted_at'); });
  it('correct schema/table', () => { expect(generateCreateDDL('myorg', mt())).toContain('"tenant_myorg"."t_tbl"'); });
  it('text -> TEXT', () => { expect(generateCreateDDL('a', mt([mf({apiKey:'n',type:'text'})]))).toContain('"n" TEXT'); });
  it('integer -> BIGINT', () => { expect(generateCreateDDL('a', mt([mf({apiKey:'q',type:'integer'})]))).toContain('"q" BIGINT'); });
  it('decimal -> NUMERIC', () => { expect(generateCreateDDL('a', mt([mf({apiKey:'p',type:'decimal'})]))).toContain('"p" NUMERIC'); });
  it('datetime -> TIMESTAMPTZ', () => { expect(generateCreateDDL('a', mt([mf({apiKey:'ts',type:'datetime'})]))).toContain('"ts" TIMESTAMPTZ'); });
  it('boolean -> TEXT', () => { expect(generateCreateDDL('a', mt([mf({apiKey:'b',type:'boolean'})]))).toContain('"b" TEXT'); });
  it('file -> JSONB', () => { expect(generateCreateDDL('a', mt([mf({apiKey:'d',type:'file'})]))).toContain('"d" JSONB'); });
  it('gps -> JSONB', () => { expect(generateCreateDDL('a', mt([mf({apiKey:'g',type:'gps'})]))).toContain('"g" JSONB'); });
  it('formula omitted', () => { expect(generateCreateDDL('a', mt([mf({apiKey:'tot',type:'formula',options:{expression:'a',returnType:'number'}})]))).not.toContain('"tot"'); });
  it('rollup omitted', () => { expect(generateCreateDDL('a', mt([mf({apiKey:'s',type:'rollup',options:{sourceRelationId:'r',sourceFieldId:'f',aggregation:'sum'}})]))).not.toContain('"s" '); });
  it('auto_number -> TEXT UNIQUE', () => { const s = generateCreateDDL('a', mt([mf({apiKey:'no',type:'auto_number',options:{prefix:'X-',padding:4}})])); expect(s).toContain('"no" TEXT'); expect(s).toContain('UNIQUE'); });
});
describe('generateAlterDDL', () => {
  it('adds new column', () => { const r = generateAlterDDL('a', mt([mf({apiKey:'notes',type:'long_text'})]), []); expect(r.statements[0]).toContain('ADD COLUMN IF NOT EXISTS'); expect(r.statements[0]).toContain('"notes" TEXT'); });
  it('no statements when unchanged', () => { const f = mf({apiKey:'x'}); const r = generateAlterDDL('a', mt([f]), [f]); expect(r.statements).toHaveLength(0); });
  it('warns on removed field', () => { const r = generateAlterDDL('a', mt([]), [mf({apiKey:'old'})]); expect(r.warnings[0]).toContain('old'); });
});
