import { Component, inject, signal, computed, effect, untracked, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { MonteCarloScenarioService } from '@services/monte-carlo-scenario.service';
import { HealthcareService } from '@services/healthcare.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import {
  FinancialSettings, WithdrawalStrategy, LocationFull,
  HouseholdProfile, HouseholdMember,
} from '@models/api.model';
import {
  runMonteCarlo,
  weightedInflationFromLocation,
  MonteCarloResult,
  ReturnMode,
  DEFAULT_REGIME,
} from '@app/lib/monte-carlo';
import {
  HISTORICAL_PRESETS, HISTORICAL_RETURNS, statsForRange,
} from '@app/data/historical-returns';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';
import {
  SS_CUT_SOURCES, RMD_AGE_SOURCES,
  FED_BRACKETS_2026_SINGLE, FED_STD_DEDUCTION_2026,
} from '@app/lib/tax-sources';
import { monthlyMedicareFor } from '@app/lib/irmaa';

// Dyscalculia F-002: Removed red `#E57373` for the lowest percentile — now
// uses the same neutral amber gradient as the rest. Anxiety-inducing red is
// reserved for hard errors, not user outcomes.
const PERCENTILE_COLORS: { label: string; key: keyof MonteCarloResult; color: string }[] = [
  { label: '5th Percentile',  key: 'p5',     color: '#B0752A' },
  { label: '25th Percentile', key: 'p25',    color: '#D4943A' },
  { label: '50th (Median)',   key: 'median', color: '#E8B86D' },
  { label: '75th Percentile', key: 'p75',    color: '#3AA0A0' },
  { label: '95th Percentile', key: 'p95',    color: '#4CAF50' },
];

/**
 * Monthly SS benefit adjusted for claim age.
 *
 * ssPia is the Primary Insurance Amount at Full Retirement Age (FRA). Claiming
 * late increases it ~8% per year; claiming early reduces it ~6.67%/yr for the
 * first 3 years and ~5%/yr after. API returns ssPia as a string, so coerce.
 *
 * Must match the logic in ss-screen.component.ts:estimateBenefit so the two
 * screens agree.
 */
/**
 * Portfolio-weighted annual drag % from per-account load + fees. Decision:
 * both load and fees are recurring — treated identically, just separate lines
 * for reporting clarity in the Settings UI.
 */
function weightedAccountDragPct(f: FinancialSettings): number {
  const rows: [number, number, number][] = [
    [Number(f.traditionalBalance) || 0, Number(f.traditionalLoadPct) || 0, Number(f.traditionalFeesPct) || 0],
    [Number(f.rothBalance)        || 0, Number(f.rothLoadPct)        || 0, Number(f.rothFeesPct)        || 0],
    [Number(f.taxableBalance)     || 0, Number(f.taxableLoadPct)     || 0, Number(f.taxableFeesPct)     || 0],
    [Number(f.hsaBalance)         || 0, Number(f.hsaLoadPct)         || 0, Number(f.hsaFeesPct)         || 0],
  ];
  const total = rows.reduce((s, [b]) => s + b, 0);
  if (total <= 0) return 0;
  return rows.reduce((s, [b, l, fe]) => s + (b / total) * (l + fe), 0);
}

function estimateBenefitAtClaim(m: HouseholdMember): number {
  const pia = Number(m.ssPia) || 0;
  if (!pia || !m.ssFra || !m.ssClaimAge) return 0;
  const diff = m.ssClaimAge - m.ssFra;
  if (diff === 0) return pia;
  if (diff > 0) return Math.round(pia * (1 + diff * 0.08));
  const yearsEarly = Math.abs(diff);
  const reduction = yearsEarly <= 3
    ? yearsEarly * 0.0667
    : 3 * 0.0667 + (yearsEarly - 3) * 0.05;
  return Math.round(pia * (1 - reduction));
}

const PATH_CHART_W = 640;
const PATH_CHART_H = 260;
const HIST_CHART_W = 640;
const HIST_CHART_H = 220;
const HIST_BINS = 40;

