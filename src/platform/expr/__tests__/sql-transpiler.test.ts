import engine from '../engine';

describe('SQL transpiler', () => {
  it('record.owner_id = user.id', () => {
    const expr = engine.parse('record.owner_id = user.id');
    const frag = engine.toSql(expr, {});
    expect(frag).not.toBeNull();
    expect(frag!.sql).toBe(`owner_id = current_setting('claims')::jsonb->>'id'`);
    expect(frag!.params).toEqual([]);
  });

  it('record.location_id IN user.locations', () => {
    const expr = engine.parse('record.location_id IN user.locations');
    const frag = engine.toSql(expr, {});
    expect(frag).not.toBeNull();
    expect(frag!.sql).toContain('location_id');
    expect(frag!.sql).toContain('= ANY');
    expect(frag!.sql).toContain("'locations'");
  });

  it('NOT IN translates to != ALL', () => {
    const expr = engine.parse('record.location_id NOT IN user.locations');
    const frag = engine.toSql(expr, {});
    expect(frag).not.toBeNull();
    expect(frag!.sql).toContain('!= ALL');
  });

  it('record.field = literal string', () => {
    const expr = engine.parse('record.status = "Approved"');
    const frag = engine.toSql(expr, {});
    expect(frag).not.toBeNull();
    expect(frag!.sql).toBe('status = $1');
    expect(frag!.params).toEqual(['Approved']);
  });

  it('record.field = null', () => {
    const expr = engine.parse('record.deleted_at = null');
    const frag = engine.toSql(expr, {});
    expect(frag).not.toBeNull();
    expect(frag!.sql).toBe('deleted_at IS NULL');
  });

  it('AND of two conditions', () => {
    const expr = engine.parse('record.owner_id = user.id AND record.status = "Active"');
    const frag = engine.toSql(expr, {});
    expect(frag).not.toBeNull();
    expect(frag!.sql).toContain('AND');
  });

  it('returns null for arithmetic expressions', () => {
    const expr = engine.parse('record.qty * 2');
    expect(engine.toSql(expr, {})).toBeNull();
  });

  it('returns null for function calls', () => {
    const expr = engine.parse('SUM(record.qty)');
    expect(engine.toSql(expr, {})).toBeNull();
  });
});
