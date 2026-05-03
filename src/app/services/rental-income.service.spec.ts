import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RentalIncomeService } from './rental-income.service';
import type { RentalProperty } from '@app/lib/rental-income';

/**
 * Vitest spec for the rental-income service load/save round-trip
 * (Todo #36, persistence for #29).
 *
 * Verifies:
 *   - load() hits GET /me/financial and stores `rentalProperties` on
 *     the signal; idempotent (subsequent calls are no-ops).
 *   - save() hits PUT /me/financial with only `rentalProperties` in
 *     the payload (no household leak), and clears `dirty`.
 *   - add/patch/remove/clear flip `dirty` to true.
 *   - load failure leaves the service in a usable empty state and
 *     marks `loaded` true (one-shot guard).
 *   - load tolerates missing `rentalProperties` field (deployment-skew
 *     window before the api PR #92 ships).
 */
describe('RentalIncomeService', () => {
  let svc: RentalIncomeService;
  let httpMock: HttpTestingController;

  const sampleProp: RentalProperty = {
    id: 'rental-test-1',
    label: 'Test rental',
    monthlyGrossRent: 2500,
    vacancyRatePct: 8,
    propertyTaxAnnual: 4000,
    otherOpExAnnual: 3000,
    mortgageInterestAnnual: 0,
    depreciableBasis: 200000,
    depreciationStartYear: 0,
    ownedFromYear: 0,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    svc = TestBed.inject(RentalIncomeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('load: hydrates properties from GET /me/financial', () => {
    svc.load();
    const req = httpMock.expectOne((r) => r.url.endsWith('/me/financial') && r.method === 'GET');
    req.flush({
      portfolioBalance: 500000,
      rentalProperties: [sampleProp],
      updatedAt: new Date().toISOString(),
    });
    expect(svc.properties()).toEqual([sampleProp]);
    expect(svc.loaded()).toBe(true);
    expect(svc.dirty()).toBe(false);
  });

  it('load: idempotent — second call is a no-op', () => {
    svc.load();
    const req = httpMock.expectOne((r) => r.url.endsWith('/me/financial'));
    req.flush({ rentalProperties: [], updatedAt: '' });
    expect(svc.loaded()).toBe(true);
    // Second load() should NOT issue another HTTP request.
    svc.load();
    httpMock.expectNone((r) => r.url.endsWith('/me/financial'));
  });

  it('load: missing rentalProperties field tolerated (api deploy-skew)', () => {
    svc.load();
    const req = httpMock.expectOne((r) => r.url.endsWith('/me/financial'));
    // Pre-#92 deployment: response has no rentalProperties field.
    req.flush({ portfolioBalance: 500000, updatedAt: '' });
    expect(svc.properties()).toEqual([]);
    expect(svc.loaded()).toBe(true);
  });

  it('load: error leaves portfolio empty and marks loaded', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    svc.load();
    const req = httpMock.expectOne((r) => r.url.endsWith('/me/financial'));
    req.flush({}, { status: 500, statusText: 'Server Error' });
    expect(svc.properties()).toEqual([]);
    expect(svc.loaded()).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('save: PUTs only rentalProperties (no household leak)', () => {
    svc.add();
    svc.patch(svc.properties()[0].id, { label: 'Edited label' });
    expect(svc.dirty()).toBe(true);

    svc.save().subscribe();
    const req = httpMock.expectOne(
      (r) => r.url.endsWith('/me/financial') && r.method === 'PUT',
    );
    expect(req.request.body).toEqual({ rentalProperties: svc.properties() });
    // No leakage of household fields.
    expect(Object.keys(req.request.body)).toEqual(['rentalProperties']);

    req.flush({ rentalProperties: svc.properties(), updatedAt: '' });
    expect(svc.dirty()).toBe(false);
  });

  it('add/patch/remove/clear flip dirty to true', () => {
    expect(svc.dirty()).toBe(false);
    svc.add();
    expect(svc.dirty()).toBe(true);

    svc.save().subscribe();
    const saveReq = httpMock.expectOne((r) => r.method === 'PUT');
    saveReq.flush({ rentalProperties: svc.properties(), updatedAt: '' });
    expect(svc.dirty()).toBe(false);

    svc.patch(svc.properties()[0].id, { label: 'X' });
    expect(svc.dirty()).toBe(true);

    svc.dirty.set(false);
    svc.remove(svc.properties()[0].id);
    expect(svc.dirty()).toBe(true);

    svc.dirty.set(false);
    svc.clear();
    expect(svc.dirty()).toBe(true);
  });
});
