import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
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
    return this.http.get<HouseholdProfile>(`${this.base}/me/household`);
  }

  updateHousehold(data: Partial<HouseholdProfile>): Observable<HouseholdProfile> {
    return this.http.put<HouseholdProfile>(`${this.base}/me/household`, data);
  }

  /* ─── Financial ─────────────────────────────────────────────────── */

  getFinancial(): Observable<FinancialSettings> {
    return this.http.get<FinancialSettings>(`${this.base}/me/financial`);
  }

  updateFinancial(data: Partial<FinancialSettings>): Observable<FinancialSettings> {
    return this.http.put<FinancialSettings>(`${this.base}/me/financial`, data);
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
