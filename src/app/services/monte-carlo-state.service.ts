import { Injectable, inject, signal, computed, effect, untracked } from '@angular/core';
import { LocationService } from '@services/location.service';
import { HealthcareService } from '@services/healthcare.service';
import { RentalIncomeService } from '@services/rental-income.service';
import {
  FinancialSettings, WithdrawalStrategy, LocationFull,
  HouseholdProfile, HouseholdMember,
} from '@models/api.model';
import {
  MonteCarloResult,
  ReturnMode,
  DEFAULT_REGIME,
  weightedInflationFromLocation,
  inflationBreakdownFromLocation,
  type InflationBreakdown,
} from '@retirement/shared/engine/monte-carlo.js';
import { HISTORICAL_PRESETS, HISTORICAL_RETURNS } from '@retirement/shared/engine/historical-returns.js';
import {
  SS_CUT_SOURCES, RMD_AGE_SOURCES,
  FED_BRACKETS_2026_SINGLE, FED_STD_DEDUCTION_2026,
} from '@retirement/shared/engine/tax-sources.js';
import { monthlyMedicareFor } from '@app/lib/irmaa';
import { DEFAULT_CHILD_SUPPORT_UNTIL_AGE, DEFAULT_DEPENDENT_MONTHLY_COST } from '@retirement/shared/engine/household-costs.js';
import { estimateBenefitAtClaim } from '@app/lib/social-security';

const PATH_CHART_W = 640;
const PATH_CHART_H = 260;
const HIST_CHART_W = 640;
const HIST_CHART_H = 220;
const HIST_BINS = 40;


/**
 * Owns the user-controllable Monte Carlo simulation state — every input
 * signal, every derived computed, plus the latest results and the
 * stale-results flag. The screen component is a thin layer of UX state
 * (loading flags, save-message strings, calm-step reveal counter) plus
 * methods that orchestrate the kernel call and persist scenarios.
 *
 * Component-scoped (not providedIn: 'root') so each visit to the screen
 * starts with a fresh slate, matching the pre-extraction behavior where
 * all signals were class fields recreated on mount.
 *
 * Phase 1 of the god-component split (audit follow-up #1). Phase 2 will
 * carve the screen component into Parameters / Healthcare / Scenarios /
 * Results sub-components, each injecting this service to read and write
 * shared state without prop-drilling.
 */
@Injectable()
export class MonteCarloStateService {
  private readonly loc = inject(LocationService);
  private readonly healthcare = inject(HealthcareService);
  private readonly rental = inject(RentalIncomeService);

  /* ─── Async-loaded snapshots ───────────────────────────────────── */
  readonly fin = signal<FinancialSettings | null>(null);
  readonly wd = signal<WithdrawalStrategy | null>(null);
  readonly household = signal<HouseholdProfile | null>(null);

  /* ─── Inputs (all persist across the session via signals) ──────── */
  readonly selectedLocationId = signal<string>('');
  readonly portfolio = signal(0);
  readonly ssMonthly = signal(0);
  readonly monthlyIncome = signal(0);
  readonly partTimeMonthlyIncome = signal(0);
  readonly partTimeEndYear = signal(0);
  readonly runs = signal(5000);
  readonly ssCutSources = SS_CUT_SOURCES;
  readonly rmdSources = RMD_AGE_SOURCES;

  readonly years = signal(25);
  readonly meanReturn = signal(7);
  readonly volatility = signal(15);
  readonly meanInflation = signal(3);
  readonly inflVol = signal(1.5);
  readonly currVol = signal(5);
  readonly fxDrift = signal(0);
  readonly incGrowth = signal(2);

  /* ─── Historical / sampling-mode inputs ────────────────────────── */
  readonly returnMode = signal<ReturnMode>('normal');
  readonly selectedPresetId = signal<string>('');
  /** Start year for historical-sequence backtest. Defaults to earliest data. */
  readonly historicalStartYear = signal<number>(HISTORICAL_RETURNS[0].year);

