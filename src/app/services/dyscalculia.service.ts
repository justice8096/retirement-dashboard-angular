import { Injectable, signal, computed } from '@angular/core';
import {
  DyscalculiaSettings,
  DYSCALCULIA_DEFAULTS,
  NumberFormat,
  PercentageDisplay,
  ChartStyle,
  NumberSpacing,
  ProgressStyle,
} from '@models/dyscalculia.model';

@Injectable({ providedIn: 'root' })
export class DyscalculiaService {
  /** Reactive settings state using Angular signals */
  readonly settings = signal<DyscalculiaSettings>(DYSCALCULIA_DEFAULTS);

  /** Convenience computed signals */
  readonly isEnabled = computed(() => this.settings().enabled);
  readonly numberFormat = computed(() => this.settings().numberFormat);
  readonly percentageDisplay = computed(() => this.settings().percentageDisplay);
  readonly numberSpacingClass = computed(() => {
    const spacing = this.settings().numberSpacing;
    return `number-spacing-${spacing}`;
  });

  // ─── Settings Mutation ──────────────────────────────────────────────

  toggle(): void {
    this.update({ enabled: !this.settings().enabled });
  }

  update(partial: Partial<DyscalculiaSettings>): void {
    this.settings.update(current => ({ ...current, ...partial }));
    this.persist();
  }

  reset(): void {
    this.settings.set(DYSCALCULIA_DEFAULTS);
    this.persist();
  }

  // ─── Number Formatting ──────────────────────────────────────────────

  /**
   * Format a currency amount.
   *
   * @param amount  dollar value
   * @param unit    suffix to append — '/mo' (default), '/yr', or '' for a
   *                lump-sum total with no time dimension
   */
  formatCurrency(amount: number, unit: '/mo' | '/yr' | '' = '/mo'): string {
    const s = this.settings();
    const perPhrase = unit === '/mo' ? ' per month' : unit === '/yr' ? ' per year' : '';
    if (!s.enabled) return `$${amount.toLocaleString()}${unit}`;

    let value = amount;
    if (s.roundNumbers) {
      value = Math.round(value / 100) * 100;
    }

    switch (s.numberFormat) {
      case 'words':
        return `about ${this.numberToWords(value)} dollars${perPhrase}`;
      case 'spaced':
        return `$${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${unit}`;
      default:
        return `$${value.toLocaleString()}${unit}`;
    }
  }

  formatCount(count: number, unit: string): string {
    const s = this.settings();
    if (!s.enabled) return `${count} ${unit}`;

    switch (s.numberFormat) {
      case 'words':
        return `${this.numberToWords(count)} ${unit}`;
      case 'spaced':
        return `${count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${unit}`;
      default:
        return `${count} ${unit}`;
    }
  }

  formatPercentage(pct: number): string {
    const s = this.settings();
    if (!s.enabled) return `${pct}%`;

    switch (s.percentageDisplay) {
      case 'natural': {
        const ratio = Math.round(100 / pct);
        return `${pct}% (about 1 in ${ratio})`;
      }
      case 'proportion':
        if (pct === 100) return 'all';
        if (pct >= 90) return `nearly all (${pct}%)`;
        if (pct >= 75) return `about three-quarters (${pct}%)`;
        if (pct >= 50) return `about half (${pct}%)`;
        if (pct >= 25) return `about a quarter (${pct}%)`;
        if (pct >= 10) return `a small share (${pct}%)`;
        return `very few (${pct}%)`;
      case 'none':
        if (pct >= 90) return 'nearly all';
        if (pct >= 75) return 'most';
        if (pct >= 50) return 'about half';
        if (pct >= 25) return 'some';
        if (pct >= 10) return 'a few';
        return 'very few';
      default:
        return `${pct}%`;
    }
  }

  getMagnitudeAnchor(amount: number): string {
    if (amount < 2000) return 'Less than average US rent';
    if (amount < 3000) return 'About the cost of a modest US apartment';
    if (amount < 5000) return 'Similar to median US household spending';
    if (amount < 7000) return 'About the cost of living in a mid-size US city';
    if (amount < 10000) return 'Similar to living in an expensive US metro';
    return 'More than most US household monthly budgets';
  }

