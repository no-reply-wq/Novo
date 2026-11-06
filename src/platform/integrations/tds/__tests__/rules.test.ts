import { TDS_SECTIONS, getTDSSection, type TDSSection } from '../rules';

describe('TDS_SECTIONS', () => {
  it('contains entries', () => {
    expect(TDS_SECTIONS.length).toBeGreaterThan(0);
  });

  it('every section has required fields with correct types', () => {
    for (const s of TDS_SECTIONS) {
      expect(typeof s.section).toBe('string');
      expect(s.section.length).toBeGreaterThan(0);

      expect(typeof s.description).toBe('string');
      expect(s.description.length).toBeGreaterThan(0);

      expect(typeof s.thresholdSingle).toBe('number');
      expect(s.thresholdSingle).toBeGreaterThanOrEqual(0);

      expect(typeof s.thresholdAnnual).toBe('number');
      expect(s.thresholdAnnual).toBeGreaterThanOrEqual(0);

      expect(typeof s.rateIndividual).toBe('number');
      expect(s.rateIndividual).toBeGreaterThanOrEqual(0);

      expect(typeof s.rateCorporate).toBe('number');
      expect(s.rateCorporate).toBeGreaterThanOrEqual(0);

      expect(typeof s.ratePANAbsent).toBe('number');
      expect(s.ratePANAbsent).toBeGreaterThanOrEqual(0);

      expect(Array.isArray(s.applicableTo)).toBe(true);
      expect(s.applicableTo.length).toBeGreaterThan(0);
    }
  });

  it('all section codes are unique', () => {
    const codes = TDS_SECTIONS.map(s => s.section);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('contains the key sections from the Income Tax Act', () => {
    const codes = new Set(TDS_SECTIONS.map(s => s.section));
    for (const expected of ['192', '194A', '194C', '194H', '194I', '194J', '194Q']) {
      expect(codes).toContain(expected);
    }
  });
});

describe('getTDSSection', () => {
  it('returns the correct section for 194C', () => {
    const s = getTDSSection('194C');
    expect(s).toBeDefined();
    expect(s?.section).toBe('194C');
    expect(s?.description).toMatch(/contractor/i);
    expect(s?.thresholdSingle).toBe(30000);
    expect(s?.thresholdAnnual).toBe(100000);
    expect(s?.rateIndividual).toBe(1);
    expect(s?.rateCorporate).toBe(2);
    expect(s?.ratePANAbsent).toBe(20);
  });

  it('returns the correct section for 194J', () => {
    const s = getTDSSection('194J');
    expect(s).toBeDefined();
    expect(s?.rateIndividual).toBe(10);
    expect(s?.rateCorporate).toBe(10);
  });

  it('returns the correct section for 194Q', () => {
    const s = getTDSSection('194Q');
    expect(s).toBeDefined();
    expect(s?.rateIndividual).toBe(0.1);
    expect(s?.rateCorporate).toBe(0.1);
    expect(s?.ratePANAbsent).toBe(5);
    expect(s?.thresholdAnnual).toBe(5000000);
  });

  it('returns undefined for an unknown section code', () => {
    expect(getTDSSection('999X')).toBeUndefined();
    expect(getTDSSection('')).toBeUndefined();
    expect(getTDSSection('194Z')).toBeUndefined();
  });

  it('is case-sensitive', () => {
    expect(getTDSSection('194c')).toBeUndefined();
    expect(getTDSSection('194C')).toBeDefined();
  });

  it('all rates are non-negative numbers', () => {
    for (const s of TDS_SECTIONS) {
      expect(s.rateIndividual).toBeGreaterThanOrEqual(0);
      expect(s.rateCorporate).toBeGreaterThanOrEqual(0);
      expect(s.ratePANAbsent).toBeGreaterThanOrEqual(0);
    }
  });

  it('satisfies the TDSSection interface shape', () => {
    const s = getTDSSection('194H') as TDSSection;
    const keys: (keyof TDSSection)[] = [
      'section', 'description', 'thresholdSingle', 'thresholdAnnual',
      'rateIndividual', 'rateCorporate', 'ratePANAbsent', 'applicableTo',
    ];
    for (const key of keys) {
      expect(s).toHaveProperty(key);
    }
  });
});
