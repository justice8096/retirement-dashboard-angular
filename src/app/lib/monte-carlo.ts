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

/**
 * One-time discrete expense at a specific sim year — modelled as a balance
 * deduction in the year it hits. Use cases: car replacement every 7–8
 * years, new roof in year 12, grandchild college tuition in year 18, big
 * trip every 5 years, late-life nursing-home stay (LTC).
 *
 * The amount is in today's USD; the kernel multiplies by accumulated
 * inflation when `inflate` is true (default — true for almost everything
 * lumpy, since costs grow with CPI / vehicle / construction inflation),
 * skipping inflation only when the user has hedged in nominal dollars
 * (e.g., a fixed-price annuity payout, or a known nominal mortgage payoff).
 */
export interface OneTimeExpense {
  /** Sim year (0-based from start). 0 = today. */
  year: number;
  /** Amount in today's USD. Positive number; kernel deducts from balance. */
  amountUSD: number;
  /** Optional human-readable label (rendered in scenario passthrough only). */
  label?: string;
  /** Whether to inflate by accumulated inflation at the year. Default true. */
  inflate?: boolean;
}

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
   * One-time discrete expenses applied at specific sim years. Items with
   * `inflate: true` (default) scale by accumulated inflation when they hit;
   * `inflate: false` treats the amount as a nominal-dollar shock at that
   * year. Multiple expenses in the same year stack. Negative or zero
   * amounts are silently skipped. Used for lumpy realistic costs (cars,
   * roof, tuition, late-life nursing-home stay) that a recurring monthly
   * cost line can't represent.
   */
  oneTimeExpenses?: OneTimeExpense[];

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
   * Multiplier applied to the lifestyle portion of `cost` (nonHealthcareBase
   * minus tax) at the death year. Captures that fixed costs (housing,
   * utilities) don't halve but variable costs (food, transport) do. Default
   * 0.75 — the commonly-cited survivor adjustment. Does NOT apply to the
   * tax or healthcare lines — those are swapped via the survivor overrides
   * below.
   */
  survivorCostRatio?: number;

  /**
   * Monthly income-tax line for the survivor phase, computed by the caller
   * using single-filer brackets (MFJ brackets are ~2× wider, so survivor tax
   * usually goes UP even as income goes down). When set, replaces the
   * segment's `monthlyIncomeTax` in all years after `spouseDeathYear`. When
   * null, survivor tax stays at the pre-death MFJ value — an undertaxation
   * that historically made this a ~$50–200K under-projection over a 15–25
   * year survivor horizon.
   */
  survivorMonthlyIncomeTax?: number;

  /**
   * Monthly Medicare + IRMAA for the survivor — caller recomputes using
   * single-filer IRMAA thresholds (which are ~half of MFJ, so a surviving
   * spouse with unchanged MAGI can jump into a higher surcharge tier).
   * Only applied when `survivorBirthYear` indicates the survivor has
   * reached Medicare eligibility (age ≥ 65) at the current sim year.
   * For US segments before survivor age 65, the kernel falls back to the
   * single-adult ACA path. For foreign segments, this is ignored
   * entirely — `foreignHealthcareMonthly` continues to apply.
   */
  survivorMedicareMonthly?: number;

  /**
   * Birth year of the surviving spouse — used to gate
   * `survivorMedicareMonthly` on Medicare eligibility (age ≥ 65 at current
   * sim year). When unset and a survivor phase is active, the kernel
   * conservatively assumes Medicare-eligible (preserves the previous
   * behaviour of immediately swapping to survivorMedicareMonthly).
   */
  survivorBirthYear?: number;

  /**
   * One-time portfolio bump applied at `spouseDeathYear` to reflect the
   * stepped-up cost basis on jointly-held taxable accounts. Surviving
   * spouse can realize up to this dollar amount in capital gains tax-free
   * (the basis resets to fair market value at death). Caller computes as
   *   `taxableBalanceAtDeath × unrealizedGainRatio × effectiveLtcgRate`
   * and passes the resulting dollar benefit. Default 0 (no stepped-up
   * basis credit).
   */
  survivorStepUpBenefitUSD?: number;

  /**
   * Phase 3b — foreign inheritance tax hit at the spouse-death year.
   * Indexed by sim year (0..years-1). Each entry describes the active
   * location's spouse-effective tax rate and USD-baseline exemption.
   *
   * Caller (MonteCarloRunnerService) pre-computes per year:
   *   - effectiveRate: 0 for `'full'` spouse exemption (US, France,
   *     Portugal, Ireland, etc.); `topRate` for `'none'` (Colombia);
   *     `directFamilyEffectiveRate ?? topRate` for `'partial'` (Spain,
   *     Italy, Ecuador, Greece, Malta).
   *   - exemptionUSDBaseline: `exemptionLocal × USDperLocal` at the
   *     location's seed FX rate.
   *
   * Kernel applies at deathYear:
   *   deceasedShareUSD = bal × 0.5
   *   exemptionUSD     = exemptionUSDBaseline × per-trial FX multiplier
   *   hit              = max(0, deceasedShareUSD − exemptionUSD) × rate
   *   bal             −= hit
   *
   * The 50% deceased-share assumption is a community-property
   * approximation. Per-trial FX (segment-drift × shocks × year-random)
   * means in trials where the local currency strengthens, the exemption's
   * USD value goes up — realistic for cross-border planning.
   *
   * For US locations (full marital deduction → effectiveRate 0) and zero-tax
   * countries (topRate 0 → effectiveRate 0), the hit is silently zero.
   */
  inheritanceTaxByYear?: ({ effectiveRate: number; exemptionUSDBaseline: number } | undefined)[];

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

  /**
   * Long-Term Care (LTC) self-insure mode. Each trial rolls an independent
   * Bernoulli check on `ltcProbability`; if it triggers, the simulation
   * deducts `ltcCostPerYearUSD` (today's $, inflated by cumInfl) for
   * `ltcDurationYears` consecutive years starting at a uniformly-sampled
   * age in `[ltcStartAgeMin, ltcStartAgeMax]`. Defaults reflect the US
   * Genworth Cost-of-Care 2024 medians: 70% lifetime probability of needing
   * any LTC at 65+, 2.4-year median duration, $108K/yr median nursing-home
   * private-room cost.
   *
   * Anchored on the OLDEST adult's birth year (the more likely first to need
   * LTC). Caller supplies birth year via `adultBirthYears`.
   *
   * When `ltcSelfInsureEnabled` is false, no per-trial roll happens.
   * Insurance mode (recurring premium) is captured via `ltcInsuranceMonthly`
   * below — the two modes are independent and can stack if the user wants
   * to test "insurance covers part, self-insure the rest".
   */
  ltcSelfInsureEnabled?: boolean;
  ltcProbability?: number;       // 0..1, default 0.70
  ltcCostPerYearUSD?: number;    // today's $/yr, default 108000 (US median)
  ltcDurationYears?: number;     // default 2.4 (so a Math.round() lands at 2 or 3)
  ltcStartAgeMin?: number;       // default 78
  ltcStartAgeMax?: number;       // default 88

  /**
   * Long-Term Care insurance premium — flat monthly $ deducted from balance
   * once the oldest adult reaches `ltcInsuranceStartAge`. Independent of the
   * self-insure roll; can stack. Default 0 (no insurance modelled).
   */
  ltcInsuranceMonthly?: number;
  ltcInsuranceStartAge?: number; // default 60

  /**
   * Health Savings Account (HSA) — triple-tax-advantaged medical-expense
   * fund. Tracked as a parallel accumulator to the main portfolio `bal`,
   * so qualified medical withdrawals come out tax-free (and don't tap the
   * regular balance for healthcare costs in the year). Triple-tax-advantage
   * realization in this model:
   *   - Growth: tax-free (HSA balance grows by `hsaAnnualReturnRate`,
   *     deterministic — HSAs are typically conservatively allocated; not
   *     stochastic like the main portfolio)
   *   - Withdrawals for medical: tax-free (deducted from healthcare line of
   *     `cost`, never run through the tax pipeline)
   *   - Contributions: pre-tax (modeled via `hsaAnnualContribution` while
   *     within the window — typical retiree case is 0 since you can't
   *     contribute without earned income + HDHP coverage)
   *
   * When `hsaInitialBalance` is unset or 0 AND no contributions, behavior
   * is identical to pre-#33 (no HSA path executes).
   */
  hsaInitialBalance?: number;
  /** Deterministic annual return rate on HSA balance (decimal, e.g. 0.04). Default 0.04. */
  hsaAnnualReturnRate?: number;
  /** Annual HSA contribution while within the contribution window (USD/year). Default 0. */
  hsaAnnualContribution?: number;
  /**
   * Sim year at which HSA contributions stop (exclusive — year
   * `hsaContributionEndYear` is the first year at $0). Mirrors the
   * `partTimeEndYear` pattern. When unset or ≤ 0, contributions are
   * ignored entirely (typical for retirees with no earned income).
   */
  hsaContributionEndYear?: number;

  /**
   * FX stress test — a one-time abrupt currency move at `fxShockYear`.
   * Distinct from `fxDrift` (ongoing per-year drift) and `currVol` (annual
   * random shock per year). This shock is deterministic: if you set
   * +0.10, the USD weakens 10% in a single year against the local
   * currency, raising all foreign-cost-of-living deductions by ~10%
   * thereafter. Negative values represent USD strengthening.
   *
   * The shock fires at `fxShockYear` regardless of which segment is active
   * (a USD repricing happens whether or not the user is abroad that year)
   * and persists across subsequent moves — only its application to cost is
   * gated on `curIsForeign`. Useful for asking "what if EUR/USD goes from
   * 0.93 to 1.05 in a recession?"
   *
   * Default: no shock applied.
   */
  fxShockYear?: number;
  fxShockPct?: number; // decimal, e.g. 0.10 for +10% USD-weakens / cost-rises
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
 *   - Otherwise fall back to the flat `baseCost` (healthcare component
 *     unknown, returned as 0).
 *
 * Returns `{ total, healthcare }` so the kernel can run an HSA draw against
 * the healthcare portion before deducting `total` from the balance. The
 * kernel multiplies both fields by `cumInfl` at use time.
 */
