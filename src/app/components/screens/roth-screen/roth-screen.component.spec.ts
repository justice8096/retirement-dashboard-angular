import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { FinancialSettings, HouseholdProfile } from '@models/api.model';
import { conversionBracketBreakdown } from '@app/lib/roth-conversion-math';
import { FED_BRACKETS_2026_SINGLE, FED_BRACKETS_2026_MFJ, FED_STD_DEDUCTION_2026 } from '@retirement/shared/engine/tax-sources.js';
import { RothScreenComponent } from './roth-screen.component';

/**
 * A4 parity port #7 (marginal-bracket breakdown + year-by-year depletion
 * table). Exercises the component's wiring — that `RothScreenComponent`
 * correctly threads its conversion-amount / filing-status / other-income
 * inputs through the `conversionBracketBreakdown` / `buildDepletionSchedule`
 * pure helpers, and that the depletion schedule picks up the household's
 * balances and the earliest adult's age. The bracket/depletion math itself
 * is covered by `roth-conversion-math.spec.ts`; this spec is about the
 * component's wiring, not re-deriving that math.
 */

function makeFinancial(overrides: Partial<FinancialSettings> = {}): FinancialSettings {
  return {
    portfolioBalance: 500_000,
    fxDriftEnabled: false,
    fxDriftAnnualRate: 0,
    ssCutEnabled: false,
    ssCutYear: 2034,
    ssCola: 0.02,
    equityPct: 70,
    bondPct: 20,
    cashPct: 10,
    intlPct: 0,
    expectedReturn: 5,
    expectedInflation: 3,
    retirementPath: 'traditional',
    fireTargetAge: null,
    annualSavings: null,
    savingsRate: null,
    traditionalBalance: 100_000,
    rothBalance: 20_000,
    taxableBalance: 5_000,
    hsaBalance: null,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as FinancialSettings;
}

function makeHousehold(overrides: Partial<HouseholdProfile> = {}): HouseholdProfile {
  return {
    id: 'hh-1',
    adultsCount: 2,
    targetAnnualIncome: 60_000,
    planningStartYear: 2026,
    planningYears: 35,
    requirements: [],
    members: [
      { id: 'p1', role: 'primary', dependentType: null, name: 'Primary', birthYear: 1965, ssPia: 2000, ssFra: 67, ssClaimAge: 67, sortOrder: 0 },
      { id: 'p2', role: 'spouse', dependentType: null, name: 'Spouse', birthYear: 1967, ssPia: 700, ssFra: 67, ssClaimAge: 67, sortOrder: 1 },
    ],
    pets: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as unknown as HouseholdProfile;
}

function setup(financial = makeFinancial(), household = makeHousehold()) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(RothScreenComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // triggers ngOnInit -> api.getFinancial() + api.getHousehold()
  httpMock.expectOne((r) => r.url.endsWith('/me/financial') && r.method === 'GET').flush(financial);
  httpMock.expectOne((r) => r.url.endsWith('/me/household') && r.method === 'GET').flush(household);
  fixture.detectChanges();
  httpMock.verify();
  return { fixture, component: fixture.componentInstance };
}

describe('RothScreenComponent — marginal bracket breakdown + depletion table (A4 port #7)', () => {
  it('computes the bracket breakdown for the default conversion amount identically to the pure helper', () => {
    const { component } = setup();

    const expected = conversionBracketBreakdown(
      component.otherTaxableIncome(),
      component.conversionAmount(),
      FED_BRACKETS_2026_MFJ, // default filingStatus is 'joint'
      FED_STD_DEDUCTION_2026.mfj,
    );
    expect(component.bracketBreakdown()).toEqual(expected);
  });

  it('live-recomputes the bracket breakdown when the conversion amount changes', () => {
    const { component } = setup();

    const before = component.bracketBreakdown();
    component.conversionAmount.set(90_000);
    const after = component.bracketBreakdown();

    expect(after.totalTax).not.toBe(before.totalTax);
    expect(after).toEqual(
      conversionBracketBreakdown(component.otherTaxableIncome(), 90_000, FED_BRACKETS_2026_MFJ, FED_STD_DEDUCTION_2026.mfj),
    );
  });

  it('switches to the single-filer bracket table and standard deduction when filing status changes', () => {
    const { component } = setup();

    expect(component.brackets()).toBe(FED_BRACKETS_2026_MFJ);
    expect(component.standardDeduction()).toBe(FED_STD_DEDUCTION_2026.mfj);

    component.filingStatus.set('single');

    expect(component.brackets()).toBe(FED_BRACKETS_2026_SINGLE);
    expect(component.standardDeduction()).toBe(FED_STD_DEDUCTION_2026.single);
    expect(component.bracketBreakdown()).toEqual(
      conversionBracketBreakdown(component.otherTaxableIncome(), component.conversionAmount(), FED_BRACKETS_2026_SINGLE, FED_STD_DEDUCTION_2026.single),
    );
  });

  it('seeds the depletion schedule from the fetched Traditional/Roth balances and the earliest adult\'s age', () => {
    const { component } = setup();

    const rows = component.depletionSchedule();
    expect(rows.length).toBeGreaterThan(0);

    const expectedStartAge = new Date().getFullYear() - 1965; // earliest of the two birth years above
    expect(rows[0]!.age).toBe(expectedStartAge);
    expect(rows[0]!.traditionalStart).toBe(100_000);
  });

  it('sums the depletion schedule\'s per-year figures for the summary totals', () => {
    const { component } = setup();

    const rows = component.depletionSchedule();
    const expectedConverted = rows.reduce((s, r) => s + r.conversionAmount, 0);
    const expectedTax = rows.reduce((s, r) => s + r.taxPaid, 0);

    expect(component.totalConverted()).toBe(expectedConverted);
    expect(component.taxesPaid()).toBe(expectedTax);
    expect(component.finalRothBalance()).toBe(rows[rows.length - 1]!.rothBalance);
    expect(component.finalTraditionalBalance()).toBe(rows[rows.length - 1]!.traditionalEnd);
  });

  it('live-recomputes the depletion schedule and summary totals when years-to-convert changes', () => {
    const { component } = setup();

    const before = component.depletionSchedule();
    component.yearsToConvert.set(1);
    const after = component.depletionSchedule();

    expect(after).not.toBe(before);
    expect(component.totalConverted()).toBe(after.reduce((s, r) => s + r.conversionAmount, 0));
  });
});
