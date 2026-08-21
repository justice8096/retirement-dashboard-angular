import { describe, it, expect } from 'vitest';
import {
  compareStrategies,
  projectStrategy,
  DEFAULT_KNOBS,
  COMPARISON_STRATEGIES,
  type ProjectionInput,
} from './withdrawal-comparison';

/**
 * A4 parity port #10 (multi-strategy withdrawal comparison + year-by-year
 * projection). Pins down year-1 withdrawal for each of the seven strategies
 * (including CAPE, now that `calcCAPEWithdrawal` has been ported into the
 * canonical `retirement-api/shared/withdrawalStrategies.js` — see that
 * package's `feat(shared): port calcCAPEWithdrawal...` commit) against
 * hand-computed values, using the shared library's own documented behavior
 * — not re-derived math.
 */

describe('compareStrategies — year-1 withdrawal per strategy', () => {
  const base: Omit<ProjectionInput, 'strategy'> = {
    initialPortfolio: 1_000_000,
    annualSpending: 40_000,
    startAge: 65,
    startYear: 2026,
    yearsToProject: 5,
    expectedReturn: 0.05,
    inflationRate: 0.03,
    knobs: DEFAULT_KNOBS,
  };

  it('compares all 7 strategies and matches hand-computed year-1 withdrawals', () => {
    const results = compareStrategies(COMPARISON_STRATEGIES, base);
    const byStrategy = Object.fromEntries(results.map((r) => [r.strategy, r]));

    // fixed: initialPortfolio * rate * (1+inflation)^0 = 1,000,000 * 0.04
    expect(byStrategy['fixed']!.year1Withdrawal).toBeCloseTo(40_000, 6);

    // constant: portfolio * rate = 1,000,000 * 0.05
    expect(byStrategy['constant']!.year1Withdrawal).toBeCloseTo(50_000, 6);

    // guardrails: year 1 uses the seeded initial rate directly (no guardrail
    // check yet — that only runs from year 2 on, per calcGuardrailsWithdrawal's
    // own contract of comparing a *next* withdrawal against the guardrail band).
    expect(byStrategy['guardrails']!.year1Withdrawal).toBeCloseTo(40_000, 6);

    // vpw: portfolio / VPW_DIVISORS[65] = 1,000,000 / 22.0
    expect(byStrategy['vpw']!.year1Withdrawal).toBeCloseTo(1_000_000 / 22.0, 6);

    // bucket: bucket1=2yr*40k=80k, bucket2=7yr*40k=280k, bucket3=640k.
    // annualSpending (40k) < bucket1's 80k balance, so no refill needed and
    // the withdrawal is simply the full requested annualSpending.
    expect(byStrategy['bucket']!.year1Withdrawal).toBeCloseTo(40_000, 6);

    // floor-ceiling: essentialGap = max(0, 50,000-30,000) = 20,000;
    // discretionary = min(30,000, 1,000,000*0.05=50,000) = 30,000;
    // total = 20,000 + 30,000 = 50,000.
    expect(byStrategy['floor-ceiling']!.year1Withdrawal).toBeCloseTo(50_000, 6);

    // cape (DEFAULT_KNOBS: capeRatio=30, capeMultiplier=0.5, fixedComponent=0.015):
    // rawRate = (1/30)*0.5 + 0.015 = 0.016667 + 0.015 = 0.031667 (unclamped,
    // within the default [0.02, 0.06] band). amount = 1,000,000 * 0.031667.
    expect(byStrategy['cape']!.year1Withdrawal).toBeCloseTo(31_666.67, 1);
  });

  it('produces one row per requested strategy, all sized to the same horizon', () => {
    const results = compareStrategies(COMPARISON_STRATEGIES, base);
    expect(results).toHaveLength(7);
    expect(results.map((r) => r.strategy)).toContain('cape');
    for (const r of results) {
      expect(r.rows).toHaveLength(5);
    }
  });
});

describe('projectStrategy — CAPE strategy', () => {
  it('clamps to the ceiling when a low CAPE ratio implies a higher raw rate', () => {
    // rawRate = (1/8)*0.5 + 0.015 = 0.0625 + 0.015 = 0.0775 -> clamped to
    // the default ceiling of 0.06. amount = 500,000 * 0.06 = 30,000.
    const result = projectStrategy({
      strategy: 'cape',
      initialPortfolio: 500_000,
      annualSpending: 0,
      startAge: null,
      startYear: 2026,
      yearsToProject: 1,
      expectedReturn: 0.05,
      inflationRate: 0.03,
      knobs: { ...DEFAULT_KNOBS, capeRatio: 8 },
    });

    expect(result.year1Withdrawal).toBeCloseTo(30_000, 2);
    expect(result.rows[0]!.effectiveRate).toBeCloseTo(0.06, 6);
  });
});

