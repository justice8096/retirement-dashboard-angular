import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ManageLocationsScreenComponent } from './manage-locations-screen.component';

/**
 * A4 parity port #6 — manage-locations admin screen. This app has no
 * client-side admin-role concept (see AuthService), so access is gated
 * purely by how `retirement-api`'s `requireAdmin` preHandler responds to
 * a probe call (`GET /admin/locations/:id/history`) — 200 means admin,
 * 403 means signed in but not admin, 401 means not signed in. These
 * specs verify the screen renders a clean gated state instead of raw
 * HTTP errors in every case, plus one CRUD wiring check (edit save
 * merges the form patch onto the previously-fetched record and strips
 * the read-only computed fields before PUTting).
 */
function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(ManageLocationsScreenComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // triggers ngOnInit -> getLocations()
  return { fixture, component: fixture.componentInstance, httpMock };
}

function flushList(httpMock: HttpTestingController, rows: Array<Record<string, unknown>> = []): void {
  const req = httpMock.expectOne(r => r.url.endsWith('/locations') && r.method === 'GET');
  req.flush({ data: rows, pagination: { page: 1, limit: 500, total: rows.length, totalPages: 1 } });
}

describe('ManageLocationsScreenComponent — admin access gate (A4 port #6)', () => {
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
  });

  it('renders "forbidden" when the probe returns 403 (signed in, not admin)', () => {
    const { component, fixture, httpMock: mock } = setup();
    httpMock = mock;
    flushList(httpMock, [{ id: 'lisbon', version: 1, name: 'Lisbon', country: 'Portugal', region: '', currency: 'EUR', monthlyCostTotal: 2000, updatedAt: '2026-08-21' }]);

    const probeReq = httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon/history') && r.method === 'GET');
    probeReq.flush({ error: 'Admin access required' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    expect(component.gate()).toBe('forbidden');
  });

  it('renders "unauthenticated" when the probe returns 401 (not signed in)', () => {
    const { component, fixture, httpMock: mock } = setup();
    httpMock = mock;
    flushList(httpMock, [{ id: 'lisbon', version: 1, name: 'Lisbon', country: 'Portugal', region: '', currency: 'EUR', monthlyCostTotal: 2000, updatedAt: '2026-08-21' }]);

    const probeReq = httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon/history') && r.method === 'GET');
    probeReq.flush({ error: 'Please sign in to use this feature.' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(component.gate()).toBe('unauthenticated');
  });

  it('renders "admin" and shows the catalog when the probe succeeds', () => {
    const { component, fixture, httpMock: mock } = setup();
    httpMock = mock;
    flushList(httpMock, [{ id: 'lisbon', version: 1, name: 'Lisbon', country: 'Portugal', region: '', currency: 'EUR', monthlyCostTotal: 2000, updatedAt: '2026-08-21' }]);

    const probeReq = httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon/history') && r.method === 'GET');
    probeReq.flush({ data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } });
    fixture.detectChanges();

    expect(component.gate()).toBe('admin');
    expect(component.locations().map(l => l.id)).toEqual(['lisbon']);
  });

  it('falls back to a placeholder probe id when the catalog is empty', () => {
    const { component, fixture, httpMock: mock } = setup();
    httpMock = mock;
    flushList(httpMock, []);

    const probeReq = httpMock.expectOne(r => r.url.includes('/admin/locations/') && r.url.endsWith('/history'));
    expect(probeReq.request.url).toContain('__admin_access_probe__');
    probeReq.flush({ data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } });
    fixture.detectChanges();

    expect(component.gate()).toBe('admin');
  });

  it('edit-save merges the form patch onto the fetched record and strips computed overlay fields', () => {
    const { component, fixture, httpMock: mock } = setup();
    httpMock = mock;
    flushList(httpMock, [{ id: 'lisbon', version: 2, name: 'Lisbon', country: 'Portugal', region: 'Lisbon District', currency: 'EUR', monthlyCostTotal: 2000, updatedAt: '2026-08-21' }]);
    httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon/history') && r.method === 'GET')
      .flush({ data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } });
    fixture.detectChanges();
    expect(component.gate()).toBe('admin');

    component.startEdit('lisbon');
    const getReq = httpMock.expectOne(r => r.url.endsWith('/locations/lisbon') && r.method === 'GET');
    getReq.flush({
      id: 'lisbon', name: 'Lisbon', country: 'Portugal', region: 'Lisbon District', currency: 'EUR',
      exchangeRate: 1.08,
      monthlyCosts: { rent: { typical: 1500, min: 1000, max: 2000, annualInflation: 0.03 } },
      taxes: { notes: 'Flat NHR', vatRate: 0.23, federalIncomeTax: { brackets: [{ min: 0, max: null, rate: 0.2 }] } },
      // Read-time-only computed fields that must NOT be written back:
      _version: 2, updatedAt: '2026-08-20T00:00:00Z', monthlyCostTotal: 2000,
      _a11y: { description: 'x', ariaLabel: 'y' }, acaBridgeSavingsDraw: { applicable: false },
    });

    // Edit one form field, then save.
    component.patchForm({ taxNotes: 'Flat NHR — updated' });
    component.save();

    const putReq = httpMock.expectOne(r => r.url.endsWith('/admin/locations/lisbon') && r.method === 'PUT');
    const body = putReq.request.body as { locationData: Record<string, unknown> };
    // Synthetic overlay fields never reach the PUT body.
    expect(body.locationData['_version']).toBeUndefined();
    expect(body.locationData['updatedAt']).toBeUndefined();
    expect(body.locationData['_a11y']).toBeUndefined();
    expect(body.locationData['acaBridgeSavingsDraw']).toBeUndefined();
    expect(body.locationData['monthlyCostTotal']).toBeUndefined();
    // Untouched nested data (not exposed by the form) survives the merge.
    expect((body.locationData['taxes'] as Record<string, unknown>)['federalIncomeTax']).toEqual({ brackets: [{ min: 0, max: null, rate: 0.2 }] });
    // The form's edit made it through.
    expect((body.locationData['taxes'] as Record<string, unknown>)['notes']).toBe('Flat NHR — updated');

    putReq.flush({ id: 'lisbon', version: 3, name: 'Lisbon', country: 'Portugal', region: 'Lisbon District', subregion: null, currency: 'EUR', monthlyCostTotal: 2000, updatedAt: '2026-08-21' });
    httpMock.expectOne(r => r.url.endsWith('/locations') && r.method === 'GET')
      .flush({ data: [], pagination: { page: 1, limit: 500, total: 0, totalPages: 0 } });

    expect(component.formOpen()).toBe(false);
  });
});
