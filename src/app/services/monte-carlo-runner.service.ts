import { Injectable, inject, signal } from '@angular/core';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { HealthcareService } from '@services/healthcare.service';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { LocationFull } from '@models/api.model';
import { runMonteCarlo } from '@app/lib/monte-carlo';

/**
 * Orchestrates a Monte Carlo simulation run: assembles the kernel-ready
 * payload from the current MonteCarloStateService state, calls the kernel,
 * and persists results back to state. Owns the `running` UX flag.
 *
 * Component-scoped (paired with MonteCarloStateService) so each visit to
 * the screen gets a fresh runner. State is held by MonteCarloStateService;
 * this service is action.
 *
 * Phase 2c of the god-component split (audit follow-up #1). Lifts the
 * runSimulation method off the parent component so the parent can be a
 * thin orchestrator that just bootstraps API loads.
 */
@Injectable()
export class MonteCarloRunnerService {
  private readonly state = inject(MonteCarloStateService);
  private readonly loc = inject(LocationService);
  private readonly taxSvc = inject(TaxService);
  private readonly healthcare = inject(HealthcareService);

  /** True while the kernel is executing. Templates bind to this for the
   *  Run-button label / disable state. */
  readonly running = signal(false);

  /** Kick off a simulation. Mutates state.results and state.simDirty when
   *  the kernel completes. No-op when fin or selectedLoc is missing. */
  run(): void {
    const f = this.state.fin();
    const l = this.state.selectedLoc();
    if (!f || !l) return;

    // Refresh inflation from location data each run (matches original behavior:
    // if the user changed location since the last run, the default inflation
    // should re-derive from the new location's category-weighted average).
    this.state.syncInflationFromLocation();

    this.running.set(true);
    // Defer to next tick so the "Running..." label renders before the CPU loop.
    setTimeout(() => {
      try {
        const s = this.state;
        const result = runMonteCarlo({
          portfolio: s.portfolio(),
          monthlyIncome: s.ssMonthly() + s.monthlyIncome(),
          baseCost: s.baseCost(),
          isForeign: s.isForeign(),
          fxDrift: s.fxDrift() / 100,
          runs: s.runs(),
          years: s.years(),
          meanReturn: s.meanReturn() / 100,
          volReturn: s.volatility() / 100,
          meanInflation: s.meanInflation() / 100,
          volInflation: s.inflVol() / 100,
          currVol: s.currVol() / 100,
          incGrowth: s.incGrowth() / 100,
          returnMode: s.returnMode(),
          historicalStartYear: s.historicalStartYear(),
          moveSchedule: this.buildSchedule(),
          oneTimeExpenses: s.oneTimeExpensesEnabled()
            ? s.oneTimeExpenses().map(e => ({
                year: e.year,
                amountUSD: e.amountUSD,
                label: e.label || undefined,
                inflate: e.inflate,
              }))
            : undefined,
          ltcSelfInsureEnabled: s.ltcMode() === 'self-insure' || s.ltcMode() === 'both',
          ltcProbability: s.ltcProbability() / 100,
          ltcCostPerYearUSD: s.ltcCostPerYearUSD(),
          ltcDurationYears: s.ltcDurationYears(),
          ltcStartAgeMin: s.ltcStartAgeMin(),
          ltcStartAgeMax: s.ltcStartAgeMax(),
          ltcInsuranceMonthly: (s.ltcMode() === 'insurance' || s.ltcMode() === 'both')
            ? s.ltcInsuranceMonthly() : 0,
          ltcInsuranceStartAge: s.ltcInsuranceStartAge(),
          fxShockYear: s.fxShockEnabled() ? s.fxShockYear() : undefined,
          fxShockPct: s.fxShockEnabled() ? s.fxShockPct() / 100 : undefined,
          adultBirthYears: s.adults().map(m => m.birthYear),
          simStartYear: s.household()?.planningStartYear ?? new Date().getFullYear(),
          magiAnnual: this.healthcare.magi().magiForAca,
          transitionMagiAnnual: this.healthcare.transitionYearExtraIncome() > 0
            ? this.healthcare.transitionMagi()
            : undefined,
          subsidyRegime: this.healthcare.subsidyRegime(),
          spouseDeathYear: s.spouseDeathEnabled() ? s.spouseDeathYear() : undefined,
          survivorMonthlyIncome: s.spouseDeathEnabled() ? s.survivorMonthlyIncome() : undefined,
          survivorCostRatio: s.spouseDeathEnabled() ? s.survivorCostRatio() / 100 : undefined,
          survivorMonthlyIncomeTax: s.spouseDeathEnabled() ? s.survivorMonthlyIncomeTax() : undefined,
          survivorMedicareMonthly: s.spouseDeathEnabled() ? s.survivorMonthlyMedicare() : undefined,
          survivorBirthYear: s.spouseDeathEnabled() ? (s.survivorBirthYear() ?? undefined) : undefined,
          survivorStepUpBenefitUSD: s.spouseDeathEnabled() ? s.survivorStepUpBenefitUSD() : undefined,
          partTimeMonthlyIncome: s.partTimeMonthlyIncome(),
          partTimeEndYear: s.partTimeEndYear(),
          inheritanceTaxByYear: s.spouseDeathEnabled() ? this.buildInheritanceTaxByYear(s.years()) : undefined,
          regime: {
            bullMean: s.regimeBullMean() / 100,
            bullVol: s.regimeBullVol() / 100,
            bearMean: s.regimeBearMean() / 100,
            bearVol: s.regimeBearVol() / 100,
            pBullToBear: s.regimeBullToBear() / 100,
            pBearToBull: s.regimeBearToBull() / 100,
          },
        });
        s.results.set(result);
        s.simDirty.set(false);
        // McResultsComponent watches state.results() and resets its
        // calm-mode reveal step (F-006) via an effect.
      } finally {
        this.running.set(false);
      }
    }, 30);
  }

