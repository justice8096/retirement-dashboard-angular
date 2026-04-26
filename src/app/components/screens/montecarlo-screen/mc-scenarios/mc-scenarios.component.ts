import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';

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
  imports: [FormsModule, MatButtonModule, NumericInputDirective],
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
}