  /** Regime parameters (bull/bear Markov switching). */
  readonly regimeBullMean = signal(DEFAULT_REGIME.bullMean * 100);
  readonly regimeBullVol = signal(DEFAULT_REGIME.bullVol * 100);
  readonly regimeBearMean = signal(DEFAULT_REGIME.bearMean * 100);
  readonly regimeBearVol = signal(DEFAULT_REGIME.bearVol * 100);
  readonly regimeBullToBear = signal(DEFAULT_REGIME.pBullToBear * 100);
  readonly regimeBearToBull = signal(DEFAULT_REGIME.pBearToBull * 100);

  readonly historicalPresets = HISTORICAL_PRESETS;
  readonly historicalYears = HISTORICAL_RETURNS.map(r => r.year);

  /* ─── Multi-location schedule (deterministic) ──────────────────── */
  readonly moves = signal<{ fromYear: number; locationId: string; moveCostUSD: number }[]>([]);
  readonly movesEnabled = signal(false);

  /** One-time future expenses (cars, roof, tuition, big trips). */
  readonly oneTimeExpenses = signal<{ year: number; amountUSD: number; label: string; inflate: boolean }[]>([]);
  readonly oneTimeExpensesEnabled = signal(false);

  /** One-time future income / portfolio additions (inheritance, home-sale
   *  proceeds, deferred-comp payouts, life insurance). #31 priority 2. */
  readonly oneTimeIncomes = signal<{ year: number; amountUSD: number; label: string; inflate: boolean }[]>([]);
  readonly oneTimeIncomesEnabled = signal(false);

  /** Inherited traditional IRA — SECURE Act 10-year forced drawdown (#31
   *  priority 5). Each entry: starting year, IRA balance at inheritance,
   *  drain window in years (default 10), heir's effective marginal tax
   *  rate as a decimal (default 0.22). Drives both the per-year balance
   *  add (post-tax) and the per-year MAGI augmentation that ripples
   *  through the pre-65 ACA-subsidy calc in segmentCostAtYear. */
  readonly inheritedIRAs = signal<{
    year: number;
    balanceUSD: number;
    drainOverYears: number;
    effectiveTaxRate: number;
    label: string;
  }[]>([]);
  readonly inheritedIRAsEnabled = signal(false);

  /** Property sales (Todo #35) — propertySale LifeEvent rows. Each entry
   *  references a RentalProperty by id (chosen from RentalIncomeService's
   *  portfolio) and fires Sec 1250 depreciation recapture + LTCG on the
   *  gain at the sale year. The kernel auto-zeros the property's rental
   *  income from the sale year onward. */
  readonly propertySales = signal<{
    year: number;
    propertyId: string;
    salePriceUSD: number;
    sellingExpenses: number;
    label: string;
  }[]>([]);
  readonly propertySalesEnabled = signal(false);

  /** Long-Term Care planning (#21). */
  readonly ltcMode = signal<'off' | 'self-insure' | 'insurance' | 'both'>('off');
  readonly ltcProbability = signal(70);
  readonly ltcCostPerYearUSD = signal(108000);
  readonly ltcDurationYears = signal(2.4);
  readonly ltcStartAgeMin = signal(78);
  readonly ltcStartAgeMax = signal(88);
  readonly ltcInsuranceMonthly = signal(350);
  readonly ltcInsuranceStartAge = signal(60);

  /** Medicaid spend-down (Todo #21 Slice B). When enabled + segment is
   *  US, LTC drains can't pull bal below the asset threshold; remainder
   *  is implicitly covered by Medicaid. Default OFF — opt-in to preserve
   *  byte-identical legacy MC results for users who haven't enabled it. */
  readonly medicaidSpendDownEnabled = signal(false);
  /** Federal floor for individual asset limit. States range up to $15K. */
  readonly medicaidAssetThresholdUSD = signal(2000);

  /** FX stress test (#26). */
  readonly fxShockEnabled = signal(false);
  readonly fxShockYear = signal(5);
  readonly fxShockPct = signal(10);

  /* ─── Spouse-death scenario (deterministic) ────────────────────── */
  readonly spouseDeathEnabled = signal(false);
  readonly spouseDeathYear = signal(10);
  readonly survivorCostRatio = signal(75);
  readonly deceasedMemberIndex = signal(0);