@Component({
  selector: 'app-montecarlo-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective, SourceTooltipComponent],
  templateUrl: './montecarlo-screen.component.html',
  styleUrls: ['./montecarlo-screen.component.scss'],
})
export class MontecarloScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly loc = inject(LocationService);
  readonly taxSvc = inject(TaxService);
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly currency = inject(CurrencyFormatService);
  private readonly scenarios = inject(MonteCarloScenarioService);

  readonly loading = signal(false);
  readonly running = signal(false);

  /** Calm-mode reveal step (Dashboard Dyscalculia F-006). 0=none shown,
   *  1=success, 2=+median, 3=+worst, 4=+best, 5=+summary, 6=+paths chart,
   *  7=+histogram, 8=+percentile bars. Reset on every new run. Only consulted
   *  when `dyscalculia.isCalmMc()` is true. */
  readonly calmStep = signal(1);
  readonly calmMax = 8;
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

  /* ─── Multi-location schedule (deterministic) ───────────────────
   * Each entry is `{ fromYear, locationId, moveCostUSD }`. fromYear must be
   * strictly increasing. First entry is always year 0. Primary location
   * selector at the top of the screen stays in sync with moves[0].locationId.
   */
  readonly moves = signal<{ fromYear: number; locationId: string; moveCostUSD: number }[]>([]);
  readonly movesEnabled = signal(false);

  /** One-time future expenses (cars, roof, tuition, big trips). Each row:
   *  year (0-based sim year), amountUSD (today's $), label, inflate (default true). */
  readonly oneTimeExpenses = signal<{ year: number; amountUSD: number; label: string; inflate: boolean }[]>([]);
  readonly oneTimeExpensesEnabled = signal(false);

  /** Long-Term Care planning (#21). Two independent modes — self-insure
   *  (per-trial probabilistic stay) and insurance (recurring premium). */
  readonly ltcMode = signal<'off' | 'self-insure' | 'insurance' | 'both'>('off');
  readonly ltcProbability = signal(70);     // %
  readonly ltcCostPerYearUSD = signal(108000); // US Genworth 2024 median private nursing-home room
  readonly ltcDurationYears = signal(2.4);  // 2.4 yr median stay
  readonly ltcStartAgeMin = signal(78);
  readonly ltcStartAgeMax = signal(88);
  readonly ltcInsuranceMonthly = signal(350);  // $4.2K/yr is mid-range LTC premium for 60yo
  readonly ltcInsuranceStartAge = signal(60);

  /** FX stress test (#26). One-time shock at year Y, applied to foreign segments only. */
  readonly fxShockEnabled = signal(false);
  readonly fxShockYear = signal(5);
  readonly fxShockPct = signal(10);  // % — positive = USD weakens (cost rises)


  /* ─── Spouse-death scenario (deterministic) ────────────────────── */
  readonly spouseDeathEnabled = signal(false);
  readonly spouseDeathYear = signal(10);
  readonly survivorCostRatio = signal(75); // whole-percent on the wire
  /** Which member is assumed to die. Index into adults[]. */
  readonly deceasedMemberIndex = signal(0);

  readonly results = signal<MonteCarloResult | null>(null);
  readonly savingScenario = signal(false);
  readonly saveMsg = signal<string | null>(null);
  readonly saveErr = signal(false);

  /** True when a sim input changed since the last completed run. Surfaces a
   *  stale-results banner + button glow (FU-012) so users know they need to
   *  rerun to refresh the chart / percentiles. Cleared on successful run. */
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

  readonly healthcare = inject(HealthcareService);

  readonly baseCost = computed(() => {
    const l = this.selectedLoc();
    if (!l?.monthlyCosts) return 0;
    return this.loc.nonHealthcareBaseMonthly(l) + this.healthcare.decide(l).monthlyCost;
  });

  /** Non-dependent adults in the household, in sort order. Used for spouse-death UI. */
  readonly adults = computed(() =>
    (this.household()?.members ?? []).filter(m => m.role !== 'dependent')
  );

  /**
   * Monthly SS after one spouse dies = max of the two spouses' claim-age-
   * adjusted benefits (the survivor keeps the higher benefit). If only one
   * adult, survivor benefit = that person's own (survivor lives alone).
   */
  readonly survivorMonthlySs = computed(() => {
    const adults = this.adults();
    if (adults.length === 0) return 0;
    const benefits = adults.map(m => estimateBenefitAtClaim(m));
    return Math.max(...benefits);
  });

  /**
   * Birth year of the surviving spouse — used by the MC kernel to gate
   * Medicare swap on age-65 eligibility. With one adult, the survivor IS that
   * adult. With two adults, the survivor is the one NOT at deceasedMemberIndex.
   */
  readonly survivorBirthYear = computed<number | null>(() => {
    const adults = this.adults();
    if (!adults.length) return null;
    if (adults.length === 1) return adults[0].birthYear;
    const deceased = this.deceasedMemberIndex();
    const survivor = adults.find((_, i) => i !== deceased) ?? adults[0];
    return survivor.birthYear;
  });

  /** Survivor monthly income = survivor SS + other income (pension etc. kept intact). */
  readonly survivorMonthlyIncome = computed(() =>
    this.survivorMonthlySs() + this.monthlyIncome()
  );

  /**
   * Survivor monthly income tax — apply single-filer federal brackets to the
   * survivor's taxable income. Approximates SS taxation as 85% included (the
   * typical case for retirees with other income). Doesn't model state tax in
   * survivor phase; the MC's per-segment `monthlyIncomeTax` carries state.
   * Kept conservative: federal only, single stddev.
   */
  readonly survivorMonthlyIncomeTax = computed(() => {
    const survivorIncomeAnnual = this.survivorMonthlyIncome() * 12;
    if (survivorIncomeAnnual <= 0) return 0;
    // Assume ~85% of survivor SS is federally taxable (retiree common case).
    // The non-SS income portion is fully taxable.
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

  /**
   * Survivor monthly Medicare — single-filer IRMAA brackets applied to MAGI
   * (which approximates survivor income since there's no bigger spouse to
   * add). The MFJ threshold at 212K becomes single at 106K, so a survivor
   * with e.g. 110K MAGI jumps from tier 0 to tier 1 even without an income
   * change.
   */
  readonly survivorMonthlyMedicare = computed(() => {
    const magi = this.survivorMonthlyIncome() * 12;
    return monthlyMedicareFor('single', magi);
  });

  /**
   * User-controlled stepped-up basis estimate. Default 0 — user opts in by
   * setting a taxable-balance-at-death, unrealized-gain ratio, and LTCG rate.
   * One-time portfolio bump applied at the death year.
   */
  readonly survivorStepUpTaxableBalance = signal(0);
  readonly survivorStepUpGainRatio = signal(30); // %
  readonly survivorStepUpLtcgRate = signal(15);   // %

  readonly survivorStepUpBenefitUSD = computed(() => {
    const bal = this.survivorStepUpTaxableBalance();
    const gain = this.survivorStepUpGainRatio() / 100;
    const rate = this.survivorStepUpLtcgRate() / 100;
    return Math.max(0, bal * gain * rate);
  });

  /**
   * Preview-only: post-death monthly cost as the kernel computes it.
   * Lifestyle ratio applies to the non-tax / non-healthcare portion only;
   * tax + Medicare use their survivor-specific values. This must match the
   * lib/monte-carlo.ts segmentCostAtYear logic when survivorPhase = true.
   */
  readonly survivorPostDeathMonthly = computed(() => {
    const seed = this.selectedLoc();
    if (!seed) return 0;
    const totalBase = this.baseCost();
    // Best-effort decompose: subtract the seed's tax and healthcare lines so
    // we can scale only the lifestyle remainder. Both come from the
    // monthlyCosts seed; if missing, fall back to 0 and the ratio applies to
    // the whole figure (legacy behaviour).
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
    const chartH = this.histH - 20; // reserve for axis text
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

  /* ─── Lifecycle ────────────────────────────────────────────────── */

  constructor() {
    // FU-012 — mark results stale as soon as any sim input signal changes,
    // so the template can surface a "Rerun simulation" banner. Cleared at
    // the end of a successful run in runSimulation().
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
      this.ltcMode(); this.ltcProbability(); this.ltcCostPerYearUSD();
      this.ltcDurationYears(); this.ltcStartAgeMin(); this.ltcStartAgeMax();
      this.ltcInsuranceMonthly(); this.ltcInsuranceStartAge();
      this.fxShockEnabled(); this.fxShockYear(); this.fxShockPct();
      this.spouseDeathEnabled(); this.spouseDeathYear();
      this.survivorCostRatio(); this.deceasedMemberIndex();
      this.survivorStepUpTaxableBalance(); this.survivorStepUpGainRatio(); this.survivorStepUpLtcgRate();
      // Only mark stale when there's actually a prior result to be stale.
      // This keeps the banner dormant on the initial page load. Read via
      // untracked() so that runSimulation's results.set() doesn't retrigger
      // this effect and immediately re-set simDirty back to true.
      if (untracked(this.results)) this.simDirty.set(true);
    });
  }

  ngOnInit(): void {
    this.loading.set(true);
    this.healthcare.load();

    // Load financial settings, withdrawal strategy, and locations in parallel
    this.loc.loadFull();

    this.api.getFinancial().subscribe({
      next: (f) => {
        this.fin.set(f);
        this.portfolio.set(f.portfolioBalance ?? 0);
        if (typeof f.expectedReturn === 'number') {
          const drag = weightedAccountDragPct(f);
          this.meanReturn.set(+(f.expectedReturn - drag).toFixed(2));
        }
        if (typeof f.expectedInflation === 'number') this.meanInflation.set(f.expectedInflation);
        if (f.fxDriftEnabled && typeof f.fxDriftAnnualRate === 'number') {
          this.fxDrift.set(f.fxDriftAnnualRate);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.api.getWithdrawal().subscribe({
      next: (w) => { this.wd.set(w); },
      error: (err) => console.warn('MC: withdrawal strategy fetch failed.', err),
    });

    this.api.getHousehold().subscribe({
      next: (h) => {
        this.household.set(h);
        const ssSum = (h.members ?? []).reduce(
          (s, m) => s + estimateBenefitAtClaim(m),
          0,
        );
        if (ssSum > 0) this.ssMonthly.set(Math.round(ssSum));
      },
      error: (err) => console.warn('MC: household fetch failed.', err),
    });

    // Default the location selector to the first full location when it arrives.
    // Handled by `defaultLocationEffect` (field initializer below) — auto-cleans
    // up on component destroy, unlike the previous setInterval polling.
  }

  /**
   * Seeds `selectedLocationId` with the first full location as soon as one is
   * available. `effect()` reruns whenever `loc.fullLocations()` changes and
   * is torn down automatically when the component is destroyed — fixes the
   * previous setInterval leak that survived navigation.
   */
  private defaultLocationEffect = effect(() => {
    const list = this.loc.fullLocations();
    if (list.length && !this.selectedLocationId()) {
      this.selectedLocationId.set(list[0].id);
      this.syncInflationFromLocation();
    }
  });

  /** Pull weighted-average inflation from the selected location. */
  private syncInflationFromLocation(): void {
    const l = this.selectedLoc();
    if (!l?.monthlyCosts) return;
    const w = weightedInflationFromLocation(
      l.monthlyCosts as unknown as Record<string, { typical?: number; annualInflation?: number }>,
    );
    this.meanInflation.set(+(w * 100).toFixed(2));
  }

  /** Add a move to the schedule — defaults to halfway through the horizon at the cheapest location. */
  addMove(): void {
    const locs = this.loc.fullLocations();
    if (!locs.length) return;
    const defaultLoc = [...locs].sort((a, b) =>
      (a.monthlyCostTotal ?? 0) - (b.monthlyCostTotal ?? 0)
    )[0];
    const current = this.moves();
    const lastYear = current.length ? current[current.length - 1].fromYear : 0;
    const newYear = Math.min(this.years() - 1, Math.max(lastYear + 5, Math.floor(this.years() / 2)));
    this.moves.set([
      ...current,
      { fromYear: newYear, locationId: defaultLoc.id, moveCostUSD: 5000 },
    ]);
    this.movesEnabled.set(true);
  }

  removeMove(idx: number): void {
    this.moves.update(list => list.filter((_, i) => i !== idx));
  }

  patchMove(idx: number, partial: Partial<{ fromYear: number; locationId: string; moveCostUSD: number }>): void {
    this.moves.update(list => list.map((m, i) => i === idx ? { ...m, ...partial } : m));
  }

  /** Add a one-time expense row — defaults to year 5, $20K, "Car replacement". */
  addOneTimeExpense(): void {
    const current = this.oneTimeExpenses();
    const lastYear = current.length ? current[current.length - 1].year : 0;
    const newYear = Math.min(this.years() - 1, Math.max(lastYear + 3, 5));
    this.oneTimeExpenses.set([
      ...current,
      { year: newYear, amountUSD: 20000, label: 'Car replacement', inflate: true },
    ]);
    this.oneTimeExpensesEnabled.set(true);
  }

  removeOneTimeExpense(idx: number): void {
    this.oneTimeExpenses.update(list => list.filter((_, i) => i !== idx));
  }

  patchOneTimeExpense(idx: number, partial: Partial<{ year: number; amountUSD: number; label: string; inflate: boolean }>): void {
    this.oneTimeExpenses.update(list => list.map((e, i) => i === idx ? { ...e, ...partial } : e));
  }

  /**
   * Build one kernel-ready segment for a given location. Includes the richer
   * healthcare/tax breakdown so the sim can swap ACA → Medicare per year.
   */
  private buildSegmentForLocation(loc: LocationFull, fromYear: number, moveCostUSD?: number) {
    const monthlyCosts = loc.monthlyCosts ?? {};
    const nonHealthcareBase = this.loc.nonHealthcareBaseMonthly(loc);
    const isUS = loc.country === 'United States';
    const medicareMonthly = monthlyCosts['healthcare']?.typical ?? 0;
    const acaUnsubsidizedMonthly = monthlyCosts['healthcarePreMedicare']?.typical
      ?? loc.healthcare?.acaMarketplace?.benchmarkSilverMonthly2Adult ?? 0;
    const foreignHealthcareMonthly = monthlyCosts['healthcare']?.typical ?? 0;
    const acaSubsidyCapPct = loc.healthcare?.acaMarketplace?.premiumCapPctOfIncome ?? 0.085;
    // Income tax: bracket-based using shared annualIncome — this matches the
    // Compare/Taxes screens so all views stay consistent.
    const tax = this.taxSvc.computeIncomeTax(loc, this.loc.annualIncome());
    const monthlyIncomeTax = tax.monthlyTax;
    return {
      fromYear,
      baseCost: nonHealthcareBase + monthlyIncomeTax + medicareMonthly, // legacy fallback
      isForeign: loc.currency !== 'USD',
      moveCostUSD,
      label: loc.name,
      nonHealthcareBase,
      monthlyIncomeTax,
      medicareMonthly,
      acaUnsubsidizedMonthly,
      acaSubsidyCapPct,
      foreignHealthcareMonthly,
      isUS,
    };
  }

  /** Build the kernel schedule from the UI state — year 0 + any enabled moves. */
  buildSchedule() {
    const primary = this.selectedLoc();
    if (!primary) return undefined;
    const all = this.loc.fullLocations();
    const entries: ReturnType<typeof this.buildSegmentForLocation>[] = [
      this.buildSegmentForLocation(primary, 0),
    ];
    if (this.movesEnabled()) {
      for (const m of this.moves()) {
        const loc = all.find(l => l.id === m.locationId);
        if (!loc) continue;
        entries.push(this.buildSegmentForLocation(loc, m.fromYear, m.moveCostUSD));
      }
    }
    entries.sort((a, b) => a.fromYear - b.fromYear);
    // Always return at least the year-0 segment so the kernel uses the
    // rich breakdown (Medicare transition, income tax) even without moves.
    return entries;
  }

  /** Snap mean/vol params to a named historical period. */
  applyPreset(presetId: string): void {
    this.selectedPresetId.set(presetId);
    const preset = HISTORICAL_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const s = statsForRange(preset.startYear, preset.endYear);
    this.meanReturn.set(+(s.meanReturn * 100).toFixed(2));
    this.volatility.set(+(s.volReturn * 100).toFixed(2));
    this.meanInflation.set(+(s.meanInflation * 100).toFixed(2));
    this.inflVol.set(+(s.volInflation * 100).toFixed(2));
  }

  /**
   * Save the current MC inputs + results as a named scenario. Captures the
   * full parameter snapshot so we can reconstruct / re-run later, plus the
   * key summary stats for at-a-glance comparison on the Scenarios screen.
   */
  saveCurrentScenario(): void {
    const r = this.results();
    if (!r) return;
    const name = window.prompt('Name this scenario:',
      `${this.selectedLoc()?.name ?? 'Scenario'} — ${new Date().toLocaleDateString()}`);
    if (!name) return;

    this.savingScenario.set(true);
    this.saveMsg.set(null);
    this.saveErr.set(false);

    // Envelope shape + summary-stat layout owned by MonteCarloScenarioService;
    // passthrough param snapshot is built here so signal reads stay in the component.
    const scenarioData = this.scenarios.buildPayload(r, this.runs(), this.years(), {
      location: { id: this.selectedLocationId(), name: this.selectedLoc()?.name },
      portfolio: this.portfolio(),
      ssMonthly: this.ssMonthly(),
      monthlyIncome: this.monthlyIncome(),
      partTimeMonthlyIncome: this.partTimeMonthlyIncome(),
      partTimeEndYear: this.partTimeEndYear(),
      meanReturn: this.meanReturn(),
      volatility: this.volatility(),
      meanInflation: this.meanInflation(),
      inflVol: this.inflVol(),
      currVol: this.currVol(),
      fxDrift: this.fxDrift(),
      incGrowth: this.incGrowth(),
      returnMode: this.returnMode(),
      historicalStartYear: this.historicalStartYear(),
      apportionStrategy: this.healthcare.apportionStrategy(),
      magiAnnual: this.healthcare.magi().magiForAca,
      subsidyRegime: this.healthcare.subsidyRegime(),
      transitionExtraIncome: this.healthcare.transitionYearExtraIncome(),
      movesEnabled: this.movesEnabled(),
      moves: this.moves(),
      oneTimeExpensesEnabled: this.oneTimeExpensesEnabled(),
      oneTimeExpenses: this.oneTimeExpenses(),
      ltcMode: this.ltcMode(),
      ltcProbability: this.ltcProbability(),
      ltcCostPerYearUSD: this.ltcCostPerYearUSD(),
      ltcDurationYears: this.ltcDurationYears(),
      ltcStartAgeMin: this.ltcStartAgeMin(),
      ltcStartAgeMax: this.ltcStartAgeMax(),
      ltcInsuranceMonthly: this.ltcInsuranceMonthly(),
      ltcInsuranceStartAge: this.ltcInsuranceStartAge(),
      fxShockEnabled: this.fxShockEnabled(),
      fxShockYear: this.fxShockYear(),
      fxShockPct: this.fxShockPct(),
      spouseDeathEnabled: this.spouseDeathEnabled(),
      spouseDeathYear: this.spouseDeathYear(),
      survivorCostRatio: this.survivorCostRatio(),
      survivorStepUpTaxableBalance: this.survivorStepUpTaxableBalance(),
      survivorStepUpGainRatio: this.survivorStepUpGainRatio(),
      survivorStepUpLtcgRate: this.survivorStepUpLtcgRate(),
    });

    this.api.createScenario({
      name,
      scenarioData,
    }).subscribe({
      next: () => {
        this.savingScenario.set(false);
        this.saveMsg.set('✓ Saved. View on Simulate → Scenarios.');
        setTimeout(() => this.saveMsg.set(null), 4000);
      },
      error: (err) => {
        this.savingScenario.set(false);
        this.saveErr.set(true);
        this.saveMsg.set('Save failed: ' + (err?.error?.error ?? err?.message ?? 'unknown'));
      },
    });
  }

  runSimulation(): void {
    const f = this.fin();
    const l = this.selectedLoc();
    if (!f || !l) return;

    // Refresh inflation from location data each run (matches original behavior)
    this.syncInflationFromLocation();

    this.running.set(true);
    // Defer to next tick so the "Running..." label renders before the CPU loop
    setTimeout(() => {
      try {
        const result = runMonteCarlo({
          portfolio: this.portfolio(),
          monthlyIncome: this.ssMonthly() + this.monthlyIncome(),
          baseCost: this.baseCost(),
          isForeign: this.isForeign(),
          fxDrift: this.fxDrift() / 100,
          runs: this.runs(),
          years: this.years(),
          meanReturn: this.meanReturn() / 100,
          volReturn: this.volatility() / 100,
          meanInflation: this.meanInflation() / 100,
          volInflation: this.inflVol() / 100,
          currVol: this.currVol() / 100,
          incGrowth: this.incGrowth() / 100,
          returnMode: this.returnMode(),
          historicalStartYear: this.historicalStartYear(),
          moveSchedule: this.buildSchedule(),
          oneTimeExpenses: this.oneTimeExpensesEnabled()
            ? this.oneTimeExpenses().map(e => ({
                year: e.year,
                amountUSD: e.amountUSD,
                label: e.label || undefined,
                inflate: e.inflate,
              }))
            : undefined,
          ltcSelfInsureEnabled: this.ltcMode() === 'self-insure' || this.ltcMode() === 'both',
          ltcProbability: this.ltcProbability() / 100,
          ltcCostPerYearUSD: this.ltcCostPerYearUSD(),
          ltcDurationYears: this.ltcDurationYears(),
          ltcStartAgeMin: this.ltcStartAgeMin(),
          ltcStartAgeMax: this.ltcStartAgeMax(),
          ltcInsuranceMonthly: (this.ltcMode() === 'insurance' || this.ltcMode() === 'both')
            ? this.ltcInsuranceMonthly() : 0,
          ltcInsuranceStartAge: this.ltcInsuranceStartAge(),
          fxShockYear: this.fxShockEnabled() ? this.fxShockYear() : undefined,
          fxShockPct: this.fxShockEnabled() ? this.fxShockPct() / 100 : undefined,
          adultBirthYears: this.adults().map(m => m.birthYear),
          simStartYear: this.household()?.planningStartYear ?? new Date().getFullYear(),
          magiAnnual: this.healthcare.magi().magiForAca,
          transitionMagiAnnual: this.healthcare.transitionYearExtraIncome() > 0
            ? this.healthcare.transitionMagi()
            : undefined,
          subsidyRegime: this.healthcare.subsidyRegime(),
          spouseDeathYear: this.spouseDeathEnabled() ? this.spouseDeathYear() : undefined,
          survivorMonthlyIncome: this.spouseDeathEnabled() ? this.survivorMonthlyIncome() : undefined,
          survivorCostRatio: this.spouseDeathEnabled() ? this.survivorCostRatio() / 100 : undefined,
          survivorMonthlyIncomeTax: this.spouseDeathEnabled() ? this.survivorMonthlyIncomeTax() : undefined,
          survivorMedicareMonthly: this.spouseDeathEnabled() ? this.survivorMonthlyMedicare() : undefined,
          survivorBirthYear: this.spouseDeathEnabled() ? (this.survivorBirthYear() ?? undefined) : undefined,
          survivorStepUpBenefitUSD: this.spouseDeathEnabled() ? this.survivorStepUpBenefitUSD() : undefined,
          partTimeMonthlyIncome: this.partTimeMonthlyIncome(),
          partTimeEndYear: this.partTimeEndYear(),
          regime: {
            bullMean: this.regimeBullMean() / 100,
            bullVol: this.regimeBullVol() / 100,
            bearMean: this.regimeBearMean() / 100,
            bearVol: this.regimeBearVol() / 100,
            pBullToBear: this.regimeBullToBear() / 100,
            pBearToBull: this.regimeBearToBull() / 100,
          },
        });
        this.results.set(result);
        this.simDirty.set(false);
        // Calm mode (Dashboard Dyscalculia F-006): reset reveal to the first
        // card so the user steps through the results one at a time.
        this.calmStep.set(1);
      } finally {
        this.running.set(false);
      }
    }, 30);
  }

  /** Reveal the next calm-mode card. Capped at `calmMax`. */
  revealNext(): void {
    this.calmStep.update(n => Math.min(n + 1, this.calmMax));
  }
  /** Reveal everything at once — "Skip to full results". */
  revealAll(): void {
    this.calmStep.set(this.calmMax);
  }
  /** Predicate used by the template: true when the card at `step` should render. */
  showStep(step: number): boolean {
    return !this.dyscalculia.isCalmMc() || this.calmStep() >= step;
  }

  /** Calendar year "right now" — fallback when household.planningStartYear isn't set. */
  todayYear(): number { return new Date().getFullYear(); }

  /** Template adapter — keeps existing `fmt(x)` / `fmt(x, '/yr')` template
   *  call sites working. Logic lives in CurrencyFormatService. */
  fmt(amount: number, unit: '/mo' | '/yr' | '' = '/mo'): string {
    if (unit === '/yr') return this.currency.currencyYearly(amount);
    if (unit === '/mo') return this.currency.currencyMonthly(amount);
    return this.currency.currency(amount);
  }

  /** Abbreviated K/M/B currency. Dyscalculia mode: full digits (per F-003). */
  fmtK(amount: number): string {
    return this.currency.currencyShort(amount);
  }

  /** Tone class for the success-rate card. Delegates to the service. */
  toneClass(fraction: number): 'success' | 'warn' | 'neutral' {
    return this.dyscalculia.toneForSuccessRate(fraction);
  }

  /** Annual spending reference for the percentile anchors. */
  annualSpending(): number {
    return (this.baseCost() - this.ssMonthly() - this.monthlyIncome()) * 12;
  }

  /** Download a PNG snapshot of the paths + histogram + percentile summary.
   *  Rebuilds the charts into a single self-contained SVG (no external CSS
   *  dependency), rasterizes via a data-URL Image → canvas pipeline, then
   *  triggers a browser download. No new deps. */
  saveChartsPng(): void {
    const r = this.results();
    if (!r) return;
    const svgStr = this.buildStandaloneSvg();
    svgToPngBlob(svgStr, 2).then(blob => {
      const name = `monte-carlo-${new Date().toISOString().slice(0, 10)}-${Math.round(r.successRate * 100)}pct.png`;
      downloadBlob(name, blob);
    }).catch(err => {
      console.warn('Save PNG failed:', err);
      this.saveMsg.set('Save PNG failed: ' + (err?.message ?? 'unknown'));
      this.saveErr.set(true);
    });
  }

  /** Open a new window navigated to a Blob URL containing print-styled HTML
   *  with the charts + summary, then trigger the print dialog. The window
   *  owns its own stylesheet so the dashboard's dark theme doesn't bleed in. */
  printCharts(): void {
    const r = this.results();
    if (!r) return;
    const svgStr = this.buildStandaloneSvg();
    const html = buildPrintHtml(svgStr);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    // `noopener` severs `window.opener` in the new window, blocking tab-nabbing
    // and any future regression that might pass API data into the SVG builder
    // unescaped. Some browsers return null for win under noopener — the
    // null-check below handles that path the same as a popup-block.
    const win = window.open(url, '_blank', 'width=820,height=1000,noopener,noreferrer');
    if (!win) {
      URL.revokeObjectURL(url);
      this.saveMsg.set('Popup blocked — allow popups for this site to print.');
      this.saveErr.set(true);
      return;
    }
    // With noopener we can't listen for the child's load event, so use a
    // timeout fallback long enough for the new window to fetch the blob URL.
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  /** Build a standalone SVG document string containing: title, success rate,
   *  paths chart, histogram, and percentile list. Self-contained — no
   *  external CSS needed to render correctly. */
  private buildStandaloneSvg(): string {
    const r = this.results()!;
    const locName = this.selectedLoc()?.name ?? 'No location';
    const headerH = 90;
    const gap = 24;
    const pctH = 120;
    const totalW = PATH_CHART_W;
    const totalH = headerH + PATH_CHART_H + gap + HIST_CHART_H + gap + pctH + 30;

    const paths = this.pathData();
    const pathZeroY = this.pathZeroY();
    const pathYMax = this.pathYMax();
    const pathYMin = this.pathYMin();
    const histBars = this.histBars();
    const histMinStr = this.fmt(this.histMin(), '');
    const histMaxStr = this.fmt(this.histMax(), '');
    const medianX = this.medianX();
    const pctBars = this.percentileBars();

    const esc = (s: string) => String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
    );

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`;
    svg += `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#ffffff"/>`;
    svg += `<text x="16" y="28" font-family="system-ui" font-size="18" font-weight="700" fill="#111">Monte Carlo — ${esc(locName)}</text>`;
    svg += `<text x="16" y="50" font-family="system-ui" font-size="13" fill="#333">`
         + `Success rate: ${(r.successRate * 100).toFixed(0)}% · `
         + `${this.runs().toLocaleString()} simulated futures over ${this.years()} years`
         + `</text>`;
    svg += `<text x="16" y="70" font-family="system-ui" font-size="12" fill="#666">`
         + `Median ${this.fmt(r.median, '')} · 5th ${this.fmt(r.p5, '')} · 95th ${this.fmt(r.p95, '')}`
         + `</text>`;

    const pY = headerH;
    svg += `<g transform="translate(0,${pY})">`;
    svg += `<text x="16" y="16" font-family="system-ui" font-size="12" font-weight="600" fill="#333">Portfolio Paths</text>`;
    svg += `<g transform="translate(0,24)">`;
    svg += `<line x1="0" x2="${PATH_CHART_W}" y1="${pathZeroY}" y2="${pathZeroY}" stroke="#999" stroke-dasharray="3,3" stroke-width="1"/>`;
    for (const pd of paths) {
      svg += `<polyline points="${esc(pd.points)}" stroke="${pd.color}" stroke-width="1" fill="none" opacity="0.6"/>`;
    }
    svg += `<text x="4" y="12" font-family="system-ui" font-size="10" fill="#666">${esc(this.fmt(pathYMax, ''))}</text>`;
    svg += `<text x="4" y="${pathZeroY - 4}" font-family="system-ui" font-size="10" fill="#666">$0</text>`;
    svg += `<text x="4" y="${PATH_CHART_H - 4}" font-family="system-ui" font-size="10" fill="#666">${esc(this.fmt(pathYMin, ''))}</text>`;
    svg += `<text x="${PATH_CHART_W - 4}" y="${PATH_CHART_H - 4}" text-anchor="end" font-family="system-ui" font-size="10" fill="#666">Year ${this.years()}</text>`;
    svg += `</g></g>`;

    const hY = headerH + PATH_CHART_H + 24 + gap;
    svg += `<g transform="translate(0,${hY})">`;
    svg += `<text x="16" y="16" font-family="system-ui" font-size="12" font-weight="600" fill="#333">End Balance Distribution</text>`;
    svg += `<g transform="translate(0,24)">`;
    for (const bar of histBars) {
      svg += `<rect x="${bar.x}" y="${bar.y}" width="${bar.w}" height="${bar.h}" fill="${bar.color}"/>`;
    }
    svg += `<line x1="${medianX}" x2="${medianX}" y1="0" y2="${HIST_CHART_H - 18}" stroke="#D4943A" stroke-width="2"/>`;
    svg += `<text x="${medianX}" y="12" text-anchor="middle" font-family="system-ui" font-size="10" fill="#333">Median</text>`;
    svg += `<text x="4" y="${HIST_CHART_H - 4}" font-family="system-ui" font-size="10" fill="#666">${esc(histMinStr)}</text>`;
    svg += `<text x="${HIST_CHART_W - 4}" y="${HIST_CHART_H - 4}" text-anchor="end" font-family="system-ui" font-size="10" fill="#666">${esc(histMaxStr)}</text>`;
    svg += `</g></g>`;

    const bY = headerH + PATH_CHART_H + 24 + gap + HIST_CHART_H + 24 + gap;
    svg += `<g transform="translate(0,${bY})">`;
    svg += `<text x="16" y="16" font-family="system-ui" font-size="12" font-weight="600" fill="#333">Percentile Breakdown</text>`;
    const rowH = 16;
    const labelW = 80;
    const barW = totalW - labelW - 40;
    pctBars.forEach((p, i) => {
      const y = 24 + i * rowH;
      const fillW = Math.max(2, (p.width / 100) * barW);
      svg += `<text x="16" y="${y + 11}" font-family="system-ui" font-size="11" fill="#333">${esc(p.label)}</text>`;
      svg += `<rect x="${labelW + 16}" y="${y}" width="${barW}" height="12" fill="#eee" rx="2"/>`;
      svg += `<rect x="${labelW + 16}" y="${y}" width="${fillW}" height="12" fill="${p.color}" rx="2"/>`;
      svg += `<text x="${labelW + 16 + fillW + 4}" y="${y + 10}" font-family="system-ui" font-size="10" fill="#333">${esc(this.fmt(p.value, ''))}</text>`;
    });
    svg += `</g>`;

    svg += `</svg>`;
    return svg;
  }
}

/** Build a print-ready HTML document wrapping the SVG with print CSS and an
 *  autoprint trigger. All interpolated values (the SVG string) are already
 *  escaped during SVG assembly. */
function buildPrintHtml(svgStr: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Monte Carlo Results</title>
<style>
  @page { size: letter; margin: 0.5in; }
  body { font-family: system-ui, sans-serif; color: #111; margin: 0; padding: 24px; background: #fff; }
  svg { display: block; max-width: 100%; height: auto; }
  .noprint { margin-bottom: 16px; color: #666; font-size: 12px; }
  .noprint button {
    padding: 6px 12px; border-radius: 4px; border: 1px solid #999;
    background: #eee; cursor: pointer; margin-right: 8px;
  }
  @media print { .noprint { display: none; } }
</style></head>
<body onload="setTimeout(function(){window.print()},250)">
  <div class="noprint">
    <button onclick="window.print()">Print</button>
    <button onclick="window.close()">Close</button>
  </div>
  ${svgStr}
</body></html>`;
}

/** Convert an SVG string to a PNG Blob via an off-screen canvas. Scales by
 *  `pixelRatio` so the export looks crisp on retina displays. */
function svgToPngBlob(svgStr: string, pixelRatio = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const widthMatch = svgStr.match(/width="(\d+)"/);
    const heightMatch = svgStr.match(/height="(\d+)"/);
    const w = widthMatch ? parseInt(widthMatch[1]!, 10) : 800;
    const h = heightMatch ? parseInt(heightMatch[1]!, 10) : 600;
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * pixelRatio;
      canvas.height = h * pixelRatio;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no 2d context')); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(pixelRatio, pixelRatio);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error('image load failed: ' + e)); };
    img.src = url;
  });
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
