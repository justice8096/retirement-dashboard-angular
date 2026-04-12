import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { LocationSummary, LocationFull, LocationQuery, MonthlyCosts, CostRange, COST_CATEGORIES, DetailedCosts } from '@models/api.model';

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

  /* ─── Computed ──────────────────────────────────────────────────── */

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
        l.region.toLowerCase().includes(search)
      );
    }
    if (country) locs = locs.filter(l => l.country === country);
    if (region) locs = locs.filter(l => l.region === region);
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

  /* ─── Supplement data ──────────────────────────────────────────── */
  readonly supplementCache = signal<Record<string, Record<string, unknown>>>({});

  loadSupplement(locId: string, dataType: string): void {
    const cacheKey = `${locId}:${dataType}`;
    if (this.supplementCache()[cacheKey]) return;
    this.api.getLocationSupplement(locId, dataType as any).subscribe({
      next: (data) => {
        this.supplementCache.update(cache => ({
          ...cache,
          [cacheKey]: data as Record<string, unknown>,
        }));
      },
      error: () => {},
    });
  }

  getSupplement(locId: string, dataType: string): Record<string, unknown> | null {
    return this.supplementCache()[`${locId}:${dataType}`] ?? null;
  }

  /* ─── Actions ───────────────────────────────────────────────────── */

  loadAll(): void {
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
      error: () => {},
    });
  }

  loadCountries(): void {
    this.api.getCountries().subscribe({
      next: (data) => this.countries.set(data),
      error: () => {},
    });
  }

  loadRegions(): void {
    this.api.getRegions().subscribe({
      next: (data) => this.regions.set(data),
      error: () => {},
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