  /** Stepped-up basis estimate. User opts in by setting balance / gain ratio / LTCG rate. */
  readonly survivorStepUpTaxableBalance = signal(0);
  readonly survivorStepUpGainRatio = signal(30);
  readonly survivorStepUpLtcgRate = signal(15);

  /** Survivor relocation (#31 priority 4) — if the spouse dies, swap to
   *  this location at the death year. Empty `survivorRelocateLocationId`
   *  means "no relocation"; the toggle gates whether the runner threads
   *  it into the kernel. */
  readonly survivorRelocateEnabled = signal(false);
  readonly survivorRelocateLocationId = signal<string>('');
  readonly survivorRelocateMoveCostUSD = signal(0);

  /* ─── Results + stale-results flag ─────────────────────────────── */
  readonly results = signal<MonteCarloResult | null>(null);
  /** True when a sim input changed since the last completed run. */
  readonly simDirty = signal(false);

  /* ─── Chart dimensions ─────────────────────────────────────────── */
  readonly pathW = PATH_CHART_W;
  readonly pathH = PATH_CHART_H;
  readonly histW = HIST_CHART_W;
  readonly histH = HIST_CHART_H;

  /* ─── Derived from selected location ───────────────────────────── */
  readonly selectedLoc = computed<LocationFull | null>(() => {
    const id = this.selectedLocationId();
    return this.loc.fullLocations().find((l) => l.id === id) ?? null;
  });

  readonly isForeign = computed(() => {
    const l = this.selectedLoc();
    return !!l && l.currency !== 'USD';
  });

  readonly baseCost = computed(() => {
    const l = this.selectedLoc();
    if (!l?.monthlyCosts) return 0;
    // The pet cost curve REPLACES the flat pet categories — exclude them
    // from the base so pets aren't double-counted (see household-costs.ts).
    const petExcluded = this.petCurveEnabled() ? this.loc.petMonthlyTotal(l) : 0;
    return this.loc.nonHealthcareBaseMonthly(l) - petExcluded + this.healthcare.decide(l).monthlyCost;
  });

  /** Non-dependent adults in the household, in sort order. */
  readonly adults = computed(() =>
    (this.household()?.members ?? []).filter(m => m.role !== 'dependent')
  );

  /** Dependent members (children / supported adults), in sort order. */
  readonly dependents = computed(() =>
    (this.household()?.members ?? []).filter(m => m.role === 'dependent')
  );

  // Pets & dependents cost curves — per-year arrays replacing the flat
  // pet categories / adding explicit dependent costs (household-costs.ts).
  readonly petCurveEnabled = signal(false);
  readonly replacePets = signal(false);
  readonly dependentCurveEnabled = signal(false);
  readonly dependentMonthlyCost = signal(DEFAULT_DEPENDENT_MONTHLY_COST);
  readonly childSupportUntilAge = signal(DEFAULT_CHILD_SUPPORT_UNTIL_AGE);

  readonly survivorMonthlySs = computed(() => {
    const adults = this.adults();
    if (adults.length === 0) return 0;
    const benefits = adults.map(m => estimateBenefitAtClaim(m));
    return Math.max(...benefits);
  });

  readonly survivorBirthYear = computed<number | null>(() => {
    const adults = this.adults();
    if (!adults.length) return null;
    if (adults.length === 1) return adults[0].birthYear;
    const deceased = this.deceasedMemberIndex();
    const survivor = adults.find((_, i) => i !== deceased) ?? adults[0];
    return survivor.birthYear;
  });

  readonly survivorMonthlyIncome = computed(() =>
    this.survivorMonthlySs() + this.monthlyIncome()
  );

  readonly survivorMonthlyIncomeTax = computed(() => {
    const survivorIncomeAnnual = this.survivorMonthlyIncome() * 12;
    if (survivorIncomeAnnual <= 0) return 0;
    const ssAnnual = this.survivorMonthlySs() * 12;
    const otherAnnual = this.monthlyIncome() * 12;
    const taxableGross = ssAnnual * 0.85 + otherAnnual;
    const taxable = Math.max(0, taxableGross - FED_STD_DEDUCTION_2026.single);
    let fed = 0;
    for (const b of FED_BRACKETS_2026_SINGLE) {
      const top = b.max ?? Number.POSITIVE_INFINITY;
      if (taxable <= b.min) break;
      const span = Math.min(taxable, top) - b.min;
      if (span > 0) fed += span * b.rate;
    }
    return fed / 12;
  });

