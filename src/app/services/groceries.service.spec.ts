import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GroceriesService } from './groceries.service';
import { LocationService } from './location.service';
import type { DetailedCosts } from '@models/api.model';

/**
 * Vitest spec for GroceriesService — the per-item override math, the
 * debounced load/save round-trip against `/me/groceries`, and saved-list
 * CRUD (A4 parity port #3).
 *
 * Verifies:
 *   - load() hydrates overrides/lists from GET /me/groceries; idempotent.
 *   - workingItems() merges the location's detailed-costs catalog with
 *     overrides; toggling/cost/quantity overrides recompute the totals.
 *   - Edits are debounced 3s (matches the retired React useGrocerySync's
 *     SAVE_DEBOUNCE_MS) and flush() saves immediately, PUTting only
 *     {overrides, lists} (no stray fields).
 *   - flush() with nothing dirty issues no request.
 *   - List save/rename/delete flush immediately instead of debouncing.
 */
describe('GroceriesService', () => {
  let svc: GroceriesService;
  let loc: LocationService;
  let httpMock: HttpTestingController;

  const sampleCatalog: DetailedCosts['groceries'] = {
    categories: [
      {
        id: 'produce',
        name: 'Fresh Produce',
        items: [
          { name: 'Apples', monthlyCost: 10, quantity: 3, unit: 'lbs', forWhom: 'adults', notes: '' },
          { name: 'Carrots', monthlyCost: 6, quantity: 2, unit: 'lbs', forWhom: 'shared', notes: 'dog-safe' },
        ],
      },
      {
        id: 'proteins',
        name: 'Proteins',
        items: [
          { name: 'Chicken', monthlyCost: 24, quantity: 5, unit: 'lbs', forWhom: 'shared', notes: '' },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    svc = TestBed.inject(GroceriesService);
    loc = TestBed.inject(LocationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  /** Sets the active location and flushes its detailed-costs supplement
   *  fetch with `sampleCatalog` so `workingItems()` has something to merge. */
  function seedCatalog(locId = 'test-loc'): void {
    svc.setActiveLocation(locId);
    const req = httpMock.expectOne((r) => r.url.endsWith(`/locations/${locId}/detailed-costs`));
    req.flush({ groceries: sampleCatalog });
  }

  describe('load', () => {
    it('hydrates overrides + lists from GET /me/groceries', () => {
      svc.load();
      const req = httpMock.expectOne((r) => r.url.endsWith('/me/groceries') && r.method === 'GET');
      req.flush({ overrides: { 'produce::Apples': { enabled: false } }, lists: {} });

      expect(svc.overrides()).toEqual({ 'produce::Apples': { enabled: false } });
      expect(svc.loaded()).toBe(true);
      expect(svc.dirty()).toBe(false);
    });

    it('is idempotent — second call issues no request', () => {
      svc.load();
      const req = httpMock.expectOne((r) => r.url.endsWith('/me/groceries'));
      req.flush({ overrides: {}, lists: {} });
      svc.load();
      httpMock.expectNone((r) => r.url.endsWith('/me/groceries'));
    });

    it('error leaves overrides empty, sets error message, marks loaded', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      svc.load();
      const req = httpMock.expectOne((r) => r.url.endsWith('/me/groceries'));
      req.flush({}, { status: 500, statusText: 'Server Error' });

      expect(svc.overrides()).toEqual({});
      expect(svc.loaded()).toBe(true);
      expect(svc.error()).toMatch(/could not load/i);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('catalog error surfacing', () => {
    it('a failed catalog fetch surfaces catalogError and keeps catalogLoaded false', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      svc.setActiveLocation('test-loc');
      const req = httpMock.expectOne((r) => r.url.endsWith('/locations/test-loc/detailed-costs'));
      req.flush({}, { status: 500, statusText: 'Server Error' });

      expect(svc.catalogLoaded()).toBe(false);
      expect(svc.catalogError()).toMatch(/could not load/i);
      warnSpy.mockRestore();
    });

    it('retryCatalog clears the error and re-fetches; success renders the catalog', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      svc.setActiveLocation('test-loc');
      httpMock.expectOne((r) => r.url.endsWith('/locations/test-loc/detailed-costs'))
        .flush({}, { status: 500, statusText: 'Server Error' });

      svc.retryCatalog();
      expect(svc.catalogError()).toBeNull();
      httpMock.expectOne((r) => r.url.endsWith('/locations/test-loc/detailed-costs'))
        .flush({ groceries: sampleCatalog });

      expect(svc.catalogLoaded()).toBe(true);
      expect(svc.activeCatalog()).toHaveLength(2);
      warnSpy.mockRestore();
    });

    it('a 404 catalog (no detailed data for this location) resolves as loaded-and-empty, not an error', () => {
      svc.setActiveLocation('test-loc');
      httpMock.expectOne((r) => r.url.endsWith('/locations/test-loc/detailed-costs'))
        .flush({ error: 'Data not found' }, { status: 404, statusText: 'Not Found' });

      expect(svc.catalogLoaded()).toBe(true);
      expect(svc.activeCatalog()).toEqual([]);
      expect(svc.catalogError()).toBeNull();
    });
  });

  describe('workingItems / totals', () => {
    beforeEach(() => {
      svc.load();
      httpMock.expectOne((r) => r.url.endsWith('/me/groceries')).flush({ overrides: {}, lists: {} });
      seedCatalog();
    });

    it('merges catalog defaults with no overrides', () => {
      const items = svc.workingItems();
      expect(items).toHaveLength(3);
      const apples = items.find(i => i.name === 'Apples')!;
      expect(apples.enabled).toBe(true);
      expect(apples.monthlyCost).toBe(10);
      expect(apples.quantity).toBe(3);
      expect(apples.categoryId).toBe('produce');
    });

    it('monthlyTotal sums enabled items only', () => {
      expect(svc.monthlyTotal()).toBe(10 + 6 + 24);
      svc.toggleItem('produce::Apples');
      expect(svc.monthlyTotal()).toBe(6 + 24);
    });

    it('weeklyTotal / annualTotal derive from monthlyTotal', () => {
      const monthly = svc.monthlyTotal();
      expect(svc.weeklyTotal()).toBeCloseTo(monthly / (52 / 12), 6);
      expect(svc.annualTotal()).toBe(monthly * 12);
    });

    it('updateCost overrides a single item and recomputes totals', () => {
      svc.updateCost('proteins::Chicken', 40);
      const chicken = svc.workingItems().find(i => i.name === 'Chicken')!;
      expect(chicken.monthlyCost).toBe(40);
      expect(chicken.baseMonthlyCost).toBe(24);
      expect(svc.monthlyTotal()).toBe(10 + 6 + 40);
    });

    it('updateQuantity overrides quantity without touching cost', () => {
      svc.updateQuantity('produce::Carrots', 5);
      const carrots = svc.workingItems().find(i => i.name === 'Carrots')!;
      expect(carrots.quantity).toBe(5);
      expect(carrots.monthlyCost).toBe(6);
    });

    it('categoryTotals groups by category id, enabled items only', () => {
      svc.toggleItem('produce::Carrots');
      const totals = svc.categoryTotals();
      expect(totals['produce']).toBe(10);
      expect(totals['proteins']).toBe(24);
    });

    it('resetDefaults clears all overrides', () => {
      svc.toggleItem('produce::Apples');
      svc.updateCost('proteins::Chicken', 99);
      svc.resetDefaults();
      expect(svc.overrides()).toEqual({});
      expect(svc.monthlyTotal()).toBe(10 + 6 + 24);
      vi.advanceTimersByTime(3000);
      httpMock.expectOne((r) => r.url.endsWith('/me/groceries') && r.method === 'PUT').flush({ overrides: {}, lists: {} });
    });
  });

  describe('debounced save', () => {
    beforeEach(() => {
      svc.load();
      httpMock.expectOne((r) => r.url.endsWith('/me/groceries')).flush({ overrides: {}, lists: {} });
      seedCatalog();
    });

    it('does not save until the debounce elapses', () => {
      svc.toggleItem('produce::Apples');
      expect(svc.dirty()).toBe(true);
      httpMock.expectNone((r) => r.method === 'PUT');
      vi.advanceTimersByTime(2999);
      httpMock.expectNone((r) => r.method === 'PUT');
    });

    it('saves 3s after the last edit, with only {overrides, lists} in the body', () => {
      svc.toggleItem('produce::Apples');
      vi.advanceTimersByTime(3000);
      const req = httpMock.expectOne((r) => r.url.endsWith('/me/groceries') && r.method === 'PUT');
      expect(Object.keys(req.request.body)).toEqual(['overrides', 'lists']);
      expect(req.request.body.overrides).toEqual({ 'produce::Apples': { enabled: false } });
      req.flush({ overrides: req.request.body.overrides, lists: {} });
      expect(svc.dirty()).toBe(false);
    });

    it('resets the debounce window on rapid successive edits (only one save)', () => {
      svc.toggleItem('produce::Apples');
      vi.advanceTimersByTime(2000);
      svc.updateCost('proteins::Chicken', 30);
      vi.advanceTimersByTime(2000);
      httpMock.expectNone((r) => r.method === 'PUT');
      vi.advanceTimersByTime(1000);
      const req = httpMock.expectOne((r) => r.method === 'PUT');
      req.flush({ overrides: req.request.body.overrides, lists: {} });
    });

    it('flush() saves immediately and cancels the pending timer', () => {
      svc.updateQuantity('produce::Carrots', 4);
      svc.flush();
      const req = httpMock.expectOne((r) => r.url.endsWith('/me/groceries') && r.method === 'PUT');
      req.flush({ overrides: req.request.body.overrides, lists: {} });
      expect(svc.dirty()).toBe(false);

      // The original 3s timer must have been cancelled — advancing past it
      // issues no second request.
      vi.advanceTimersByTime(5000);
      httpMock.expectNone((r) => r.method === 'PUT');
    });

    it('flush() with nothing dirty issues no request', () => {
      svc.flush();
      httpMock.expectNone((r) => r.method === 'PUT');
    });

    it('a failed save sets an error message and stops "saving"', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      svc.toggleItem('produce::Apples');
      svc.flush();
      const req = httpMock.expectOne((r) => r.method === 'PUT');
      req.flush({}, { status: 500, statusText: 'Server Error' });

      expect(svc.saving()).toBe(false);
      expect(svc.error()).toMatch(/failed to save/i);
      warnSpy.mockRestore();
    });
  });

  describe('saved lists', () => {
    beforeEach(() => {
      svc.load();
      httpMock.expectOne((r) => r.url.endsWith('/me/groceries')).flush({ overrides: {}, lists: {} });
      seedCatalog();
    });

    it('saveCurrentAsList snapshots overrides + flushes immediately (no debounce wait)', () => {
      svc.toggleItem('produce::Apples');
      // Toggling scheduled a debounced save; saving the list should still
      // flush right away rather than waiting out that timer.
      const id = svc.saveCurrentAsList('My List');

      const req = httpMock.expectOne((r) => r.url.endsWith('/me/groceries') && r.method === 'PUT');
      expect(req.request.body.lists[id]).toMatchObject({
        name: 'My List',
        itemCount: 2, // Carrots + Chicken enabled; Apples disabled
        monthlyTotal: 30,
      });
      req.flush(req.request.body);
      expect(svc.lists()[id].name).toBe('My List');
    });

    it('lists are stored as an object keyed by id, not an array', () => {
      const id = svc.saveCurrentAsList('List A');
      httpMock.expectOne((r) => r.method === 'PUT').flush({ overrides: {}, lists: { [id]: svc.lists()[id] } });
      expect(Array.isArray(svc.lists())).toBe(false);
      expect(typeof svc.lists()).toBe('object');
      expect(svc.lists()[id].name).toBe('List A');
    });

    it('applyList restores that list\'s overrides as the working overrides', () => {
      svc.toggleItem('produce::Apples');
      const id = svc.saveCurrentAsList('Snapshot');
      httpMock.expectOne((r) => r.method === 'PUT').flush({ overrides: svc.overrides(), lists: svc.lists() });

      svc.updateCost('proteins::Chicken', 999); // diverge from the snapshot
      vi.advanceTimersByTime(3000);
      httpMock.expectOne((r) => r.method === 'PUT').flush({ overrides: svc.overrides(), lists: svc.lists() });

      svc.applyList(id);
      expect(svc.overrides()).toEqual({ 'produce::Apples': { enabled: false } });
      vi.advanceTimersByTime(3000);
      httpMock.expectOne((r) => r.method === 'PUT').flush({ overrides: svc.overrides(), lists: svc.lists() });
    });

    it('renameList updates the name and flushes immediately', () => {
      const id = svc.saveCurrentAsList('Old Name');
      httpMock.expectOne((r) => r.method === 'PUT').flush({ overrides: svc.overrides(), lists: svc.lists() });

      svc.renameList(id, 'New Name');
      const req = httpMock.expectOne((r) => r.method === 'PUT');
      expect(req.request.body.lists[id].name).toBe('New Name');
      req.flush(req.request.body);
    });

    it('deleteList removes the entry and flushes immediately', () => {
      const id = svc.saveCurrentAsList('Doomed');
      httpMock.expectOne((r) => r.method === 'PUT').flush({ overrides: svc.overrides(), lists: svc.lists() });

      svc.deleteList(id);
      const req = httpMock.expectOne((r) => r.method === 'PUT');
      expect(req.request.body.lists).toEqual({});
      req.flush(req.request.body);
      expect(svc.lists()[id]).toBeUndefined();
    });
  });
});
