/**
 * Monte Carlo retirement simulation.
 *
 * Ported from D:\retirementProject\dashboard\src\workers\montecarlo.worker.js
 * to preserve identical semantics. Runs synchronously; for large run counts
 * consider moving to a Web Worker.
 *
 * Semantics (annual steps):
 *   - Stochastic real return  ~ N(meanReturn, volReturn)
 *   - Stochastic inflation    ~ N(meanInflation, volInflation), floored at 0
 *   - Stochastic currency     ~ N(1, currVol) applied to foreign cost-of-living
 *   - Systematic FX drift     compounded each year for foreign locations
 *   - Income grows at incGrowth each year
 *   - Cost inflates at annInfl each year
 *   - Per year: bal = bal * (1 + ret) + income*12 - cost*12 * currShock * fxMult
 */

export interface MonteCarloParams {
  /** Starting portfolio balance in USD */
  portfolio: number;
  /** Monthly income in USD (SS, pension, etc.) */
  monthlyIncome: number;
  /** Baseline monthly cost-of-living in local currency */
  baseCost: number;
  /** true if location's currency is not USD */
  isForeign: boolean;
  /** Annual FX drift rate (positive = USD weakens) */
  fxDrift: number;
  /** Number of simulation runs (trials) */
  runs: number;
  /** Years to simulate */
  years: number;
  /** Mean annual return (decimal, e.g. 0.07 for 7%) */
  meanReturn: number;
  /** Return volatility (decimal, e.g. 0.15 for 15%) */
  volReturn: number;
  /** Mean inflation (decimal) */
  meanInflation: number;
  /** Inflation volatility (decimal) */
  volInflation: number;
  /** Currency volatility (decimal) */
  currVol: number;
  /** Income growth (decimal) */
  incGrowth: number;
}

export interface MonteCarloResult {
  /** Ending balances for every run, sorted ascending */
  results: number[];
  /** Up to 50 sample portfolio paths (length = years + 1) */
  paths: number[][];
  /** Fraction of runs ending above $0 (0..1) */
  successRate: number;
  /** 50th percentile ending balance */
  median: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
}

/** Box-Muller transform: standard normal sample. */
function normalRandom(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function runMonteCarlo(p: MonteCarloParams): MonteCarloResult {
  const {
    portfolio, monthlyIncome, baseCost, isForeign, fxDrift,
    runs, years, meanReturn, volReturn,
    meanInflation, volInflation, currVol, incGrowth,
  } = p;

  const drift = fxDrift || 0;
  const results: number[] = [];
  const paths: number[][] = [];

  for (let r = 0; r < runs; r++) {
    let bal = portfolio;
    let income = monthlyIncome;
    let cost = baseCost;
    let fxMult = 1;
    const path: number[] = [bal];

    for (let y = 0; y < years; y++) {
      const annReturn = meanReturn + volReturn * normalRandom();
      const annInfl = Math.max(0, meanInflation + volInflation * normalRandom());
      const currShock = isForeign ? 1 + currVol * normalRandom() : 1;
      if (isForeign && drift) fxMult *= (1 + drift);

      bal *= (1 + annReturn);
      bal += income * 12 - cost * 12 * currShock * fxMult;
      cost *= (1 + annInfl);
      income *= (1 + incGrowth);

      path.push(bal);
    }

    results.push(bal);
    if (r < 50) paths.push(path);
  }

  results.sort((a, b) => a - b);
  const successRate = results.filter((v) => v > 0).length / runs;

  // Percentile sampling (matches original floor-index behavior)
  const at = (q: number): number => results[Math.floor(runs * q)] ?? 0;

  return {
    results,
    paths,
    successRate,
    median: at(0.5),
    p5: at(0.05),
    p25: at(0.25),
    p75: at(0.75),
    p95: at(0.95),
  };
}

/**
 * Compute per-category weighted-average inflation from a location's monthlyCosts.
 * Falls back to 0.025 (2.5%) if no data is present.
 */
export function weightedInflationFromLocation(
  monthlyCosts: Record<string, { typical?: number; annualInflation?: number }> | null | undefined,
): number {
  if (!monthlyCosts) return 0.025;
  const cats = Object.values(monthlyCosts);
  const totalBase = cats.reduce((s, c) => s + (c?.typical ?? 0), 0);
  if (totalBase <= 0) return 0.025;
  let weighted = 0;
  for (const c of cats) {
    const w = (c?.typical ?? 0) / totalBase;
    weighted += w * (c?.annualInflation ?? 0.025);
  }
  return weighted;
}
