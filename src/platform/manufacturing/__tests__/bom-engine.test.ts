/**
 * BOM engine unit tests
 */

import {
  scaleBOM,
  generateConsumptionLines,
  calculateBOMCost,
} from '../bom-engine';
import type { BOMHeader } from '../types';

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeHeader(overrides: Partial<BOMHeader> = {}): BOMHeader {
  return {
    id: 'bom-1',
    appId: 'app-1',
    productId: 'FG-001',
    productName: 'Widget A',
    unit: 'pcs',
    version: 'R0',
    isActive: true,
    components: [
      {
        id: 'line-1',
        bomId: 'bom-1',
        componentId: 'RM-001',
        componentName: 'Steel Sheet',
        qtyPerUnit: 2,
        unit: 'kg',
        wastePercent: 0,
        isOptional: false,
        substituteIds: [],
      },
      {
        id: 'line-2',
        bomId: 'bom-1',
        componentId: 'RM-002',
        componentName: 'Bolt',
        qtyPerUnit: 4,
        unit: 'pcs',
        wastePercent: 0,
        isOptional: false,
        substituteIds: ['RM-003'],
      },
    ],
    byProducts: [],
    ...overrides,
  };
}

// ─── scaleBOM ─────────────────────────────────────────────────────────────────

describe('scaleBOM', () => {
  it('scales 100 units correctly with zero waste', () => {
    const bom = makeHeader();
    const result = scaleBOM(bom, 100);

    expect(result).toHaveLength(2);
    expect(result[0].requiredQty).toBe(200);    // 2 * 100 * 1.0
    expect(result[1].requiredQty).toBe(400);    // 4 * 100 * 1.0
  });

  it('applies waste percent to required qty', () => {
    const bom = makeHeader({
      components: [
        {
          id: 'line-1',
          bomId: 'bom-1',
          componentId: 'RM-001',
          componentName: 'Steel Sheet',
          qtyPerUnit: 2,
          unit: 'kg',
          wastePercent: 5,    // 5% waste
          isOptional: false,
          substituteIds: [],
        },
      ],
    });

    const result = scaleBOM(bom, 100);
    // 2 * 100 * 1.05 = 210
    expect(result[0].requiredQty).toBeCloseTo(210, 10);
  });

  it('zero waste: requiredQty = qtyPerUnit * targetQty exactly', () => {
    const bom = makeHeader({
      components: [
        {
          id: 'line-1',
          bomId: 'bom-1',
          componentId: 'RM-001',
          componentName: 'Resin',
          qtyPerUnit: 1.5,
          unit: 'litre',
          wastePercent: 0,
          isOptional: false,
          substituteIds: [],
        },
      ],
    });

    const result = scaleBOM(bom, 10);
    expect(result[0].requiredQty).toBe(15);
  });

  it('scales large qty (10,000 units) without floating point explosion', () => {
    const bom = makeHeader({
      components: [
        {
          id: 'line-1',
          bomId: 'bom-1',
          componentId: 'RM-001',
          componentName: 'Copper Wire',
          qtyPerUnit: 0.1,
          unit: 'm',
          wastePercent: 2,
          isOptional: false,
          substituteIds: [],
        },
      ],
    });

    const result = scaleBOM(bom, 10000);
    // 0.1 * 10000 * 1.02 = 1020
    expect(result[0].requiredQty).toBeCloseTo(1020, 6);
  });

  it('marks optional components correctly', () => {
    const bom = makeHeader({
      components: [
        {
          id: 'line-1',
          bomId: 'bom-1',
          componentId: 'RM-OPT',
          componentName: 'Optional Coating',
          qtyPerUnit: 0.05,
          unit: 'litre',
          wastePercent: 0,
          isOptional: true,
          substituteIds: [],
        },
      ],
    });

    const result = scaleBOM(bom, 50);
    expect(result[0].isOptional).toBe(true);
    expect(result[0].requiredQty).toBe(2.5);
  });

  it('excludes by-products from scaled components', () => {
    const bom = makeHeader({
      components: [
        {
          id: 'line-1',
          bomId: 'bom-1',
          componentId: 'RM-001',
          componentName: 'Steel',
          qtyPerUnit: 3,
          unit: 'kg',
          wastePercent: 0,
          isOptional: false,
          substituteIds: [],
        },
      ],
      byProducts: [
        {
          id: 'bp-1',
          bomId: 'bom-1',
          componentId: 'BP-001',
          componentName: 'Metal Chips',
          qtyPerUnit: 0.5,
          unit: 'kg',
          wastePercent: 0,
          isOptional: false,
          substituteIds: [],
        },
      ],
    });

    const result = scaleBOM(bom, 10);
    // Only component (RM-001), no by-product
    expect(result).toHaveLength(1);
    expect(result[0].componentId).toBe('RM-001');
    expect(result[0].requiredQty).toBe(30);
  });

  it('throws for targetQty <= 0', () => {
    const bom = makeHeader();
    expect(() => scaleBOM(bom, 0)).toThrow('targetQty must be greater than 0');
    expect(() => scaleBOM(bom, -5)).toThrow('targetQty must be greater than 0');
  });
});

// ─── generateConsumptionLines ─────────────────────────────────────────────────

