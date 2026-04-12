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

  formatCurrency(amount: number): string {
    const s = this.settings();
    if (!s.enabled) return `$${amount.toLocaleString()}/mo`;

    let value = amount;
    if (s.roundNumbers) {
      value = Math.round(value / 100) * 100;
    }

    switch (s.numberFormat) {
      case 'words':
        return `about ${this.numberToWords(value)} dollars per month`;
      case 'spaced':
        return `$${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}/mo`;
      default:
        return `$${value.toLocaleString()}/mo`;
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
