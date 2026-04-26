import { Component, inject, signal, effect, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { MonteCarloScenarioService } from '@services/monte-carlo-scenario.service';
import { HealthcareService } from '@services/healthcare.service';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { FinancialSettings, LocationFull, HouseholdMember } from '@models/api.model';
import { runMonteCarlo, weightedInflationFromLocation } from '@app/lib/monte-carlo';
import { HISTORICAL_PRESETS, statsForRange } from '@app/data/historical-returns';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';

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

/**
 * Monthly SS benefit adjusted for claim age. Mirrors the same helper in
 * ss-screen.component.ts:estimateBenefit so the two screens agree.
 */
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

@Component({
  selector: 'app-montecarlo-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective, SourceTooltipComponent],
  templateUrl: './montecarlo-screen.component.html',
  styleUrls: ['./montecarlo-screen.component.scss'],
  // Component-scoped so each visit to the screen starts with a fresh state
  // instance, matching the pre-extraction behavior where signals were class
  // fields recreated on mount.
  providers: [MonteCarloStateService],
})
export class MontecarloScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly loc = inject(LocationService);
  readonly taxSvc = inject(TaxService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly healthcare = inject(HealthcareService);
  private readonly currency = inject(CurrencyFormatService);
  private readonly scenarios = inject(MonteCarloScenarioService);
  private readonly state = inject(MonteCarloStateService);

  /* ─── Screen-only UX state (loading flags, save messages, calm reveal) ─── */
  readonly loading = signal(false);
  readonly running = signal(false);

  /** Calm-mode reveal step (Dashboard Dyscalculia F-006). 0=none shown,
   *  1=success, 2=+median, 3=+worst, 4=+best, 5=+summary, 6=+paths chart,
   *  7=+histogram, 8=+percentile bars. Reset on every new run. Only consulted
   *  when `dyscalculia.isCalmMc()` is true. */
  readonly calmStep = signal(1);
  readonly calmMax = 8;

  readonly savingScenario = signal(false);
  readonly saveMsg = signal<string | null>(null);
  readonly saveErr = signal(false);

  /* ─── Sim state pass-throughs ──────────────────────────────────────────
   * Phase 1 of audit follow-up #1: state moved to MonteCarloStateService.
   * Templates still read these as `runs()`, `moves()`, etc., so the
   * 830-line template stays untouched. Phase 2 will introduce sub-components
   * that inject the state service directly and these facades will retire. */
  readonly fin = this.state.fin;
  readonly wd = this.state.wd;
  readonly household = this.state.household;
  readonly selectedLocationId = this.state.selectedLocationId;
  readonly portfolio = this.state.portfolio;
  readonly ssMonthly = this.state.ssMonthly;
  readonly monthlyIncome = this.state.monthlyIncome;
  readonly partTimeMonthlyIncome = this.state.partTimeMonthlyIncome;
  readonly partTimeEndYear = this.state.partTimeEndYear;
  readonly runs = this.state.runs;
  readonly ssCutSources = this.state.ssCutSources;
  readonly rmdSources = this.state.rmdSources;
  readonly years = this.state.years;
  readonly meanReturn = this.state.meanReturn;
  readonly volatility = this.state.volatility;
  readonly meanInflation = this.state.meanInflation;
  readonly inflVol = this.state.inflVol;
  readonly currVol = this.state.currVol;
  readonly fxDrift = this.state.fxDrift;
  readonly incGrowth = this.state.incGrowth;
  readonly returnMode = this.state.returnMode;
  readonly selectedPresetId = this.state.selectedPresetId;
  readonly historicalStartYear = this.state.historicalStartYear;
  readonly regimeBullMean = this.state.regimeBullMean;
  readonly regimeBullVol = this.state.regimeBullVol;
  readonly regimeBearMean = this.state.regimeBearMean;
  readonly regimeBearVol = this.state.regimeBearVol;
  readonly regimeBullToBear = this.state.regimeBullToBear;
  readonly regimeBearToBull = this.state.regimeBearToBull;
  readonly historicalPresets = this.state.historicalPresets;
  readonly historicalYears = this.state.historicalYears;
  readonly moves = this.state.moves;
  readonly movesEnabled = this.state.movesEnabled;
  readonly oneTimeExpenses = this.state.oneTimeExpenses;
  readonly oneTimeExpensesEnabled = this.state.oneTimeExpensesEnabled;
  readonly ltcMode = this.state.ltcMode;
  readonly ltcProbability = this.state.ltcProbability;
  readonly ltcCostPerYearUSD = this.state.ltcCostPerYearUSD;
  readonly ltcDurationYears = this.state.ltcDurationYears;
  readonly ltcStartAgeMin = this.state.ltcStartAgeMin;
  readonly ltcStartAgeMax = this.state.ltcStartAgeMax;
  readonly ltcInsuranceMonthly = this.state.ltcInsuranceMonthly;
  readonly ltcInsuranceStartAge = this.state.ltcInsuranceStartAge;
  readonly fxShockEnabled = this.state.fxShockEnabled;
  readonly fxShockYear = this.state.fxShockYear;
  readonly fxShockPct = this.state.fxShockPct;
  readonly spouseDeathEnabled = this.state.spouseDeathEnabled;
  readonly spouseDeathYear = this.state.spouseDeathYear;
  readonly survivorCostRatio = this.state.survivorCostRatio;
  readonly deceasedMemberIndex = this.state.deceasedMemberIndex;
  readonly survivorStepUpTaxableBalance = this.state.survivorStepUpTaxableBalance;
  readonly survivorStepUpGainRatio = this.state.survivorStepUpGainRatio;
  readonly survivorStepUpLtcgRate = this.state.survivorStepUpLtcgRate;
  readonly results = this.state.results;
  readonly simDirty = this.state.simDirty;

  /* Chart dimensions */
  readonly pathW = this.state.pathW;
  readonly pathH = this.state.pathH;
  readonly histW = this.state.histW;
  readonly histH = this.state.histH;

  /* Computeds derived from sim state */
  readonly selectedLoc = this.state.selectedLoc;
  readonly isForeign = this.state.isForeign;
  readonly baseCost = this.state.baseCost;
  readonly adults = this.state.adults;
  readonly survivorMonthlySs = this.state.survivorMonthlySs;
  readonly survivorBirthYear = this.state.survivorBirthYear;
  readonly survivorMonthlyIncome = this.state.survivorMonthlyIncome;
  readonly survivorMonthlyIncomeTax = this.state.survivorMonthlyIncomeTax;
  readonly survivorMonthlyMedicare = this.state.survivorMonthlyMedicare;
  readonly survivorStepUpBenefitUSD = this.state.survivorStepUpBenefitUSD;
  readonly survivorPostDeathMonthly = this.state.survivorPostDeathMonthly;
  readonly ssLifetime = this.state.ssLifetime;
  readonly pathYMax = this.state.pathYMax;
  readonly pathYMin = this.state.pathYMin;
  readonly pathZeroY = this.state.pathZeroY;
  readonly pathData = this.state.pathData;
  readonly histMin = this.state.histMin;
  readonly histMax = this.state.histMax;
  readonly histBars = this.state.histBars;
  readonly medianX = this.state.medianX;
  readonly percentileBars = this.state.percentileBars;

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
    const totalW = this.pathW;
    const totalH = headerH + this.pathH + gap + this.histH + gap + pctH + 30;

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
    svg += `<line x1="0" x2="${this.pathW}" y1="${pathZeroY}" y2="${pathZeroY}" stroke="#999" stroke-dasharray="3,3" stroke-width="1"/>`;
    for (const pd of paths) {
      svg += `<polyline points="${esc(pd.points)}" stroke="${pd.color}" stroke-width="1" fill="none" opacity="0.6"/>`;
    }
    svg += `<text x="4" y="12" font-family="system-ui" font-size="10" fill="#666">${esc(this.fmt(pathYMax, ''))}</text>`;
    svg += `<text x="4" y="${pathZeroY - 4}" font-family="system-ui" font-size="10" fill="#666">$0</text>`;
    svg += `<text x="4" y="${this.pathH - 4}" font-family="system-ui" font-size="10" fill="#666">${esc(this.fmt(pathYMin, ''))}</text>`;
    svg += `<text x="${this.pathW - 4}" y="${this.pathH - 4}" text-anchor="end" font-family="system-ui" font-size="10" fill="#666">Year ${this.years()}</text>`;
    svg += `</g></g>`;

    const hY = headerH + this.pathH + 24 + gap;
    svg += `<g transform="translate(0,${hY})">`;
    svg += `<text x="16" y="16" font-family="system-ui" font-size="12" font-weight="600" fill="#333">End Balance Distribution</text>`;
    svg += `<g transform="translate(0,24)">`;
    for (const bar of histBars) {
      svg += `<rect x="${bar.x}" y="${bar.y}" width="${bar.w}" height="${bar.h}" fill="${bar.color}"/>`;
    }
    svg += `<line x1="${medianX}" x2="${medianX}" y1="0" y2="${this.histH - 18}" stroke="#D4943A" stroke-width="2"/>`;
    svg += `<text x="${medianX}" y="12" text-anchor="middle" font-family="system-ui" font-size="10" fill="#333">Median</text>`;
    svg += `<text x="4" y="${this.histH - 4}" font-family="system-ui" font-size="10" fill="#666">${esc(histMinStr)}</text>`;
    svg += `<text x="${this.histW - 4}" y="${this.histH - 4}" text-anchor="end" font-family="system-ui" font-size="10" fill="#666">${esc(histMaxStr)}</text>`;
    svg += `</g></g>`;

    const bY = headerH + this.pathH + 24 + gap + this.histH + 24 + gap;
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
