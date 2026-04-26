import { Component, inject, signal, effect, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { HealthcareService } from '@services/healthcare.service';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { FinancialSettings, LocationFull, HouseholdMember } from '@models/api.model';
import { runMonteCarlo, weightedInflationFromLocation } from '@app/lib/monte-carlo';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';
import { McResultsComponent } from './mc-results/mc-results.component';
import { McParametersComponent } from './mc-parameters/mc-parameters.component';
import { McSamplingComponent } from './mc-sampling/mc-sampling.component';
import { McScenariosComponent } from './mc-scenarios/mc-scenarios.component';

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
  imports: [MatButtonModule, SourceTooltipComponent, McResultsComponent, McParametersComponent, McSamplingComponent, McScenariosComponent],
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
  private readonly state = inject(MonteCarloStateService);

  /* ─── Screen-only UX state (data-loading flags only — the post-run
   *  save bar / save messages / calm-reveal moved into McResultsComponent
   *  along with the rest of the Results section.) ─── */
  readonly loading = signal(false);
  readonly running = signal(false);

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
        // McResultsComponent watches state.results() and resets its
        // calm-mode reveal step (F-006) via an effect — parent doesn't
        // need to coordinate it.
      } finally {
        this.running.set(false);
      }
    }, 30);
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

}
