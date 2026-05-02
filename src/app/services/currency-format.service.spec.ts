import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { CurrencyFormatService } from './currency-format.service';

/**
 * First Vitest spec in the dashboard repo — proves the analogjs
 * vite-plugin-angular + TestBed wiring works end-to-end:
 *   - Angular DI is available (CurrencyFormatService injects DyscalculiaService)
 *   - Angular signals work in test code (DyscalculiaService uses signal())
 *   - jsdom provides localStorage (used by DyscalculiaService.persist)
 *
 * Tests the dyscalculia-disabled (default) code path for each unit suffix.
 * The dyscalculia-enabled paths (number-as-words / spaced-digits) live in
 * a follow-up spec — this PR focuses on infrastructure, not coverage breadth.
 */
describe('CurrencyFormatService', () => {
  let svc: CurrencyFormatService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(CurrencyFormatService);
  });

  it('currency: lump sum with no suffix', () => {
    // DYSCALCULIA_DEFAULTS.enabled is false → falls through to plain formatting.
    expect(svc.currency(1_234_567)).toBe('$1,234,567');
  });

  it('currencyMonthly: lump sum with /mo suffix', () => {
    expect(svc.currencyMonthly(3500)).toBe('$3,500/mo');
  });

  it('currencyYearly: lump sum with /yr suffix', () => {
    expect(svc.currencyYearly(42_000)).toBe('$42,000/yr');
  });

  it('currencyShort: K/M/B compaction at canonical thresholds', () => {
    // Exactly $1B → "1.50B" with the .toFixed(2) branch
    expect(svc.currencyShort(1_500_000_000)).toBe('$1.50B');
    // Exactly $2.5M → "2.50M"
    expect(svc.currencyShort(2_500_000)).toBe('$2.50M');
    // $50K → integer K branch (>= 10_000)
    expect(svc.currencyShort(50_000)).toBe('$50K');
    // $1.5K → fractional K branch (1_000 ≤ x < 10_000)
    expect(svc.currencyShort(1_500)).toBe('$1.5K');
    // $850 → unrounded plain dollars
    expect(svc.currencyShort(850)).toBe('$850');
  });

  it('currencyShort: negative amounts get -$ prefix', () => {
    expect(svc.currencyShort(-2_500_000)).toBe('-$2.50M');
  });
});
