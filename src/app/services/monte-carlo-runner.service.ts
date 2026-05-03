import { Injectable, inject, signal } from '@angular/core';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { HealthcareService } from '@services/healthcare.service';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { RentalIncomeService } from '@services/rental-income.service';
import { LocationFull } from '@models/api.model';
import { runMonteCarlo } from '@app/lib/monte-carlo';
import { aggregateRentalIncome } from '@app/lib/rental-income';
import { monthlyMedicareFor } from '@app/lib/irmaa';

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
  private readonly rental = inject(RentalIncomeService);

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
          oneTimeIncomes: s.oneTimeIncomesEnabled()
            ? s.oneTimeIncomes().map(e => ({
                year: e.year,
                amountUSD: e.amountUSD,
                label: e.label || undefined,
                inflate: e.inflate,
              }))
            : undefined,
          // Inherited traditional IRA + property sales — both routed
          // through the unified `lifeEvents` channel.
          //   - inheritedIRA: SECURE Act 10-year drain (#31 priority 5)
          //   - propertySale: Sec 1250 recapture + LTCG (Todo #35)
          // `compileLifeEvents` passes them through to the kernel
          // verbatim; per-kind dispatchers handle the math.
          lifeEvents: this.buildLifeEvents(),
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
          // Rental Schedule E income (Todo #34, Stage 4b of #29). Pass-through
          // to the kernel which pre-computes per-year cash + taxable arrays
          // and applies them in the year loop. Empty array (no properties
          // configured) is byte-identical to a legacy run.
          rentalProperties: this.rental.properties(),
          // Filing status for LTCG bracket lookup on propertySale events
          // (Todo #35). Two-adult households → MFJ; single-adult → single.
          propertySaleFilingStatus: s.adults().length >= 2 ? 'mfj' : 'single',
          inheritanceTaxByYear: s.spouseDeathEnabled() ? this.buildInheritanceTaxByYear(s.years()) : undefined,
          medicareMonthlyByYear: this.buildMedicareMonthlyByYear(s.years()),
          survivorRelocate: this.buildSurvivorRelocate(),
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

  /** Combine all caller-supplied LifeEvent rows into the unified channel
   *  consumed by the kernel's `compileLifeEvents`. Currently merges:
   *    - inheritedIRA events (#31 priority 5, [PR #108](https://github.com/justice8096/retirement-dashboard-angular/pull/108))
   *    - propertySale events (Todo #35) — Sec 1250 recapture + LTCG
   *  Returns `undefined` when neither toggle is enabled, so legacy
   *  callers and tests stay byte-identical when nothing is configured. */
  private buildLifeEvents() {
    const s = this.state;
    const events: import('@app/lib/monte-carlo').LifeEvent[] = [];
    if (s.inheritedIRAsEnabled()) {
      for (const e of s.inheritedIRAs()) {
        events.push({
          kind: 'inheritedIRA',
          year: e.year,
          balanceUSD: e.balanceUSD,
          drainOverYears: e.drainOverYears,
          // UI stores tax rate as a percent (e.g. 22 = 22%); kernel
          // expects a decimal. Same convention throughout this object.
          effectiveTaxRate: e.effectiveTaxRate / 100,
          label: e.label || undefined,
        });
      }
    }
    if (s.propertySalesEnabled()) {
      for (const e of s.propertySales()) {
        events.push({
          kind: 'propertySale',
          year: e.year,
          propertyId: e.propertyId,
          salePriceUSD: e.salePriceUSD,
          sellingExpenses: e.sellingExpenses || undefined,
          label: e.label || undefined,
        });
      }
    }
    return events.length ? events : undefined;
  }

  /** Build the survivor-relocation segment (#31 priority 4). Returns undefined
   *  when the user hasn't enabled the toggle or hasn't picked a location.
   *  Kernel injects the death year as `fromYear` at dispatch time, so any
   *  value here is overwritten — we pass 0 as a safe placeholder. */
  private buildSurvivorRelocate() {
    const s = this.state;
    if (!s.spouseDeathEnabled() || !s.survivorRelocateEnabled()) return undefined;
    const locId = s.survivorRelocateLocationId();
    if (!locId) return undefined;
    const loc = this.loc.fullLocations().find(l => l.id === locId);
    if (!loc) return undefined;
    return this.buildSegmentForLocation(loc, 0, s.survivorRelocateMoveCostUSD() || undefined);
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

  /**
   * Pre-compute per-year Medicare premium override for the inherited-IRA
   * IRMAA tier ripple (#31 priority 5 follow-up). Returns `undefined` when
   * inheritedIRAs are disabled — kernel falls back to the segment's flat
   * `m.medicareMonthly`, preserving byte-identity for non-inheritedIRA
   * callers.
   *
   * Algorithm per year y:
   *   1. magiAugment = sum of (balanceUSD / drainOverYears) for any
   *      inheritedIRA event whose drain window covers y.
   *   2. effectiveMagi = baseline MAGI + magiAugment.
   *   3. perAdult = monthlyMedicareFor(filingStatus, effectiveMagi).
   *      Filing status: 'married' if 2+ adults in household, else 'single'.
   *   4. household total = perAdult × nAdults (matches `m.medicareMonthly`
   *      semantics — kernel divides by nAdults internally and multiplies
   *      by Medicare-eligible adult count).
   *
   * Sparse semantics: years with augment === 0 are left `undefined` so the
   * kernel falls through to `m.medicareMonthly` (no-op for non-augmented
   * years). This preserves the seed-derived Medicare cost for years where
   * IRMAA wouldn't move; only the augmented years get a tier-aware override.
   */
  private buildMedicareMonthlyByYear(years: number): (number | undefined)[] | undefined {
    const s = this.state;
    const iraEvents = s.inheritedIRAsEnabled() ? s.inheritedIRAs() : [];
    const rentalProps = this.rental.properties();
    // Rental loss-years can also move IRMAA tiers (downward) — include
    // them whenever properties are configured, not just when iraEvents are.
    if (!iraEvents.length && !rentalProps.length) return undefined;

    const adults = s.adults();
    const nAdults = Math.max(1, adults.length);
    const filingStatus: 'single' | 'married' = nAdults >= 2 ? 'married' : 'single';
    const baseMagi = this.healthcare.magi().magiForAca;

    const arr: (number | undefined)[] = new Array(years);
    for (let y = 0; y < years; y++) {
      let augment = 0;
      for (const e of iraEvents) {
        const drainYears = Math.max(1, e.drainOverYears ?? 10);
        if (y >= e.year && y < e.year + drainYears) {
          augment += e.balanceUSD / drainYears;
        }
      }
      // Rental Schedule E taxable contribution — can be negative (paper
      // loss from depreciation), which legitimately reduces MAGI and may
      // shift the household to a lower IRMAA tier. Mirrors the kernel's
      // magiAugmentByYear contribution.
      if (rentalProps.length) {
        augment += aggregateRentalIncome(rentalProps, y).totalTaxableNet;
      }
      // Skip years with no augmentation in either direction — kernel
      // falls through to the segment's flat `m.medicareMonthly`.
      if (augment === 0) continue;
      const effectiveMagi = Math.max(0, baseMagi + augment);
      const perAdult = monthlyMedicareFor(filingStatus, effectiveMagi);
      arr[y] = perAdult * nAdults;
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
