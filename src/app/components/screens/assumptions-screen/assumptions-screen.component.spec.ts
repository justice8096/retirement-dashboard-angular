import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { AssumptionsScreenComponent } from './assumptions-screen.component';
import { HealthcareService } from '@services/healthcare.service';
import { LocationService } from '@services/location.service';
import type { HouseholdMember, HouseholdProfile } from '@models/household.model';
import type { LocationFull } from '@models/location.model';

/** Minimal US location so the healthcare/income card renders (same shape as
 *  healthcare-consistent.service.spec.ts). */
const testLocation = {
  id: 'test-va',
  name: 'Testville, VA',
  country: 'United States',
  currency: 'USD',
  monthlyCosts: {
    rent: { typical: 1500 },
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

/**
 * Renders the Household Members card and verifies the live spousal top-up
 * echo (spec: retirement-api docs/superpowers/specs/
 * 2026-08-22-spousal-ss-benefits-design.md — worked example: Pat PIA 2400,
 * Sam PIA 760, both claiming at FRA 67 → Sam shows a $440/mo top-up).
 */

function member(over: Partial<HouseholdMember>): HouseholdMember {
  return {
    id: 'm', role: 'primary', dependentType: null, name: 'Member',
    birthYear: 1962, ssPia: null, ssFra: 67, ssClaimAge: 67, sortOrder: 0,
    ...over,
  };
}

function household(members: HouseholdMember[]): HouseholdProfile {
  return {
    id: 'h1', adultsCount: 2, targetAnnualIncome: 0, planningStartYear: 2026,
    planningYears: 35, requirements: [], members, pets: [],
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
}

describe('AssumptionsScreenComponent — spousal top-up echo', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AssumptionsScreenComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function render(members: HouseholdMember[]): HTMLElement {
    const fixture = TestBed.createComponent(AssumptionsScreenComponent);
    fixture.detectChanges(); // ngOnInit fires the load requests
    // The screen and HealthcareService each fetch the household on boot —
    // flush every matching request with the same fixture.
    const requests = http.match(req => req.url.endsWith('/me/household'));
    expect(requests.length).toBeGreaterThan(0);
    requests.forEach(r => r.flush(household(members)));
    // Drain the screen's other boot requests (financial, locations,
    // healthcare, rental) — their defaults are fine for this test.
    http.match(() => true);
    // The income-composition card renders only when a full location exists
    // (healthcareDecision gate) — seed one directly on the service signal.
    TestBed.inject(LocationService).fullLocations.set([testLocation]);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the top-up on the lower earner only (spec worked example)', () => {
    const el = render([
      member({ id: 'pat', name: 'Pat', role: 'primary', ssPia: 2400 }),
      member({ id: 'sam', name: 'Sam', role: 'spouse', ssPia: 760, sortOrder: 1 }),
    ]);
    const echoes = (el.textContent ?? '').match(/spousal top-up/g) ?? [];
    expect(echoes.length).toBe(1);
    expect(el.textContent).toContain('440');
  });

  it('fills ssAnnual from the household members via the apply button', () => {
    const el = render([
      member({ id: 'pat', name: 'Pat', role: 'primary', ssPia: 2400 }),
      member({ id: 'sam', name: 'Sam', role: 'spouse', ssPia: 760, sortOrder: 1 }),
    ]);
    const btn = Array.from(el.querySelectorAll('button'))
      .find(b => (b.textContent ?? '').includes('household Social Security'));
    expect(btn).toBeTruthy();
    btn!.click();
    const healthcare = TestBed.inject(HealthcareService);
    expect(healthcare.income().ssAnnual).toBe(43_200);
  });

  it('offers no ssAnnual apply button when nobody has SS data', () => {
    const el = render([
      member({ id: 'pat', name: 'Pat', role: 'primary', ssPia: null }),
    ]);
    const btn = Array.from(el.querySelectorAll('button'))
      .find(b => (b.textContent ?? '').includes('household Social Security'));
    expect(btn).toBeUndefined();
  });

  it('shows no top-up when only one member has a PIA', () => {
    const el = render([
      member({ id: 'pat', name: 'Pat', role: 'primary', ssPia: 2400 }),
      member({ id: 'sam', name: 'Sam', role: 'spouse', ssPia: null, sortOrder: 1 }),
    ]);
    expect(el.textContent).not.toContain('spousal top-up');
  });
});
