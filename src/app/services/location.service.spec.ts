import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocationService } from './location.service';
import type { LocationFull } from '@models/api.model';

/**
 * Vitest spec for `LocationService`'s rent-override mechanism (A4 parity
 * port #5, editable rent) — the override math itself, and that it
 * propagates to every existing downstream reader (`fullLocations`,
 * `selectedFullLocations`, `selectedLocation`, `nonHealthcareBaseMonthly`,
 * `locMonthlyCost`, `getCostBreakdown`) with no wiring beyond patching the
 * canonical location object, exactly as the retired React
 * `useAppStore.setBaseOverride` did for its single Zustand store.
 *
 * `MonteCarloStateService.baseCost` is a direct one-line pass-through of
 * `LocationService.nonHealthcareBaseMonthly(selectedLoc)` (see
 * monte-carlo-state.service.ts:224) — proving that helper reflects the
 * override is equivalent proof `baseCost` will too, without standing up
 * that service's much heavier household/healthcare dependency graph.
 *
 * Verifies:
 *   - setRentOverride patches `monthlyCosts.rent.typical` on the location
 *     object read from `fullLocations()` / `selectedFullLocations()`,
 *     preserving min/max/annualInflation/sources untouched.
 *   - The same patched location is what `nonHealthcareBaseMonthly` and
 *     `locMonthlyCost` sum from — i.e. downstream cost totals change.
 *   - `selectedLocation` (the separate single-fetch signal) is patched too.
 *   - clearRentOverride reverts every reader to the catalog default and
 *     issues a DELETE.
 *   - loadRentOverrides hydrates from GET, is idempotent, and degrades
 *     gracefully (session-only) on a failed fetch.
 *   - Edits are debounced 2s (matches the retired `useApiSync`'s
 *     SAVE_DEBOUNCE_MS) and PUT the full rent CostRange with just
 *     `typical` replaced; flushRentOverrides saves immediately.
 */
