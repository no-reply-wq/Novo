import { describe, it, expect } from 'vitest';
import { scaleBOM, generateConsumptionLines, calculateBOMCost } from '../bom-engine';
import type { BOMHeader } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeBOM(overrides: Partial<BOMHeader> = {}): BOMHeader {
  return {
    id: 'bom-1',
    appId: 'app-1',
    productId: 'PROD-001',
    productName: 'Widget',
    unit: 'EA',
    version: 'R0',
    isActive: true,
    components: [
      {
        id: 'line-1',
        bomId: 'bom-1',
        componentId: 'RAW-A',
        componentName: 'Raw A',
        qtyPerUnit: 2,
        unit: 'KG',
        wastePercent: 0,
        isOptional: false,
      },
      {
        id: 'line-2',
        bomId: 'bom-1',
        componentId: 'RAW-B',
        componentName: 'Raw B',
        qtyPerUnit: 0.5,
        unit: 'L',
        wastePercent: 10,
        isOptional: true,
      },
    ],
    byProducts: [
      {
        id: 'bp-1',
        bomId: 'bom-1',
        componentId: 'BY-C',
        componentName: 'By-product C',
        qtyPerUnit: 0.1,
        unit: 'KG',
        wastePercent: 0,
        isOptional: false,
      },
    ],
    ...overrides,
  };
}

// ─── scaleBOM ─────────────────────────────────────────────────────────────────

describe('scaleBOM', () => {
  it('scales qty correctly for 100 units', () => {
    const bom = makeBOM();
    const result = scaleBOM(bom, 100);
    expect(result).toHaveLength(2);
    // RAW-A: 2 * 100 * 1.0 = 200
    expect(result[0].requiredQty).toBeCloseTo(200);
    // RAW-B: 0.5 * 100 * 1.1 = 55
    expect(result[1].requiredQty).toBeCloseTo(55);
  });

  it('applies waste percentage correctly', () => {
    const bom = makeBOM();
    const result = scaleBOM(bom, 10);
    // RAW-B: 0.5 * 10 * 1.1 = 5.5
    expect(result[1].requiredQty).toBeCloseTo(5.5);
  });

  it('produces exact qty with zero waste', () => {
    const bom = makeBOM();
    const result = scaleBOM(bom, 50);
    // RAW-A: 2 * 50 * 1.0 = 100
    expect(result[0].requiredQty).toBe(100);
  });

  it('handles large quantities', () => {
    const bom = makeBOM();
    const result = scaleBOM(bom, 10000);
    expect(result[0].requiredQty).toBeCloseTo(20000);
  });

  it('preserves isOptional flag', () => {
    const bom = makeBOM();
    const result = scaleBOM(bom, 1);
    expect(result[0].isOptional).toBe(false);
    expect(result[1].isOptional).toBe(true);
  });

  it('excludes by-products from output', () => {
    const bom = makeBOM();
    const result = scaleBOM(bom, 10);
    expect(result.every((r) => r.componentId !== 'BY-C')).toBe(true);
  });

  it('throws when targetQty is zero or negative', () => {
    const bom = makeBOM();
    expect(() => scaleBOM(bom, 0)).toThrow();
    expect(() => scaleBOM(bom, -1)).toThrow();
  });
});

// ─── generateConsumptionLines ─────────────────────────────────────────────────

describe('generateConsumptionLines', () => {
  it('generates lines with correct required qty', () => {
    const bom = makeBOM();
    const lines = generateConsumptionLines(bom, 100);
    expect(lines[0].requiredQty).toBeCloseTo(200);
    expect(lines[1].requiredQty).toBeCloseTo(55);
  });

  it('sets issuedQty to 0', () => {
    const lines = generateConsumptionLines(makeBOM(), 10);
    expect(lines.every((l) => l.issuedQty === 0)).toBe(true);
  });

  it('sets returnedQty to 0', () => {
    const lines = generateConsumptionLines(makeBOM(), 10);
    expect(lines.every((l) => l.returnedQty === 0)).toBe(true);
  });

  it('sets status to Pending', () => {
    const lines = generateConsumptionLines(makeBOM(), 10);
    expect(lines.every((l) => l.status === 'Pending')).toBe(true);
  });

  it('throws when targetQty <= 0', () => {
    expect(() => generateConsumptionLines(makeBOM(), 0)).toThrow();
  });
});

// ─── calculateBOMCost ─────────────────────────────────────────────────────────

describe('calculateBOMCost', () => {
  it('computes material cost correctly', () => {
    const bom = makeBOM();
    // RAW-A: 2 * 100 * 1.0 * 5 = 1000
    // RAW-B: 0.5 * 100 * 1.1 * 10 = 550
    const result = calculateBOMCost(bom, 100, { 'RAW-A': 5, 'RAW-B': 10 });
    expect(result.materialCost).toBeCloseTo(1550);
  });

  it('computes by-product credit', () => {
    const bom = makeBOM();
    // BY-C: 0.1 * 100 * 2 = 20
    const result = calculateBOMCost(bom, 100, { 'RAW-A': 5, 'RAW-B': 10, 'BY-C': 2 });
    expect(result.byProductCredit).toBeCloseTo(20);
  });

  it('computes net cost as materialCost minus credit', () => {
    const bom = makeBOM();
    const result = calculateBOMCost(bom, 100, { 'RAW-A': 5, 'RAW-B': 10, 'BY-C': 2 });
    expect(result.netCost).toBeCloseTo(result.materialCost - result.byProductCredit);
  });

  it('computes costPerUnit as netCost / targetQty', () => {
    const bom = makeBOM();
    const result = calculateBOMCost(bom, 100, { 'RAW-A': 5, 'RAW-B': 10, 'BY-C': 2 });
    expect(result.costPerUnit).toBeCloseTo(result.netCost / 100);
  });

  it('defaults missing costs to 0', () => {
    const bom = makeBOM();
    const result = calculateBOMCost(bom, 10, {});
    expect(result.materialCost).toBe(0);
    expect(result.byProductCredit).toBe(0);
  });

  it('includes waste factor in material cost', () => {
    const bom = makeBOM();
    // RAW-B with 10% waste: 0.5 * 10 * 1.1 * 1 = 5.5
    const result = calculateBOMCost(bom, 10, { 'RAW-B': 1 });
    expect(result.materialCost).toBeCloseTo(5.5);
  });

  it('handles BOM with no by-products', () => {
    const bom = makeBOM({ byProducts: [] });
    const result = calculateBOMCost(bom, 10, { 'RAW-A': 1 });
    expect(result.byProductCredit).toBe(0);
    expect(result.netCost).toBe(result.materialCost);
  });

  it('throws when targetQty <= 0', () => {
    expect(() => calculateBOMCost(makeBOM(), 0, {})).toThrow();
  });
});