interface SegmentCost {
  /** Lumped monthly cost: nonHC * lifestyleRatio + tax + healthcare. */
  total: number;
  /** Healthcare-only monthly portion (subset of total). 0 when unknown. */
  healthcare: number;
}

function segmentCostAtYear(m: LocationMove, y: number, p: MonteCarloParams, survivorPhase = false): SegmentCost {
  if (m.nonHealthcareBase == null) return { total: m.baseCost, healthcare: 0 };
  // Survivor-phase overrides: single-filer tax, single-IRMAA Medicare, and a
  // ratio applied to the non-tax / non-healthcare lifestyle portion.
  const lifestyleRatio = survivorPhase ? (p.survivorCostRatio ?? 0.75) : 1;
  const tax = survivorPhase && p.survivorMonthlyIncomeTax != null
    ? p.survivorMonthlyIncomeTax
    : (m.monthlyIncomeTax ?? 0);
  let healthcare = 0;

  // Survivor Medicare swap is only valid when (a) US segment AND (b) survivor
  // is Medicare-eligible (age ≥ 65 at the current sim year). The caller's
  // single-filer IRMAA computation is US-specific — applying it to a
  // foreign segment, or applying it before age 65, materially distorts cost.
  const calYear = (p.simStartYear ?? new Date().getFullYear()) + y;
  const survivorMedicareEligible = survivorPhase
    && p.survivorMedicareMonthly != null
    && m.isUS
    && (p.survivorBirthYear == null || (calYear - p.survivorBirthYear) >= 65);

  if (m.isUS) {
    const adults = p.adultBirthYears ?? [];
    const nAdults = Math.max(1, adults.length || 2);
    if (survivorMedicareEligible) {
      // Survivor phase + age 65+ + US: use the IRMAA-adjusted single-filer
      // premium from the caller (pre-computed for 1 adult, so use as-is).
      healthcare = p.survivorMedicareMonthly!;
    } else if (!adults.length) {
      // Unknown ages → assume all Medicare-eligible (conservative lower bound).
      healthcare = m.medicareMonthly ?? 0;
    } else {
      // Standard age-aware mix. In survivor phase but pre-65, this still runs
      // and naturally treats the survivor as 1 adult on ACA — except
      // adultBirthYears still includes the deceased spouse, which over-counts
      // adults for the post-death years. Effect is small (ACA per-adult halved
      // when survivor's pre-65 share gets calculated against nAdults=2) but
      // worth noting as a future refinement: drop the deceased birth year
      // from `adults` once survivorPhase is true.
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
    // Foreign segment: survivor Medicare swap does NOT apply — that's a
    // US-specific IRMAA calc, not a foreign-healthcare equivalent. Keep the
    // foreign healthcare baseline (caller may scale it down if desired by
    // adjusting `foreignHealthcareMonthly` directly per segment, or via the
    // lifestyle ratio on `nonHealthcareBase` — but not here).
    healthcare = m.foreignHealthcareMonthly ?? 0;
  }

  // Lifestyle ratio scales the non-tax / non-healthcare portion only —
  // housing, food, transport, utilities. Tax + healthcare are already
  // swapped to their survivor values above; scaling them again would
  // double-count the reduction.
  return {
    total: m.nonHealthcareBase * lifestyleRatio + tax + healthcare,
    healthcare,
  };
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

  // One-time expenses indexed by year for O(1) lookup. Multiple expenses
  // in the same year stack via array. Skipped silently when amount <= 0.
  const expensesByYear = new Map<number, OneTimeExpense[]>();
  for (const e of (p.oneTimeExpenses ?? [])) {
    if (!e || !(e.amountUSD > 0) || e.year < 0 || e.year >= years) continue;
    const list = expensesByYear.get(e.year) ?? [];
    list.push(e);
    expensesByYear.set(e.year, list);
  }

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

  // HSA setup (#33 item 3). Active iff hsaInitialBalance > 0 OR contributions
  // are configured. When inactive, the per-year HSA path is a no-op — the
  // hsaBal accumulator stays at 0, the draw is 0, and `cost` is deducted in
  // full from the regular balance exactly as before.
  const hsaInitial = Math.max(0, p.hsaInitialBalance ?? 0);
  const hsaReturn = p.hsaAnnualReturnRate ?? 0.04;
  const hsaContribution = Math.max(0, p.hsaAnnualContribution ?? 0);
  const hsaContribEndYear = Math.max(0, p.hsaContributionEndYear ?? 0);
  const hsaActive = hsaInitial > 0 || hsaContribution > 0;

  // LTC self-insure setup. Anchor on the OLDEST adult — most likely first
  // to need LTC. simStartYear + sim-year y === calendar year; LTC start
  // year (in sim-year terms) = max(0, ltcStartAge - oldestAdultAge0).
  const ltcSelfInsure = !!p.ltcSelfInsureEnabled;
  const ltcProbability = Math.min(1, Math.max(0, p.ltcProbability ?? 0.70));
  const ltcCostUSD = Math.max(0, p.ltcCostPerYearUSD ?? 108000);
  const ltcDurationY = Math.max(0.1, p.ltcDurationYears ?? 2.4);
  const ltcStartAgeMin = Math.max(50, p.ltcStartAgeMin ?? 78);
  const ltcStartAgeMax = Math.max(ltcStartAgeMin, p.ltcStartAgeMax ?? 88);
  const ltcInsMonthly = Math.max(0, p.ltcInsuranceMonthly ?? 0);
  const ltcInsStartAge = Math.max(0, p.ltcInsuranceStartAge ?? 60);
  const calStart = p.simStartYear ?? new Date().getFullYear();
  const oldestBirthYear = (p.adultBirthYears && p.adultBirthYears.length)
    ? Math.min(...p.adultBirthYears)
    : null;
  const oldestAge0 = oldestBirthYear != null ? (calStart - oldestBirthYear) : null;
  // Single-run modes (historical-sequence) can't average across trials, so a
  // per-trial coin flip would make identical inputs flip between "LTC happened"
  // / "didn't" — unstable success rate and percentiles. In those modes we
  // switch to an expected-value LTC: always-on at the midpoint start age,
  // scaled by ltcProbability. Cross-trial average of the random mode equals
  // the per-year EV deduction, so this preserves intent without the noise.
  const ltcUseExpectedValue = effectiveRuns === 1;

  for (let r = 0; r < effectiveRuns; r++) {
    let bal = portfolio;
    // Parallel HSA accumulator. Stays at 0 when HSA is inactive; otherwise
    // grows deterministically by `hsaReturn` and is drawn against annual
    // healthcare cost each year (#33 item 3).
    let hsaBal = hsaInitial;
    let income = monthlyIncome;
    // Part-time income tracked separately so it can cliff to zero at
    // `partTimeEndYear` without disturbing the base income (SS + pension)
    // stream. Inflates at the same `incGrowth` rate as income.
    let partTime = partTimeBase;
    // Initial cost uses the segment-aware calc if the breakdown is present,
    // otherwise the legacy flat `baseCost`. `costHealthcare` tracks the
    // healthcare-only portion of `cost` in parallel — used for HSA draw
    // each year (#33 item 3).
    let { total: cost, healthcare: costHealthcare } = segmentCostAtYear(initial, 0, p, false);
    let curIsForeign = initial.isForeign;
    let curDrift = initial.fxDrift ?? drift;
    let fxMult = 1;
    // Durable across moves: a one-time FX shock is a global USD repricing
    // and survives segment changes, unlike per-segment drift in fxMult.
    // Only applied to cost when in a foreign segment.
    let fxShockMult = 1;
    let cumInfl = 1; // accumulated inflation from year 0 — used to re-baseline cost on moves
    let survivorPhase = false;
    const regimeState = { inBear: false };
    const path: number[] = [bal];

    // Per-trial LTC roll. Resolves once at trial start; deterministic across
    // years within the trial. willNeedLtc: 70% of 65+ Americans by Genworth.
    //
    // Single-run modes (historical-sequence, effectiveRuns === 1) can't
    // average across trials, so a per-trial coin flip would make identical
    // inputs flip between "LTC happened" / "LTC didn't" — unstable result.
    // Switch to expected-value mode: per-year occupancy weighted by the
    // start-age distribution. ltcStartSimYear/ltcEndSimYear are not used
    // in EV mode — see ltcEvWeightForYear inside the year loop.
    let ltcStartSimYear = -1;
    let ltcEndSimYear = -1;
    if (ltcSelfInsure && oldestAge0 != null && !ltcUseExpectedValue
        && Math.random() < ltcProbability) {
      const ltcStartAge = ltcStartAgeMin + Math.random() * (ltcStartAgeMax - ltcStartAgeMin);
      ltcStartSimYear = Math.max(0, Math.floor(ltcStartAge - oldestAge0));
      ltcEndSimYear = ltcStartSimYear + Math.max(1, Math.round(ltcDurationY));
    }

    for (let y = 0; y < years; y++) {
      const moveThisYear = y > 0 && movesByYear.has(y);
      const ageTransition = ageTransitionAtYear(y, p);

      // Location swap at the start of the year: new cost = new baseCost
      // scaled by accumulated inflation so we move to "$X in today's dollars".
      // FX resets (new currency baseline). Optional one-time move cost.
      if (moveThisYear) {
        const m = movesByYear.get(y)!;
        const sc = segmentCostAtYear(m, y, p, survivorPhase);
        cost = sc.total * cumInfl;
        costHealthcare = sc.healthcare * cumInfl;
        curIsForeign = m.isForeign;
        curDrift = m.fxDrift ?? curDrift;
        fxMult = 1;
        if (m.moveCostUSD) bal -= m.moveCostUSD;
      } else if (ageTransition) {
        // Medicare crossover or any age-65 transition in a US segment —
        // recompute the segment's cost without resetting FX.
        const active = activeSegmentAt(y);
        const sc = segmentCostAtYear(active, y, p, survivorPhase);
        cost = sc.total * cumInfl;
        costHealthcare = sc.healthcare * cumInfl;
      }

      // Spouse-death transition: income steps down, cost recomputed with
      // survivor overrides (single-filer tax, single-IRMAA Medicare,
      // lifestyle ratio on the remainder), and a one-time stepped-up-basis
      // bump on the taxable portion of the portfolio.
      if (!survivorPhase && deathYear != null && y === deathYear) {
        survivorPhase = true;
        if (survivorIncome != null) income = survivorIncome;
        const active = activeSegmentAt(y);
        // Back out cumulative inflation so segmentCostAtYear gets today's $,
        // then re-inflate for the sim's current-year dollars.
        const sc = segmentCostAtYear(active, y, p, true);
        cost = sc.total * cumInfl;
        costHealthcare = sc.healthcare * cumInfl;
        if (p.survivorStepUpBenefitUSD && p.survivorStepUpBenefitUSD > 0) {
          bal += p.survivorStepUpBenefitUSD;
        }
      }

      const { ret, inf } = sampleYear(mode, y, p, regimeState);
      const currShock = curIsForeign ? 1 + currVol * normalRandom() : 1;
      if (curIsForeign && curDrift) fxMult *= (1 + curDrift);
      // FX stress test: deterministic one-time shock at fxShockYear. Fires
      // regardless of current segment (a USD repricing happens whether or not
      // the user is abroad that year), but its multiplier is only applied to
      // cost when in a foreign segment — see the cost-deduction line below.
      if (p.fxShockYear != null && y === p.fxShockYear && p.fxShockPct) {
        fxShockMult *= (1 + p.fxShockPct);
      }

      // Phase 3b — spouse-death inheritance tax. One-time hit at the death
      // year, applied AFTER the FX state is settled for year y so the
      // exemption-in-USD reflects per-trial FX volatility (segment-drift ×
      // accumulated shocks × current-year random shock). Skipped silently
      // when the active location has spouseExemption='full' or topRate=0
      // (effectiveRate=0 — caller pre-flattened that logic).
      if (deathYear != null && y === deathYear) {
        const inhEntry = p.inheritanceTaxByYear?.[y];
        if (inhEntry && inhEntry.effectiveRate > 0) {
          const effectiveFx = curIsForeign ? currShock * fxMult * fxShockMult : 1;
          const exemptionUSD = inhEntry.exemptionUSDBaseline * effectiveFx;
          const deceasedShareUSD = bal * 0.5;
          const taxableUSD = Math.max(0, deceasedShareUSD - exemptionUSD);
          bal -= taxableUSD * inhEntry.effectiveRate;
        }
      }

      // Part-time income stops at `partTimeEndYear` (exclusive — year == end is zero).
      const activePartTime = (partTimeEndYear > 0 && y < partTimeEndYear) ? partTime : 0;

      bal *= (1 + ret);
      const effectiveFxShock = curIsForeign ? fxShockMult : 1;
      const costShockMult = currShock * fxMult * effectiveFxShock;

      // HSA logic (#33 item 3) — runs only when HSA is active. Order:
      //   1. Apply deterministic growth to existing balance.
      //   2. Add the year's contribution (within the contribution window).
      //   3. Compute the year's annual healthcare cost with same shocks
      //      that scale total cost (FX, currVol, fxShock).
      //   4. Draw min(hsaBal, healthcareAnnual), clamped at 0 — tax-free
      //      withdrawal cannot be negative, even when costShockMult goes
      //      below 0 in degenerate trials. (Codex P2 on PR #92.)
      //   5. Reduce the regular cost deduction by the HSA draw.
      // When inactive, hsaDraw stays at 0 and the equation matches pre-#33.
      //
      // Why the Math.max floor: `costShockMult = currShock * fxMult *
      // effectiveFxShock` where `currShock = 1 + currVol * normalRandom()`
      // is unbounded below 0 in foreign segments. With high `currVol`
      // (e.g. 50%), a -2σ Gaussian draw makes currShock < 0, flipping
      // healthcareAnnual negative. Without the clamp, hsaDraw would also
      // go negative, then `hsaBal -= hsaDraw` would ADD to HSA and
      // `bal += hsaDraw` would SUBTRACT from portfolio — the opposite
      // of "withdraw up to healthcare cost." Floor at 0 to match the
      // documented "tax-free withdrawal" semantics in either edge case.
      let hsaDraw = 0;
      if (hsaActive) {
        hsaBal *= (1 + hsaReturn);
        if (hsaContribEndYear > 0 && y < hsaContribEndYear) {
          hsaBal += hsaContribution;
        }
        const healthcareAnnual = Math.max(0, costHealthcare * 12 * costShockMult);
        hsaDraw = Math.min(hsaBal, healthcareAnnual);
        hsaBal -= hsaDraw;
      }
      bal += (income + activePartTime) * 12 - cost * 12 * costShockMult + hsaDraw;

      // One-time expenses for this year — stacked deductions, scaled by
      // accumulated inflation by default (lumpy real-world costs grow with CPI).
      const lumpsThisYear = expensesByYear.get(y);
      if (lumpsThisYear) {
        for (const e of lumpsThisYear) {
          const inflated = (e.inflate ?? true) ? e.amountUSD * cumInfl : e.amountUSD;
          bal -= inflated;
        }
      }

      // Long-Term Care deductions (independent of one-time expenses; see #21).
      // Self-insure: per-trial probabilistic LTC stay. Insurance: flat
      // monthly premium once the oldest adult crosses ltcInsuranceStartAge.
      if (ltcSelfInsure && oldestAge0 != null) {
        if (ltcUseExpectedValue) {
          // Spread the EV across the start-age distribution, not the midpoint.
          // Random mode: ltcStartSimYear = floor(start - oldestAge0), window
          // covers sim years [start_y, start_y + dur). So sim year y is in
          // some trial's window iff start ∈ [oldestAge0 + y - dur + 1,
          // oldestAge0 + y + 1). Intersect with the user's [min, max] start
          // range and divide by the range to get P(year y in window | LTC),
          // then multiply by ltcProbability for the unconditional weight.
          // Sum of occupancy across years equals `dur`, so total EV cost
          // equals ltcProbability × cost × dur — matching random mode's
          // cross-trial expectation.
          const dur = Math.max(1, Math.round(ltcDurationY));
          const startRange = ltcStartAgeMax - ltcStartAgeMin;
          let occupancy: number;
          if (startRange <= 0) {
            // Degenerate uniform (min === max): fixed start age.
            const startSimYear = Math.max(0, Math.floor(ltcStartAgeMin - oldestAge0));
            occupancy = (y >= startSimYear && y < startSimYear + dur) ? 1 : 0;
          } else {
            const lowerStart = Math.max(ltcStartAgeMin, oldestAge0 + y - dur + 1);
            const upperStart = Math.min(ltcStartAgeMax, oldestAge0 + y + 1);
            occupancy = Math.max(0, upperStart - lowerStart) / startRange;
          }
          if (occupancy > 0) {
            bal -= ltcCostUSD * cumInfl * ltcProbability * occupancy;
          }
        } else if (y >= ltcStartSimYear && y < ltcEndSimYear && ltcStartSimYear >= 0) {
          // Random mode: per-trial roll already gated whether this trial sees
          // LTC at all; deduct the full cost in each year of the window.
          bal -= ltcCostUSD * cumInfl;
        }
      }
      if (ltcInsMonthly > 0 && oldestAge0 != null && (oldestAge0 + y) >= ltcInsStartAge) {
        bal -= ltcInsMonthly * 12 * cumInfl;
      }

      cost *= (1 + inf);
      costHealthcare *= (1 + inf);
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

/**
 * Per-category inflation breakdown for a location's monthlyCosts. Same
 * weighting math as `weightedInflationFromLocation` but returns the full
 * structure so a UI panel (#25) can show *which* categories drive the
 * average.
 *
 * Categories are sorted by `weight` descending, so the heaviest cost
 * lines (rent, healthcare, groceries) appear first. The `weight` field
 * is the share of each category in the total monthly spend (0..1); the
 * `contribution` field is `weight * annualInflation` — the share each
 * category contributes to the weighted average. The sum of all
 * `contribution` values equals `weightedAverage`.
 *
 * Falls back to an empty `categories` array + 0.025 weighted average
 * when no data is present, matching `weightedInflationFromLocation`'s
 * default behavior.
 */
export interface InflationCategoryContribution {
  /** Category key from the location's monthlyCosts (e.g. 'rent', 'healthcare'). */
  key: string;
  /** Monthly cost in local currency (typical value from the seed data). */
  typical: number;
  /** Annual inflation rate as a decimal fraction (0.045 = 4.5%/year). */
  annualInflation: number;
  /** Share of total monthly spend (0..1). Higher = heavier weight in the average. */
  weight: number;
  /** Contribution to weighted average = weight × annualInflation. */
  contribution: number;
}

export interface InflationBreakdown {
  categories: InflationCategoryContribution[];
  /** Weighted-average annual inflation, sum of all `contribution` values. */
  weightedAverage: number;
  /** Total monthly spend across all categories (denominator of `weight`). */
  totalMonthly: number;
}

export function inflationBreakdownFromLocation(
  monthlyCosts: Record<string, { typical?: number; annualInflation?: number }> | null | undefined,
): InflationBreakdown {
  if (!monthlyCosts) return { categories: [], weightedAverage: 0.025, totalMonthly: 0 };
  const entries = Object.entries(monthlyCosts);
  const totalMonthly = entries.reduce((s, [, c]) => s + (c?.typical ?? 0), 0);
  if (totalMonthly <= 0) return { categories: [], weightedAverage: 0.025, totalMonthly: 0 };

  const categories: InflationCategoryContribution[] = entries
    .filter(([, c]) => (c?.typical ?? 0) > 0)
    .map(([key, c]) => {
      const typical = c?.typical ?? 0;
      const annualInflation = c?.annualInflation ?? 0.025;
      const weight = typical / totalMonthly;
      return {
        key,
        typical,
        annualInflation,
        weight,
        contribution: weight * annualInflation,
      };
    })
    .sort((a, b) => b.weight - a.weight);

  const weightedAverage = categories.reduce((s, c) => s + c.contribution, 0);
  return { categories, weightedAverage, totalMonthly };
}
