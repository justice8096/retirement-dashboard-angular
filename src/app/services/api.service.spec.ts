import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApiService } from './api.service';
import type { AdminLocationRow, AdminLocationHistoryEntry, PaginatedResponse } from '@models/api.model';

/**
 * Vitest spec for `ApiService`'s admin-location catalog methods (A4 parity
 * port #6 — manage-locations screen: CRUD + version history + reindex).
 * Verifies each method hits the right verb/URL/body against
 * `retirement-api`'s `/api/admin/locations*` routes (`src/routes/admin.ts`)
 * and threads the response straight through. Auth-gating (401/403) is
 * exercised at the component level (`manage-locations-screen.component.spec.ts`)
 * since it's a UI-state concern, not a serialization concern.
 */
describe('ApiService — admin locations (A4 port #6)', () => {
  let api: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('createAdminLocation POSTs { id, locationData } to /admin/locations', () => {
    const row: AdminLocationRow = {
      id: 'atlantis', version: 1, name: 'Atlantis', country: 'Nowhere', region: '',
      subregion: null, currency: 'USD', monthlyCostTotal: 0, updatedAt: '2026-08-21T00:00:00Z',
    };
    let result: AdminLocationRow | undefined;
    api.createAdminLocation('atlantis', { name: 'Atlantis', country: 'Nowhere' }).subscribe(r => result = r);

    const req = httpMock.expectOne(r => r.url.endsWith('/admin/locations') && r.method === 'POST');
    expect(req.request.body).toEqual({ id: 'atlantis', locationData: { name: 'Atlantis', country: 'Nowhere' } });
    req.flush(row);

    expect(result).toEqual(row);
  });

  it('updateAdminLocation PUTs { locationData } (no changedBy) to /admin/locations/:id', () => {
    const row: AdminLocationRow = {
      id: 'lisbon', version: 3, name: 'Lisbon', country: 'Portugal', region: 'Lisbon District',
      subregion: null, currency: 'EUR', monthlyCostTotal: 2200, updatedAt: '2026-08-21T00:00:00Z',
    };
    let result: AdminLocationRow | undefined;
    api.updateAdminLocation('lisbon', { name: 'Lisbon', country: 'Portugal' }).subscribe(r => result = r);

    const req = httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon') && r.method === 'PUT');
    expect(req.request.body).toEqual({ locationData: { name: 'Lisbon', country: 'Portugal' } });
    req.flush(row);

    expect(result).toEqual(row);
  });

  it('updateAdminLocation includes changedBy in the body when given', () => {
    api.updateAdminLocation('lisbon', { name: 'Lisbon' }, 'admin@example.com').subscribe();

    const req = httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon') && r.method === 'PUT');
    expect(req.request.body).toEqual({ locationData: { name: 'Lisbon' }, changedBy: 'admin@example.com' });
    req.flush({});
  });

  it('deleteAdminLocation issues DELETE /admin/locations/:id', () => {
    let result: { message: string; id: string } | undefined;
    api.deleteAdminLocation('lisbon').subscribe(r => result = r);

    const req = httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon') && r.method === 'DELETE');
    req.flush({ message: 'Location deleted', id: 'lisbon' });

    expect(result).toEqual({ message: 'Location deleted', id: 'lisbon' });
  });

  it('getAdminLocationHistory GETs /admin/locations/:id/history with page + limit params', () => {
    const page: PaginatedResponse<AdminLocationHistoryEntry> = {
      data: [
        { locationId: 'lisbon', version: 3, locationData: { name: 'Lisbon' }, changedBy: 'admin@example.com', createdAt: '2026-08-21T00:00:00Z' },
      ],
      pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
    };
    let result: PaginatedResponse<AdminLocationHistoryEntry> | undefined;
    api.getAdminLocationHistory('lisbon').subscribe(r => result = r);

    const req = httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon/history') && r.method === 'GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush(page);

    expect(result).toEqual(page);
  });

  it('getAdminLocationHistory forwards a custom page/limit', () => {
    api.getAdminLocationHistory('lisbon', 2, 5).subscribe();
    const req = httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon/history') && r.method === 'GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('5');
    req.flush({ data: [], pagination: { page: 2, limit: 5, total: 0, totalPages: 0 } });
  });

  it('reindexAdminLocations POSTs to /admin/locations/reindex', () => {
    let result: { message: string } | undefined;
    api.reindexAdminLocations().subscribe(r => result = r);

    const req = httpMock.expectOne(r => r.url.endsWith('/admin/locations/reindex') && r.method === 'POST');
    req.flush({ message: 'Reindexed 138 locations' });

    expect(result).toEqual({ message: 'Reindexed 138 locations' });
  });

  it('propagates a 403 error (non-admin tier) to the subscriber', () => {
    let error: { status: number; error: unknown } | undefined;
    api.deleteAdminLocation('lisbon').subscribe({ error: (err) => { error = err; } });

    const req = httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon') && r.method === 'DELETE');
    req.flush({ error: 'Admin access required' }, { status: 403, statusText: 'Forbidden' });

    expect(error?.status).toBe(403);
    expect(error?.error).toEqual({ error: 'Admin access required' });
  });
});
