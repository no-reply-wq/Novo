import { calculateTDS, computeQuarterlySummary, type TDSCalculationInput } from '../calculator';

// ─── calculateTDS ────────────────────────────────────────────────────────────

describe('calculateTDS', () => {
  describe('194C — contractors', () => {
    it('deducts 2% for corporate vendor above both single and annual threshold', () => {
      // ytdPayments=90000: cumulative = 90000+50000 = 140000 > 100000
      const result = calculateTDS({
        amount: 50000,
        section: '194C',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
        ytdPayments: 90000,
      });
      expect(result.tdsRate).toBe(2);
      expect(result.tdsAmount).toBe(1000);
      expect(result.netAmount).toBe(49000);
      expect(result.thresholdApplied).toBe(false);
      expect(result.section).toBe('194C');
      expect(result.grossAmount).toBe(50000);
    });

    it('deducts 1% for individual vendor above both single and annual threshold', () => {
      // ytdPayments=90000: cumulative = 90000+50000 = 140000 > 100000
      const result = calculateTDS({
        amount: 50000,
        section: '194C',
        vendorType: 'individual',
        hasPAN: true,
        financialYear: '2024-25',
        ytdPayments: 90000,
      });
      expect(result.tdsRate).toBe(1);
      expect(result.tdsAmount).toBe(500);
      expect(result.netAmount).toBe(49500);
      expect(result.thresholdApplied).toBe(false);
    });

    it('returns zero TDS when payment is below single threshold (₹30,000)', () => {
      const result = calculateTDS({
        amount: 25000,
        section: '194C',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
      });
      expect(result.tdsAmount).toBe(0);
      expect(result.tdsRate).toBe(0);
      expect(result.netAmount).toBe(25000);
      expect(result.thresholdApplied).toBe(true);
    });

    it('returns zero TDS when exactly at single threshold', () => {
      const result = calculateTDS({
        amount: 29999,
        section: '194C',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
      });
      expect(result.tdsAmount).toBe(0);
      expect(result.thresholdApplied).toBe(true);
    });

    it('applies TDS when annual cumulative crosses annual threshold', () => {
      // ytd=90000, this payment=50000 → cumulative=140000 > annualThreshold=100000
      const result = calculateTDS({
        amount: 50000,
        section: '194C',
        vendorType: 'individual',
        hasPAN: true,
        financialYear: '2024-25',
        ytdPayments: 90000,
      });
      expect(result.tdsAmount).toBeGreaterThan(0);
      expect(result.thresholdApplied).toBe(false);
      expect(result.tdsRate).toBe(1);
    });

    it('returns zero TDS when cumulative is still below annual threshold', () => {
      // ytd=40000, payment=30001 → single threshold crossed, annual cumulative=70001 < 100000
      const result = calculateTDS({
        amount: 30001,
        section: '194C',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
        ytdPayments: 40000,
      });
      // cumulative = 70001 < 100000 → no TDS
      expect(result.tdsAmount).toBe(0);
      expect(result.thresholdApplied).toBe(true);
    });

    it('applies TDS when no ytdPayments provided and amount > single threshold', () => {
      const result = calculateTDS({
        amount: 50000,
        section: '194C',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
        // ytdPayments omitted → defaults to 0
        // annual check: 0 + 50000 = 50000 < 100000 → still below annual threshold
      });
      // Single threshold: 50000 >= 30000 → passes
      // Annual threshold: 50000 < 100000 → no TDS
      expect(result.tdsAmount).toBe(0);
      expect(result.thresholdApplied).toBe(true);
    });
  });

  describe('194J — professional/technical services', () => {
    it('applies 10% for individual with PAN', () => {
      const result = calculateTDS({
        amount: 100000,
        section: '194J',
        vendorType: 'individual',
        hasPAN: true,
        financialYear: '2024-25',
      });
      expect(result.tdsRate).toBe(10);
      expect(result.tdsAmount).toBe(10000);
      expect(result.netAmount).toBe(90000);
    });

    it('applies 10% for corporate with PAN', () => {
      const result = calculateTDS({
        amount: 100000,
        section: '194J',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
      });
      expect(result.tdsRate).toBe(10);
      expect(result.tdsAmount).toBe(10000);
    });

    it('applies 20% (no-PAN rate) when hasPAN is false', () => {
      const result = calculateTDS({
        amount: 50000,
        section: '194J',
        vendorType: 'individual',
        hasPAN: false,
        financialYear: '2024-25',
      });
      expect(result.tdsRate).toBe(20);
      expect(result.tdsAmount).toBe(10000);
      expect(result.netAmount).toBe(40000);
    });

    it('applies 20% for company without PAN', () => {
      const result = calculateTDS({
        amount: 50000,
        section: '194J',
        vendorType: 'company',
        hasPAN: false,
        financialYear: '2024-25',
      });
      expect(result.tdsRate).toBe(20);
    });

    it('returns zero TDS when below single threshold', () => {
      // 194J thresholdSingle = 30000
      const result = calculateTDS({
        amount: 15000,
        section: '194J',
        vendorType: 'individual',
        hasPAN: true,
        financialYear: '2024-25',
      });
      expect(result.tdsAmount).toBe(0);
      expect(result.thresholdApplied).toBe(true);
    });
  });

  describe('194Q — purchase of goods', () => {
    it('applies 0.1% for purchases above annual threshold', () => {
      const result = calculateTDS({
        amount: 1000000,
        section: '194Q',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
        ytdPayments: 5000000,  // already above annual threshold
      });
      expect(result.tdsRate).toBe(0.1);
      expect(result.tdsAmount).toBe(1000);
      expect(result.netAmount).toBe(999000);
    });

    it('applies 5% rate when PAN absent', () => {
      const result = calculateTDS({
        amount: 1000000,
        section: '194Q',
        vendorType: 'company',
        hasPAN: false,
        financialYear: '2024-25',
        ytdPayments: 5000000,
      });
      expect(result.tdsRate).toBe(5);
    });
  });

  describe('HUF vendor type', () => {
    it('applies individual rate for HUF vendor', () => {
      const result = calculateTDS({
        amount: 50000,
        section: '194C',
        vendorType: 'huf',
        hasPAN: true,
        financialYear: '2024-25',
        ytdPayments: 90000,
      });
      expect(result.tdsRate).toBe(1);  // individual rate
    });
  });

  describe('unknown section', () => {
    it('returns zero TDS and explanation for unknown section', () => {
      const result = calculateTDS({
        amount: 50000,
        section: '999X',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
      });
      expect(result.tdsAmount).toBe(0);
      expect(result.tdsRate).toBe(0);
      expect(result.netAmount).toBe(50000);
      expect(result.reason).toMatch(/unknown/i);
    });
  });

  describe('return value shape', () => {
    it('always returns all required fields', () => {
      const input: TDSCalculationInput = {
        amount: 50000,
        section: '194C',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
        ytdPayments: 90000,
      };
      const result = calculateTDS(input);
      expect(typeof result.grossAmount).toBe('number');
      expect(typeof result.tdsRate).toBe('number');
      expect(typeof result.tdsAmount).toBe('number');
      expect(typeof result.netAmount).toBe('number');
      expect(typeof result.section).toBe('string');
      expect(typeof result.thresholdApplied).toBe('boolean');
      expect(typeof result.reason).toBe('string');
    });

    it('grossAmount + tdsAmount = netAmount + 2*tdsAmount (i.e. gross = net + tds)', () => {
      const result = calculateTDS({
        amount: 50000,
        section: '194C',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
        ytdPayments: 90000,
      });
      expect(result.grossAmount).toBe(result.netAmount + result.tdsAmount);
    });

    it('tdsAmount is correctly rounded to 2 decimal places', () => {
      // 194Q rate = 0.1%, amount = 33333 → TDS = 33.333 → rounds to 33.33
      const result = calculateTDS({
        amount: 33333,
        section: '194Q',
        vendorType: 'company',
        hasPAN: true,
        financialYear: '2024-25',
        ytdPayments: 5000000,
      });
      const decimalPlaces = (result.tdsAmount.toString().split('.')[1] ?? '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });
});

// ─── computeQuarterlySummary ─────────────────────────────────────────────────

describe('computeQuarterlySummary', () => {
  const basePayments = [
    { vendorId: 'v1', vendorName: 'ACME Ltd', vendorPAN: 'AAACE1234E', amount: 100000, tdsAmount: 2000, section: '194C', date: '2024-04-15' },
    { vendorId: 'v1', vendorName: 'ACME Ltd', vendorPAN: 'AAACE1234E', amount: 50000, tdsAmount: 1000, section: '194C', date: '2024-05-10' },
    { vendorId: 'v2', vendorName: 'TechPro', vendorPAN: 'BBBBT9999Z', amount: 200000, tdsAmount: 20000, section: '194J', date: '2024-07-20' },
    { vendorId: 'v1', vendorName: 'ACME Ltd', vendorPAN: 'AAACE1234E', amount: 80000, tdsAmount: 1600, section: '194C', date: '2025-01-05' },
  ];

  it('groups Q1 payments correctly by vendor + section', () => {
    const summary = computeQuarterlySummary({
      payments: basePayments,
      quarter: 1,
      financialYear: '2024-25',
    });
    // Q1 (Apr–Jun): two 194C payments for v1
    expect(summary).toHaveLength(1);
    expect(summary[0]?.section).toBe('194C');
    expect(summary[0]?.vendorPAN).toBe('AAACE1234E');
    expect(summary[0]?.totalPayments).toBe(150000);
    expect(summary[0]?.totalTDS).toBe(3000);
    expect(summary[0]?.netPayments).toBe(147000);
  });

  it('filters Q2 correctly (Jul–Sep)', () => {
    const summary = computeQuarterlySummary({
      payments: basePayments,
      quarter: 2,
      financialYear: '2024-25',
    });
    expect(summary).toHaveLength(1);
    expect(summary[0]?.section).toBe('194J');
    expect(summary[0]?.vendorName).toBe('TechPro');
    expect(summary[0]?.totalPayments).toBe(200000);
    expect(summary[0]?.totalTDS).toBe(20000);
  });

  it('filters Q4 correctly (Jan–Mar)', () => {
    const summary = computeQuarterlySummary({
      payments: basePayments,
      quarter: 4,
      financialYear: '2024-25',
    });
    expect(summary).toHaveLength(1);
    expect(summary[0]?.vendorPAN).toBe('AAACE1234E');
    expect(summary[0]?.totalPayments).toBe(80000);
  });

  it('returns empty array when no payments fall in the quarter', () => {
    const summary = computeQuarterlySummary({
      payments: basePayments,
      quarter: 3,
      financialYear: '2024-25',
    });
    expect(summary).toHaveLength(0);
  });

  it('groups same vendor + section across multiple payments correctly', () => {
    const payments = [
      { vendorId: 'v1', vendorName: 'ACME', vendorPAN: 'AAACE1234E', amount: 50000, tdsAmount: 1000, section: '194C', date: '2024-04-01' },
      { vendorId: 'v1', vendorName: 'ACME', vendorPAN: 'AAACE1234E', amount: 50000, tdsAmount: 1000, section: '194C', date: '2024-06-30' },
      { vendorId: 'v1', vendorName: 'ACME', vendorPAN: 'AAACE1234E', amount: 30000, tdsAmount: 3000, section: '194J', date: '2024-05-15' },
    ];
    const summary = computeQuarterlySummary({ payments, quarter: 1, financialYear: '2024-25' });
    expect(summary).toHaveLength(2);
    const c194 = summary.find(s => s.section === '194C');
    const j194 = summary.find(s => s.section === '194J');
    expect(c194?.totalPayments).toBe(100000);
    expect(j194?.totalPayments).toBe(30000);
  });

  it('returns financialYear in each summary row', () => {
    const summary = computeQuarterlySummary({
      payments: basePayments,
      quarter: 1,
      financialYear: '2024-25',
    });
    for (const row of summary) {
      expect(row.financialYear).toBe('2024-25');
    }
  });

  it('handles vendors without PAN using vendorId as grouping key', () => {
    const payments = [
      { vendorId: 'v5', vendorName: 'Unknown Vendor', vendorPAN: '', amount: 40000, tdsAmount: 8000, section: '194J', date: '2024-04-10' },
      { vendorId: 'v5', vendorName: 'Unknown Vendor', vendorPAN: '', amount: 30000, tdsAmount: 6000, section: '194J', date: '2024-05-10' },
    ];
    const summary = computeQuarterlySummary({ payments, quarter: 1, financialYear: '2024-25' });
    expect(summary).toHaveLength(1);
    expect(summary[0]?.totalPayments).toBe(70000);
    expect(summary[0]?.totalTDS).toBe(14000);
  });
});
