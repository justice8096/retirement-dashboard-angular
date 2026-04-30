import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';

/**
 * Monte Carlo "Simulation Parameters" sub-component. Owns the core-input
 * card: location selector, portfolio, SS, other income, runs, years, and
 * the return / volatility / inflation / FX / growth fields.
 *
 * Pure inputs: each field reads from MonteCarloStateService and writes
 * back via signal.set() on (ngModelChange). No methods worth extracting —
 * the only behavior here is "user types → signal updates."
 *
 * The Run button + stale banner moved to the parent in this Phase 2b
 * extraction so this component can stay input-pure.
 *
 * Phase 2b of the god-component split (audit follow-up #1).
 */
@Component({
  selector: 'app-mc-parameters',
  standalone: true,
  imports: [FormsModule, NumericInputDirective],
  templateUrl: './mc-parameters.component.html',
  styleUrls: ['./mc-parameters.component.scss'],
})
export class McParametersComponent {
  protected readonly loc = inject(LocationService);
  protected readonly dyscalculia = inject(DyscalculiaService);
  protected readonly state = inject(MonteCarloStateService);
  private readonly currency = inject(CurrencyFormatService);

  /** Template adapter — keeps existing `fmt(x)` / `fmt(x, '/yr')` template
   *  call sites working. Logic lives in CurrencyFormatService. */
  protected fmt(amount: number, unit: '/mo' | '/yr' | '' = '/mo'): string {
    if (unit === '/yr') return this.currency.currencyYearly(amount);
    if (unit === '/mo') return this.currency.currencyMonthly(amount);
    return this.currency.currency(amount);
  }

  /** Format monthlyCosts category keys for display in the inflation
   *  breakdown panel. Splits camelCase into spaced words and title-cases:
   *    'rent'                  -> 'Rent'
   *    'healthcarePreMedicare' -> 'Healthcare Pre Medicare'
   *    'utilitiesAndInternet'  -> 'Utilities And Internet'
   */
  protected humanizeCategory(key: string): string {
    return key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase());
  }
}
