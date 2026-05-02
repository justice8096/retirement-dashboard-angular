import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { McLifeEventsTimelineComponent } from '../mc-life-events-timeline/mc-life-events-timeline.component';

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
  styleUrls: ['./mc-scenarios.component.scss'],
})
export class McScenariosComponent {
  protected readonly loc = inject(LocationService);
  protected readonly dyscalculia = inject(DyscalculiaService);
  protected readonly state = inject(MonteCarloStateService);
  private readonly currency = inject(CurrencyFormatService);

  protected fmt(amount: number, unit: '/mo' | '/yr' | '' = '/mo'): string {
    if (unit === '/yr') return this.currency.currencyYearly(amount);
    if (unit === '/mo') return this.currency.currencyMonthly(amount);
    return this.currency.currency(amount);
  }

  /** Calendar year "right now" — fallback when household.planningStartYear isn't set. */
  protected todayYear(): number { return new Date().getFullYear(); }

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
}
