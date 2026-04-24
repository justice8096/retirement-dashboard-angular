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

export interface LocationMove {
  /** Year from simulation start when this segment begins (0 = start). */
  fromYear: number;
  /** Baseline monthly cost of living at this location, in today's USD. */
  baseCost: number;
  /** Whether this location's currency is not USD. */
  isForeign: boolean;
  /** One-time move cost deducted from balance at `fromYear` (USD). */
  moveCostUSD?: number;
  /** Optional FX drift override for this segment (per-year, decimal). */
  fxDrift?: number;
  /** Optional label (for logging / future path annotations). */
  label?: string;

  // ── Richer breakdown for age-aware healthcare + income-tax swap ──
  // When all four optional fields below are supplied, the kernel computes
  // cost per year as:
  //   nonHealthcareBase + incomeTax + healthcare(year, ages, magi)
  // Otherwise falls back to `baseCost` as-is.
  /** Sum of monthlyCosts in today's $ EXCLUDING healthcare + taxes categories. */
  nonHealthcareBase?: number;
  /** Monthly income tax (today's $) — e.g. from bracket-based computation on MAGI. */
  monthlyIncomeTax?: number;
  /** US location: Medicare baseline monthly for the whole household. */
  medicareMonthly?: number;
  /** US location: unsubsidized ACA silver benchmark monthly for the whole household. */
  acaUnsubsidizedMonthly?: number;
  /** US location: ACA premium cap as fraction of MAGI (e.g. 0.085 = 8.5%). */
  acaSubsidyCapPct?: number;
  /** Foreign location: monthly healthcare from stored data (public system or local private). */
  foreignHealthcareMonthly?: number;
  /** True if this is a US location — drives Medicare eligibility. */
  isUS?: boolean;
}

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

  /**
   * Birth years of non-dependent adults — used to determine Medicare
   * eligibility per sim year (age ≥ 65). When absent, segments fall back to
   * their ACA baseline regardless of year.
   */
  adultBirthYears?: number[];
  /** Calendar year at sim start (y=0). Defaults to current year. */
  simStartYear?: number;
  /** MAGI for ACA subsidy calc. Held constant across the sim (v1 simplification). */
  magiAnnual?: number;
  /**
   * Transition-year MAGI override — applied in sim year 0 only. Captures the
   * spike from mid-year retirement W-2 / severance / final bonuses / year-of
   * RMDs that push MAGI above what it'll be in steady state. Year 1+ uses
   * `magiAnnual`.
   */
  transitionMagiAnnual?: number;
  /**
   * ACA subsidy regime: 'cliff' (2026 reality per Rev Proc 2025-25, sliding 2.10–9.96%
   * with hard 400% FPL cliff) or 'enhanced' (flat 8.5% of MAGI cap, no cliff).
   * Default 'enhanced' for backward compatibility with existing callers.
   */
  subsidyRegime?: 'cliff' | 'enhanced';

  /**
   * Multi-location schedule. Each entry sets a new cost-of-living baseline at
   * `fromYear` and optionally deducts a one-time move cost. When unset, the
   * sim uses the single-location `baseCost` / `isForeign` / `fxDrift` params.
   *
   * Inflation is preserved across moves: the kernel tracks accumulated
   * inflation (`cumInfl`) and applies it to each segment's baseCost on swap,
   * so you move to "$X in today's dollars" regardless of when the move happens.
   */
  moveSchedule?: LocationMove[];

  /**
   * Deterministic spouse-death scenario. When set, at year `spouseDeathYear`
   * the sim switches to survivor parameters:
   *   - income drops to `survivorMonthlyIncome` (typically max PIA × 12)
   *   - cost multiplies by `survivorCostRatio` (default 0.75)
   *
   * Probabilistic (actuarial) mortality is a future extension.
   */
  spouseDeathYear?: number;
  /** Monthly income after spouse death (SS survivor benefit + other). */
  survivorMonthlyIncome?: number;
  /**
   * Multiplier applied to `cost` at the death year. Captures that fixed costs
   * (housing, utilities) don't halve but variable costs (food, transport,
   * healthcare) do. Default 0.75 — the commonly-cited survivor adjustment.
   */
  survivorCostRatio?: number;

  /**
   * Part-time / Barista-FIRE income that runs for a bounded number of years
   * then cliffs to zero. Models the common Coast / Barista pattern where a
   * retiree works a low-stress job for 3–10 years to bridge to full SS claim
   * age. Inflates at the same `incGrowth` rate as the base `monthlyIncome`.
   *
   * Default 0: no part-time income.
   */
  partTimeMonthlyIncome?: number;

  /**
   * Sim year at which part-time income stops (exclusive — year
   * `partTimeEndYear` is the first year at $0). Common case: user plans
   * to work part-time for 5 years, sets `partTimeEndYear = 5`. When
   * unset or ≤ 0, part-time income is ignored entirely.
   */
  partTimeEndYear?: number;
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

