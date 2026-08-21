import { describe, it, expect } from 'vitest';
import { runMonteCarlo, mulberry32, type MonteCarloParams } from './monte-carlo';

/**
 * Per-year pet / dependent cost curves (petCostByYear / dependentCostByYear).
 * Deterministic base: zero vol / zero return / zero income so balance
 * arithmetic is exact and every trial is identical.
 */
const base = (over: Partial<MonteCarloParams> = {}): MonteCarloParams => ({
  portfolio: 100_000, monthlyIncome: 0, baseCost: 0, isForeign: false,
  fxDrift: 0, runs: 3, years: 3, meanReturn: 0, volReturn: 0,
  meanInflation: 0, volInflation: 0, currVol: 0, incGrowth: 0,
  seededRandom: mulberry32(42), ...over,
});

describe('kernel pet/dependent cost curves', () => {
  it('absent curves === explicit zero curves (dormant path, seeded identity)', () => {
    const a = runMonteCarlo(base());
    const b = runMonteCarlo(base({ petCostByYear: [0, 0, 0], dependentCostByYear: [] }));
    expect(b.results).toEqual(a.results);
    expect(b.paths).toEqual(a.paths);
  });

  it('deducts pet + dependent annual amounts per year', () => {
    const r = runMonteCarlo(base({
      petCostByYear: [1_200, 0, 600],
      dependentCostByYear: [0, 2_400, 0],
    }));
    expect(r.median).toBeCloseTo(100_000 - 1_200 - 2_400 - 600);
    expect(r.paths[0]).toEqual([100_000, 98_800, 96_400, 95_800]);
  });

  it('scales deductions by accumulated inflation', () => {
    const r = runMonteCarlo(base({
      meanInflation: 0.10,
      petCostByYear: [1_000, 1_000, 1_000],
    }));
    // cumInfl at deduction time: y0 ×1, y1 ×1.1, y2 ×1.21 → 3,310 total
    expect(r.median).toBeCloseTo(100_000 - 3_310, 6);
  });

  it('ignores negative entries and years beyond the array', () => {
    const r = runMonteCarlo(base({ petCostByYear: [-500], dependentCostByYear: [0, -1] }));
    expect(r.median).toBeCloseTo(100_000);
  });
});
