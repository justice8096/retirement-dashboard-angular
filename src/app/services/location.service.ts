import { Injectable, inject, signal, computed } from '@angular/core';
import { of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import {
  LocationSummary, LocationFull, LocationQuery, MonthlyCosts, CostRange, COST_CATEGORIES, DetailedCosts,
  NeighborhoodsSupplement, Neighborhood, SupplementType, LocationOverrideRow,
} from '@models/api.model';
import { weightedInflationFromLocation } from '@retirement/shared/engine/monte-carlo.js';
import { PET_COST_CATEGORY_KEYS } from '@retirement/shared/engine/household-costs.js';

/** Debounced save delay for a rent-override edit, in ms — matches the
 *  retired React `useApiSync`'s `SAVE_DEBOUNCE_MS` (2s) for the same
 *  `baseLocationOverrides` writes. */
const OVERRIDE_SAVE_DEBOUNCE_MS = 2000;

export type SortField = 'name' | 'monthlyCostTotal' | 'country';
export type SortDir = 'asc' | 'desc';

@Injectable({ providedIn: 'root' })
export class LocationService {
  readonly api = inject(ApiService);

  /* ─── State ─────────────────────────────────────────────────────── */
  readonly locations = signal<LocationSummary[]>([]);
  /** Raw catalog data as served by the API — never patched with overrides.
   *  Read `fullLocations()` below for the override-aware version; this stays
   *  private so nothing accidentally bypasses the patch. */
  private readonly rawFullLocations = signal<LocationFull[]>([]);
  private readonly rawSelectedLocation = signal<LocationFull | null>(null);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /* ─── Rent overrides (A4 parity port #5) ───────────────────────────
   * Per-location rent override, keyed by location id, in the same USD
   * "today" units as `monthlyCosts.rent.typical`. Mirrors the retired
   * React `useAppStore.setBaseOverride` mechanism: patching the canonical
   * location object itself (see `fullLocations` below) so every existing
   * downstream reader — MonteCarloStateService.baseCost, location-compare,
   * report-screen, cost-detail's comparison chart — sees the override with
   * zero extra wiring, exactly as the single Zustand store did in React. */
  readonly rentOverrides = signal<Record<string, number>>({});
  readonly overridesLoaded = signal(false);
  readonly overridesSaving = signal(false);
  readonly overridesDirty = signal(false);
  readonly overridesError = signal<string | null>(null);
  private readonly overrideSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  /** Count of in-flight override PUT/DELETE requests — lets `overridesDirty`
   *  / `overridesSaving` stay accurate when multiple locations are edited
   *  within the same debounce window (each location debounces independently). */
  private overrideSavesInFlight = 0;

  /* Filters */
  readonly searchTerm = signal('');
  readonly countryFilter = signal<string | null>(null);
  readonly regionFilter = signal<string | null>(null);
  readonly minCost = signal<number | null>(null);
  readonly maxCost = signal<number | null>(null);
  readonly sortBy = signal<SortField>('monthlyCostTotal');
  readonly sortDir = signal<SortDir>('asc');

  /* Reference data */
  readonly countries = signal<string[]>([]);
  readonly regions = signal<string[]>([]);

  /**
   * User's annual income, used to drive the bracket-based income tax calc.
   * Seeded from `household.targetAnnualIncome` on first load; overrideable on
   * the Taxes screen. Default $72k matches the legacy stored-tax baseline.
   */
  readonly annualIncome = signal<number>(72000);

  /* ─── Computed ──────────────────────────────────────────────────── */

  /** Returns the right label for the region-filter dropdown: US locations
   *  surface their state (`subregion`) so the picker breaks the nine US
   *  macros into 50 actionable states. Non-US locations stay on their
   *  macro region so the compact Europe / Central America / South America
   *  groupings remain usable. Falls back to `region` when `subregion`
   *  is absent. */
  readonly displayRegion = (l: { country: string; region: string; subregion?: string }): string => {
    if (l.country === 'United States') return l.subregion ?? l.region;
    return l.region;
  };

  readonly filteredLocations = computed(() => {
    let locs = this.locations();
    const search = this.searchTerm().toLowerCase();
    const country = this.countryFilter();
    const region = this.regionFilter();
    const min = this.minCost();
    const max = this.maxCost();

    if (search) {
      locs = locs.filter(l =>
        l.name.toLowerCase().includes(search) ||
        l.country.toLowerCase().includes(search) ||
        l.region.toLowerCase().includes(search) ||
        (l.subregion?.toLowerCase().includes(search) ?? false)
      );
    }
    if (country) locs = locs.filter(l => l.country === country);
    if (region) locs = locs.filter(l => this.displayRegion(l) === region);
    if (min !== null) locs = locs.filter(l => l.monthlyCostTotal >= min);
    if (max !== null) locs = locs.filter(l => l.monthlyCostTotal <= max);

    const field = this.sortBy();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...locs].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * dir;
      }
      return ((aVal as number) - (bVal as number)) * dir;
    });
  });

  readonly locationCount = computed(() => this.filteredLocations().length);
  readonly totalCount = computed(() => this.locations().length);

  readonly cheapest = computed(() => {
    const locs = this.filteredLocations();
    return locs.length ? locs.reduce((a, b) => a.monthlyCostTotal < b.monthlyCostTotal ? a : b) : null;
  });

  readonly mostExpensive = computed(() => {
    const locs = this.filteredLocations();
    return locs.length ? locs.reduce((a, b) => a.monthlyCostTotal > b.monthlyCostTotal ? a : b) : null;
  });

  readonly averageCost = computed(() => {
    const locs = this.filteredLocations();
    if (!locs.length) return 0;
    return Math.round(locs.reduce((sum, l) => sum + l.monthlyCostTotal, 0) / locs.length);
  });

  /** Locations currently checked */
  readonly selectedLocations = computed(() => {
    const ids = this.selectedIds();
    return this.locations().filter(l => ids.has(l.id));
  });

  /**
   * Every full location the API has served, patched with any active rent
   * override. This is THE single choke point every cost screen, the
   * comparison chart, and MonteCarloStateService.baseCost read through —
   * patching here means an override propagates everywhere the catalog
   * value used to appear, without touching those consumers.
   */
  readonly fullLocations = computed<LocationFull[]>(() => {
    const overrides = this.rentOverrides();
    const raw = this.rawFullLocations();
    if (!Object.keys(overrides).length) return raw;
    return raw.map(l => this.withRentOverride(l, overrides[l.id]));
  });

  /** Single-location detail fetch (`selectLocation`), also override-aware
   *  so a location-detail view stays consistent with every other screen. */
  readonly selectedLocation = computed<LocationFull | null>(() => {
    const l = this.rawSelectedLocation();
    if (!l) return null;
    return this.withRentOverride(l, this.rentOverrides()[l.id]);
  });

  /** Returns `loc` unchanged when there's no override for it; otherwise a
   *  shallow copy with `monthlyCosts.rent.typical` replaced — every other
   *  rent field (min/max/annualInflation/sources) is preserved from the
   *  catalog, matching the retired React `setBaseOverride` call in
   *  `HousingTab.saveEdit`.
   *
   *  Also delta-adjusts the backend-computed `monthlyCostTotal` by the same
   *  amount the rent changed. Everything that *sums categories* (
   *  `nonHealthcareBaseMonthly` → MC baseCost, cost-detail's chart,
   *  TaxService's location-compare path) already reflects the override for
   *  free because it re-sums `monthlyCosts`; but `report-screen.component.ts`
   *  reads the precomputed `monthlyCostTotal` field directly for its CSV
   *  exports and narrative text (buildLocationCostsCsv's "Total Monthly"/
   *  "Total Annual" columns, buildScenarioProjectionCsv's 35-year baseCost,
   *  and the brochure narrative) — without this adjustment those totals
   *  would silently go stale next to a changed rent line. `monthlyCostTotal`
   *  is the only backend-precomputed total-like field on `LocationFull`/
   *  `LocationSummary` (grepped the model: no separate annual total is
   *  stored — every "Total Annual" column is derived client-side as
   *  `monthlyCostTotal * 12`, so adjusting the monthly figure here fixes
   *  the annual ones too, automatically, wherever they're derived). */
  private withRentOverride(loc: LocationFull, overrideTypical: number | undefined): LocationFull {
    if (overrideTypical == null) return loc;
    const rent = loc.monthlyCosts?.rent;
    const rawRentTypical = rent?.typical;
    let monthlyCostTotal = loc.monthlyCostTotal;
    if (typeof monthlyCostTotal === 'number' && Number.isFinite(monthlyCostTotal) &&
        typeof rawRentTypical === 'number' && Number.isFinite(rawRentTypical)) {
      monthlyCostTotal = Math.max(0, monthlyCostTotal + (overrideTypical - rawRentTypical));
    }
    return {
      ...loc,
      monthlyCostTotal,
      monthlyCosts: {
        ...loc.monthlyCosts,
        rent: { ...(rent ?? { min: 0, max: 0, typical: 0 }), typical: overrideTypical },
      },
    };
  }

  /**
   * Full-detail locations filtered by Overview selection. When no selection is
   * active (size === 0), returns all full locations — lets cost screens render
   * gracefully before the user has visited Overview.
   */
  readonly selectedFullLocations = computed(() => {
    const ids = this.selectedIds();
    const all = this.fullLocations();
    return ids.size ? all.filter(l => ids.has(l.id)) : all;
  });

  /* ─── Cost breakdown helpers ────────────────────────────────────── */

  readonly costCategories = computed(() => COST_CATEGORIES);

  getCostBreakdown(loc: LocationFull): { label: string; key: string; value: number; color: string; icon: string }[] {
    return this.costCategories()
      .map(cat => ({
        label: cat.label,
        key: cat.key,
        value: loc.monthlyCosts[cat.key]?.typical ?? 0,
        color: cat.color,
        icon: cat.icon,
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  /* Tax helpers live in `TaxService` — injected directly by screens that
   * need them. Keeps LocationService focused on location state + filtering
   * + cost composition. See src/app/services/tax.service.ts. */

  /* ─── Supplement data ──────────────────────────────────────────── */
  readonly supplementCache = signal<Record<string, Record<string, unknown>>>({});
  /** Plain-language fetch-failure message per `${locId}:${dataType}` key.
   *  A key is present only while its last fetch failed with something other
   *  than a 404 — a 404 means "this location has no such supplement" and is
   *  cached as an empty supplement instead (same convention as
   *  `preloadNeighborhoodsForSelected`'s batch misses), so consumers fall
   *  through to their "data not available" cards rather than a retry UI. */
  readonly supplementErrors = signal<Record<string, string>>({});

  loadSupplement(locId: string, dataType: SupplementType): void {
    const cacheKey = `${locId}:${dataType}`;
    if (this.supplementCache()[cacheKey]) return;
    this.clearSupplementError(cacheKey);
    this.api.getLocationSupplement(locId, dataType).subscribe({
      next: (data) => {
        this.supplementCache.update(cache => ({
          ...cache,
          [cacheKey]: data as Record<string, unknown>,
        }));
      },
      error: (err) => {
        if (err?.status === 404) {
          this.supplementCache.update(cache => ({ ...cache, [cacheKey]: {} }));
          return;
        }
        console.warn(`LocationService: supplement fetch failed (${dataType} for ${locId}).`, err);
        this.supplementErrors.update(m => ({
          ...m,
          [cacheKey]: "Could not load this location's data. Check your connection and try again.",
        }));
      },
    });
  }

  getSupplement(locId: string, dataType: SupplementType): Record<string, unknown> | null {
    return this.supplementCache()[`${locId}:${dataType}`] ?? null;
  }

  /** The plain-language failure message for one location's supplement, or
   *  null when it loaded fine, resolved as "no data" (404), or hasn't been
   *  requested/settled yet. Signal-backed — safe to read from computeds. */
  supplementError(locId: string, dataType: SupplementType): string | null {
    return this.supplementErrors()[`${locId}:${dataType}`] ?? null;
  }

  /** Clears a failed supplement's error and refetches it. The error clears
   *  immediately so consumers drop back to their loading state while the
   *  new request is in flight. */
  retrySupplement(locId: string, dataType: SupplementType): void {
    this.loadSupplement(locId, dataType);
  }

  private clearSupplementError(cacheKey: string): void {
    if (!(cacheKey in this.supplementErrors())) return;
    this.supplementErrors.update(m => {
      const next = { ...m };
      delete next[cacheKey];
      return next;
    });
  }

  /**
   * Recommended neighborhood for a location — the highest-ranked entry in the
   * neighborhoods supplement by composite score (walkability + transit +
   * mapped safety + mapped English prevalence). Returns null until the
   * supplement for that location is loaded via `loadSupplement(id, 'neighborhoods')`.
   */
  recommendedNeighborhood(locId: string): Neighborhood | null {
    const sup = this.supplementCache()[`${locId}:neighborhoods`] as unknown as NeighborhoodsSupplement | undefined;
    if (!sup?.neighborhoods?.length) return null;
    const rankWord = (w: string | undefined): number => {
      switch ((w ?? '').toLowerCase()) {
        case 'high': case 'large': case 'excellent': return 3;
        case 'moderate': case 'medium': case 'good': return 2;
        case 'low': case 'small': case 'fair': return 1;
        default: return 0;
      }
    };
    const score = (n: Neighborhood): number =>
      (n.walkabilityScore ?? 0) * 0.4 +
      (n.transitScore ?? 0) * 0.2 +
      rankWord(n.safetyRating) * 15 +
      rankWord(n.expats?.englishPrevalence) * 10;
    return [...sup.neighborhoods].sort((a, b) => score(b) - score(a))[0];
  }

  /** Preload neighborhoods supplement for every currently-selected location.
   *  Issues ONE batch request to `/locations/batch-supplements` instead of N
   *  per-location GETs — previously a full selection fanned out 200 requests
   *  and tripped the rate limiter. Locations missing a supplement are simply
   *  absent from the response map (no 404 per miss). */
  preloadNeighborhoodsForSelected(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    const missing = ids.filter(id => !this.supplementCache()[`${id}:neighborhoods`]);
    if (!missing.length) return;
    this.api.batchLoadSupplements(missing, 'neighborhoods').subscribe({
      next: (map) => {
        this.supplementCache.update(cache => {
          const next = { ...cache };
          for (const id of missing) {
            const data = map[id];
            // Cache hits AND misses so we don't re-request known-empty ids.
            next[`${id}:neighborhoods`] = (data as Record<string, unknown>) ?? {};
          }
          return next;
        });
      },
      error: (err) => console.warn('LocationService: batch neighborhoods fetch failed.', err),
    });
  }

  /**
   * Sum of a location's monthly costs excluding `healthcare`, `taxes`, and any
   * category flagged as `alternate` (e.g. `healthcarePreMedicare`). This is
   * the "rest of the bill" that callers combine with an effective healthcare
   * cost + computed income tax to get a realistic total.
   *
   * Single source of truth for the "what counts in baseline cost" rule —
   * used by `totalWithIncomeTax` below, by HealthcareService.locationTotalWithHealthcare,
   * and by the MC screen's segment builder.
   */
  nonHealthcareBaseMonthly(loc: LocationFull): number {
    const costs = loc.monthlyCosts ?? {};
    const alternateKeys = new Set(
      COST_CATEGORIES.filter(c => c.alternate).map(c => c.key),
    );
    let sum = 0;
    for (const [key, val] of Object.entries(costs)) {
      if (key === 'taxes' || key === 'healthcare' || alternateKeys.has(key)) continue;
      sum += (val?.typical ?? 0);
    }
    return sum;
  }

  /** Total monthly pet cost categories (petCare + petDaycare + petGrooming)
   *  for a location, today's USD. Used to exclude pets from the flat
   *  baseCost when the per-year pet cost curve replaces them. */
  petMonthlyTotal(loc: LocationFull): number {
    const costs = (loc.monthlyCosts ?? {}) as Partial<Record<string, CostRange>>;
    return PET_COST_CATEGORY_KEYS.reduce((sum, key) => sum + (costs[key]?.typical ?? 0), 0);
  }

  /** A location's catalog (un-overridden) typical rent — used by the
   *  housing screen to show what "Reset to default" reverts to. */
  catalogRent(locId: string): number {
    return this.rawFullLocations().find(l => l.id === locId)?.monthlyCosts?.rent?.typical ?? 0;
  }

  /**
   * Baseline monthly cost of a catalog location in today's USD — the sum of
   * monthlyCosts with exactly ONE healthcare figure counted:
   * `healthcarePreMedicare` (ACA pricing) while the household is
   * pre-Medicare, the Medicare-era `healthcare` category once everyone is
   * 65+. Locations without a healthcarePreMedicare figure (most non-US)
   * always use `healthcare`. Previously this summed BOTH healthcare
   * variants plus the seed taxes category, which overstated the Location
   * Schedule versus the Costs/Compare screens.
   */
  locMonthlyCost(locId: string, medicareHousehold = false): number {
    const l = this.fullLocations().find(x => x.id === locId);
    if (!l) return 0;
    const costs = (l.monthlyCosts ?? {}) as Partial<Record<string, CostRange>>;
    const hasPre = (costs['healthcarePreMedicare']?.typical ?? 0) > 0;
    const excluded = (medicareHousehold || !hasPre) ? 'healthcarePreMedicare' : 'healthcare';
    return Object.entries(costs)
      .reduce((s, [key, c]) => (key === excluded ? s : s + (c?.typical ?? 0)), 0);
  }

  /** Weighted per-category inflation for a location (decimal, e.g. 0.025). */
  locInflationRate(locId: string): number {
    const l = this.fullLocations().find(x => x.id === locId);
    if (!l?.monthlyCosts) return 0.025;
    return weightedInflationFromLocation(
      l.monthlyCosts as unknown as Record<string, { typical?: number; annualInflation?: number }>,
    );
  }

  /**
   * Projected monthly cost at a given simulation year — compounds today's
   * baseline by the target location's own weighted inflation rate.
   * Deterministic preview; actual MC runs sample per year.
   */
  locMonthlyCostAtYear(locId: string, year: number, medicareHousehold = false): number {
    const today = this.locMonthlyCost(locId, medicareHousehold);
    const rate = this.locInflationRate(locId);
    const factor = Math.pow(1 + rate, Math.max(0, year));
    return today * factor;
  }

  /* ─── Actions ───────────────────────────────────────────────────── */

  loadAll(): void {
    if (this.locations().length) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.getAllLocations().subscribe({
      next: (data) => {
        this.locations.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load locations');
        this.loading.set(false);
      },
    });
  }

  loadFull(): void {
    if (this.rawFullLocations().length) return;
    this.api.getLocations({ fields: 'full', limit: 200 }).subscribe({
      next: (res) => this.rawFullLocations.set(res.data as LocationFull[]),
      error: (err) => console.warn('LocationService: full locations fetch failed.', err),
    });
  }

  loadCountries(): void {
    if (this.countries().length) return;
    this.api.getCountries().subscribe({
      next: (data) => this.countries.set(data),
      error: (err) => console.warn('LocationService: countries fetch failed.', err),
    });
  }

  loadRegions(): void {
    if (this.regions().length) return;
    this.api.getRegions().subscribe({
      next: (data) => this.regions.set(data),
      error: (err) => console.warn('LocationService: regions fetch failed.', err),
    });
  }

  selectLocation(id: string): void {
    this.loading.set(true);
    this.api.getLocation(id).subscribe({
      next: (loc) => {
        this.rawSelectedLocation.set(loc);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load location');
        this.loading.set(false);
      },
    });
  }

  clearSelection(): void {
    this.rawSelectedLocation.set(null);
  }

  /* ─── Rent override actions (A4 parity port #5) ────────────────── */

  /** One-shot fetch of this user's persisted rent overrides. Idempotent —
   *  safe to call from every housing-screen visit's `ngOnInit`. For an
   *  anonymous user the API 401s; that's treated the same as "no overrides
   *  yet" and edits stay session-only, matching `GroceriesService.load`'s
   *  graceful-degradation pattern. */
  loadRentOverrides(): void {
    if (this.overridesLoaded()) return;
    this.api.getLocationOverrides().pipe(
      tap((rows: LocationOverrideRow[]) => {
        const map: Record<string, number> = {};
        for (const row of rows) {
          const typical = row.overrides?.monthlyCosts?.rent?.typical;
          if (typeof typical === 'number' && typical >= 0) map[row.baseLocationId] = typical;
        }
        this.rentOverrides.set(map);
        this.overridesLoaded.set(true);
      }),
      catchError((err) => {
        console.warn('LocationService: rent overrides fetch failed; using session-only overrides.', err);
        this.overridesLoaded.set(true);
        return of(null);
      }),
    ).subscribe();
  }

  /** Sets (or replaces) the rent override for one location and schedules a
   *  debounced server save. The override is visible everywhere immediately
   *  (it's a signal update); only the persistence round-trip is deferred. */
  setRentOverride(locId: string, typicalRent: number): void {
    this.rentOverrides.update(m => ({ ...m, [locId]: typicalRent }));
    this.scheduleOverrideSave(locId);
  }

  /** Clears a location's rent override — reverts every downstream reader
   *  to the catalog default immediately, and deletes the persisted row
   *  (mirrors React's UX, which had no explicit reset button, plus the
   *  app's `GroceriesService.resetDefaults` convention of an explicit
   *  clear-to-default affordance). */
  clearRentOverride(locId: string): void {
    if (!(locId in this.rentOverrides())) return;
    this.rentOverrides.update(m => {
      const next = { ...m };
      delete next[locId];
      return next;
    });
    if (this.overrideSaveTimers[locId]) {
      clearTimeout(this.overrideSaveTimers[locId]);
      delete this.overrideSaveTimers[locId];
    }
    this.overridesDirty.set(true);
    this.beginOverrideSave();
    this.api.deleteLocationOverride(locId).pipe(
      tap(() => this.endOverrideSave()),
      catchError((err) => {
        console.warn(`LocationService: failed to clear rent override for ${locId}.`, err);
        this.overridesError.set('Failed to clear the rent override on the server. It is cleared locally for this session.');
        this.endOverrideSave();
        return of(null);
      }),
    ).subscribe();
  }

  /** Flushes any pending debounced override saves immediately. Call from a
   *  screen's `ngOnDestroy` so quick navigation never drops the last few
   *  seconds of edits (mirrors `GroceriesService.flush`). */
  flushRentOverrides(): void {
    for (const locId of Object.keys(this.overrideSaveTimers)) {
      clearTimeout(this.overrideSaveTimers[locId]);
      delete this.overrideSaveTimers[locId];
      this.saveRentOverrideNow(locId);
    }
  }

  private scheduleOverrideSave(locId: string): void {
    this.overridesDirty.set(true);
    if (this.overrideSaveTimers[locId]) clearTimeout(this.overrideSaveTimers[locId]);
    this.overrideSaveTimers[locId] = setTimeout(() => {
      delete this.overrideSaveTimers[locId];
      this.saveRentOverrideNow(locId);
    }, OVERRIDE_SAVE_DEBOUNCE_MS);
  }

  private saveRentOverrideNow(locId: string): void {
    const typical = this.rentOverrides()[locId];
    if (typical == null) return;
    this.beginOverrideSave();
    const rent = this.rawFullLocations().find(l => l.id === locId)?.monthlyCosts?.rent;
    this.api.saveLocationOverride(locId, {
      monthlyCosts: { rent: { ...(rent ?? { min: 0, max: 0, typical: 0 }), typical } },
    }).pipe(
      tap(() => this.endOverrideSave()),
      catchError((err) => {
        console.warn(`LocationService: failed to save rent override for ${locId}.`, err);
        this.overridesError.set('Failed to save your rent override to the server. It is kept for this session only — try again shortly.');
        this.endOverrideSave();
        return of(null);
      }),
    ).subscribe();
  }

  /** Marks a save in flight — `overridesSaving` stays true while at least
   *  one location's PUT/DELETE is outstanding. */
  private beginOverrideSave(): void {
    this.overrideSavesInFlight++;
    this.overridesSaving.set(true);
  }

  /** Un-marks one in-flight save. `overridesDirty`/`overridesSaving` only
   *  drop back to false once every debounce timer AND every in-flight
   *  request has settled — accurate even when several locations are edited
   *  within the same debounce window. */
  private endOverrideSave(): void {
    this.overrideSavesInFlight = Math.max(0, this.overrideSavesInFlight - 1);
    this.overridesSaving.set(this.overrideSavesInFlight > 0);
    if (this.overrideSavesInFlight === 0 && Object.keys(this.overrideSaveTimers).length === 0) {
      this.overridesDirty.set(false);
    }
  }

  toggleLocation(id: string): void {
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  selectAllVisible(): void {
    const visible = this.filteredLocations().map(l => l.id);
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      visible.forEach(id => next.add(id));
      return next;
    });
  }

  deselectAll(): void {
    this.selectedIds.set(new Set());
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.countryFilter.set(null);
    this.regionFilter.set(null);
    this.minCost.set(null);
    this.maxCost.set(null);
  }
}
