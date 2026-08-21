import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { RentalIncomeService } from '@services/rental-income.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { McLifeEventsTimelineComponent } from '../mc-life-events-timeline/mc-life-events-timeline.component';
import { defaultLtcCostForCountry } from '@app/lib/ltc-costs';
import { SENIOR_PET_FRACTION } from '@app/lib/household-costs';

/**
 * Monte Carlo "what-if scenarios" sub-component. Bundles the 5
 * independent modifier toggles applied at sim time:
 *
 *   1. Multi-location schedule (moves)
 *   2. One-time future expenses (cars, roof, tuition, big trips)
 *   3. Long-Term Care planning (self-insure / insurance / both)
 *   4. FX stress test (one-time abrupt currency shock)
 *   5. Spouse-death scenario (deterministic) + stepped-up basis
 *
 * Each card is independent — they're bundled into one component
 * because they all sit at the same logical level ("optional what-if
 * modifiers") and splitting per card produces 5 ~80-LOC components
 * with 5 file trios = over-decomposition. If a future feature wants
 * "filter to only enabled scenarios" or "scenario presets", this is
 * the natural home for it.
 *
 * Phase 2b of the god-component split (audit follow-up #1).
 */
@Component({
  selector: 'app-mc-scenarios',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective, McLifeEventsTimelineComponent],
  templateUrl: './mc-scenarios.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./mc-scenarios.component.scss'],
})
export class McScenariosComponent {
  protected readonly loc = inject(LocationService);
  protected readonly dyscalculia = inject(DyscalculiaService);
  protected readonly state = inject(MonteCarloStateService);
  protected readonly rental = inject(RentalIncomeService);
  private readonly currency = inject(CurrencyFormatService);

  protected fmt(amount: number, unit: '/mo' | '/yr' | '' = '/mo'): string {
    if (unit === '/yr') return this.currency.currencyYearly(amount);
    if (unit === '/mo') return this.currency.currencyMonthly(amount);
    return this.currency.currency(amount);
  }

  /** Country of the currently-selected location (for LTC cost hints). */
  protected readonly selectedCountry = computed<string | null>(() =>
    this.state.selectedLoc()?.country ?? null,
  );

  /** Median LTC cost (USD/yr) for the selected country, with a foreign-
   *  generic fallback. Surfaced as a hint on the LTC cost input so users
   *  see a country-appropriate starting point rather than the global US
   *  default ($108K) regardless of where they're retiring. */
  protected readonly defaultLtcCostForLocation = computed<number>(() =>
    defaultLtcCostForCountry(this.selectedCountry()),
  );

  /** Apply the country-default LTC cost to the kernel input. Wired to a
   *  small "Use median" button next to the cost field. */
  protected useDefaultLtcCost(): void {
    this.state.ltcCostPerYearUSD.set(this.defaultLtcCostForLocation());
  }

  /** Calendar year "right now" — fallback when household.planningStartYear isn't set. */
  protected todayYear(): number { return new Date().getFullYear(); }

  /** True when EVERY adult has reached Medicare age (65) by sim year
   *  `fromYear` — i.e., the youngest adult decides. Chooses which single
   *  healthcare figure a Location Schedule row displays (ACA pricing while
   *  anyone is under 65, Medicare pricing after). Falls back to ACA
   *  pricing when no household birth years are configured, matching
   *  HealthcareService's 2-adults-pre-Medicare fallback. */
  protected rowMedicare(fromYear: number): boolean {
    const adults = this.state.adults();
    if (!adults.length) return false;
    const startYear = this.state.household()?.planningStartYear ?? this.todayYear();
    const youngestBirthYear = Math.max(...adults.map(a => a.birthYear));
    return (startYear + fromYear) - youngestBirthYear >= 65;
  }

  /** Plain-language per-pet summary for the Pets & Dependents card
   *  ("Luna (dog): costs modeled through 2034, senior rates from 2031"). */
  protected readonly petSummaries = computed(() => {
    const start = this.state.household()?.planningStartYear ?? this.todayYear();
    return (this.state.household()?.pets ?? []).map(p => {
      const lifespan = Math.max(1, p.expectedLifespan);
      const death = Math.max(p.birthYear + lifespan, start + 1);
      const seniorFrom = p.birthYear + Math.ceil(SENIOR_PET_FRACTION * lifespan);
      const name = p.name || p.type || 'Pet';
      const senior = seniorFrom < death ? `, senior rates from ${Math.max(seniorFrom, start)}` : '';
      return { label: `${name} (${p.type}): costs modeled through ${death - 1}${senior}` };
    });
  });

  /* ─── Multi-location moves ─────────────────────────────────────── */

  /** Add a move to the schedule — defaults to halfway through the
   *  horizon at the cheapest location. */
  protected addMove(): void {
    const locs = this.loc.fullLocations();
    if (!locs.length) return;
    const defaultLoc = [...locs].sort((a, b) =>
      (a.monthlyCostTotal ?? 0) - (b.monthlyCostTotal ?? 0)
    )[0];
    const current = this.state.moves();
    const lastYear = current.length ? current[current.length - 1].fromYear : 0;
    const newYear = Math.min(this.state.years() - 1,
                             Math.max(lastYear + 5, Math.floor(this.state.years() / 2)));
    this.state.moves.set([
      ...current,
      { fromYear: newYear, locationId: defaultLoc.id, moveCostUSD: 5000 },
    ]);
    this.state.movesEnabled.set(true);
  }

