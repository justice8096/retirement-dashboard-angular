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
import { aggregateRentalIncome, straightLineDepreciation, type RentalProperty } from './rental-income';
import { ltcgFederalTax, type LtcgFilingStatus } from './tax-sources';

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

/**
 * One-time discrete income at a specific sim year — modelled as a balance
 * addition in the year it hits. Use cases: inheritance, home-sale proceeds,
 * deferred-comp payout, lawsuit settlement, lottery, severance, late-life
 * gift to the children's children.
 *
 * Symmetric to `OneTimeExpense` (#31 priority 2): same shape, opposite sign
 * — kernel adds to balance instead of subtracting. Default `inflate: true`
 * matches `OneTimeExpense` semantics: amount is in today's USD, scaled by
 * accumulated inflation at the year it hits unless caller explicitly opts
 * out (e.g., a fixed-dollar life-insurance payout that doesn't grow with
 * CPI). Multiple incomes in the same year stack. Negative or zero amounts
 * are silently skipped, mirroring the expense filter.
 *
 * Tax treatment caveat: this is a pure balance add — does NOT flow into
 * MAGI or any tax pathway. For inheritance-of-IRA scenarios where the
 * heir owes ordinary income tax on distributions, use the (future)
 * `inheritedIRA` LifeEvent kind instead, which models the SECURE Act
 * 10-year forced drawdown with MAGI ripples to IRMAA. Use this kind only
 * for inflows that don't trigger tax (cash inheritance under the federal
 * estate-tax exemption, step-up-basis taxable-account inheritance, home
 * sale proceeds within IRC § 121 exclusion, life insurance, etc.).
 */