/* ─── ACA subsidy helpers ────────────────────────────────────────────
 * Imported from the shared `lib/aca-constants` module so the Monte
 * Carlo kernel can't drift from `HealthcareService`. Rev Proc 2025-25
 * 2026 applicable-percentage values (2.10-9.96%) and HHS 2026 FPL
 * ($15,960 / $5,600) live there. */
import { fpl2026 as fplMc, applicablePctCliff2026 as applicablePctCliffMc } from './aca-constants';

/**
 * Effective monthly cost for a segment at a given sim year — in today's $.
 *   - If the segment has a richer breakdown (nonHealthcareBase + healthcare
 *     options), compute per-year healthcare based on ages + MAGI and add
 *     income tax on top.
 *   - Otherwise fall back to the flat `baseCost`.
 *
 * The kernel multiplies by `cumInfl` at use time.
 */
function segmentCostAtYear(m: LocationMove, y: number, p: MonteCarloParams): number {
  if (m.nonHealthcareBase == null) return m.baseCost;
  const tax = m.monthlyIncomeTax ?? 0;
  let healthcare = 0;

  if (m.isUS) {
    const calYear = (p.simStartYear ?? new Date().getFullYear()) + y;
    const adults = p.adultBirthYears ?? [];
    const nAdults = Math.max(1, adults.length || 2);
    if (!adults.length) {
      // Unknown ages → assume all Medicare-eligible (conservative lower bound).
      healthcare = m.medicareMonthly ?? 0;
    } else {
      const medicareCount = adults.filter(by => (calYear - by) >= 65).length;
      const acaCount = nAdults - medicareCount;
      const medicarePerAdult = (m.medicareMonthly ?? 0) / nAdults;
      const acaFullPerAdult = (m.acaUnsubsidizedMonthly ?? 0) / nAdults;
      // Year-aware MAGI: transition value in year 0, steady state thereafter.
      const magi = (y === 0 && p.transitionMagiAnnual != null)
        ? p.transitionMagiAnnual
        : (p.magiAnnual ?? 0);
      const regime = p.subsidyRegime ?? 'enhanced';

      // Annual subsidy cap — regime-dependent:
      //   enhanced: flat cap × MAGI (default 8.5%)
      //   cliff:    sliding applicable-pct by FPL bucket; null above 400% FPL
      let annualCap: number;
      if (regime === 'cliff') {
        const fplPct = magi > 0 ? (magi / fplMc(nAdults)) * 100 : 0;
        const pct = applicablePctCliffMc(fplPct);
        annualCap = pct != null ? magi * pct : Number.POSITIVE_INFINITY; // above cliff → no subsidy
      } else {
        const cap = m.acaSubsidyCapPct ?? 0.085;
        annualCap = magi * cap;
      }

      const acaPerAdult = acaCount > 0 && magi > 0 && isFinite(annualCap)
        ? Math.min(acaFullPerAdult, (annualCap / 12) / acaCount)
        : acaFullPerAdult; // above cliff (or zero MAGI) → full sticker
      healthcare = medicareCount * medicarePerAdult + acaCount * acaPerAdult;
    }
  } else {
    healthcare = m.foreignHealthcareMonthly ?? 0;
  }

  return m.nonHealthcareBase + tax + healthcare;
}