  protected removeMove(idx: number): void {
    this.state.moves.update(list => list.filter((_, i) => i !== idx));
  }

  protected patchMove(
    idx: number,
    partial: Partial<{ fromYear: number; locationId: string; moveCostUSD: number }>,
  ): void {
    this.state.moves.update(list =>
      list.map((m, i) => i === idx ? { ...m, ...partial } : m),
    );
  }

  /* ─── One-time expenses ────────────────────────────────────────── */

  /** Add a one-time expense row — defaults to year 5, $20K, "Car replacement". */
  protected addOneTimeExpense(): void {
    const current = this.state.oneTimeExpenses();
    const lastYear = current.length ? current[current.length - 1].year : 0;
    const newYear = Math.min(this.state.years() - 1, Math.max(lastYear + 3, 5));
    this.state.oneTimeExpenses.set([
      ...current,
      { year: newYear, amountUSD: 20000, label: 'Car replacement', inflate: true },
    ]);
    this.state.oneTimeExpensesEnabled.set(true);
  }

  protected removeOneTimeExpense(idx: number): void {
    this.state.oneTimeExpenses.update(list => list.filter((_, i) => i !== idx));
  }

  protected patchOneTimeExpense(
    idx: number,
    partial: Partial<{ year: number; amountUSD: number; label: string; inflate: boolean }>,
  ): void {
    this.state.oneTimeExpenses.update(list =>
      list.map((e, i) => i === idx ? { ...e, ...partial } : e),
    );
  }

  /* ─── One-time incomes (#31 priority 2 — inheritance / payouts) ── */

  /** Add a one-time income row — defaults to year 10, $100K, "Inheritance",
   *  inflate=true. The default scenario most users have in mind is "expected
   *  inheritance from a parent in ~10 years"; the inflate flag matches
   *  expenses (today's-$ semantics, scaled by CPI when it actually arrives). */
  protected addOneTimeIncome(): void {
    const current = this.state.oneTimeIncomes();
    const lastYear = current.length ? current[current.length - 1].year : 0;
    const newYear = Math.min(this.state.years() - 1, Math.max(lastYear + 3, 10));
    this.state.oneTimeIncomes.set([
      ...current,
      { year: newYear, amountUSD: 100000, label: 'Inheritance', inflate: true },
    ]);
    this.state.oneTimeIncomesEnabled.set(true);
  }

  protected removeOneTimeIncome(idx: number): void {
    this.state.oneTimeIncomes.update(list => list.filter((_, i) => i !== idx));
  }

  protected patchOneTimeIncome(
    idx: number,
    partial: Partial<{ year: number; amountUSD: number; label: string; inflate: boolean }>,
  ): void {
    this.state.oneTimeIncomes.update(list =>
      list.map((e, i) => i === idx ? { ...e, ...partial } : e),
    );
  }

  /* ─── Inherited traditional IRA (#31 priority 5 — SECURE Act drain) ── */

  /** Add a default inherited-IRA row — year 8, $250K balance, 10-year
   *  drain, 22% effective tax. Defaults reflect the most-common case:
   *  parental inheritance mid-retirement, full SECURE Act window, mid-
   *  bracket retiree. */
  protected addInheritedIRA(): void {
    const current = this.state.inheritedIRAs();
    const lastYear = current.length ? current[current.length - 1].year : 0;
    const newYear = Math.min(this.state.years() - 1, Math.max(lastYear + 3, 8));
    this.state.inheritedIRAs.set([
      ...current,
      { year: newYear, balanceUSD: 250000, drainOverYears: 10, effectiveTaxRate: 22, label: 'Parental IRA' },
    ]);
    this.state.inheritedIRAsEnabled.set(true);
  }

  protected removeInheritedIRA(idx: number): void {
    this.state.inheritedIRAs.update(list => list.filter((_, i) => i !== idx));
  }

  protected patchInheritedIRA(
    idx: number,
    partial: Partial<{ year: number; balanceUSD: number; drainOverYears: number; effectiveTaxRate: number; label: string }>,
  ): void {
    this.state.inheritedIRAs.update(list =>
      list.map((e, i) => i === idx ? { ...e, ...partial } : e),
    );
  }

  /* ─── Property sales (Todo #35 — Sec 1250 recapture + LTCG) ────────── */

  /** Add a property-sale row tied to the first available rental property.
   *  No-op when the user has no properties configured (the empty-state
   *  hint in the template tells them to add one on Assumptions first). */
  protected addPropertySale(): void {
    const props = this.rental.properties();
    if (!props.length) return;
    const firstId = props[0].id;
    const current = this.state.propertySales();
    const lastYear = current.length ? current[current.length - 1].year : 0;
    const newYear = Math.min(this.state.years() - 1, Math.max(lastYear + 3, 10));
    this.state.propertySales.set([
      ...current,
      { year: newYear, propertyId: firstId, salePriceUSD: 400000, sellingExpenses: 24000, label: '' },
    ]);
    this.state.propertySalesEnabled.set(true);
  }

  protected removePropertySale(idx: number): void {
    this.state.propertySales.update(list => list.filter((_, i) => i !== idx));
  }

  protected patchPropertySale(
    idx: number,
    partial: Partial<{ year: number; propertyId: string; salePriceUSD: number; sellingExpenses: number; label: string }>,
  ): void {
    this.state.propertySales.update(list =>
      list.map((e, i) => i === idx ? { ...e, ...partial } : e),
    );
  }
}