  /** Build one kernel-ready segment for a given location. Includes the richer
   *  healthcare/tax breakdown so the sim can swap ACA → Medicare per year. */
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

  /** Build the per-year inheritance-tax payload for the spouse-death scenario.
   *  At each sim year, picks the active location (year-0 primary or whichever
   *  move is in effect by that year) and pre-flattens its `taxes.inheritance`
   *  into the kernel's `{ effectiveRate, exemptionUSDBaseline }` shape.
   *
   *  Phase 3b — only built when spouseDeathEnabled is true (the kernel still
   *  tolerates the array being absent or having undefined entries).
   *
   *  effectiveRate flattening:
   *    spouseExemption='full' or topRate=0 → 0 (silent zero, no hit)
   *    spouseExemption='none'              → topRate
   *    spouseExemption='partial' or unset  → directFamilyEffectiveRate ?? topRate
   *
   *  exemptionUSDBaseline = exemptionLocal / loc.exchangeRate
   *  (loc.exchangeRate is "local-per-USD"; e.g. France ≈ 0.93 EUR/USD; USD = 1)
   *  Per-trial FX volatility is layered on at kernel time — this is just the
   *  baseline for that multiplier to scale. */
  private buildInheritanceTaxByYear(years: number): ({ effectiveRate: number; exemptionUSDBaseline: number } | undefined)[] {
    const all = this.loc.fullLocations();
    const primary = this.state.selectedLoc();
    if (!primary) return [];

    // Determine the active location at each sim year given the move schedule.
    const moves = this.state.movesEnabled() ? this.state.moves() : [];
    const activeAtYear = (y: number): LocationFull => {
      let active: LocationFull = primary;
      for (const m of moves) {
        if (y >= m.fromYear) {
          const loc = all.find(l => l.id === m.locationId);
          if (loc) active = loc;
        }
      }
      return active;
    };

    const arr: ({ effectiveRate: number; exemptionUSDBaseline: number } | undefined)[] = new Array(years);
    for (let y = 0; y < years; y++) {
      const loc = activeAtYear(y);
      const inh = loc.taxes?.inheritance;
      if (!inh || !inh.topRate) {
        arr[y] = { effectiveRate: 0, exemptionUSDBaseline: 0 };
        continue;
      }
      let effectiveRate = 0;
      if (inh.spouseExemption === 'full') effectiveRate = 0;
      else if (inh.spouseExemption === 'none') effectiveRate = inh.topRate;
      else effectiveRate = inh.directFamilyEffectiveRate ?? inh.topRate;

      const exchangeRate = loc.exchangeRate ?? 1;
      const exemptionUSDBaseline = (inh.exemptionLocal ?? 0) / exchangeRate;
      arr[y] = { effectiveRate, exemptionUSDBaseline };
    }
    return arr;
  }

  /** Build the kernel schedule from the UI state — year 0 + any enabled moves. */
  private buildSchedule() {
    const primary = this.state.selectedLoc();
    if (!primary) return undefined;
    const all = this.loc.fullLocations();
    const entries: ReturnType<typeof this.buildSegmentForLocation>[] = [
      this.buildSegmentForLocation(primary, 0),
    ];
    if (this.state.movesEnabled()) {
      for (const m of this.state.moves()) {
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
}
