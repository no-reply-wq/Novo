import { levenshtein, similarity } from '@/platform/dedup/detector';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('kitten', 'kitten')).toBe(0);
  });

  it('returns length for empty vs non-empty', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('classic kitten->sitting = 3', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('single substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('single insertion', () => {
    expect(levenshtein('cat', 'cats')).toBe(1);
  });

  it('single deletion', () => {
    expect(levenshtein('cats', 'cat')).toBe(1);
  });

  it('completely different strings', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3);
  });
});

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('hello', 'hello')).toBe(1);
  });

  it('returns 1 for two empty strings', () => {
    expect(similarity('', '')).toBe(1);
  });

  it('returns value between 0 and 1 for partial match', () => {
    const s = similarity('kitten', 'sitting');
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it('close strings have high similarity', () => {
    expect(similarity('johnson', 'jonhson')).toBeGreaterThan(0.7);
  });
});
