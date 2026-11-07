import { validateComponentCode } from '@/platform/components/validator';

const VALID = "export default function MyWidget() { return null; }";

describe('validateComponentCode valid', () => {
  it('passes a well-formed ESM component', async () => {
    const r = await validateComponentCode(VALID);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe('validateComponentCode forbidden globals', () => {
  it('rejects require()', async () => {
    const r = await validateComponentCode("const fs = require('fs'); export default function C() { return null; }");
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('require()'))).toBe(true);
  });
  it('rejects process access', async () => {
    const r = await validateComponentCode("const e = process.env.SECRET; export default function C() { return null; }");
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('process'))).toBe(true);
  });
  it('rejects eval()', async () => {
    const r = await validateComponentCode("eval('x'); export default function C() { return null; }");
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('eval()'))).toBe(true);
  });
  it('rejects new Function()', async () => {
    const r = await validateComponentCode("new Function('return 1'); export default function C() { return null; }");
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('new Function()'))).toBe(true);
  });
  it('rejects __dirname', async () => {
    const r = await validateComponentCode("const d = __dirname; export default function C() { return null; }");
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('__dirname'))).toBe(true);
  });
});

describe('validateComponentCode missing default export', () => {
  it('rejects code without a default export', async () => {
    const r = await validateComponentCode("function MyWidget() { return null; }");
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('default export'))).toBe(true);
  });
});

describe('validateComponentCode oversized', () => {
  it('rejects code over 50 KB', async () => {
    const bigCode = 'export default function C() { return null; }\n' + 'x'.repeat(51 * 1024);
    const r = await validateComponentCode(bigCode);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('50 KB'))).toBe(true);
  });
});

describe('validateComponentCode warnings', () => {
  it('warns on bare fetch()', async () => {
    const r = await validateComponentCode("export default async function C() { await fetch('https://example.com'); return null; }");
    expect(r.warnings.some(w => w.includes('fetch()'))).toBe(true);
  });
});
