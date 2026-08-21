import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { HouseholdProfile } from '@models/api.model';
import { SsScreenComponent } from './ss-screen.component';

/**
 * A4 parity port #9 (per-spouse claim-age sliders + 62/FRA/70 comparison).
 * Exercises the math-wiring — that `SsScreenComponent` correctly threads
 * the household member's claim-age slider position through
 * `@retirement/shared`'s `calcSSBenefit`/`calcSpousalBenefit` (the exact
 * functions the retired React SSBenefitsTab used) — and that changing the
 * slider live-recomputes the displayed figures. The underlying SSA formula
 * itself is covered by `shared/__tests__/socialSecurity.test.js`; this
 * spec is about the component's wiring, not re-deriving the math.
 */

function makeHousehold(overrides: Partial<HouseholdProfile> = {}): HouseholdProfile {
  return {
    id: 'hh-1',
    adultsCount: 2,
    targetAnnualIncome: 60000,
    planningStartYear: 2026,
    planningYears: 35,
    requirements: [],
    members: [
      { id: 'p1', role: 'primary', dependentType: null, name: 'Primary', birthYear: 1960, ssPia: 2400, ssFra: 67, ssClaimAge: 67, sortOrder: 0 },
      { id: 'p2', role: 'spouse', dependentType: null, name: 'Spouse', birthYear: 1962, ssPia: 800, ssFra: 67, ssClaimAge: 67, sortOrder: 1 },
    ],
    pets: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as unknown as HouseholdProfile;
}

function setup(household = makeHousehold()) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(SsScreenComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // triggers ngOnInit -> api.getHousehold()
  httpMock.expectOne((r) => r.url.endsWith('/me/household') && r.method === 'GET').flush(household);
  fixture.detectChanges();
  httpMock.verify();
  return { fixture, component: fixture.componentInstance };
}

describe('SsScreenComponent — claim-age exploration sliders (A4 port #9)', () => {
  it('seeds each member\'s exploration slider from their persisted ssClaimAge', () => {
    const { component } = setup();
    const primary = component.ssMembers().find((m) => m.role === 'primary')!;
    const spouse = component.ssMembers().find((m) => m.role === 'spouse')!;
    expect(component.exploreAgeFor(primary)).toBe(67);
    expect(component.exploreAgeFor(spouse)).toBe(67);
  });

  it('benefit at 62 < FRA < 70 for a fixture member (monotonic across claim ages)', () => {
    const { component } = setup();
    const primary = component.ssMembers().find((m) => m.role === 'primary')!;

    const at62 = component.benefitAt(primary, 62);
    const atFra = component.benefitAt(primary, primary.ssFra!);
    const at70 = component.benefitAt(primary, 70);

    expect(at62).toBeLessThan(atFra);
    expect(atFra).toBeLessThan(at70);
    expect(atFra).toBe(primary.ssPia); // claiming exactly at FRA pays the raw PIA
  });

  it('live-recomputes the displayed benefit when the explore claim age changes', () => {
    const { component } = setup();
    const primary = component.ssMembers().find((m) => m.role === 'primary')!;

    const beforeAge = component.exploreAgeFor(primary);
    const beforeBenefit = component.exploreBenefit(primary);
    expect(beforeAge).toBe(67);

    component.setExploreAge(primary.id, 62);

    expect(component.exploreAgeFor(primary)).toBe(62);
    const afterBenefit = component.exploreBenefit(primary);
    expect(afterBenefit).not.toBe(beforeBenefit);
    expect(afterBenefit).toBe(component.benefitAt(primary, 62));
  });

  it('clamps an out-of-range explore age to the 62-70 slider bounds', () => {
    const { component } = setup();
    const primary = component.ssMembers().find((m) => m.role === 'primary')!;

    component.setExploreAge(primary.id, 75);
    expect(component.exploreAgeFor(primary)).toBe(70);

    component.setExploreAge(primary.id, 40);
    expect(component.exploreAgeFor(primary)).toBe(62);
  });

  it('applies the spousal top-up only to the spouse-role member, sourced from the primary\'s PIA', () => {
    const { component } = setup();
    const primary = component.ssMembers().find((m) => m.role === 'primary')!;
    const spouse = component.ssMembers().find((m) => m.role === 'spouse')!;

    component.setExploreAge(spouse.id, spouse.ssFra!);
    // maxSpousal = 2400 * 0.5 = 1200 > spouse's own PIA 800 -> top-up = 400 at FRA (no reduction).
    expect(component.spousalTopUpFor(spouse)).toBe(400);
    // The primary role never receives a spousal top-up in this one-directional port.
    expect(component.spousalTopUpFor(primary)).toBe(0);
  });

  it('combined monthly total sums every member\'s live benefit plus the spousal top-up', () => {
    const { component } = setup();
    const primary = component.ssMembers().find((m) => m.role === 'primary')!;
    const spouse = component.ssMembers().find((m) => m.role === 'spouse')!;

    component.setExploreAge(primary.id, 70);
    component.setExploreAge(spouse.id, 62);

    const expected =
      component.exploreBenefit(primary) + component.exploreBenefit(spouse) + component.spousalTopUpFor(spouse);
    expect(component.totalMonthly()).toBe(expected);
  });

  it('returns 0 benefit for a member missing PIA or FRA rather than throwing', () => {
    const { component } = setup(makeHousehold({
      members: [
        { id: 'p1', role: 'primary', dependentType: null, name: 'Primary', birthYear: 1960, ssPia: null, ssFra: null, ssClaimAge: null, sortOrder: 0 },
      ] as unknown as HouseholdProfile['members'],
    }));
    const primary = component.ssMembers()[0];
    expect(component.benefitAt(primary, 62)).toBe(0);
    expect(component.exploreBenefit(primary)).toBe(0);
    expect(component.totalMonthly()).toBe(0);
  });

  it('produces plain-language aria-valuetext for the slider at 62, FRA, and 70', () => {
    const { component } = setup();
    const primary = component.ssMembers().find((m) => m.role === 'primary')!;
    expect(component.claimAgeValueText(primary, 62)).toMatch(/claim at age 62/i);
    expect(component.claimAgeValueText(primary, 62)).toMatch(/before full retirement age/i);
    expect(component.claimAgeValueText(primary, 67)).toMatch(/full retirement age/i);
    expect(component.claimAgeValueText(primary, 70)).toMatch(/after full retirement age/i);
  });
});
