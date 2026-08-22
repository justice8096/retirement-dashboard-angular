import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { TaxService } from './tax.service';
import type { LocationFull } from '@models/api.model';

/**
 * SS-aware bracket income tax. When the caller says how much of the income
 * is Social Security, only the IRC §86 taxable portion of it enters the
 * brackets — instead of taxing the whole benefit as ordinary income.
 * The healthcare/MAGI solver passes an already-adjusted AGI and must NOT
 * opt in (no `ss` argument), so plain calls stay unchanged.
 */

const usLoc = {
  id: 'us-test-va',
  name: 'Testville',
  country: 'United States',
  currency: 'USD',
  monthlyCosts: { rent: { typical: 1500 } },
  taxes: {},
} as unknown as LocationFull;

describe('TaxService — SS-aware income tax', () => {
  let svc: TaxService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(TaxService);
  });

  it('taxes the full income as ordinary without ss info (unchanged)', () => {
    // 72k − 32.2k MFJ deduction = 39.8k → 10%×24.8k + 12%×15k = 4,280/yr
    const r = svc.computeIncomeTax(usLoc, 72_000);
    expect(r.source).toBe('brackets');
    expect(r.monthlyTax).toBeCloseTo(4_280 / 12, 5);
  });

  it('taxes only the §86 portion of SS when ss info is given', () => {
    // other = 42k; taxableSS(30k, 42k, joint) = 23,550
    // brackets input = 65,550 − 32,200 = 33,350 → 2,480 + 8,550×0.12 = 3,506/yr
    const r = svc.computeIncomeTax(usLoc, 72_000, { ssAnnual: 30_000, filingStatus: 'joint' });
    expect(r.monthlyTax).toBeCloseTo(3_506 / 12, 5);
    expect(r.taxableSSAnnual).toBeCloseTo(23_550, 5);
  });

  it('fully excludes SS below the provisional threshold', () => {
    // other = 20k, SS = 20k → provisional 30k ≤ 32k → taxableSS 0
    // brackets input = 20k − 32.2k → 0 tax
    const r = svc.computeIncomeTax(usLoc, 40_000, { ssAnnual: 20_000, filingStatus: 'joint' });
    expect(r.monthlyTax).toBe(0);
    expect(r.taxableSSAnnual).toBe(0);
  });

  it('clamps ssAnnual above the total income', () => {
    // other = max(0, 30k − 40k) = 0; provisional = 20k ≤ 32k → no tax
    const r = svc.computeIncomeTax(usLoc, 30_000, { ssAnnual: 40_000, filingStatus: 'joint' });
    expect(r.monthlyTax).toBe(0);
  });

  it('uses the single-filer table and deduction when filing status is single', () => {
    // 72k − 16.1k single deduction = 55.9k
    // → 10%×12.4k + 12%×38k + 22%×5.5k = 1,240 + 4,560 + 1,210 = 7,010/yr
    const r = svc.computeIncomeTax(usLoc, 72_000, { ssAnnual: 0, filingStatus: 'single' });
    expect(r.monthlyTax).toBeCloseTo(7_010 / 12, 5);
  });

  it('honors the ambient ssContext filing status when no ss arg is passed', () => {
    // The healthcare solver passes pre-adjusted AGI with no ss arg — bracket
    // CHOICE must still match the household's filing status.
    svc.ssContext.set({ ssAnnual: 0, filingStatus: 'single' });
    const r = svc.computeIncomeTax(usLoc, 72_000);
    expect(r.monthlyTax).toBeCloseTo(7_010 / 12, 5);
  });

  it('totalWithIncomeTax defaults to the pushed ssContext', () => {
    svc.ssContext.set({ ssAnnual: 30_000, filingStatus: 'joint' });
    // annualIncome default 72k → same 3,506/yr as the explicit case
    const bundle = svc.totalWithIncomeTax(usLoc);
    expect(bundle.monthlyTax).toBeCloseTo(3_506 / 12, 5);
  });
});