describe('LocationService — rent overrides', () => {
  let svc: LocationService;
  let httpMock: HttpTestingController;

  const springfield: LocationFull = {
    id: 'springfield',
    name: 'Springfield',
    country: 'United States',
    region: 'Midwest',
    currency: 'USD',
    monthlyCosts: {
      rent: { typical: 1500, min: 1200, max: 1900, annualInflation: 0.03 },
      groceries: { typical: 500, min: 400, max: 600 },
      utilities: { typical: 150, min: 100, max: 200 },
      healthcare: { typical: 300, min: 200, max: 400 },
      insurance: { typical: 100, min: 80, max: 120 },
      petCare: { typical: 0, min: 0, max: 0 },
      petDaycare: { typical: 0, min: 0, max: 0 },
      petGrooming: { typical: 0, min: 0, max: 0 },
      transportation: { typical: 200, min: 150, max: 250 },
      entertainment: { typical: 100, min: 50, max: 150 },
      clothing: { typical: 50, min: 30, max: 70 },
      personalCare: { typical: 50, min: 30, max: 70 },
      subscriptions: { typical: 30, min: 20, max: 40 },
      phoneCell: { typical: 60, min: 40, max: 80 },
      taxes: { typical: 0, min: 0, max: 0 },
      miscellaneous: { typical: 100, min: 50, max: 150 },
      medicine: { typical: 40, min: 20, max: 60 },
      buffer: { typical: 0, min: 0, max: 0 },
      medicalOOP: { typical: 0, min: 0, max: 0 },
    },
    // Deliberately NOT the simple sum of the categories above (3180) — the
    // backend bakes in extra factors (e.g. tax-on-total convergence) that a
    // naive recompute-from-categories would lose. Using a total with a
    // built-in +220 "extra" over the raw sum proves the fix delta-adjusts
    // rather than silently recomputing monthlyCostTotal from scratch.
    monthlyCostTotal: 3400,
  } as LocationFull;

  // A second, never-overridden location — used to prove the patch is
  // scoped to the overridden id only.
  const shelbyville: LocationFull = {
    ...springfield,
    id: 'shelbyville',
    name: 'Shelbyville',
    monthlyCosts: { ...springfield.monthlyCosts, rent: { typical: 1100, min: 900, max: 1400 } },
    monthlyCostTotal: 3000,
  } as LocationFull;

  function seedFullLocations(): void {
    svc.loadFull();
    const req = httpMock.expectOne((r) => r.url.endsWith('/locations') && r.method === 'GET');
    req.flush({ data: [springfield, shelbyville], pagination: { page: 1, limit: 200, total: 2, totalPages: 1 } });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    svc = TestBed.inject(LocationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  describe('loadRentOverrides', () => {
    it('hydrates rentOverrides from GET /me/locations/overrides', () => {
      svc.loadRentOverrides();
      const req = httpMock.expectOne((r) => r.url.endsWith('/me/locations/overrides') && r.method === 'GET');
      req.flush([
        {
          id: 'row-1', userId: 'u1', baseLocationId: 'springfield', baseLocationVersion: 1,
          overrides: { monthlyCosts: { rent: { typical: 1800 } } },
          createdAt: '2026-01-01', updatedAt: '2026-01-01',
        },
      ]);
      expect(svc.rentOverrides()).toEqual({ springfield: 1800 });
      expect(svc.overridesLoaded()).toBe(true);
    });

    it('is idempotent — second call issues no request', () => {
      svc.loadRentOverrides();
      httpMock.expectOne((r) => r.url.endsWith('/me/locations/overrides')).flush([]);
      svc.loadRentOverrides();
      httpMock.expectNone((r) => r.url.endsWith('/me/locations/overrides'));
    });

    it('a failed fetch leaves overrides empty and marks loaded (session-only fallback)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      svc.loadRentOverrides();
      const req = httpMock.expectOne((r) => r.url.endsWith('/me/locations/overrides'));
      req.flush({}, { status: 401, statusText: 'Unauthorized' });

      expect(svc.rentOverrides()).toEqual({});
      expect(svc.overridesLoaded()).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('override math + downstream propagation', () => {
    beforeEach(() => {
      seedFullLocations();
    });

    it('setRentOverride patches monthlyCosts.rent.typical in fullLocations(), preserving other rent fields', () => {
      svc.setRentOverride('springfield', 2200);
      const loc = svc.fullLocations().find(l => l.id === 'springfield')!;
      expect(loc.monthlyCosts.rent.typical).toBe(2200);
      expect(loc.monthlyCosts.rent.min).toBe(1200);
      expect(loc.monthlyCosts.rent.max).toBe(1900);
      expect(loc.monthlyCosts.rent.annualInflation).toBe(0.03);
    });

    it('does not mutate the raw catalog object', () => {
      svc.setRentOverride('springfield', 2200);
      expect(svc.catalogRent('springfield')).toBe(1500);
    });

    it('delta-adjusts monthlyCostTotal by the rent change, preserving the backend-baked extra', () => {
      // monthlyCostTotal (3400) is not the raw category sum (3180) — it has
      // a +220 "extra" baked in by the backend. Raising rent by +700 should
      // land at 3400 + 700 = 4100, keeping that extra intact rather than
      // recomputing the total from scratch.
      svc.setRentOverride('springfield', 2200);
      const loc = svc.fullLocations().find(l => l.id === 'springfield')!;
      expect(loc.monthlyCostTotal).toBe(4100);
    });

    it('monthlyCostTotal never goes negative even if a huge negative rent delta were applied', () => {
      svc.setRentOverride('springfield', 0);
      const loc = svc.fullLocations().find(l => l.id === 'springfield')!;
      // 3400 + (0 - 1500) = 1900 — still comfortably positive here, but the
      // clamp itself is exercised by an extreme fixture below.
      expect(loc.monthlyCostTotal).toBe(1900);
    });

    it('clamps monthlyCostTotal at 0 rather than going negative on a large rent cut', () => {
      // A pathological fixture whose total (200) is smaller than its rent
      // (1500) — clearing rent to 0 would naively land at 200 - 1500 = -1300.
      const tinyTotalLoc = { ...springfield, id: 'tiny', monthlyCostTotal: 200 } as LocationFull;
      const patched = (svc as unknown as { withRentOverride(l: LocationFull, o: number | undefined): LocationFull })
        .withRentOverride(tinyTotalLoc, 0);
      expect(patched.monthlyCostTotal).toBe(0);
    });

    it('clearing the override restores monthlyCostTotal to the catalog value', () => {
      svc.setRentOverride('springfield', 2200);
      expect(svc.fullLocations().find(l => l.id === 'springfield')!.monthlyCostTotal).toBe(4100);
      svc.clearRentOverride('springfield');
      httpMock.expectOne((r) => r.method === 'DELETE').flush({ message: 'Override removed' });
      expect(svc.fullLocations().find(l => l.id === 'springfield')!.monthlyCostTotal).toBe(3400);
    });

    it('leaves non-overridden locations\' monthlyCostTotal untouched', () => {
      svc.setRentOverride('springfield', 2200);
      const shelby = svc.fullLocations().find(l => l.id === 'shelbyville')!;
      expect(shelby.monthlyCostTotal).toBe(3000);
      expect(shelby.monthlyCosts.rent.typical).toBe(1100);
    });

    it('propagates into selectedFullLocations()', () => {
      svc.selectedIds.set(new Set(['springfield']));
      svc.setRentOverride('springfield', 2200);
      const loc = svc.selectedFullLocations().find(l => l.id === 'springfield')!;
      expect(loc.monthlyCosts.rent.typical).toBe(2200);
    });

    it('propagates into nonHealthcareBaseMonthly — the same sum MonteCarloStateService.baseCost reads', () => {
      const before = svc.nonHealthcareBaseMonthly(springfield);
      svc.setRentOverride('springfield', 2200);
      const overriddenLoc = svc.fullLocations().find(l => l.id === 'springfield')!;
      const after = svc.nonHealthcareBaseMonthly(overriddenLoc);
      expect(after - before).toBe(2200 - 1500);
    });

    it('propagates into locMonthlyCost()', () => {
      const before = svc.locMonthlyCost('springfield');
      svc.setRentOverride('springfield', 2200);
      const after = svc.locMonthlyCost('springfield');
      expect(after - before).toBe(2200 - 1500);
    });

    it('propagates into getCostBreakdown()', () => {
      svc.setRentOverride('springfield', 2200);
      const loc = svc.fullLocations().find(l => l.id === 'springfield')!;
      const rentRow = svc.getCostBreakdown(loc).find(r => r.key === 'rent')!;
      expect(rentRow.value).toBe(2200);
    });

    it('propagates into selectedLocation() (the single-fetch detail signal)', () => {
      svc.selectLocation('springfield');
      httpMock.expectOne((r) => r.url.endsWith('/locations/springfield')).flush(springfield);
      svc.setRentOverride('springfield', 2200);
      expect(svc.selectedLocation()?.monthlyCosts.rent.typical).toBe(2200);
      vi.advanceTimersByTime(2000);
      httpMock.expectOne((r) => r.url.endsWith('/me/locations/overrides') && r.method === 'PUT')
        .flush({ id: 'row-1', userId: 'u1', baseLocationId: 'springfield', baseLocationVersion: 1, overrides: {}, createdAt: '', updatedAt: '' });
    });

    it('clearRentOverride reverts every reader to the catalog default and issues a DELETE', () => {
      svc.setRentOverride('springfield', 2200);
      vi.advanceTimersByTime(2000);
      httpMock.expectOne((r) => r.method === 'PUT').flush({ id: 'row-1', userId: 'u1', baseLocationId: 'springfield', baseLocationVersion: 1, overrides: {}, createdAt: '', updatedAt: '' });

      svc.clearRentOverride('springfield');
      expect(svc.fullLocations().find(l => l.id === 'springfield')!.monthlyCosts.rent.typical).toBe(1500);
      expect(svc.rentOverrides()).toEqual({});

      const del = httpMock.expectOne((r) => r.url.endsWith('/me/locations/overrides/springfield') && r.method === 'DELETE');
      del.flush({ message: 'Override removed' });
    });

    it('clearRentOverride with no active override issues no request', () => {
      svc.clearRentOverride('springfield');
      httpMock.expectNone((r) => r.method === 'DELETE');
    });
  });

  describe('debounced save', () => {
    beforeEach(() => {
      seedFullLocations();
    });

    it('does not save until the 2s debounce elapses', () => {
      svc.setRentOverride('springfield', 2200);
      httpMock.expectNone((r) => r.method === 'PUT');
      vi.advanceTimersByTime(1999);
      httpMock.expectNone((r) => r.method === 'PUT');
    });

    it('saves 2s after the last edit, PUTting the full rent CostRange with typical replaced', () => {
      svc.setRentOverride('springfield', 2200);
      vi.advanceTimersByTime(2000);
      const req = httpMock.expectOne((r) => r.url.endsWith('/me/locations/overrides') && r.method === 'PUT');
      expect(req.request.body).toEqual({
        baseLocationId: 'springfield',
        overrides: { monthlyCosts: { rent: { typical: 2200, min: 1200, max: 1900, annualInflation: 0.03 } } },
      });
      req.flush({ id: 'row-1', userId: 'u1', baseLocationId: 'springfield', baseLocationVersion: 1, overrides: req.request.body.overrides, createdAt: '', updatedAt: '' });
      expect(svc.overridesDirty()).toBe(false);
    });

    it('resets the debounce window on rapid successive edits (only one save)', () => {
      svc.setRentOverride('springfield', 2000);
      vi.advanceTimersByTime(1000);
      svc.setRentOverride('springfield', 2200);
      vi.advanceTimersByTime(1000);
      httpMock.expectNone((r) => r.method === 'PUT');
      vi.advanceTimersByTime(1000);
      const req = httpMock.expectOne((r) => r.method === 'PUT');
      expect(req.request.body.overrides.monthlyCosts.rent.typical).toBe(2200);
      req.flush({ id: 'row-1', userId: 'u1', baseLocationId: 'springfield', baseLocationVersion: 1, overrides: req.request.body.overrides, createdAt: '', updatedAt: '' });
    });

    it('flushRentOverrides saves immediately and cancels the pending timer', () => {
      svc.setRentOverride('springfield', 2200);
      svc.flushRentOverrides();
      const req = httpMock.expectOne((r) => r.method === 'PUT');
      req.flush({ id: 'row-1', userId: 'u1', baseLocationId: 'springfield', baseLocationVersion: 1, overrides: req.request.body.overrides, createdAt: '', updatedAt: '' });
      expect(svc.overridesDirty()).toBe(false);

      vi.advanceTimersByTime(5000);
      httpMock.expectNone((r) => r.method === 'PUT');
    });

    it('stays dirty/saving until every concurrently-edited location settles', () => {
      // Only one location in the fixture, but exercising two independent
      // debounce timers (as if two locations were mid-edit) verifies the
      // in-flight counter, not just the single-key case.
      svc.setRentOverride('springfield', 2000);
      vi.advanceTimersByTime(2000);
      const req1 = httpMock.expectOne((r) => r.method === 'PUT');

      // A second edit lands before the first PUT resolves — dirty should
      // stay true even after the first request settles.
      svc.setRentOverride('springfield', 2100);
      req1.flush({ id: 'row-1', userId: 'u1', baseLocationId: 'springfield', baseLocationVersion: 1, overrides: req1.request.body.overrides, createdAt: '', updatedAt: '' });
      expect(svc.overridesDirty()).toBe(true);

      vi.advanceTimersByTime(2000);
      const req2 = httpMock.expectOne((r) => r.method === 'PUT');
      req2.flush({ id: 'row-1', userId: 'u1', baseLocationId: 'springfield', baseLocationVersion: 1, overrides: req2.request.body.overrides, createdAt: '', updatedAt: '' });
      expect(svc.overridesDirty()).toBe(false);
      expect(svc.overridesSaving()).toBe(false);
    });

    it('a failed save sets an error message and stops "saving"', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      svc.setRentOverride('springfield', 2200);
      svc.flushRentOverrides();
      const req = httpMock.expectOne((r) => r.method === 'PUT');
      req.flush({}, { status: 500, statusText: 'Server Error' });

      expect(svc.overridesSaving()).toBe(false);
      expect(svc.overridesError()).toMatch(/failed to save/i);
      warnSpy.mockRestore();
    });
  });
});

/**
 * Supplement fetch error handling — a failed `loadSupplement` used to leave
 * both the cache and consumers' loading state unset forever, so screens
 * (groceries, neighborhoods) showed an infinite "Loading…" on any fetch
 * error. Now:
 *   - a transport/server error records a plain-language, per-location/
 *     per-type error readable via `supplementError()`, leaving the cache
 *     unset so a retry can refetch;
 *   - a 404 means "this location has no such supplement" (the API's
 *     documented shape) and caches an empty supplement instead — the same
 *     convention `preloadNeighborhoodsForSelected` uses for batch misses —
 *     so screens fall through to their "data not available" cards;
 *   - `retrySupplement` (and any later `loadSupplement`) clears the error
 *     and re-issues the request.
 */
describe('LocationService — supplement error handling', () => {
  let svc: LocationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    svc = TestBed.inject(LocationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('caches a successful fetch and records no error', () => {
    svc.loadSupplement('lisbon', 'neighborhoods');
    const req = httpMock.expectOne((r) => r.url.endsWith('/locations/lisbon/neighborhoods'));
    req.flush({ city: 'Lisbon', neighborhoods: [] });

    expect(svc.getSupplement('lisbon', 'neighborhoods')).toEqual({ city: 'Lisbon', neighborhoods: [] });
    expect(svc.supplementError('lisbon', 'neighborhoods')).toBeNull();
  });

  it('a failed fetch records a plain-language per-key error and leaves the cache unset', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    svc.loadSupplement('lisbon', 'neighborhoods');
    const req = httpMock.expectOne((r) => r.url.endsWith('/locations/lisbon/neighborhoods'));
    req.flush({}, { status: 500, statusText: 'Server Error' });

    expect(svc.getSupplement('lisbon', 'neighborhoods')).toBeNull();
    expect(svc.supplementError('lisbon', 'neighborhoods')).toMatch(/could not load/i);
    expect(svc.supplementError('lisbon', 'neighborhoods')).toMatch(/try again/i);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('a 404 caches an empty supplement ("no data for this location"), not an error', () => {
    svc.loadSupplement('lisbon', 'detailed-costs');
    const req = httpMock.expectOne((r) => r.url.endsWith('/locations/lisbon/detailed-costs'));
    req.flush({ error: 'Data not found' }, { status: 404, statusText: 'Not Found' });

    expect(svc.getSupplement('lisbon', 'detailed-costs')).toEqual({});
    expect(svc.supplementError('lisbon', 'detailed-costs')).toBeNull();

    // Known-empty — a later load must not refetch.
    svc.loadSupplement('lisbon', 'detailed-costs');
    httpMock.expectNone((r) => r.url.endsWith('/locations/lisbon/detailed-costs'));
  });

  it('errors are scoped to their location+type key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    svc.loadSupplement('lisbon', 'neighborhoods');
    svc.loadSupplement('porto', 'neighborhoods');
    svc.loadSupplement('lisbon', 'detailed-costs');
    httpMock.expectOne((r) => r.url.endsWith('/locations/lisbon/neighborhoods'))
      .flush({}, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne((r) => r.url.endsWith('/locations/porto/neighborhoods'))
      .flush({ city: 'Porto', neighborhoods: [] });
    httpMock.expectOne((r) => r.url.endsWith('/locations/lisbon/detailed-costs'))
      .flush({ groceries: { categories: [] } });

    expect(svc.supplementError('lisbon', 'neighborhoods')).toMatch(/could not load/i);
    expect(svc.supplementError('porto', 'neighborhoods')).toBeNull();
    expect(svc.supplementError('lisbon', 'detailed-costs')).toBeNull();
    warnSpy.mockRestore();
  });

  it('retrySupplement clears the error and re-issues the request', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    svc.loadSupplement('lisbon', 'neighborhoods');
    httpMock.expectOne((r) => r.url.endsWith('/locations/lisbon/neighborhoods'))
      .flush({}, { status: 500, statusText: 'Server Error' });
    expect(svc.supplementError('lisbon', 'neighborhoods')).not.toBeNull();

    svc.retrySupplement('lisbon', 'neighborhoods');
    // The retry clears the error immediately so consumers drop back to
    // their loading state while the new request is in flight.
    expect(svc.supplementError('lisbon', 'neighborhoods')).toBeNull();
    const retryReq = httpMock.expectOne((r) => r.url.endsWith('/locations/lisbon/neighborhoods'));
    retryReq.flush({ city: 'Lisbon', neighborhoods: [] });

    expect(svc.getSupplement('lisbon', 'neighborhoods')).toEqual({ city: 'Lisbon', neighborhoods: [] });
    expect(svc.supplementError('lisbon', 'neighborhoods')).toBeNull();
    warnSpy.mockRestore();
  });

  it('a later loadSupplement after an error also refetches and clears the error', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    svc.loadSupplement('lisbon', 'neighborhoods');
    httpMock.expectOne((r) => r.url.endsWith('/locations/lisbon/neighborhoods'))
      .flush({}, { status: 500, statusText: 'Server Error' });

    // E.g. the user navigates away and back — the screen's ngOnInit calls
    // loadSupplement again; that alone must recover, not just retrySupplement.
    svc.loadSupplement('lisbon', 'neighborhoods');
    expect(svc.supplementError('lisbon', 'neighborhoods')).toBeNull();
    httpMock.expectOne((r) => r.url.endsWith('/locations/lisbon/neighborhoods'))
      .flush({ city: 'Lisbon', neighborhoods: [] });
    expect(svc.getSupplement('lisbon', 'neighborhoods')).toEqual({ city: 'Lisbon', neighborhoods: [] });
    warnSpy.mockRestore();
  });
});
