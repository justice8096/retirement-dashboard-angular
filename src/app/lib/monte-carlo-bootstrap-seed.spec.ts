import { describe, it, expect } from 'vitest';
import { runMonteCarlo, mulberry32, type MonteCarloParams } from './monte-carlo';

/**
 * Regression test for Codex P2 (api #147): `returnMode: 'bootstrap'` must honor
 * `seededRandom`, else the API's documented reproducibility guarantee is false
 * for bootstrap sims. `bootstrapYear` now threads the resolved RNG.
 */
function params(seed: number): MonteCarloParams {
  return {
    portfolio: 1_000_000, monthlyIncome: 0, baseCost: 50_000 / 12,
    isForeign: false, fxDrift: 0, runs: 300, years: 30,
    meanReturn: 0.07, volReturn: 0.13, meanInflation: 0.025, volInflation: 0.01,
    currVol: 0, incGrowth: 0, returnMode: 'bootstrap', seededRandom: mulberry32(seed),
  };
}

describe('bootstrap mode honors the seed', () => {
  it('same seed → identical results', () => {
    const a = runMonteCarlo(params(42));
    const b = runMonteCarlo(params(42));
    expect(a.results).toEqual(b.results);
    expect(a.successRate).toBe(b.successRate);
    expect(a.median).toBe(b.median);
  });

  it('different seeds → different draws', () => {
    const a = runMonteCarlo(params(1));
    const b = runMonteCarlo(params(2));
    expect(a.results).not.toEqual(b.results);
  });
});
