import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LocationService } from './location.service';
import type { LocationFull } from '@models/api.model';

/**
 * Location Schedule fix: locMonthlyCost counts exactly ONE healthcare
 * figure — ACA (healthcarePreMedicare) for pre-Medicare households,
 * Medicare (`healthcare`) once everyone is 65+ — instead of summing both.
 */
describe('LocationService.locMonthlyCost — single healthcare figure', () => {
  let svc: LocationService;
  let httpMock: HttpTestingController;

  const usLoc = {
    id: 'us-test', name: 'Test, VA', country: 'United States', currency: 'USD',
    monthlyCosts: {
      housing: { typical: 2000 },
      groceries: { typical: 500 },
      taxes: { typical: 538 },
      healthcare: { typical: 650 },
      healthcarePreMedicare: { typical: 2300 },
    },
  } as unknown as LocationFull;

  const foreignLoc = {
    id: 'pa-test', name: 'Test, Panama', country: 'Panama', currency: 'USD',
    monthlyCosts: {
      housing: { typical: 1200 },
      healthcare: { typical: 300 },
    },
  } as unknown as LocationFull;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(LocationService);
    httpMock = TestBed.inject(HttpTestingController);
    // fullLocations() is a computed derived from the raw catalog fetched via
    // loadFull() (rent-override port, A4 #5) — no public setter any more, so
    // seed it the same way location.service.spec.ts does: flush a mocked
    // /locations response.
    svc.loadFull();
    const req = httpMock.expectOne((r) => r.url.endsWith('/locations') && r.method === 'GET');
    req.flush({
      data: [usLoc, foreignLoc],
      pagination: { page: 1, limit: 200, total: 2, totalPages: 1 },
    });
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('pre-Medicare household: uses healthcarePreMedicare, excludes healthcare', () => {
    // 2000 + 500 + 538 + 2300 (ACA) — the 650 Medicare figure is excluded
    expect(svc.locMonthlyCost('us-test', false)).toBe(5338);
  });

  it('Medicare household: uses healthcare, excludes healthcarePreMedicare', () => {
    // 2000 + 500 + 538 + 650
    expect(svc.locMonthlyCost('us-test', true)).toBe(3688);
  });

  it('never double-counts both variants (old behavior would give 5988)', () => {
    expect(svc.locMonthlyCost('us-test', false)).not.toBe(5988);
    expect(svc.locMonthlyCost('us-test', true)).not.toBe(5988);
  });

  it('locations without an ACA figure always use healthcare', () => {
    expect(svc.locMonthlyCost('pa-test', false)).toBe(1500);
    expect(svc.locMonthlyCost('pa-test', true)).toBe(1500);
  });

  it('locMonthlyCostAtYear compounds the same selected base', () => {
    const base = svc.locMonthlyCost('us-test', true);
    const rate = svc.locInflationRate('us-test');
    expect(svc.locMonthlyCostAtYear('us-test', 5, true)).toBeCloseTo(base * Math.pow(1 + rate, 5));
  });
});