  readonly survivorMonthlyMedicare = computed(() => {
    const magi = this.survivorMonthlyIncome() * 12;
    return monthlyMedicareFor('single', magi);
  });

  readonly survivorStepUpBenefitUSD = computed(() => {
    const bal = this.survivorStepUpTaxableBalance();
    const gain = this.survivorStepUpGainRatio() / 100;
    const rate = this.survivorStepUpLtcgRate() / 100;
    return Math.max(0, bal * gain * rate);
  });

  /**
   * Preview-only: Phase 3b spouse-death inheritance tax hit at the
   * selected location, using current inputs (no per-trial FX volatility,
   * no portfolio growth to deathYear). Shown in the spouse-death card so
   * the user sees the modeled hit before running a sim.
   *
   *   deceasedShareUSD = portfolio × 0.5
   *   exemptionUSD     = exemptionLocal / loc.exchangeRate
   *   effectiveRate    = 0 if 'full' or topRate=0
   *                     topRate if 'none'
   *                     directFamilyEffectiveRate ?? topRate otherwise
   *   hit              = max(0, deceasedShareUSD − exemptionUSD) × rate
   *
   * The kernel applies the same logic per-trial with FX volatility on
   * the exemption — see MonteCarloParams.inheritanceTaxByYear in
   * @retirement/shared/engine/monte-carlo.ts. The preview here uses today's $ at year-0 FX,
   * so the on-screen number is a baseline estimate.
   */
  readonly survivorInheritanceTaxHit = computed(() => {
    const loc = this.selectedLoc();
    const inh = loc?.taxes?.inheritance;
    if (!inh || !inh.topRate) return 0;

    let effectiveRate = 0;
    if (inh.spouseExemption === 'full') return 0;
    if (inh.spouseExemption === 'none') effectiveRate = inh.topRate;
    else effectiveRate = inh.directFamilyEffectiveRate ?? inh.topRate;
    if (effectiveRate <= 0) return 0;

    const exchangeRate = loc?.exchangeRate ?? 1;
    const exemptionUSD = (inh.exemptionLocal ?? 0) / exchangeRate;
    const deceasedShareUSD = this.portfolio() * 0.5;
    const taxableUSD = Math.max(0, deceasedShareUSD - exemptionUSD);
    return taxableUSD * effectiveRate;
  });

  readonly survivorPostDeathMonthly = computed(() => {
    const seed = this.selectedLoc();
    if (!seed) return 0;
    const totalBase = this.baseCost();
    const taxLine = Number(seed.monthlyCosts?.taxes?.typical) || 0;
    const hcLine = Number(seed.monthlyCosts?.healthcare?.typical) || 0;
    const lifestyleBase = Math.max(0, totalBase - taxLine - hcLine);
    const ratio = this.survivorCostRatio() / 100;
    return lifestyleBase * ratio + this.survivorMonthlyIncomeTax() + this.survivorMonthlyMedicare();
  });

  /** Nominal lifetime SS with compound COLA growth. */
  readonly ssLifetime = computed(() => {
    const monthly = this.ssMonthly();
    const g = this.incGrowth() / 100;
    const yrs = this.years();
    if (monthly <= 0 || yrs <= 0) return 0;
    if (g === 0) return monthly * 12 * yrs;
    return monthly * 12 * (Math.pow(1 + g, yrs) - 1) / g;
  });

  /* ─── Path chart data ──────────────────────────────────────────── */
  readonly pathYMax = computed(() => {
    const r = this.results();
    if (!r) return 1;
    let mx = 0;
    for (const p of r.paths) for (const v of p) if (v > mx) mx = v;
    return Math.max(mx, this.portfolio() * 2);
  });

  readonly pathYMin = computed(() => {
    const r = this.results();
    if (!r) return 0;
    let mn = 0;
    for (const p of r.paths) for (const v of p) if (v < mn) mn = v;
    return Math.min(mn, 0);
  });

  readonly pathZeroY = computed(() => {
    const mx = this.pathYMax();
    const mn = this.pathYMin();
    const range = mx - mn || 1;
    return this.pathH - ((0 - mn) / range) * this.pathH;
  });