describe('projectStrategy — year-by-year projection table (fixed strategy)', () => {
  it('computes the correct first and last row over a 3-year horizon', () => {
    const result = projectStrategy({
      strategy: 'fixed',
      initialPortfolio: 100_000,
      annualSpending: 0,
      startAge: 65,
      startYear: 2026,
      yearsToProject: 3,
      expectedReturn: 0.05,
      inflationRate: 0.03,
      knobs: DEFAULT_KNOBS, // fixedWithdrawalRate: 0.04
    });

    expect(result.rows).toHaveLength(3);

    // Year 1 (index 0): withdrawal = 100,000 * 0.04 * 1.03^0 = 4,000.
    // portfolioEnd = (100,000 - 4,000) * 1.05 = 100,800.
    const first = result.rows[0]!;
    expect(first).toMatchObject({
      year: 2026,
      age: 65,
      portfolioStart: 100_000,
    });
    expect(first.withdrawal).toBeCloseTo(4_000, 6);
    expect(first.effectiveRate).toBeCloseTo(0.04, 6);
    expect(first.portfolioEnd).toBeCloseTo(100_800, 6);

    // Year 3 (index 2, last row): withdrawal = 100,000 * 0.04 * 1.03^2 = 4,243.6.
    // portfolioStart carries forward from year 2's end (101,514 exactly).
    // portfolioEnd = (101,514 - 4,243.6) * 1.05 = 102,133.92.
    const last = result.rows[2]!;
    expect(last).toMatchObject({ year: 2028, age: 67 });
    expect(last.portfolioStart).toBeCloseTo(101_514, 2);
    expect(last.withdrawal).toBeCloseTo(4_243.6, 2);
    expect(last.portfolioEnd).toBeCloseTo(102_133.92, 2);

    expect(result.year1Withdrawal).toBeCloseTo(4_000, 6);
    expect(result.finalBalance).toBeCloseTo(102_133.92, 2);
    expect(result.yearsFunded).toBe(3);
    expect(result.depleted).toBe(false);
  });

  it('reports the bucket strategy\'s portfolio balance as the sum of its own bucket growth, not a disconnected top-level rate (regression)', () => {
    // bucket1 = 2yr * 30,000 = 60,000 @2%; bucket2 = 7yr * 30,000 = 210,000 @5%;
    // bucket3 = remainder 30,000 @7%. Sums to the 300,000 initial portfolio.
    const result = projectStrategy({
      strategy: 'bucket',
      initialPortfolio: 300_000,
      annualSpending: 30_000,
      startAge: null,
      startYear: 2026,
      yearsToProject: 2,
      expectedReturn: 0.99, // deliberately absurd — must be ignored for bucket
      inflationRate: 0.03,
      knobs: DEFAULT_KNOBS, // bucket1Years: 2, bucket2Years: 7, refillThreshold: 1
    });

    // Year 1: withdrawal = 30,000 (bucket 1's 60,000 balance covers it, no
    // refill needed — 60,000 is not below the 30,000 refill threshold).
    const first = result.rows[0]!;
    expect(first.withdrawal).toBeCloseTo(30_000, 6);
    // Post-withdrawal: bucket1=30,000, bucket2=210,000, bucket3=30,000.
    // Grown at 2%/5%/7%: 30,600 + 220,500 + 32,100 = 283,200.
    expect(first.portfolioEnd).toBeCloseTo(283_200, 2);

    // Year 2's portfolioStart must carry forward from the bucket-sum total
    // above, not from a separate balance grown at the 99% `expectedReturn`.
    const second = result.rows[1]!;
    expect(second.portfolioStart).toBeCloseTo(283_200, 2);
  });

  it('marks a strategy depleted once the portfolio hits zero', () => {
    const result = projectStrategy({
      strategy: 'constant',
      initialPortfolio: 1_000,
      annualSpending: 0,
      startAge: null,
      startYear: 2026,
      yearsToProject: 2,
      expectedReturn: 0,
      inflationRate: 0,
      knobs: { ...DEFAULT_KNOBS, constantWithdrawalRate: 1 }, // withdraw 100% year 1
    });

    expect(result.rows[0]!.portfolioEnd).toBe(0);
    expect(result.rows[0]!.age).toBeNull();
    expect(result.finalBalance).toBe(0);
    expect(result.depleted).toBe(true);
    expect(result.yearsFunded).toBe(0);
  });
});