export interface OneTimeIncome {
  /** Sim year (0-based from start). 0 = today. */
  year: number;
  /** Amount in today's USD. Positive number; kernel adds to balance. */
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
  /**
   * Self-consistent steady-state ACA MAGI for THIS segment's location (set by
   * the runner via `decideConsistent`). The kernel uses it for the segment's
   * subsidy calc instead of the global `magiAnnual`, so a move to a cheaper /
   * pricier city reprices ACA against the moved-to location's own draw. Year 0
   * still uses `transitionMagiAnnual`. Undefined → fall back to global.
   */
  magiAnnual?: number;
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

// ─── Life Events framework (#31) ────────────────────────────────────────
//
// Discriminated union for events that perturb income, expenses, portfolio
// balance, or segment at a specific sim year. Unified timeline so adding
// a new kind is a `case` branch rather than a new top-level param + new
// kernel code path. Kernel currently reads legacy fields (moveSchedule,
// spouseDeathYear, etc.) directly; `compileLifeEvents` projects those +
// the optional `lifeEvents` input into the unified shape.

/** Bundled at `LifeEvent.spouseDeath.survivorOverrides`. Short field names
 *  inside the namespace; the existing flat `MonteCarloParams.survivor*`
 *  fields use the long-form prefix. */
export interface SurvivorOverrides {
  /** Monthly income after death (typically max PIA × 12 of surviving adult). */
  monthlyIncome?: number;
  /** Multiplier on the lifestyle portion of cost (default 0.75 elsewhere). */
  costRatio?: number;
  /** Single-filer monthly income tax (replaces MFJ tax line). */
  monthlyIncomeTax?: number;
  /** Single-IRMAA Medicare monthly (gated on age ≥ 65 elsewhere). */
  medicareMonthly?: number;
  /** Birth year of survivor — gates Medicare eligibility year-by-year. */
  birthYear?: number;
}

/** `label` (not `description`) on every variant — matches the existing
 *  `OneTimeExpense.label` field used by the runner / state / UI. */
export type LifeEvent =
  | { kind: 'move'; year: number; segment: LocationMove }
  | { kind: 'spouseDeath'; year: number; deceasedIndex?: number; survivorOverrides?: SurvivorOverrides }
  | { kind: 'stepUpBasis'; year: number; benefitUSD: number }
  | { kind: 'oneTimeExpense'; year: number; amountUSD: number; label?: string; inflate?: boolean }
  | { kind: 'oneTimeIncome'; year: number; amountUSD: number; label?: string; inflate?: boolean }
  | { kind: 'incomeChange'; year: number; monthlyDelta: number; label?: string }
  /** SECURE Act forced 10-year drawdown of an inherited traditional IRA
   *  (#31 priority 5). Each year of the drain window adds
   *  `(balanceUSD / drainOverYears) × cumInfl × (1 - effectiveTaxRate)` to
   *  the heir's portfolio balance. Concurrently, the gross per-year
   *  distribution is added to MAGI for that year, which ripples into the
   *  ACA-subsidy calculation when the heir is pre-65 (lower subsidy at
   *  higher MAGI). The post-65 IRMAA tier jump is NOT yet modeled — the
   *  kernel uses a pre-baked `m.medicareMonthly` set by the runner from
   *  the heir's baseline MAGI. To capture that effect, the runner would
   *  need to encode `medicareMonthlyByYear[]` per IRMAA tier crossing.
   *
   *  Defaults: `drainOverYears: 10` (SECURE Act mandate),
   *  `effectiveTaxRate: 0.22` (typical retiree's marginal bracket — 12%
   *  / 22% / 24% bracket midpoint). The user-facing simplification is
   *  ordinary income at a single flat rate; a future iteration could
   *  recompute single-filer brackets per year as the drain stacks on
   *  base income. */
  | { kind: 'inheritedIRA'; year: number; balanceUSD: number; drainOverYears?: number; effectiveTaxRate?: number; label?: string }
  | { kind: 'careerChange'; year: number; newMonthlyIncome: number; label?: string }
  /**
   * Sale of a rental property in `RentalProperty[]` portfolio (Todo #35).
   *
   * In year `year`, the kernel:
   *   1. Computes accumulated depreciation = `straightLineDepreciation`
   *      summed from `depreciationStartYear` through saleYear.
   *   2. adjustedBasis = depreciableBasis − accumulatedDepreciation.
   *   3. netSalePrice = salePriceUSD − sellingExpenses.
   *   4. gain = netSalePrice − adjustedBasis (signed).
   *   5. If gain > 0: Sec 1250 recapture = min(gain, accumulatedDepreciation) × 0.25;
   *      remaining gain at LTCG rates (`ltcgFederalTax`).
   *      bal += netSalePrice − recaptureTax − ltcgTax.
   *   6. If gain ≤ 0: capital loss; bal += netSalePrice (loss not yet
   *      modeled against ordinary income — out of scope v1).
   *   7. Property is auto-zeroed from rental aggregation starting
   *      saleYear (kernel pre-trial overrides `ownedThroughYear`).
   *
   * v1 simplifications: NIIT 3.8% surtax not modeled; state tax not
   * modeled; capital-loss carryforward not modeled.
   */
  | { kind: 'propertySale'; year: number; propertyId: string; salePriceUSD: number; sellingExpenses?: number; label?: string };

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
   * One-time discrete income / portfolio additions at specific sim years.
   * Symmetric to `oneTimeExpenses` (#31 priority 2): same shape, opposite
   * sign — kernel adds to balance. Use cases: inheritance, home-sale
   * proceeds, deferred-comp payout, life-insurance payout, severance.
   *
   * Tax-pathway caveat: this is a pure balance add — does NOT flow into
   * MAGI / income tax / IRMAA. For inflows that DO trigger ordinary
   * income tax (e.g. inherited traditional IRA distributions under the
   * SECURE Act 10-year drain), use a future `inheritedIRA` LifeEvent
   * instead. Use this field only for tax-free or already-taxed inflows.
   */
  oneTimeIncomes?: OneTimeIncome[];

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
   * Optional location swap that fires the year `spouseDeathYear` triggers,
   * not at a fixed `fromYear`. #31 priority 4 — "if my spouse dies, I'd
   * downsize / move closer to family / relocate to a cheaper city". The
   * supplied `LocationMove` is the new active segment (cost / FX / breakdown
   * fields), with kernel-set `fromYear = spouseDeathYear` injected at
   * dispatch time. Mutations at the death year mirror a regular move:
   *   - `cost` / `costHealthcare` recomputed from the relocate segment
   *      (with survivor flag set, since survivorPhase is true by this point)
   *   - `curIsForeign` / `curDrift` swapped to the new segment's values
   *   - `fxMult` reset to 1 (new currency baseline)
   *   - optional `moveCostUSD` deducted from balance
   * The relocation is sticky: the trial-local schedule is extended with
   * the relocate segment so subsequent age-transition cost recomputes
   * (Medicare crossover at 65) read from the relocate segment, not the
   * pre-death active segment.
   *
   * Year-based moves on `moveSchedule` whose `fromYear > spouseDeathYear`
   * still fire after the relocation, so the user can still pre-plan a
   * later move (e.g. "move at year 25 regardless of spouse status").
   * Year-based moves whose `fromYear ≤ spouseDeathYear` are unaffected.
   */
  survivorRelocate?: LocationMove;

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
   * Medicaid spend-down (Todo #21). When enabled, US-segment LTC drains
   * are clamped so portfolio balance can't drop below the asset
   * threshold — once the household has spent down to the threshold,
   * Medicaid covers the remaining nursing-home cost. Default false to
   * preserve byte-identical legacy behavior.
   *
   * v1 simplifications (documented in UI):
   *   - Federal floor only — actual state thresholds vary $2K..$15K
   *   - Home equity exemption not modeled (most states exempt up to
   *     $713K equity in primary residence; doesn't affect liquid bal)
   *   - Look-back period (5-year asset transfer rule per IRC § 1396p(c))
   *     not modeled — sim just clamps at the threshold each year
   *   - Couple vs individual threshold not modeled — caller passes
   *     the household-appropriate value
   *   - Foreign segments: Medicaid doesn't apply abroad. Drain proceeds
   *     unclamped during foreign-segment LTC years.
   */
  medicaidSpendDownEnabled?: boolean;
  medicaidAssetThresholdUSD?: number; // default 2000 (federal floor for individual)

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

  /**
   * Optional unified event list, projected via `compileLifeEvents` together
   * with the legacy fields (`moveSchedule`, `spouseDeathYear`,
   * `survivorStepUpBenefitUSD`, `oneTimeExpenses`). Caller-supplied entries
   * are NOT deduped against legacy fields — supply one or the other for a
   * given event, not both.
   */
  lifeEvents?: LifeEvent[];

  /**
   * Optional per-year override of the household-wide Medicare monthly cost.
   * Sparse array: index `y` may be `undefined`, which falls through to the
   * active segment's `m.medicareMonthly`. Set entries are used instead of
   * `m.medicareMonthly` when the active segment is US + non-survivor phase.
   *
   * Use case (#31 priority 5 follow-up): inherited-IRA SECURE Act 10-year
   * drain spikes MAGI for the drain years. Pre-65 effects ripple through
   * the ACA-subsidy branch of `segmentCostAtYear` already (via
   * `magiAugmentByYear`). Post-65 effects didn't ripple because Medicare
   * + IRMAA premium was a fixed `m.medicareMonthly` scalar. The runner
   * now pre-computes this override using the IRMAA bracket table for
   * years where MAGI is augmented past a tier boundary.
   *
   * Survivor phase bypasses this override entirely — `p.survivorMedicareMonthly`
   * is the survivor-specific single-IRMAA premium and is read directly.
   * Foreign segments don't read `m.medicareMonthly` at all, so the
   * override is naturally inert when the heir is abroad.
   */
  medicareMonthlyByYear?: (number | undefined)[];

  /**
   * Per-year household pet cost — annual USD in today's dollars, index =
   * sim year. Sparse: missing / undefined / non-positive entries deduct
   * nothing. Inflated by accumulated inflation (cumInfl) at deduction
   * time — USD baseline with NO per-trial FX, same convention as
   * ltcCostPerYearUSD and rental cash flows. Built by `buildPetCostByYear`
   * (household-costs.ts) from household pets (birth year + expected
   * lifespan) and the active location's petCare/petDaycare/petGrooming
   * monthly costs.
   *
   * IMPORTANT: when supplying this, the caller must EXCLUDE the pet cost
   * categories from segment baseCost — the curve replaces the flat
   * inclusion (otherwise pets double-count). Absent → no code path
   * executes (byte-identical legacy behavior).
   */
  petCostByYear?: number[];

  /**
   * Per-year dependent (children / adult dependents) cost — annual USD in
   * today's dollars. Purely additive: the flat baseCost never included
   * dependent-specific costs. Same sparse + cumInfl semantics as
   * petCostByYear. Built by `buildDependentCostByYear`.
   */
  dependentCostByYear?: number[];

  /**
   * Optional rental property portfolio (Todo #34, Stage 4b of #29).
   *
   * For each year in horizon the kernel pre-computes Schedule E aggregates
   * via `aggregateRentalIncome`, then in the year loop:
   *
   *   - Adds `cashFlow × cumInfl` to balance (the actual cash hitting the
   *     bank from rents net of operating expenses + mortgage interest).
   *   - Subtracts `max(0, taxableNet) × cumInfl × rentalEffectiveTaxRate`
   *     as the household's tax bill on the Schedule E line. The clamp at 0
   *     means a paper loss does NOT credit household tax — only its MAGI
   *     ripple flows through (see below). Avoids double-counting the
   *     depreciation shield against income that the segment's pre-baked
   *     monthlyIncomeTax already taxes.
   *   - Augments `magiAugmentByYear[y]` with `taxableNet × cumInfl` so
   *     ACA subsidy calc sees the correct Schedule E impact (positive
   *     pushes MAGI up; negative paper loss correctly reduces it).
   *
   * Ownership window respected: years before `ownedFromYear` or at/after
   * `ownedThroughYear` produce zero contribution. Depreciation rolls off
   * after 27.5 years per `straightLineDepreciation`.
   *
   * Empty/undefined array = no rental income (legacy callers byte-identical).
   */
  rentalProperties?: RentalProperty[];

  /**
   * Effective marginal tax rate applied to rental Schedule E taxable
   * income (decimal, e.g. 0.22 = 22%). Default 0.22. Mirrors the
   * `effectiveTaxRate` field on inheritedIRA events. Single rate is a
   * v1 simplification — actual rates step through brackets year-to-year.
   */
  rentalEffectiveTaxRate?: number;

  /**
   * Filing status for LTCG bracket lookup on propertySale events
   * (Todo #35). Defaults to 'mfj'. Single-filer households should
   * pass 'single'. Drives the `ltcgFederalTax` stacked-on-ordinary
   * computation; the ordinary-income stack is approximated as
   * `monthlyIncome × 12` of the trial.
   */
  propertySaleFilingStatus?: LtcgFilingStatus;

  /**
   * Primary-residence mortgage P+I per month, USD (Todo #28). Sticky —
   * the kernel does NOT multiply this by `cumInfl` because mortgage
   * payments are nominal (the whole point of fixed-rate mortgages, and
   * the planning lever the todo flags around payoff timing).
   *
   * Deducted each year `y < mortgageEndYear` as `mortgageMonthlyPayment × 12`.
   * 0 (or undefined) means no mortgage — dormant code path.
   *
   * Early payoff is modeled by the caller: set `mortgageEndYear` to the
   * payoff year and add a `oneTimeExpense` LifeEvent for the remaining
   * principal in that year. No new LifeEvent kind needed.
   */
  mortgageMonthlyPayment?: number;
  /** Exclusive sim-year cutoff for mortgage payments. 0 = no mortgage. */
  mortgageEndYear?: number;

  /**
   * Optional deterministic-seed RNG. When provided, all kernel-internal
   * random draws (Gaussian return/inflation samples, regime-switch coin
   * flips, currency shocks, LTC start-age + occurrence rolls) consume
   * this function instead of `Math.random`. Defaults to `Math.random`
   * for production use.
   *
   * Use `mulberry32(seed)` to construct a seeded function:
   *   const params = { ..., seededRandom: mulberry32(42) };
   *
   * Two `runMonteCarlo` calls with the same seed and otherwise-identical
   * params produce byte-identical results / paths arrays — which is
   * exactly what kernel-refactor PRs need to prove "no behavior change"
   * without relying on algebraic reduction proofs in commit bodies.
   * Pre-existing legacy callers that don't supply this field continue
   * to use Math.random and remain bit-for-bit identical to pre-PR runs.
   */
  seededRandom?: () => number;
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

function segmentCostAtYear(m: LocationMove, y: number, p: MonteCarloParams, survivorPhase = false, magiAugment = 0): SegmentCost {
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
    // Per-year IRMAA override (#31 priority 5 follow-up). When the runner
    // pre-computed `p.medicareMonthlyByYear[y]` (e.g. for an inherited-IRA
    // drain year that pushes MAGI past an IRMAA tier boundary), use that
    // value instead of the segment's flat `m.medicareMonthly`. Survivor
    // phase bypasses the override (`survivorMedicareMonthly` branch above
    // already returned), so the override only applies to non-survivor +
    // US + age-aware household paths below.
    const medicareTotal = p.medicareMonthlyByYear?.[y] ?? m.medicareMonthly ?? 0;
    if (survivorMedicareEligible) {
      // Survivor phase + age 65+ + US: use the IRMAA-adjusted single-filer
      // premium from the caller (pre-computed for 1 adult, so use as-is).
      healthcare = p.survivorMedicareMonthly!;
    } else if (!adults.length) {
      // Unknown ages → assume all Medicare-eligible (conservative lower bound).
      healthcare = medicareTotal;
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
      const medicarePerAdult = medicareTotal / nAdults;
      const acaFullPerAdult = (m.acaUnsubsidizedMonthly ?? 0) / nAdults;
      // Year-aware MAGI: transition value in year 0, steady state thereafter.
      // Plus optional caller-supplied augmentation for inherited-IRA drain
      // years (#31 priority 5) — the per-year distribution from a SECURE Act
      // 10-year drain spikes MAGI in the drain window, lowering the ACA
      // subsidy cap below.
      // Per-segment MAGI: after a move, the ACA subsidy must reflect the
      // active location's own self-consistent draw (a cheaper city needs
      // smaller withdrawals → lower MAGI → may qualify where the prior one
      // didn't). `m.magiAnnual` is set per segment by the runner; falls back
      // to the global `p.magiAnnual`. Year 0 still uses the transition spike.
      const baseMagi = (y === 0 && p.transitionMagiAnnual != null)
        ? p.transitionMagiAnnual
        : (m.magiAnnual ?? p.magiAnnual ?? 0);
      const magi = baseMagi + magiAugment;
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

/**
 * Mulberry32 seeded PRNG factory. Returns a function that produces a
 * deterministic stream of `Math.random()`-compatible values in `[0, 1)`
 * from the supplied 32-bit integer seed.
 *
 * Reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
 * Quality: passes most BigCrush statistical tests; ~2-3x faster than
 * `Math.random` in modern V8; fine for simulation use, NOT for crypto.
 *
 * Pair with `MonteCarloParams.seededRandom` to make trial trajectories
 * deterministic across runs:
 *   runMonteCarlo({ ..., seededRandom: mulberry32(42) })
 * Same seed → byte-identical `results[]` and `paths[][]`.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller transform: standard normal sample, threading a caller-supplied
 *  RNG so the same seed produces a reproducible Gaussian stream. */
function normalRandom(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
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
  rand: () => number,
): { ret: number; inf: number } {
  switch (mode) {
    case 'bootstrap': {
      return bootstrapYear(rand);
    }

    case 'regime': {
      const cfg = p.regime ?? DEFAULT_REGIME;
      if (regimeState.inBear) {
        if (rand() < cfg.pBearToBull) regimeState.inBear = false;
      } else {
        if (rand() < cfg.pBullToBear) regimeState.inBear = true;
      }
      const mean = regimeState.inBear ? cfg.bearMean : cfg.bullMean;
      const vol  = regimeState.inBear ? cfg.bearVol  : cfg.bullVol;
      const ret = mean + vol * normalRandom(rand);
      const inf = Math.max(0, p.meanInflation + p.volInflation * normalRandom(rand));
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
      const ret = p.meanReturn + p.volReturn * normalRandom(rand);
      const inf = Math.max(0, p.meanInflation + p.volInflation * normalRandom(rand));
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

  // RNG resolution. When `p.seededRandom` is unset (the default — every
  // production caller today), `rand` is `Math.random` and trial trajectories
  // are non-deterministic across runs as before. When set (test harnesses
  // and any caller wanting reproducibility), every kernel-internal random
  // draw routes through the supplied function — same seed → byte-identical
  // results / paths arrays. Pair with `mulberry32(seed)` for tests.
  const rand = p.seededRandom ?? Math.random;

  // Historical-sequence is deterministic per start year, so a single "run"
  // is the only meaningful output. Clamp runs to 1 to avoid identical dupes.
  const effectiveRuns = mode === 'historical-sequence' ? 1 : runs;

  const drift = fxDrift || 0;
  const results: number[] = [];
  const paths: number[][] = [];

  const deathYear = p.spouseDeathYear;
  const survivorIncome = p.survivorMonthlyIncome ?? null;
  const survivorRatio = p.survivorCostRatio ?? 0.75;

  // Build the segment schedule. `schedule` is still needed for trial
  // initialisation (`initial = schedule[0]`) and for `activeSegmentAt(y)`
  // — the per-year segment-cost recompute that fires on age transitions
  // and the spouse-death branch. Move *triggering* (the location swap at
  // year y) is now driven by `eventsByYear` below, so we no longer need
  // the year-keyed `movesByYear` map.
  //
  // If no schedule is provided, synthesize a single "year 0" segment from
  // the legacy scalar baseCost / isForeign / fxDrift params. `isUS` is
  // derived as the negation of `isForeign` so kernel paths that gate on
  // `m.isUS` (Medicaid spend-down, US-specific Medicare swap) work for
  // legacy callers without forcing them to provide a full LocationMove.
  const schedule: LocationMove[] = p.moveSchedule?.length
    ? [...p.moveSchedule].sort((a, b) => a.fromYear - b.fromYear)
    : [{ fromYear: 0, baseCost, isForeign, isUS: !isForeign, fxDrift: drift }];
  const initial = schedule[0];

  // Unified Life Events timeline (#31 steps 2a + 2b + 2c).
  // `compileLifeEvents` projects legacy fields (oneTimeExpenses,
  // spouseDeathYear + survivorStepUpBenefitUSD, moveSchedule) plus any
  // caller-supplied `lifeEvents` into a single year-sorted list,
  // already filtered to the kernel's [0, years) horizon. Indexed by
  // year for O(1) per-year dispatch lookup. Multiple events in the same
  // year stack via array.
  //
  // The kernel now dispatches six event kinds from this map: the four
  // legacy-projected (`move`, `spouseDeath`, `stepUpBasis`,
  // `oneTimeExpense`) plus `oneTimeIncome` (#31 priority 2 —
  // inheritance / home-sale proceeds / payouts) plus `inheritedIRA`
  // (#31 priority 5 — SECURE Act 10-year drain with pre-65 ACA-subsidy
  // MAGI ripple via `magiAugmentByYear`). The `spouseDeath` dispatcher
  // (step 2c) only triggers the survivor-phase transition; the per-year
  // survivor-specific reads of `p.survivor*` fields elsewhere
  // (segmentCostAtYear, the inheritance-tax branch) still run as
  // before, preserving byte-identity. The remaining LifeEvent kinds
  // (`careerChange`, `incomeChange`) have no kernel implementation yet
  // — caller-supplied events of those kinds pass through
  // `compileLifeEvents` into `eventsByYear` but are silently no-op'd
  // in the year loop.
  //
  // Post-65 IRMAA tier ripple (#31 priority 5 follow-up — closed): the
  // runner now pre-computes `p.medicareMonthlyByYear[]` for years where
  // the inherited-IRA drain pushes MAGI past an IRMAA tier boundary.
  // `segmentCostAtYear` reads the override (when set) instead of the
  // flat `m.medicareMonthly`, so the post-65 IRMAA jump materialises in
  // both the household-Medicare branch and the mixed-age ACA + Medicare
  // branch. Survivor phase still bypasses the override; foreign segments
  // never read `m.medicareMonthly` so the override is naturally inert
  // when the heir is abroad.
  const eventsByYear = new Map<number, LifeEvent[]>();
  // Pre-extracted inheritedIRA events for the per-year drain dispatcher
  // (#31 priority 5). Stored separately because their effect spans
  // `drainOverYears` years from the event's `year`, not just the single
  // year the event lives in eventsByYear. The trial loop iterates this
  // list every year and applies the drain when `y` is in the window.
  const inheritedIRAEvents: Extract<LifeEvent, { kind: 'inheritedIRA' }>[] = [];
  // Pre-extracted propertySale events (Todo #35). Indexed by propertyId
  // for O(1) lookup during pre-trial ownership-window override and during
  // the year-loop dispatcher.
  const propertySaleByPropertyId = new Map<string, Extract<LifeEvent, { kind: 'propertySale' }>>();
  for (const ev of compileLifeEvents(p)) {
    const list = eventsByYear.get(ev.year) ?? [];
    list.push(ev);
    eventsByYear.set(ev.year, list);
    if (ev.kind === 'inheritedIRA') inheritedIRAEvents.push(ev);
    if (ev.kind === 'propertySale') propertySaleByPropertyId.set(ev.propertyId, ev);
  }

  // Pre-compute the per-year MAGI augmentation from inherited-IRA drains
  // (#31 priority 5). Year `y`'s augment is the sum of gross per-year
  // distributions from any inheritedIRA event whose drain window covers
  // year `y`. Consumed by `segmentCostAtYear` in the ACA-subsidy branch
  // (pre-65 heirs only — post-65 IRMAA ripple is a documented limitation).
  const magiAugmentByYear: number[] = new Array(years).fill(0);
  for (const ev of inheritedIRAEvents) {
    const drainYears = Math.max(1, ev.drainOverYears ?? 10);
    const annualDistribution = ev.balanceUSD / drainYears;
    for (let dy = 0; dy < drainYears; dy++) {
      const y = ev.year + dy;
      if (y >= 0 && y < years) magiAugmentByYear[y] += annualDistribution;
    }
  }

  // Pre-compute per-year rental Schedule E aggregates (Todo #34, Stage 4b).
  // Empty/undefined rentalProperties → zeroed arrays → byte-identical to
  // legacy callers (no allocation/perf impact beyond the two arrays).
  // The taxableNet contribution feeds magiAugmentByYear here (today's $);
  // the year-loop applies cumulative inflation when reading.
  //
  // Todo #35: a propertySale event for a property auto-zeros its rental
  // income from the sale year onward — implemented by overriding the
  // property's `ownedThroughYear` to min(existing, saleYear). Per
  // `scheduleENetAnnual`, ownedThroughYear is exclusive, so simYear ===
  // saleYear is already inactive (consistent with the dispatcher firing
  // at year start before the year's rental income would have accrued).
  const rawRentalProps = p.rentalProperties ?? [];
  const rentalProps: RentalProperty[] = propertySaleByPropertyId.size
    ? rawRentalProps.map((rp) => {
        const sale = propertySaleByPropertyId.get(rp.id);
        if (!sale) return rp;
        const existingThrough = rp.ownedThroughYear ?? Number.POSITIVE_INFINITY;
        return { ...rp, ownedThroughYear: Math.min(existingThrough, sale.year) };
      })
    : rawRentalProps;
  const rentalEffTaxRate = p.rentalEffectiveTaxRate ?? 0.22;
  const propertySaleFilingStatus: LtcgFilingStatus = p.propertySaleFilingStatus ?? 'mfj';
  const rentalCashByYear: number[] = new Array(years).fill(0);
  const rentalTaxableByYear: number[] = new Array(years).fill(0);
  if (rentalProps.length) {
    for (let y = 0; y < years; y++) {
      const agg = aggregateRentalIncome(rentalProps, y);
      rentalCashByYear[y] = agg.totalCashFlow;
      rentalTaxableByYear[y] = agg.totalTaxableNet;
      // Schedule E flows directly into AGI/MAGI per IRC § 62(a)(4).
      // Negative (paper-loss years from depreciation) correctly reduces
      // ACA MAGI for the year — the same direction the user sees on
      // the Sankey diagram's tax-base reduction.
      magiAugmentByYear[y] += agg.totalTaxableNet;
    }
  }

  // Per-year active-segment lookup (input schedule is sorted ascending by
  // fromYear). Parametric on `sched` (#31 priority 4 — survivor
  // relocation): each trial may extend its own schedule when a survivor-
  // triggered relocation fires, so this function reads from the supplied
  // array rather than the outer `schedule`. Steady-state callers (no
  // relocation) pass the outer `schedule`; mid-trial callers (after a
  // relocation fires) pass the trial-local extended schedule.
  const activeSegmentAt = (y: number, sched: LocationMove[] = schedule): LocationMove => {
    let active = sched[0];
    for (const s of sched) {
      if (s.fromYear <= y) active = s;
      else break;
    }
    return active;
  };

  const partTimeBase = Math.max(0, p.partTimeMonthlyIncome ?? 0);
  const partTimeEndYear = Math.max(0, p.partTimeEndYear ?? 0);

  // Primary-residence mortgage (Todo #28). Both 0 = no mortgage, dormant
  // code path — byte-identical to legacy callers. Pre-extracted at trial
  // setup; the per-year deduction is a single `if` in the cost line below.
  const mortgageMonthlyPayment = Math.max(0, p.mortgageMonthlyPayment ?? 0);
  const mortgageEndYear = Math.max(0, p.mortgageEndYear ?? 0);

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
  // Medicaid spend-down (Todo #21). When enabled + segment.isUS, clamps
  // each LTC drain so bal can't fall below the threshold. Both fields
  // default to disabled / 2000 for byte-identical legacy when caller
  // doesn't opt in.
  const medicaidEnabled = !!p.medicaidSpendDownEnabled;
  const medicaidThreshold = Math.max(0, p.medicaidAssetThresholdUSD ?? 2000);
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
    let { total: cost, healthcare: costHealthcare } = segmentCostAtYear(initial, 0, p, false, magiAugmentByYear[0] ?? 0);
    let curIsForeign = initial.isForeign;
    let curDrift = initial.fxDrift ?? drift;
    let fxMult = 1;
    // Trial-local schedule starts as a reference to the outer `schedule`
    // and is replaced with an extended copy if a survivor-relocation
    // fires this trial (#31 priority 4). Reading via this binding keeps
    // post-relocation age-transition cost recomputes pointing at the
    // relocate segment instead of the pre-death active segment.
    let trialSchedule: LocationMove[] = schedule;
    // Survivor-relocation FX swap is deferred until AFTER the death-year
    // inheritance-tax calculation. See the spouseDeath dispatcher comment
    // for rationale (Codex P1 on PR #107). Set in the dispatcher; cleared
    // by the apply-pending-swap block after the IHT line.
    let pendingRelocateSwap: LocationMove | null = null;
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
        && rand() < ltcProbability) {
      const ltcStartAge = ltcStartAgeMin + rand() * (ltcStartAgeMax - ltcStartAgeMin);
      ltcStartSimYear = Math.max(0, Math.floor(ltcStartAge - oldestAge0));
      ltcEndSimYear = ltcStartSimYear + Math.max(1, Math.round(ltcDurationY));
    }

    for (let y = 0; y < years; y++) {
      // Hoisted from the step-2a position to the top of the year loop —
      // the move dispatch (#31 step 2b) needs to consult this map BEFORE
      // the age-transition / spouse-death branches, so all three event
      // dispatches share one O(1) Map lookup.
      const eventsThisYear = eventsByYear.get(y);

      // Inherited-IRA MAGI augmentation for this year (#31 priority 5).
      // Pre-computed at trial start; pulled here so all per-year cost
      // recomputes (move / age-transition / spouse-death branches below)
      // see the same effective MAGI. Pre-65 ACA-subsidy is the only path
      // that consumes it (post-65 IRMAA tier ripple is a documented
      // limitation — see segmentCostAtYear's medicareMonthly handling).
      const magiAugmentY = magiAugmentByYear[y] ?? 0;

      // Move dispatch (#31 step 2b). Replaces the legacy
      // `movesByYear.has(y)` lookup. The `y > 0` guard preserves legacy
      // behavior: a moveSchedule[0] entry at fromYear=0 is the trial's
      // initial location (already consumed via `initial = schedule[0]`),
      // not a move event the kernel re-applies.
      //
      // Last-write-wins on duplicates: legacy `movesByYear.set(...)`
      // overwrote duplicate-year entries, so the LAST move event for the
      // year is the one that takes effect. Iterate forward and keep
      // updating `moveEvent` so we end on the last match — byte-identical
      // to the legacy Map semantics for callers using `moveSchedule`.
      let moveEvent: { kind: 'move'; year: number; segment: LocationMove } | null = null;
      if (y > 0 && eventsThisYear) {
        for (const ev of eventsThisYear) {
          if (ev.kind === 'move') moveEvent = ev;
        }
      }
      const ageTransition = ageTransitionAtYear(y, p);

      // Location swap at the start of the year: new cost = new baseCost
      // scaled by accumulated inflation so we move to "$X in today's dollars".
      // FX resets (new currency baseline). Optional one-time move cost.
      if (moveEvent) {
        const m = moveEvent.segment;
        const sc = segmentCostAtYear(m, y, p, survivorPhase, magiAugmentY);
        cost = sc.total * cumInfl;
        costHealthcare = sc.healthcare * cumInfl;
        curIsForeign = m.isForeign;
        curDrift = m.fxDrift ?? curDrift;
        fxMult = 1;
        if (m.moveCostUSD) bal -= m.moveCostUSD;
      } else if (ageTransition) {
        // Medicare crossover or any age-65 transition in a US segment —
        // recompute the segment's cost without resetting FX. Reads from
        // `trialSchedule` so a post-spouseDeath survivor-relocation
        // (#31 priority 4) sticks across the transition.
        const active = activeSegmentAt(y, trialSchedule);
        const sc = segmentCostAtYear(active, y, p, survivorPhase, magiAugmentY);
        cost = sc.total * cumInfl;
        costHealthcare = sc.healthcare * cumInfl;
      }

      // Spouse-death dispatch (#31 step 2c). Replaces the legacy
      // `if (deathYear === y)` trigger with a scan of `eventsThisYear`
      // for a `spouseDeath` event. Mutations are unchanged: flip
      // `survivorPhase`, swap `income` to the survivor income, and
      // recompute `cost` / `costHealthcare` for the active segment with
      // the survivor flag set (which routes segmentCostAtYear through
      // the survivor-tax / survivor-Medicare / lifestyle-ratio paths
      // already plumbed at lines 469–502).
      //
      // The `!survivorPhase` guard is preserved verbatim — single-shot
      // transition, idempotent if multiple spouseDeath events somehow
      // land in the same year. Position in loop is unchanged: AFTER
      // move + age-transition cost recompute, BEFORE early-pass
      // stepUpBasis dispatch (so the basis bump still rides on top of
      // the post-survivor cost).
      //
      // The kernel still consumes survivor parameters via direct reads
      // of `p.survivor*` fields elsewhere (segmentCostAtYear, the
      // inheritance-tax branch below). The event's `survivorOverrides`
      // payload exists in the type for future work but is intentionally
      // not read here — applying it would change kernel behavior, which
      // step 2c explicitly avoids to preserve byte-identity for legacy
      // callers. A future pass could overlay `survivorOverrides` onto
      // `p` at dispatch time so the rest of the kernel sees it.
      //
      // NOTE: stepped-up basis bump previously lived in this branch as
      // an inline `bal += p.survivorStepUpBenefitUSD`. Moved to the
      // early-pass dispatcher below in step 2a (driven by `stepUpBasis`
      // events emitted by `compileLifeEvents` whenever spouseDeathYear
      // is set + survivorStepUpBenefitUSD > 0).
      let spouseDeathThisYear = false;
      if (eventsThisYear) {
        for (const ev of eventsThisYear) {
          if (ev.kind === 'spouseDeath') {
            spouseDeathThisYear = true;
            break;
          }
        }
      }
      if (!survivorPhase && spouseDeathThisYear) {
        survivorPhase = true;
        if (survivorIncome != null) income = survivorIncome;

        // Survivor relocation (#31 priority 4) — if the caller supplied
        // `p.survivorRelocate`, treat the death year as a location swap
        // to that segment (mirror of regular move dispatch). Extends
        // the trial-local schedule with the relocate segment so future
        // age-transition recomputes read from it.
        //
        // Stickiness: the relocate segment is appended to `trialSchedule`
        // with `fromYear = y`, sorted ascending. Year-based moves on
        // `moveSchedule` whose `fromYear > y` still fire later (the user
        // can pre-plan a post-survivor-relocation move). Year-based moves
        // whose `fromYear ≤ y` are unaffected — they already executed.
        if (p.survivorRelocate) {
          const relocate: LocationMove = { ...p.survivorRelocate, fromYear: y };
          trialSchedule = [...trialSchedule, relocate]
            .sort((a, b) => a.fromYear - b.fromYear);
          const sc = segmentCostAtYear(relocate, y, p, true, magiAugmentY);
          cost = sc.total * cumInfl;
          costHealthcare = sc.healthcare * cumInfl;
          // Defer the FX-state swap until AFTER the death-year inheritance-tax
          // calculation. Codex P1 on PR #107: the runner pre-bakes
          // `inheritanceTaxByYear[y]` from the regular move schedule (the
          // deceased's domicile at death), so swapping FX state here would
          // mis-denominate the exemption when the survivor relocates to a
          // different currency on the death year. Pinning the swap until
          // after IHT keeps `curIsForeign / fxMult / curDrift / fxShockMult`
          // and the year-y `currShock` sample on the pre-relocation segment
          // for the IHT line, matching the runner's pre-baked entry.
          //
          // The post-IHT swap restores byte-identity for non-deathYear
          // relocate scenarios (none today — survivor relocate fires only
          // on deathYear by construction), and for the rest of year y the
          // cost-deduction sees the post-relo segment via `cost` /
          // `costHealthcare` (already recomputed above) plus the new FX
          // state. There is a small year-y artifact in `costShockMult`
          // because `currShock` was sampled with pre-relocation
          // `curIsForeign` — the deceased's currency volatility
          // momentarily scales survivor's USD cost. Centered on 1 with
          // O(currVol) variance; one-year noise. Tolerable in exchange
          // for the much larger IHT correctness fix.
          pendingRelocateSwap = relocate;
          if (relocate.moveCostUSD) bal -= relocate.moveCostUSD;
        } else {
          // No relocation — recompute cost on the pre-death active
          // segment with the survivor flag. Same as legacy spouseDeath.
          const active = activeSegmentAt(y, trialSchedule);
          // Back out cumulative inflation so segmentCostAtYear gets today's $,
          // then re-inflate for the sim's current-year dollars.
          const sc = segmentCostAtYear(active, y, p, true, magiAugmentY);
          cost = sc.total * cumInfl;
          costHealthcare = sc.healthcare * cumInfl;
        }
      }

      // Early-pass dispatch (#31 steps 2a + 2b + 2c) — handles event
      // kinds whose effect is a simple balance mutation BEFORE the
      // year's random return / inflation sampling. Currently only
      // `stepUpBasis`.
      //
      // `move` events are consumed by the move-dispatch block at the
      // top of the year loop (#31 step 2b). `spouseDeath` events are
      // consumed by the spouse-death-dispatch block above (#31 step 2c).
      // `oneTimeIncome` events are consumed by the late-pass dispatch
      // below (#31 priority 2). `inheritedIRA` events are consumed by
      // the inheritedIRA-drain loop below the late-pass dispatch (#31
      // priority 5) — they iterate the pre-extracted `inheritedIRAEvents`
      // list because their effect spans multiple years. The remaining
      // new kinds (`careerChange`, `incomeChange`) live in this map but
      // have no kernel implementation yet.
      //
      // Reuses `eventsThisYear` already looked up at the top of the loop.
      if (eventsThisYear) {
        for (const ev of eventsThisYear) {
          if (ev.kind === 'stepUpBasis') {
            bal += ev.benefitUSD;
          }
        }
      }

      const { ret, inf } = sampleYear(mode, y, p, regimeState, rand);
      const currShock = curIsForeign ? 1 + currVol * normalRandom(rand) : 1;
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

      // Apply the survivor-relocation FX swap deferred from the spouseDeath
      // dispatcher (Codex P1 on PR #107). The IHT block above has already
      // consumed the pre-relocation FX state for the deceased's exemption
      // denomination; from this point onward in year y (cost-deduction,
      // late-pass events, HSA, mortgage), the survivor's destination
      // segment governs FX behavior — matching regular-move semantics.
      if (pendingRelocateSwap) {
        curIsForeign = pendingRelocateSwap.isForeign;
        curDrift = pendingRelocateSwap.fxDrift ?? curDrift;
        fxMult = 1;
        pendingRelocateSwap = null;
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
      // Phantom-income clamp — mirror of the HSA `healthcareAnnual` floor
      // a few lines above. `costShockMult = currShock * fxMult * effectiveFxShock`
      // where `currShock = 1 + currVol * normalRandom()` is unbounded below 0
      // in foreign segments under high currVol + a deep-negative Gaussian draw.
      // Without this floor, `bal -= cost * 12 * costShockMult` would flip into
      // a positive bal addition — fictitious income from no source. Expenses
      // can be reduced (favorable FX, costShockMult between 0 and 1) but cannot
      // fund the portfolio.
      const costAnnualWithShock = Math.max(0, cost * 12 * costShockMult);
      bal += (income + activePartTime) * 12 - costAnnualWithShock + hsaDraw;

      // Primary-residence mortgage P+I (Todo #28). Sticky — NO cumInfl
      // multiplier (mortgage payments are nominal) and NO costShockMult
      // (USD mortgage doesn't track foreign FX). Deducted as a sibling
      // line so it lands AFTER income & main cost but BEFORE the late-
      // pass event dispatcher (where a oneTimeExpense for early-payoff
      // remaining principal would land in the same year).
      if (mortgageMonthlyPayment > 0 && y < mortgageEndYear) {
        bal -= mortgageMonthlyPayment * 12;
      }

      // Per-year pet / dependent cost curves — annual USD in today's
      // dollars scaled by cumInfl. USD baseline, no per-trial FX (same
      // convention as the LTC / rental lines). Sparse: missing or
      // non-positive entries deduct nothing, so legacy callers (both
      // fields absent) never enter this branch.
      const householdExtraAnnual =
        Math.max(0, p.petCostByYear?.[y] ?? 0) +
        Math.max(0, p.dependentCostByYear?.[y] ?? 0);
      if (householdExtraAnnual > 0) bal -= householdExtraAnnual * cumInfl;

      // Late-pass dispatch (#31 step 2a + priority 2) — handles event
      // kinds whose effect is a balance mutation AFTER the year's
      // income / cost mutation. Two kinds today: `oneTimeExpense`
      // (`bal -=`) and `oneTimeIncome` (`bal +=`). Same `eventsThisYear`
      // array as the early-pass dispatch above; we iterate it twice
      // with different kind filters because the legacy ordering put
      // stepUpBasis BEFORE the random sample and one-time lumps AFTER
      // the cost deduction. Preserving that ordering keeps results
      // byte-identical for legacy callers.
      //
      // Inflation scaling: `e.inflate ?? true` matches the legacy
      // default — omitted means inflate-by-CPI. Set false for
      // nominal-dollar fixed payments (annuity payouts, mortgage
      // payoff, fixed-amount life insurance, court-ordered settlement
      // amounts in nominal dollars).
      //
      // Symmetry: oneTimeIncome and oneTimeExpense use identical
      // inflate-default semantics. An inheritance amount expressed in
      // today's dollars grows with CPI by the year it actually arrives,
      // matching how the user's expense estimates do the same.
      if (eventsThisYear) {
        for (const ev of eventsThisYear) {
          if (ev.kind === 'oneTimeExpense') {
            const inflated = (ev.inflate ?? true) ? ev.amountUSD * cumInfl : ev.amountUSD;
            bal -= inflated;
          } else if (ev.kind === 'oneTimeIncome') {
            const inflated = (ev.inflate ?? true) ? ev.amountUSD * cumInfl : ev.amountUSD;
            bal += inflated;
          } else if (ev.kind === 'propertySale') {
            // Property sale (Todo #35) — Sec 1250 depreciation recapture
            // + LTCG on the gain. Sale prices in nominal year-of-sale
            // dollars; multiply by `cumInfl` so the user can enter
            // today-dollar estimates and have them grow with CPI.
            //
            // Math:
            //   netSale       = (salePrice − sellingExpenses) × cumInfl
            //   accDepreciation = sum_{startYr..saleYr} straightLineDepreciation
            //   adjustedBasis = depreciableBasis − accDepreciation
            //   gain          = netSale − adjustedBasis        (signed)
            //   recapTaxable  = min(max(0, gain), accDepreciation)
            //   ltcgTaxable   = max(0, gain) − recapTaxable
            //   recaptureTax  = recapTaxable × 0.25  (Sec 1250 cap)
            //   ltcgTax       = ltcgFederalTax(ltcgTaxable, ordinary, status)
            //   bal          += netSale − adjustedBasis × 0  (basis is
            //                   already-spent capital; not a current-year
            //                   inflow) − recaptureTax − ltcgTax
            //
            // Equivalently the user's net cash from sale is:
            //   bal += netSale − recaptureTax − ltcgTax
            // (assuming no mortgage payoff at sale — out of scope v1)
            const prop = rawRentalProps.find((rp) => rp.id === ev.propertyId);
            if (!prop) continue; // unknown propertyId — silent no-op
            const sellingExp = ev.sellingExpenses ?? 0;
            const netSale = Math.max(0, ev.salePriceUSD - sellingExp) * cumInfl;
            // Accumulated depreciation in today's $ — basis is also in
            // today's $ so they correctly offset; LTCG / recapture taxes
            // apply to the inflated nominal gain, hence cumInfl on netSale
            // alone. Same convention as oneTimeExpense / oneTimeIncome.
            let accDep = 0;
            for (let dy = prop.depreciationStartYear; dy < y; dy++) {
              accDep += straightLineDepreciation(
                prop.depreciableBasis,
                dy,
                prop.depreciationStartYear,
              );
            }
            const inflatedBasis = Math.max(0, prop.depreciableBasis - accDep) * cumInfl;
            const gain = netSale - inflatedBasis;
            let totalTax = 0;
            if (gain > 0) {
              const recapTaxable = Math.min(gain, accDep * cumInfl);
              const ltcgTaxable = gain - recapTaxable;
              const recaptureTax = recapTaxable * 0.25;
              // Stack LTCG on top of the trial's current ordinary income
              // (monthlyIncome × 12 × cumInfl approximates today's tax-bracket
              // position, scaled to nominal). Survivor phase uses survivor
              // income; same approximation.
              const ordinaryStack = (survivorPhase
                ? p.survivorMonthlyIncome ?? p.monthlyIncome
                : p.monthlyIncome) * 12 * cumInfl;
              const ltcgTax = ltcgFederalTax(ltcgTaxable, ordinaryStack, propertySaleFilingStatus);
              totalTax = recaptureTax + ltcgTax;
            }
            // Capital loss (gain ≤ 0): no tax owed; full netSale to bal.
            // Loss-against-ordinary carryforward (IRC § 1211(b) $3K/yr
            // limit) is out of scope v1.
            bal += netSale - totalTax;
          }
        }
      }

      // Inherited-IRA per-year drain (#31 priority 5). Iterates all
      // inheritedIRA events (not just events at year `y`) because the
      // drain effect spans `drainOverYears` years from the event's
      // `year`. For each event whose drain window covers `y`, add the
      // post-tax distribution to balance.
      //
      // Distribution math:
      //   gross = (balanceUSD / drainYears) × cumInfl
      //   net   = gross × (1 - effectiveTaxRate)
      //   bal  += net
      //
      // The gross distribution was already added to `magiAugmentByYear[y]`
      // at trial start, so the ACA-subsidy branch in segmentCostAtYear
      // sees the elevated MAGI for cost recompute (consumed earlier this
      // tick). The post-tax `net` is what actually grows the heir's
      // portfolio.
      //
      // Tax model: flat `effectiveTaxRate` (default 22%) — the user's
      // estimate of their marginal ordinary-income rate during the
      // drain. A future iteration could recompute single-filer brackets
      // per year based on stacked income; out of scope for this pass.
      for (const ev of inheritedIRAEvents) {
        const drainYears = Math.max(1, ev.drainOverYears ?? 10);
        const yearOfDrain = y - ev.year;
        if (yearOfDrain >= 0 && yearOfDrain < drainYears) {
          const gross = (ev.balanceUSD / drainYears) * cumInfl;
          const taxRate = ev.effectiveTaxRate ?? 0.22;
          bal += gross * (1 - taxRate);
        }
      }

      // Rental Schedule E cash flow + tax (Todo #34, Stage 4b of #29).
      // Cash inflow is the gross rental cashFlow (rents net of operating
      // expenses + mortgage interest, sign included). Tax is the household's
      // bill on Schedule E line 26, computed as max(0, taxableNet) × rate
      // — clamping at 0 so a paper loss does NOT credit household tax. The
      // shield's downward MAGI ripple already flowed through magiAugmentByYear
      // at trial start; this avoids double-counting it against household
      // ordinary-income tax (which is pre-baked into the segment cost).
      if (rentalProps.length) {
        const rentalCashThisYear = rentalCashByYear[y] * cumInfl;
        const rentalTaxableThisYear = rentalTaxableByYear[y] * cumInfl;
        const rentalTaxOwed = Math.max(0, rentalTaxableThisYear) * rentalEffTaxRate;
        bal += rentalCashThisYear - rentalTaxOwed;
      }

      // Long-Term Care deductions (independent of one-time expenses; see #21).
      // Self-insure: per-trial probabilistic LTC stay. Insurance: flat
      // monthly premium once the oldest adult crosses ltcInsuranceStartAge.
      //
      // Medicaid spend-down (Todo #21): when enabled AND the active
      // segment is US, the per-year drain is clamped so bal cannot
      // fall below `medicaidThreshold`. The unspent remainder is
      // implicitly covered by Medicaid (no household impact). Foreign
      // segments bypass the clamp — Medicaid doesn't apply abroad.
      if (ltcSelfInsure && oldestAge0 != null) {
        const isUSNow = medicaidEnabled
          ? activeSegmentAt(y, trialSchedule).isUS
          : false;
        const applyLtcDraw = (proposedDraw: number): void => {
          const draw = (medicaidEnabled && isUSNow)
            ? Math.min(proposedDraw, Math.max(0, bal - medicaidThreshold))
            : proposedDraw;
          bal -= draw;
        };
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
          //
          // EV mode + Medicaid is an approximation: the clamp is applied
          // to the probability-weighted draw, not to a real per-trial
          // depletion. For accurate Medicaid-protected scenarios prefer
          // random mode. Documented in the UI hint.
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
            applyLtcDraw(ltcCostUSD * cumInfl * ltcProbability * occupancy);
          }
        } else if (y >= ltcStartSimYear && y < ltcEndSimYear && ltcStartSimYear >= 0) {
          // Random mode: per-trial roll already gated whether this trial sees
          // LTC at all; deduct the full cost in each year of the window.
          applyLtcDraw(ltcCostUSD * cumInfl);
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

/**
 * Project legacy `MonteCarloParams` fields + any caller-supplied
 * `lifeEvents` into a unified, year-sorted `LifeEvent[]`. The output is
 * filtered to `[0, p.years)` so it matches the kernel's actual execution
 * horizon — events outside that range are silently dropped, mirroring
 * the kernel's own expense filter at the inner loop.
 */
export function compileLifeEvents(p: MonteCarloParams): LifeEvent[] {
  const events: LifeEvent[] = [];
  const inHorizon = (year: number) => year >= 0 && year < p.years;

  for (const m of p.moveSchedule ?? []) {
    if (inHorizon(m.fromYear)) events.push({ kind: 'move', year: m.fromYear, segment: m });
  }

  if (p.spouseDeathYear != null && inHorizon(p.spouseDeathYear)) {
    const survivorOverrides = pickDefined({
      monthlyIncome: p.survivorMonthlyIncome,
      costRatio: p.survivorCostRatio,
      monthlyIncomeTax: p.survivorMonthlyIncomeTax,
      medicareMonthly: p.survivorMedicareMonthly,
      birthYear: p.survivorBirthYear,
    });
    events.push({
      kind: 'spouseDeath',
      year: p.spouseDeathYear,
      survivorOverrides: Object.keys(survivorOverrides).length > 0 ? survivorOverrides : undefined,
    });

    if (p.survivorStepUpBenefitUSD != null && p.survivorStepUpBenefitUSD > 0) {
      events.push({ kind: 'stepUpBasis', year: p.spouseDeathYear, benefitUSD: p.survivorStepUpBenefitUSD });
    }
  }

  for (const e of p.oneTimeExpenses ?? []) {
    if (!e || !(e.amountUSD > 0) || !inHorizon(e.year)) continue;
    events.push({
      kind: 'oneTimeExpense',
      year: e.year,
      amountUSD: e.amountUSD,
      label: e.label,
      inflate: e.inflate,
    });
  }

  for (const e of p.oneTimeIncomes ?? []) {
    if (!e || !(e.amountUSD > 0) || !inHorizon(e.year)) continue;
    events.push({
      kind: 'oneTimeIncome',
      year: e.year,
      amountUSD: e.amountUSD,
      label: e.label,
      inflate: e.inflate,
    });
  }

  for (const e of p.lifeEvents ?? []) {
    if (inHorizon(e.year)) events.push(e);
  }

  events.sort((a, b) => a.year - b.year);
  return events;
}

/** Drop keys whose value is null/undefined, preserving the input shape. */
function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k in obj) if (obj[k] != null) out[k] = obj[k];
  return out;
}
