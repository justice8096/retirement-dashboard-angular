/**
 * Monte Carlo retirement simulation.
 *
 * Supports four sampling modes:
 *   - 'normal'             : Gaussian draws from (meanReturn, volReturn) + (meanInflation, volInflation)
 *   - 'bootstrap'          : random-year resample from HISTORICAL_RETURNS (return/inflation paired)
 *   - 'regime'             : 2-state Markov switching bull/bear with different means and vols
 *   - 'historical-sequence': actual annual returns starting at historicalStartYear, wrapping if needed
 *
 * Annual steps for every mode:
 *   - bal *= (1 + annReturn)
 *   - bal += income * 12 - cost * 12 * currShock * fxMult
 *   - cost *= (1 + annInfl)
 *   - income *= (1 + incGrowth)
 */

import { HISTORICAL_RETURNS, bootstrapYear } from '../data/historical-returns';

export type ReturnMode = 'normal' | 'bootstrap' | 'regime' | 'historical-sequence';

export interface RegimeConfig {
  /** Mean/vol in the bull state (decimal fractions). */
  bullMean: number;
  bullVol: number;
  /** Mean/vol in the bear state. */
  bearMean: number;
  bearVol: number;
  /** Transition probabilities per year. */
  pBullToBear: number;
  pBearToBull: number;
}

export const DEFAULT_REGIME: RegimeConfig = {
  bullMean: 0.12,
  bullVol: 0.12,
  bearMean: -0.12,
  bearVol: 0.22,
  pBullToBear: 0.15,
  pBearToBull: 0.45,
};

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
  /** Sampling mode for returns + inflation. Default 'normal'. */
  returnMode?: ReturnMode;
  /** Regime config (only used when returnMode === 'regime'). */
  regime?: RegimeConfig;
  /** Start year for 'historical-sequence' mode. Required for that mode. */
  historicalStartYear?: number;
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

/**
 * Resolve the year-(return, inflation) pair for a single simulation step,
 * given the sampling mode. Encapsulates the mode-specific logic so the
 * core sim loop stays flat.
 */
function sampleYear(
  mode: ReturnMode,
  y: number,
  p: MonteCarloParams,
  regimeState: { inBear: boolean },
): { ret: number; inf: number } {
  switch (mode) {
    case 'bootstrap': {
      return bootstrapYear();
    }

    case 'regime': {
      const cfg = p.regime ?? DEFAULT_REGIME;
      if (regimeState.inBear) {
        if (Math.random() < cfg.pBearToBull) regimeState.inBear = false;
      } else {
        if (Math.random() < cfg.pBullToBear) regimeState.inBear = true;
      }
      const mean = regimeState.inBear ? cfg.bearMean : cfg.bullMean;
      const vol  = regimeState.inBear ? cfg.bearVol  : cfg.bullVol;
      const ret = mean + vol * normalRandom();
      const inf = Math.max(0, p.meanInflation + p.volInflation * normalRandom());
      return { ret, inf };
    }

    case 'historical-sequence': {
      const start = p.historicalStartYear ?? HISTORICAL_RETURNS[0].year;
      const startIdx = HISTORICAL_RETURNS.findIndex(r => r.year === start);
      const idx = (startIdx >= 0 ? startIdx : 0) + y;
      const row = HISTORICAL_RETURNS[idx % HISTORICAL_RETURNS.length];
      return { ret: row.sp500, inf: row.cpi };
    }

    case 'normal':
    default: {
      const ret = p.meanReturn + p.volReturn * normalRandom();
      const inf = Math.max(0, p.meanInflation + p.volInflation * normalRandom());
      return { ret, inf };
    }
  }
}

export function runMonteCarlo(p: MonteCarloParams): MonteCarloResult {
  const {
    portfolio, monthlyIncome, baseCost, isForeign, fxDrift,
    runs, years, currVol, incGrowth,
  } = p;
  const mode: ReturnMode = p.returnMode ?? 'normal';

  // Historical-sequence is deterministic per start year, so a single "run"
  // is the only meaningful output. Clamp runs to 1 to avoid identical dupes.
  const effectiveRuns = mode === 'historical-sequence' ? 1 : runs;

  const drift = fxDrift || 0;
  const results: number[] = [];
  const paths: number[][] = [];

  for (let r = 0; r < effectiveRuns; r++) {
    let bal = portfolio;
    let income = monthlyIncome;
    let cost = baseCost;
    let fxMult = 1;
    const regimeState = { inBear: false };
    const path: number[] = [bal];

    for (let y = 0; y < years; y++) {
      const { ret, inf } = sampleYear(mode, y, p, regimeState);
      const currShock = isForeign ? 1 + currVol * normalRandom() : 1;
      if (isForeign && drift) fxMult *= (1 + drift);

      bal *= (1 + ret);
      bal += income * 12 - cost * 12 * currShock * fxMult;
      cost *= (1 + inf);
      income *= (1 + incGrowth);

      path.push(bal);
    }

    results.push(bal);
    if (r < 50) paths.push(path);
  }

  results.sort((a, b) => a - b);
  const successRate = results.filter((v) => v > 0).length / effectiveRuns;

  // Percentile sampling (matches original floor-index behavior)
  const at = (q: number): number => results[Math.floor(effectiveRuns * q)] ?? 0;

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
