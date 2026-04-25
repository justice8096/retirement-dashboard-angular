import { Injectable, inject } from '@angular/core';
import { DyscalculiaService } from '@services/dyscalculia.service';

/**
 * Single source of truth for currency formatting across screens.
 *
 * Pre-existing pattern: every screen defined its own `fmt()` doing a
 * redundant `dyscalculia.isEnabled() ? formatCurrency(x) : '$' + ...`
 * — DyscalculiaService.formatCurrency already handles the disabled
 * case, so the per-screen check was dead code. Worse, the dyscalculia
 * branch added '/mo' suffix while the fallback did not — silent
 * inconsistency.
 *
 * This Facade exposes named methods per unit (no implicit defaults)
 * to make call sites explicit and consistent.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyFormatService {
  private readonly dys = inject(DyscalculiaService);

  /** Lump-sum currency, no time suffix. e.g. "$1,234,567" */
  currency(amount: number): string {
    return this.dys.formatCurrency(amount, '');
  }

  /** Monthly currency, "/mo" suffix. e.g. "$3,500/mo" */
  currencyMonthly(amount: number): string {
    return this.dys.formatCurrency(amount, '/mo');
  }

  /** Yearly currency, "/yr" suffix. e.g. "$42,000/yr" */
  currencyYearly(amount: number): string {
    return this.dys.formatCurrency(amount, '/yr');
  }

  /** Currency with cents — for tax / fee figures that need to-the-penny. */
  currencyPrecise(amount: number, fractionDigits = 2): string {
    return this.dys.formatCurrencyPrecise(amount, { fractionDigits });
  }

  /**
   * Compact lump-sum currency with K/M/B suffix. e.g. "$1.5M".
   * Falls back to plain `currency()` when dyscalculia is on (its modes
   * — words / spaced — would conflict with K/M/B abbreviation).
   */
  currencyShort(amount: number): string {
    if (this.dys.isEnabled()) return this.currency(amount);
    const neg = amount < 0;
    const n = Math.abs(amount);
    let out: string;
    if (n >= 1_000_000_000) out = (n / 1_000_000_000).toFixed(2) + 'B';
    else if (n >= 1_000_000) out = (n / 1_000_000).toFixed(2) + 'M';
    else if (n >= 10_000)    out = (n / 1_000).toFixed(0) + 'K';
    else if (n >= 1_000)     out = (n / 1_000).toFixed(1) + 'K';
    else                     out = Math.round(n).toString();
    return (neg ? '-$' : '$') + out;
  }
}
