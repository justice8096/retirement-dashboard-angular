import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { MonteCarloStateService } from './monte-carlo-state.service';

/**
 * Roth conversion schedule expansion for the RMD pass (engine #177/#179):
 * inclusive sim-year ranges in state become the per-year array the kernel
 * reads, clamped to the horizon, with overlapping ranges stacking.
 */
describe('MonteCarloStateService rothConversionByYear', () => {
  let s: MonteCarloStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MonteCarloStateService, provideHttpClient(), provideHttpClientTesting()],
    });
    s = TestBed.inject(MonteCarloStateService);
    s.years.set(10);
  });

  it('is all zeros with no ranges', () => {
    expect(s.rothConversionByYear()).toEqual(new Array(10).fill(0));
  });

  it('expands an inclusive range and clamps to the horizon', () => {
    s.rothConversions.set([{ fromYear: 1, toYear: 3, amountUSD: 80000 }, { fromYear: 8, toYear: 20, amountUSD: 10000 }]);
    const a = s.rothConversionByYear();
    expect(a.length).toBe(10);
    expect(a.slice(0, 5)).toEqual([0, 80000, 80000, 80000, 0]);
    expect(a[8]).toBe(10000);
    expect(a[9]).toBe(10000);
  });

  it('stacks overlapping ranges and ignores negative amounts', () => {
    s.rothConversions.set([{ fromYear: 2, toYear: 4, amountUSD: 50000 }, { fromYear: 3, toYear: 3, amountUSD: 25000 }, { fromYear: 0, toYear: 9, amountUSD: -5 }]);
    const a = s.rothConversionByYear();
    expect(a[2]).toBe(50000);
    expect(a[3]).toBe(75000);
    expect(a[4]).toBe(50000);
    expect(a[0]).toBe(0);
  });

  it('defaults: RMD pass off, bracket tax, pre-tax draws first, IRMAA off with Part D on', () => {
    expect(s.rmdEnabled()).toBe(false);
    expect(s.rmdTaxMode()).toBe('bracket');
    expect(s.rmdWithdrawalOrder()).toBe('traditional-first');
    expect(s.irmaaEnabled()).toBe(false);
    expect(s.irmaaPartD()).toBe(true);
  });
});