describe('generateConsumptionLines', () => {
  it('generates consumption lines with correct required qty', () => {
    const bom = makeHeader();
    const lines = generateConsumptionLines(bom, 50);

    expect(lines).toHaveLength(2);
    expect(lines[0].componentId).toBe('RM-001');
    expect(lines[0].requiredQty).toBe(100);     // 2 * 50
    expect(lines[1].requiredQty).toBe(200);     // 4 * 50
  });

  it('initializes issued and returned qty to 0', () => {
    const lines = generateConsumptionLines(makeHeader(), 10);
    for (const line of lines) {
      expect(line.issuedQty).toBe(0);
      expect(line.returnedQty).toBe(0);
    }
  });

  it('initializes all lines to Pending status', () => {
    const lines = generateConsumptionLines(makeHeader(), 10);
    for (const line of lines) {
      expect(line.status).toBe('Pending');
    }
  });

  it('throws for targetQty <= 0', () => {
    expect(() => generateConsumptionLines(makeHeader(), 0)).toThrow();
  });
});

// ─── calculateBOMCost ─────────────────────────────────────────────────────────

describe('calculateBOMCost', () => {
  it('calculates material cost correctly', () => {
    const bom = makeHeader();
    // RM-001: 2 kg/unit @ ₹50/kg, RM-002: 4 pcs/unit @ ₹5/pcs
    const costs = { 'RM-001': 50, 'RM-002': 5 };
    const result = calculateBOMCost(bom, 10, costs);

    // RM-001: 2 * 10 * 50 = 1000
    // RM-002: 4 * 10 * 5 = 200
    expect(result.materialCost).toBe(1200);
  });

  it('calculates by-product credit and net cost', () => {
    const bom = makeHeader({
      components: [
        {
          id: 'line-1',
          bomId: 'bom-1',
          componentId: 'RM-001',
          componentName: 'Plastic',
          qtyPerUnit: 1,
          unit: 'kg',
          wastePercent: 0,
          isOptional: false,
          substituteIds: [],
        },
      ],
      byProducts: [
        {
          id: 'bp-1',
          bomId: 'bom-1',
          componentId: 'BP-SCRAP',
          componentName: 'Scrap Plastic',
          qtyPerUnit: 0.1,
          unit: 'kg',
          wastePercent: 0,
          isOptional: false,
          substituteIds: [],
        },
      ],
    });

    const costs = { 'RM-001': 100, 'BP-SCRAP': 20 };
    const result = calculateBOMCost(bom, 10, costs);

    // materialCost: 1 * 10 * 100 = 1000
    // byProductCredit: 0.1 * 10 * 20 = 20
    // netCost: 1000 - 20 = 980
    expect(result.materialCost).toBe(1000);
    expect(result.byProductCredit).toBe(20);
    expect(result.netCost).toBe(980);
  });

  it('calculates cost per unit correctly', () => {
    const bom = makeHeader({
      components: [
        {
          id: 'line-1',
          bomId: 'bom-1',
          componentId: 'RM-001',
          componentName: 'Metal',
          qtyPerUnit: 2,
          unit: 'kg',
          wastePercent: 0,
          isOptional: false,
          substituteIds: [],
        },
      ],
    });

    const costs = { 'RM-001': 50 };
    const result = calculateBOMCost(bom, 10, costs);

    // materialCost: 2 * 10 * 50 = 1000
    // costPerUnit: 1000 / 10 = 100
    expect(result.costPerUnit).toBe(100);
  });

  it('uses 0 cost for components not in cost map', () => {
    const bom = makeHeader();
    // No costs provided
    const result = calculateBOMCost(bom, 100, {});
    expect(result.materialCost).toBe(0);
    expect(result.netCost).toBe(0);
    expect(result.costPerUnit).toBe(0);
  });

  it('applies waste percent when calculating cost', () => {
    const bom = makeHeader({
      components: [
        {
          id: 'line-1',
          bomId: 'bom-1',
          componentId: 'RM-001',
          componentName: 'Resin',
          qtyPerUnit: 1,
          unit: 'litre',
          wastePercent: 10,   // 10% waste
          isOptional: false,
          substituteIds: [],
        },
      ],
    });

    const costs = { 'RM-001': 100 };
    const result = calculateBOMCost(bom, 1, costs);

    // 1 * 1 * 1.10 * 100 = 110
    expect(result.materialCost).toBeCloseTo(110, 10);
  });

  it('handles no by-products (byProductCredit = 0)', () => {
    const bom = makeHeader({ byProducts: [] });
    const costs = { 'RM-001': 10, 'RM-002': 5 };
    const result = calculateBOMCost(bom, 1, costs);
    expect(result.byProductCredit).toBe(0);
  });

  it('throws for targetQty <= 0', () => {
    expect(() => calculateBOMCost(makeHeader(), 0, {})).toThrow();
  });

  it('returns substitute IDs on scaled components (via bom components)', () => {
    const bom = makeHeader();
    // RM-002 has substituteIds: ['RM-003']
    const scaled = scaleBOM(bom, 1);
    const rm002 = scaled.find((c) => c.componentId === 'RM-002');
    // substituteIds are on BOMLine, not ScaledComponent — availability check uses them
    // This test verifies the fixture data is correct
    expect(bom.components[1].substituteIds).toEqual(['RM-003']);
    expect(rm002).toBeDefined();
  });
});
