import { describe, it, expect } from 'vitest';
import { FED_BRACKETS_2026_SINGLE } from '@retirement/shared/engine/tax-sources.js';
import { conversionBracketBreakdown, buildDepletionSchedule } from './roth-conversion-math';

/**
 * A4 parity port #7 (marginal-bracket breakdown + year-by-year depletion
 * table). Neither retired React tab actually computed a correct per-bracket
 * breakdown: `RothConversionTab.tsx` applied only the top marginal rate to
 * the whole conversion-caused income delta, and `RothPlannerTab.tsx` defined
 * a per-bracket `calcTaxOnIncome` helper but never called it (the schedule
 * used a flat user-set rate instead). These tests pin down the corrected,
 * genuinely progressive math this port introduces.
 *
 * FED_BRACKETS_2026_SINGLE (the shared, maintained 2026 table) for
 * reference: 0–12,400 @10%, 12,400–50,400 @12%, 50,400–105,700 @22%, ...
 */

describe('conversionBracketBreakdown', () => {
  it('splits a conversion spanning 3 brackets into per-chunk tax at each bracket rate', () => {
    const result = conversionBracketBreakdown(0, 60_000, FED_BRACKETS_2026_SINGLE);

    expect(result.chunks).toEqual([
      { min: 0, max: 12_400, rate: 0.10, amount: 12_400, tax: 1_240 },
      { min: 12_400, max: 50_400, rate: 0.12, amount: 38_000, tax: 4_560 },
      { min: 50_400, max: 105_700, rate: 0.22, amount: 9_600, tax: 2_112 },
    ]);
    expect(result.totalTax).toBeCloseTo(1_240 + 4_560 + 2_112, 2);
    expect(result.marginalRate).toBe(0.22);
    expect(result.effectiveRate).toBeCloseTo(result.totalTax / 60_000, 6);
  });

  it('taxes a conversion that stays inside a single bracket at just that one rate', () => {
    // Baseline of $20,000 sits inside the 12,400-50,400 @12% bracket;
    // a $5,000 conversion on top (up to $25,000) never crosses out of it.
    const result = conversionBracketBreakdown(20_000, 5_000, FED_BRACKETS_2026_SINGLE);

    expect(result.chunks).toEqual([
      { min: 12_400, max: 50_400, rate: 0.12, amount: 5_000, tax: 600 },
    ]);
    expect(result.totalTax).toBe(600);
    expect(result.marginalRate).toBe(0.12);
    expect(result.effectiveRate).toBeCloseTo(0.12, 6);
  });

  it('returns no chunks and zero tax for a zero-dollar conversion', () => {
    const result = conversionBracketBreakdown(50_000, 0, FED_BRACKETS_2026_SINGLE);

    expect(result.chunks).toEqual([]);
    expect(result.totalTax).toBe(0);
    expect(result.marginalRate).toBe(0);
    expect(result.effectiveRate).toBe(0);
  });

  it('nets the standard deduction out of other income before stacking the conversion', () => {
    // $12,400 of other income minus a $12,400 deduction leaves a $0 baseline,
    // so the whole $5,000 conversion falls in the first (10%) bracket.
    const result = conversionBracketBreakdown(12_400, 5_000, FED_BRACKETS_2026_SINGLE, 12_400);

    expect(result.chunks).toEqual([
      { min: 0, max: 12_400, rate: 0.10, amount: 5_000, tax: 500 },
    ]);
    expect(result.totalTax).toBe(500);
  });
});

describe('buildDepletionSchedule', () => {
  it('produces the correct year-1 row and stops once Traditional is depleted at the end of the conversion window', () => {
    const rows = buildDepletionSchedule({
      traditionalStart: 30_000,
      rothStart: 0,
      annualConversion: 10_000,
      yearsToConvert: 3,
      otherTaxableIncome: 0,
      standardDeduction: 0,
      brackets: FED_BRACKETS_2026_SINGLE,
      growthRate: 0,
      startYear: 2026,
      startAge: 60,
      tailYears: 2,
    });

    // Depleted exactly as the 3-year conversion window closes -> 3 rows, no tail.
    expect(rows).toHaveLength(3);

    const year1 = rows[0]!;
    expect(year1).toEqual({
      year: 2026,
      age: 60,
      traditionalStart: 30_000,
      conversionAmount: 10_000,
      taxPaid: 1_000, // $10,000 entirely inside the 0-12,400 @10% bracket
      traditionalEnd: 20_000,
      rothBalance: 10_000,
    });

    const finalRow = rows[rows.length - 1]!;
    expect(finalRow).toEqual({
      year: 2028,
      age: 62,
      traditionalStart: 10_000,
      conversionAmount: 10_000,
      taxPaid: 1_000,
      traditionalEnd: 0,
      rothBalance: 30_000,
    });
  });

  it('caps each year\'s conversion at the remaining Traditional balance', () => {
    const rows = buildDepletionSchedule({
      traditionalStart: 5_000,
      rothStart: 0,
      annualConversion: 10_000, // more than the balance
      yearsToConvert: 3,
      otherTaxableIncome: 0,
      standardDeduction: 0,
      brackets: FED_BRACKETS_2026_SINGLE,
      growthRate: 0,
      startYear: 2026,
      startAge: null,
      tailYears: 1,
    });

    expect(rows[0]!.conversionAmount).toBe(5_000);
    expect(rows[0]!.traditionalEnd).toBe(0);
    expect(rows[0]!.age).toBeNull();
  });

  it('grows both balances after the conversion moves dollars across, once conversions stop', () => {
    const rows = buildDepletionSchedule({
      traditionalStart: 100_000,
      rothStart: 0,
      annualConversion: 0,
      yearsToConvert: 0,
      otherTaxableIncome: 0,
      standardDeduction: 0,
      brackets: FED_BRACKETS_2026_SINGLE,
      growthRate: 0.10,
      startYear: 2026,
      startAge: 55,
      tailYears: 2,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]!.traditionalStart).toBe(100_000);
    expect(rows[0]!.traditionalEnd).toBe(110_000);
    expect(rows[1]!.traditionalStart).toBe(110_000);
    expect(rows[1]!.traditionalEnd).toBe(121_000);
  });
});