/** Whether any adult crosses 65 exactly at calendar year (simStartYear + y). */
function ageTransitionAtYear(y: number, p: MonteCarloParams): boolean {
  const adults = p.adultBirthYears;
  if (!adults?.length) return false;
  const calYear = (p.simStartYear ?? new Date().getFullYear()) + y;
  return adults.some(by => calYear === by + 65);
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

  const deathYear = p.spouseDeathYear;
  const survivorIncome = p.survivorMonthlyIncome ?? null;
  const survivorRatio = p.survivorCostRatio ?? 0.75;

  // Build move schedule indexed by year for O(1) lookup per step.
  // If no schedule is provided, synthesize a single "year 0" segment from
  // the legacy scalar baseCost / isForeign / fxDrift params.
  const schedule: LocationMove[] = p.moveSchedule?.length
    ? [...p.moveSchedule].sort((a, b) => a.fromYear - b.fromYear)
    : [{ fromYear: 0, baseCost, isForeign, fxDrift: drift }];
  const movesByYear = new Map<number, LocationMove>();
  for (const m of schedule) movesByYear.set(m.fromYear, m);
  const initial = schedule[0];

  // Per-year active-segment lookup (schedule is sorted ascending by fromYear).
  const activeSegmentAt = (y: number): LocationMove => {
    let active = schedule[0];
    for (const s of schedule) {
      if (s.fromYear <= y) active = s;
      else break;
    }
    return active;
  };

  const partTimeBase = Math.max(0, p.partTimeMonthlyIncome ?? 0);
  const partTimeEndYear = Math.max(0, p.partTimeEndYear ?? 0);

  for (let r = 0; r < effectiveRuns; r++) {
    let bal = portfolio;
    let income = monthlyIncome;
    // Part-time income tracked separately so it can cliff to zero at
    // `partTimeEndYear` without disturbing the base income (SS + pension)
    // stream. Inflates at the same `incGrowth` rate as income.
    let partTime = partTimeBase;
    // Initial cost uses the segment-aware calc if the breakdown is present,
    // otherwise the legacy flat `baseCost`.
    let cost = segmentCostAtYear(initial, 0, p);
    let curIsForeign = initial.isForeign;
    let curDrift = initial.fxDrift ?? drift;
    let fxMult = 1;
    let cumInfl = 1; // accumulated inflation from year 0 — used to re-baseline cost on moves
    let survivorPhase = false;
    const regimeState = { inBear: false };
    const path: number[] = [bal];

    for (let y = 0; y < years; y++) {
      const moveThisYear = y > 0 && movesByYear.has(y);
      const ageTransition = ageTransitionAtYear(y, p);

      // Location swap at the start of the year: new cost = new baseCost
      // scaled by accumulated inflation so we move to "$X in today's dollars".
      // FX resets (new currency baseline). Optional one-time move cost.
      if (moveThisYear) {
        const m = movesByYear.get(y)!;
        cost = segmentCostAtYear(m, y, p) * cumInfl;
        curIsForeign = m.isForeign;
        curDrift = m.fxDrift ?? curDrift;
        fxMult = 1;
        if (m.moveCostUSD) bal -= m.moveCostUSD;
      } else if (ageTransition) {
        // Medicare crossover or any age-65 transition in a US segment —
        // recompute the segment's cost without resetting FX.
        const active = activeSegmentAt(y);
        cost = segmentCostAtYear(active, y, p) * cumInfl;
      }

      // Spouse-death transition: income steps down, cost×ratio once.
      if (!survivorPhase && deathYear != null && y === deathYear) {
        survivorPhase = true;
        if (survivorIncome != null) income = survivorIncome;
        cost *= survivorRatio;
      }

      const { ret, inf } = sampleYear(mode, y, p, regimeState);
      const currShock = curIsForeign ? 1 + currVol * normalRandom() : 1;
      if (curIsForeign && curDrift) fxMult *= (1 + curDrift);

      // Part-time income stops at `partTimeEndYear` (exclusive — year == end is zero).
      const activePartTime = (partTimeEndYear > 0 && y < partTimeEndYear) ? partTime : 0;

      bal *= (1 + ret);
      bal += (income + activePartTime) * 12 - cost * 12 * currShock * fxMult;
      cost *= (1 + inf);
      cumInfl *= (1 + inf);
      income *= (1 + incGrowth);
      partTime *= (1 + incGrowth);

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
