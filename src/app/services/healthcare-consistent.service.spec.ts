import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { HealthcareService } from './healthcare.service';
import type { LocationFull } from '@models/location.model';

/**
 * Tests for the self-consistent need→MAGI→healthcare+tax solver
 * (`decideConsistent`). See docs/ACA-MAGI-CONSISTENCY.md.
 *
 * Two pre-Medicare adults; a US location with a $2,050/2-adult unsubsidized
 * benchmark. We drive the household above vs below the 400% FPL cliff
 * (~$86,560 for 2 adults in 2026) purely through cost-of-living + income, and
 * assert the subsidy state + self-consistency that the fixed point should reach.
 */
function loc(rentMonthly: number): LocationFull {
  return {
    id: 'test-va',
    name: 'Testville, VA',
    country: 'United States',
    currency: 'USD',
    monthlyCosts: {
      rent: { typical: rentMonthly },
      healthcare: { typical: 500 },
      healthcarePreMedicare: { typical: 2050 },
    },
    healthcare: {
      acaMarketplace: {
        benchmarkSilverMonthly2Adult: 2050,
        benchmarkSilverMonthlySingle: 1025,
        premiumCapPctOfIncome: 0.085,
      },
    },
  } as unknown as LocationFull;
}

describe('HealthcareService.decideConsistent', () => {
  let svc: HealthcareService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HealthcareService, provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(HealthcareService);
    // Two adults, both ~58 in 2026 → pre-Medicare.
    svc.household.set({
      members: [
        { role: 'adult', birthYear: 1968 },
        { role: 'adult', birthYear: 1968 },
      ],
    } as never);
    svc.financial.set({ traditionalBalance: 3_000_000, rothBalance: 3_000_000, taxableBalance: 0 } as never);
    svc.income.set({
      traditionalAnnual: 0, rothAnnual: 0, taxableBrokerageAnnual: 0,
      taxableBrokerageTaxablePct: 0.5, pensionAnnual: 0, ssAnnual: 0, filingStatus: 'joint',
    });
    svc.subsidyRegime.set('cliff');
  });

  it('above the cliff → unsubsidized, full sticker, self-consistent', () => {
    // Traditional-only balances ⇒ the whole draw is taxable (hits MAGI).
    // Rent $5,800/mo + $2,050 healthcare ⇒ need ≈ $94k/yr ⇒ MAGI clears the
    // ~$86.6k cliff.
    svc.financial.set({ traditionalBalance: 3_000_000, rothBalance: 0, taxableBalance: 0 } as never);
    svc.apportionStrategy.set('proportional');
    const d = svc.decideConsistent(loc(5_800));
    expect(d.source).toBe('aca-unsubsidized');
    expect(d.monthlyCost).toBe(2_050); // full 2-adult benchmark, no subsidy
    expect(d.magiUsed).toBeGreaterThan(86_560);
    expect(d.aboveFplCliff).toBe(true);
    expect(d.solveIterations).toBeLessThanOrEqual(12);
  });

  it('below the cliff → subsidized, capped under the sticker', () => {
    // Modest rent + a magi-targeted draw keeps MAGI between 100% and 400% FPL,
    // so the household qualifies for a partial subsidy.
    svc.income.set({
      traditionalAnnual: 0, rothAnnual: 0, taxableBrokerageAnnual: 0,
      taxableBrokerageTaxablePct: 0.5, pensionAnnual: 0, ssAnnual: 30_000, filingStatus: 'joint',
    });
    svc.apportionStrategy.set('magi-targeted');
    const d = svc.decideConsistent(loc(1_800));
    expect(d.source).toBe('aca-subsidized');
    expect(d.monthlyCost).toBeLessThan(2_050);
    expect(d.monthlyCost).toBeGreaterThan(0);
    expect(d.magiUsed).toBeLessThanOrEqual(86_560);
    expect(d.subsidyEligible).toBe(true);
  });

  it('reports a monthly income-tax figure alongside the decision', () => {
    svc.apportionStrategy.set('proportional');
    const d = svc.decideConsistent(loc(5_800));
    expect(typeof d.monthlyTax).toBe('number');
    expect(d.monthlyTax!).toBeGreaterThanOrEqual(0);
  });

  it('transition year adds the pre-retirement spike (pushes toward unsubsidized)', () => {
    svc.apportionStrategy.set('magi-targeted');
    svc.income.set({
      traditionalAnnual: 0, rothAnnual: 0, taxableBrokerageAnnual: 0,
      taxableBrokerageTaxablePct: 0.5, pensionAnnual: 0, ssAnnual: 30_000, filingStatus: 'joint',
    });
    svc.transitionYearExtraIncome.set(120_000); // big final-year W-2 / RMD spike
    const steady = svc.decideConsistent(loc(1_800));
    const transition = svc.decideConsistent(loc(1_800), { transition: true });
    expect(transition.magiUsed).toBeGreaterThan(steady.magiUsed);
    expect(transition.source).toBe('aca-unsubsidized');
  });

  it('first-year-unsubsidized defaults on', () => {
    expect(svc.firstYearUnsubsidized()).toBe(true);
  });

  it('income tax includes the taxable portion of Social Security (Codex P2)', () => {
    // $30k traditional + $40k SS, MFJ. Provisional income makes ~$14.1k of SS
    // taxable → AGI ≈ $44.1k, above the $32.2k standard deduction → tax > 0.
    // On the old `taxableBase` ($30k, below the deduction) it would be $0.
    svc.apportionStrategy.set('manual');
    svc.income.set({
      traditionalAnnual: 30_000, rothAnnual: 0, taxableBrokerageAnnual: 0,
      taxableBrokerageTaxablePct: 0.5, pensionAnnual: 0, ssAnnual: 40_000, filingStatus: 'joint',
    });
    const d = svc.decideConsistent(loc(2_000));
    expect(d.monthlyTax!).toBeGreaterThan(0);
  });

  it('transition income raises the tax base, not just MAGI (Codex P2 #153)', () => {
    // Manual mode, modest steady AGI (~$28k, below the standard deduction → $0
    // tax). A $100k first-year W-2/RMD spike pushes AGI into the brackets, so
    // the transition tax must exceed the steady tax.
    svc.apportionStrategy.set('manual');
    svc.income.set({
      traditionalAnnual: 28_000, rothAnnual: 0, taxableBrokerageAnnual: 0,
      taxableBrokerageTaxablePct: 0.5, pensionAnnual: 0, ssAnnual: 0, filingStatus: 'joint',
    });
    svc.transitionYearExtraIncome.set(100_000);
    const steady = svc.decideConsistent(loc(2_000));
    const transition = svc.decideConsistent(loc(2_000), { transition: true });
    expect(transition.monthlyTax!).toBeGreaterThan(steady.monthlyTax!);
  });

  it('unsubsidizedMonthly returns the full sticker (supports enhanced-regime year 0)', () => {
    // Pre-Medicare household → unsubsidized = the 2-adult ACA benchmark.
    const sticker = svc.unsubsidizedMonthly(loc(2_000));
    expect(sticker).toBe(2_050);
  });
});
