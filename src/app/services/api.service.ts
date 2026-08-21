import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { coerceHousehold, coerceFinancial } from '@app/lib/coerce-encrypted-numerics';
import {
  PaginatedResponse,
  LocationSummary,
  LocationFull,
  LocationQuery,
  SupplementType,
  UserProfile,
  HouseholdProfile,
  FinancialSettings,
  WithdrawalStrategy,
  Scenario,
  BillingStatus,
  Badge,
  Contribution,
  ContributionProgress,
  BrokerageFees,
  GroceryData,
  LocationOverrideRow,
} from '@models/api.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /* ─── Locations ──────────────────────────────────────────────────── */

  getLocations(query: LocationQuery = {}): Observable<PaginatedResponse<LocationSummary | LocationFull>> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        params = params.set(key, String(val));
      }
    });
    return this.http.get<PaginatedResponse<LocationSummary | LocationFull>>(
      `${this.base}/locations`, { params }
    );
  }

  getAllLocations(): Observable<LocationSummary[]> {
    return this.http.get<LocationSummary[]>(`${this.base}/locations/all`);
  }

  getLocation(id: string): Observable<LocationFull> {
    return this.http.get<LocationFull>(`${this.base}/locations/${id}`);
  }

  getLocationSupplement(id: string, dataType: SupplementType): Observable<unknown> {
    return this.http.get(`${this.base}/locations/${id}/${dataType}`);
  }

  /** One POST instead of N GETs. Server returns `{ [locationId]: data }` —
   *  locations with no supplement are omitted from the map (not an error). */
  batchLoadSupplements(
    locationIds: string[],
    dataType: SupplementType,
  ): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(
      `${this.base}/locations/batch-supplements`,
      { locationIds, dataType },
    );
  }

  getCountries(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/locations/countries`);
  }

  getRegions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/locations/regions`);
  }

  /* ─── User ──────────────────────────────────────────────────────── */

  getProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.base}/me`);
  }

  updateProfile(data: Partial<UserProfile>): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${this.base}/me`, data);
  }

  /* ─── Household ─────────────────────────────────────────────────── */

  getHousehold(): Observable<HouseholdProfile> {
    return this.http.get<HouseholdProfile>(`${this.base}/me/household`)
      .pipe(map(coerceHousehold));
  }

  updateHousehold(data: Partial<HouseholdProfile>): Observable<HouseholdProfile> {
    return this.http.put<HouseholdProfile>(`${this.base}/me/household`, data)
      .pipe(map(coerceHousehold));
  }

  /* ─── Financial ─────────────────────────────────────────────────── */

  getFinancial(): Observable<FinancialSettings> {
    return this.http.get<FinancialSettings>(`${this.base}/me/financial`)
      .pipe(map(coerceFinancial));
  }

  updateFinancial(data: Partial<FinancialSettings>): Observable<FinancialSettings> {
    // Strip server-only fields so the API's strict Zod schema doesn't 400.
    // GET returns userId / updatedAt / _units / _labels alongside settings;
    // callers often forward the whole object back, so filter defensively.
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === 'userId' || k === 'updatedAt' || k.startsWith('_')) continue;
      payload[k] = v;
    }
    return this.http.put<FinancialSettings>(`${this.base}/me/financial`, payload)
      .pipe(map(coerceFinancial));
  }

  /* ─── Withdrawal ────────────────────────────────────────────────── */

  getWithdrawal(): Observable<WithdrawalStrategy> {
    return this.http.get<WithdrawalStrategy>(`${this.base}/me/withdrawal`);
  }

  updateWithdrawal(data: Partial<WithdrawalStrategy>): Observable<WithdrawalStrategy> {
    return this.http.put<WithdrawalStrategy>(`${this.base}/me/withdrawal`, data);
  }

  /* ─── Preferences ───────────────────────────────────────────────── */

  getPreferences(): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.base}/me/preferences`);
  }

  updatePreferences(data: Record<string, unknown>): Observable<void> {
    return this.http.patch<void>(`${this.base}/me/preferences`, data);
  }

  /* ─── Groceries ──────────────────────────────────────────────────── */

  /** GET /me/groceries — per-item overrides + saved shopping lists.
   *  Server returns `{ overrides: {}, lists: {} }` for a user with no
   *  saved data yet (never 404s). See retirement-api `src/routes/groceries.ts`. */
  getGroceries(): Observable<GroceryData> {
    return this.http.get<GroceryData>(`${this.base}/me/groceries`);
  }

  /** PUT /me/groceries — full replace of overrides/lists (whichever keys
   *  are present in `data`; the route's schema treats both as optional). */
  saveGroceries(data: Partial<GroceryData>): Observable<GroceryData> {
    return this.http.put<GroceryData>(`${this.base}/me/groceries`, data);
  }

  /* ─── Location Overrides ────────────────────────────────────────── */

  /** GET /me/locations/overrides — every persisted override row for the
   *  signed-in user (A4 parity port #5, editable rent). Empty array for a
   *  user with none. See retirement-api `src/routes/custom-locations.ts`. */
  getLocationOverrides(): Observable<LocationOverrideRow[]> {
    return this.http.get<LocationOverrideRow[]>(`${this.base}/me/locations/overrides`);
  }

  /** PUT /me/locations/overrides — upserts the override for one base
   *  location. `overrides` is merged wholesale server-side; callers pass
   *  the full partial-location shape they want stored (here always
   *  `{ monthlyCosts: { rent: {...} } }`), matching the retired React
   *  `api.overrides.save` / `setBaseOverride` contract exactly. */
  saveLocationOverride(baseLocationId: string, overrides: Record<string, unknown>): Observable<LocationOverrideRow> {
    return this.http.put<LocationOverrideRow>(`${this.base}/me/locations/overrides`, { baseLocationId, overrides });
  }

  /** DELETE /me/locations/overrides/:baseLocationId — clears a persisted override. */
  deleteLocationOverride(baseLocationId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/me/locations/overrides/${baseLocationId}`);
  }

  /* ─── Scenarios ─────────────────────────────────────────────────── */

  getScenarios(): Observable<Scenario[]> {
    return this.http.get<Scenario[]>(`${this.base}/me/scenarios`);
  }

  createScenario(data: { name: string; scenarioData: Record<string, unknown> }): Observable<Scenario> {
    return this.http.post<Scenario>(`${this.base}/me/scenarios`, data);
  }

  updateScenario(id: string, data: Partial<Scenario>): Observable<Scenario> {
    return this.http.put<Scenario>(`${this.base}/me/scenarios/${id}`, data);
  }

  deleteScenario(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/me/scenarios/${id}`);
  }

  /* ─── Billing ───────────────────────────────────────────────────── */

  getBillingStatus(): Observable<BillingStatus> {
    return this.http.get<BillingStatus>(`${this.base}/billing/status`);
  }

  /* ─── Badges ────────────────────────────────────────────────────── */

  getMyBadges(): Observable<Badge[]> {
    return this.http.get<Badge[]>(`${this.base}/badges/mine`);
  }

  getBadgeCatalog(): Observable<Badge[]> {
    return this.http.get<Badge[]>(`${this.base}/badges/catalog`);
  }

  /* ─── Contributions ─────────────────────────────────────────────── */

  getMyContributions(page = 1): Observable<PaginatedResponse<Contribution>> {
    return this.http.get<PaginatedResponse<Contribution>>(
      `${this.base}/contributions/mine`, { params: { page: String(page) } }
    );
  }

  getContributionProgress(): Observable<ContributionProgress> {
    return this.http.get<ContributionProgress>(`${this.base}/contributions/progress`);
  }

  submitContribution(data: {
    type: string;
    locationId?: string;
    title: string;
    data: Record<string, unknown>;
  }): Observable<Contribution> {
    return this.http.post<Contribution>(`${this.base}/contributions`, data);
  }

  /* --- Brokerage & Transfer Fees --- */

  getFees(): Observable<BrokerageFees> {
    return this.http.get<BrokerageFees>(`${this.base}/me/fees`);
  }

  updateFees(data: Partial<BrokerageFees>): Observable<BrokerageFees> {
    return this.http.put<BrokerageFees>(`${this.base}/me/fees`, data);
  }

  /* ─── Health ────────────────────────────────────────────────────── */

  getHealth(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.base}/health`);
  }
}