  readonly pathData = computed(() => {
    const r = this.results();
    if (!r) return [];
    const mx = this.pathYMax();
    const mn = this.pathYMin();
    const range = mx - mn || 1;
    const yrs = this.years();
    return r.paths.map((path) => {
      const points = path
        .map((v, i) => {
          const x = (i / yrs) * this.pathW;
          const y = this.pathH - ((v - mn) / range) * this.pathH;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
      const endedPositive = path[path.length - 1] > 0;
      return {
        points,
        color: endedPositive ? 'rgba(42,123,123,0.6)' : 'rgba(229,115,115,0.6)',
      };
    });
  });

  /* ─── Histogram data ───────────────────────────────────────────── */
  readonly histMin = computed(() => {
    const r = this.results();
    return r ? r.results[0] ?? 0 : 0;
  });

  readonly histMax = computed(() => {
    const r = this.results();
    return r ? r.results[r.results.length - 1] ?? 0 : 0;
  });

  readonly histBars = computed(() => {
    const r = this.results();
    if (!r || !r.results.length) return [];
    const min = this.histMin();
    const max = this.histMax();
    const range = max - min || 1;
    const binWidth = range / HIST_BINS;
    const counts = new Array<number>(HIST_BINS).fill(0);
    for (const v of r.results) {
      let idx = Math.floor((v - min) / binWidth);
      if (idx >= HIST_BINS) idx = HIST_BINS - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    }
    const maxCount = Math.max(...counts) || 1;
    const barW = this.histW / HIST_BINS;
    const chartH = this.histH - 20;
    return counts.map((c, i) => {
      const h = (c / maxCount) * chartH;
      const binStart = min + i * binWidth;
      const color = binStart < 0 ? 'rgba(229,115,115,0.7)' : 'rgba(74,144,226,0.7)';
      return {
        x: i * barW,
        y: chartH - h,
        w: Math.max(barW - 1, 1),
        h,
        color,
      };
    });
  });

  readonly medianX = computed(() => {
    const r = this.results();
    if (!r) return 0;
    const min = this.histMin();
    const max = this.histMax();
    const range = max - min || 1;
    return ((r.median - min) / range) * this.histW;
  });

  /* ─── Percentile bars (numeric list) ───────────────────────────── */
  readonly percentileBars = computed(() => {
    const r = this.results();
    if (!r) return [];
    const maxP = Math.max(r.p95, this.portfolio() * 2);
    const minP = Math.min(0, r.p5);
    const range = maxP - minP || 1;
    return PERCENTILE_COLORS.map(({ label, key, color }) => {
      const value = r[key] as number;
      const width = Math.max(2, Math.min(100, ((value - minP) / range) * 100));
      return { label, value, color, width };
    });
  });

  /** Recompute meanInflation from the current location's category-weighted
   *  inflation. Called from the default-location effect (when location is
   *  first seeded) and from MonteCarloRunnerService.run() (so a location
   *  change since the last run resyncs the default before the kernel call).
   *  No-op when no location is selected. */
  syncInflationFromLocation(): void {
    const l = this.selectedLoc();
    if (!l?.monthlyCosts) return;
    const w = weightedInflationFromLocation(
      l.monthlyCosts as unknown as Record<string, { typical?: number; annualInflation?: number }>,
    );
    this.meanInflation.set(+(w * 100).toFixed(2));
  }

  /** Per-category inflation breakdown for the currently selected location.
   *  Drives the "what's driving the weighted average?" UI panel (#25).
   *  Returns an empty breakdown when no location is selected. Reactive on
   *  `selectedLoc` so the panel updates as the user changes locations. */
  readonly inflationBreakdown = computed<InflationBreakdown>(() => {
    const l = this.selectedLoc();
    if (!l?.monthlyCosts) return { categories: [], weightedAverage: 0.025, totalMonthly: 0 };
    return inflationBreakdownFromLocation(
      l.monthlyCosts as unknown as Record<string, { typical?: number; annualInflation?: number }>,
    );
  });

  /** Seeds `selectedLocationId` with the first full location as soon as
   *  one is available, and refreshes inflation from that location. Effect
   *  reruns when `loc.fullLocations()` changes; tears down with the
   *  service. Replaces the prior parent-component setInterval polling. */
  private defaultLocationEffect = effect(() => {
    const list = this.loc.fullLocations();
    if (list.length && !this.selectedLocationId()) {
      this.selectedLocationId.set(list[0].id);
      this.syncInflationFromLocation();
    }
  });

  constructor() {
    // FU-012 — mark results stale as soon as any sim input signal changes,
    // so the template can surface a "Rerun simulation" banner. Cleared at
    // the end of a successful run by MonteCarloRunnerService.run().
    effect(() => {
      // Dependency-read each input. Order doesn't matter; Angular tracks
      // any signal read inside this effect body.
      this.portfolio(); this.ssMonthly(); this.monthlyIncome();
      this.partTimeMonthlyIncome(); this.partTimeEndYear();
      this.runs(); this.years();
      this.meanReturn(); this.volatility();
      this.meanInflation(); this.inflVol(); this.currVol(); this.fxDrift();
      this.incGrowth();
      this.returnMode(); this.selectedLocationId(); this.historicalStartYear();
      this.regimeBullMean(); this.regimeBullVol();
      this.regimeBearMean(); this.regimeBearVol();
      this.regimeBullToBear(); this.regimeBearToBull();
      this.moves(); this.movesEnabled();
      this.oneTimeExpenses(); this.oneTimeExpensesEnabled();
      this.oneTimeIncomes(); this.oneTimeIncomesEnabled();
      this.inheritedIRAs(); this.inheritedIRAsEnabled();
      this.propertySales(); this.propertySalesEnabled();
      // Pets & dependents cost curves — the kernel arrays are rebuilt from
      // these each run, so any edit invalidates prior results.
      this.petCurveEnabled(); this.replacePets();
      this.dependentCurveEnabled(); this.dependentMonthlyCost(); this.childSupportUntilAge();
      this.ltcMode(); this.ltcProbability(); this.ltcCostPerYearUSD();
      this.ltcDurationYears(); this.ltcStartAgeMin(); this.ltcStartAgeMax();
      this.ltcInsuranceMonthly(); this.ltcInsuranceStartAge();
      this.medicaidSpendDownEnabled(); this.medicaidAssetThresholdUSD();
      this.fxShockEnabled(); this.fxShockYear(); this.fxShockPct();
      this.spouseDeathEnabled(); this.spouseDeathYear();
      this.survivorCostRatio(); this.deceasedMemberIndex();
      this.survivorStepUpTaxableBalance(); this.survivorStepUpGainRatio(); this.survivorStepUpLtcgRate();
      this.survivorRelocateEnabled(); this.survivorRelocateLocationId(); this.survivorRelocateMoveCostUSD();
      // Rental properties (Todo #34) — kernel pre-computes per-year cash +
      // taxable arrays from this list, so any edit invalidates prior results.
      this.rental.properties();
      // Mortgage fields (Todo #28) — read via the fin() signal which
      // updates on every successful financial save / load. Kernel deducts
      // a sticky annual P+I until mortgageEndYear, so any edit must
      // invalidate prior results.
      this.fin();
      // Only mark stale when there's actually a prior result to be stale.
      // Read via untracked() so runSimulation's results.set() doesn't
      // retrigger this effect and immediately re-set simDirty back to true.
      if (untracked(this.results)) this.simDirty.set(true);
    });
  }
}

/* Dyscalculia F-002: Removed red `#E57373` for the lowest percentile — now
 * uses the same neutral amber gradient as the rest. Anxiety-inducing red is
 * reserved for hard errors, not user outcomes. */
const PERCENTILE_COLORS: { label: string; key: keyof MonteCarloResult; color: string }[] = [
  { label: '5th Percentile',  key: 'p5',     color: '#B0752A' },
  { label: '25th Percentile', key: 'p25',    color: '#D4943A' },
  { label: '50th (Median)',   key: 'median', color: '#E8B86D' },
  { label: '75th Percentile', key: 'p75',    color: '#3AA0A0' },
  { label: '95th Percentile', key: 'p95',    color: '#4CAF50' },
];