  /**
   * Magnitude anchor keyed by context. Returns a plain-language phrase a
   * dyscalculic user can use to calibrate the raw number. Dashboard
   * Dyscalculia F-003 / F-005 — extends the old monthly-cost-only helper.
   *
   * @param amount Raw dollar amount (positive or negative).
   * @param context Domain of the number: portfolio total, withdrawal, percentile, etc.
   * @param yearlySpending Optional reference for anchors like "years of spending".
   */
  getAnchor(
    amount: number,
    context: 'monthly-cost' | 'portfolio' | 'withdrawal-year' | 'percentile' | 'general',
    yearlySpending?: number,
  ): string {
    const abs = Math.abs(amount);
    switch (context) {
      case 'monthly-cost':
        return this.getMagnitudeAnchor(abs);

      case 'portfolio': {
        if (yearlySpending && yearlySpending > 0) {
          const years = Math.round(abs / yearlySpending);
          return `about ${years} year${years === 1 ? '' : 's'} of your planned spending`;
        }
        if (abs < 100_000) return 'less than a year of a typical middle-income salary';
        if (abs < 500_000) return 'around a typical starter-home price in many US markets';
        if (abs < 1_000_000) return 'roughly what you need for a modest retirement at 4% withdrawal';
        if (abs < 3_000_000) return 'enough to cover decades of modest retirement spending';
        return 'well above the median net worth at US retirement age';
      }

      case 'withdrawal-year': {
        if (abs < 20_000) return 'about what a part-time job pays in a year';
        if (abs < 50_000) return 'around median US household income';
        if (abs < 100_000) return 'around a comfortable middle-class yearly income';
        return 'a high yearly income by US standards';
      }

      case 'percentile': {
        if (yearlySpending && yearlySpending > 0) {
          const years = Math.round(abs / yearlySpending);
          if (amount < 0) return `a shortfall of about ${years} year${years === 1 ? '' : 's'} of spending`;
          if (years === 0) return 'roughly nothing left over';
          return `about ${years} year${years === 1 ? '' : 's'} of planned spending remaining`;
        }
        if (amount <= 0) return 'portfolio ran out of money';
        return 'portfolio ended in positive territory';
      }

      default:
        return this.getMagnitudeAnchor(abs);
    }
  }

  /**
   * Natural-frequency phrasing for a success-rate fraction. Maps 0.72 → "7 out of 10".
   * Dashboard Dyscalculia F-002 — replaces abstract percentage framing with
   * an anxiety-safe, low-cognitive-load phrase.
   */
  naturalFrequency(fraction: number): string {
    const clamped = Math.max(0, Math.min(1, fraction));
    const outOf10 = Math.round(clamped * 10);
    return `${outOf10} out of 10`;
  }

  /**
   * Tone class for a success fraction — used by Monte Carlo and similar
   * screens. Never returns `danger`; uses a neutral tone for low scores to
   * avoid the math-anxiety anti-pattern flagged in the dyscalculia audit.
   */
  toneForSuccessRate(fraction: number): 'success' | 'warn' | 'neutral' {
    if (fraction > 0.9) return 'success';
    if (fraction > 0.7) return 'warn';
    return 'neutral';
  }

  // ─── Persistence ────────────────────────────────────────────────────

  private persist(): void {
    try {
      localStorage.setItem('dyscalculia-settings', JSON.stringify(this.settings()));
    } catch {
      // localStorage unavailable — settings remain in memory
    }
  }

  loadSaved(): void {
    try {
      const saved = localStorage.getItem('dyscalculia-settings');
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<DyscalculiaSettings>;
        this.settings.update(current => ({ ...current, ...parsed }));
      }
    } catch {
      // Use defaults
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private numberToWords(n: number): string {
    if (n === 0) return 'zero';
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
      'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
      'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty',
      'seventy', 'eighty', 'ninety'];

    if (n < 0) return 'negative ' + this.numberToWords(-n);
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + this.numberToWords(n % 100) : '');
    if (n < 1000000) return this.numberToWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + this.numberToWords(n % 1000) : '');
    return n.toLocaleString();
  }
}
