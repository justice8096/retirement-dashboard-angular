import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import {
  LocationSummary, LocationFull, LocationQuery, MonthlyCosts, CostRange, COST_CATEGORIES, DetailedCosts,
  NeighborhoodsSupplement, Neighborhood, SupplementType,
} from '@models/api.model';
import { weightedInflationFromLocation } from '@retirement/shared/engine/monte-carlo.js';

export type SortField = 'name' | 'monthlyCostTotal' | 'country';
export type SortDir = 'asc' | 'desc';

@Injectable({ providedIn: 'root' })
export class LocationService {
  readonly api = inject(ApiService);

  /* ─── State ─────────────────────────────────────────────────────── */
  readonly locations = signal<LocationSummary[]>([]);
  readonly fullLocations = signal<LocationFull[]>([]);
  readonly selectedLocation = signal<LocationFull | null>(null);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

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

  loadSupplement(locId: string, dataType: SupplementType): void {
    const cacheKey = `${locId}:${dataType}`;
    if (this.supplementCache()[cacheKey]) return;
    this.api.getLocationSupplement(locId, dataType).subscribe({
      next: (data) => {
        this.supplementCache.update(cache => ({
          ...cache,
          [cacheKey]: data as Record<string, unknown>,
        }));
      },
      error: (err) => {
        console.warn(`LocationService: supplement fetch failed (${dataType} for ${locId}).`, err);
      },
    });
  }

  getSupplement(locId: string, dataType: SupplementType): Record<string, unknown> | null {
    return this.supplementCache()[`${locId}:${dataType}`] ?? null;
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

  /** Baseline monthly cost of a catalog location in today's USD (sum of monthlyCosts). */
  locMonthlyCost(locId: string): number {
    const l = this.fullLocations().find(x => x.id === locId);
    if (!l) return 0;
    return Object.values(l.monthlyCosts ?? {}).reduce((s, c) => s + (c?.typical ?? 0), 0);
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
  locMonthlyCostAtYear(locId: string, year: number): number {
    const today = this.locMonthlyCost(locId);
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
    if (this.fullLocations().length) return;
    this.api.getLocations({ fields: 'full', limit: 200 }).subscribe({
      next: (res) => this.fullLocations.set(res.data as LocationFull[]),
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
        this.selectedLocation.set(loc);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load location');
        this.loading.set(false);
      },
    });
  }

  clearSelection(): void {
    this.selectedLocation.set(null);
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
