import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import {
  LocationSummary, LocationFull, LocationQuery, MonthlyCosts, CostRange, COST_CATEGORIES, DetailedCosts,
  NeighborhoodsSupplement, Neighborhood, IncomeTaxTable,
} from '@models/api.model';

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

  /**
   * Iterative tax-on-total calculation. Sums the location's monthly costs,
   * separates taxable from non-taxable categories (via `CostCategoryMeta.taxable`),
   * and applies `vatRate + socialChargesRate` from `TaxInfo`. Iterates until the
   * total changes by ≤ $3.00 between passes (cap 20 iterations for safety).
   *
   * Since only the fixed `taxableBase` is taxed, this converges in 1 iteration
   * today — the loop is future-proofing for scenarios where tax itself becomes
   * part of the taxable base.
   */
  computeConvergedTotal(loc: LocationFull): {
    total: number;
    taxableBase: number;
    untaxedBase: number;
    tax: number;
    iterations: number;
    converged: boolean;
  } {
    // Normalize rates: some locations store as decimal (0.2 = 20%), others as
    // whole-number percent (22 = 22%). Anything > 1 is treated as whole-%.
    const normalize = (r: number | undefined | null): number => {
      const n = Number(r ?? 0);
      if (!isFinite(n) || n <= 0) return 0;
      return n > 1 ? n / 100 : n;
    };
    const rate = normalize(loc.taxes?.vatRate) + normalize(loc.taxes?.socialChargesRate);
    let taxableBase = 0;
    let untaxedBase = 0;
    for (const cat of COST_CATEGORIES) {
      if (cat.key === 'taxes') continue;
      const v = loc.monthlyCosts[cat.key]?.typical ?? 0;
      if (cat.taxable) taxableBase += v;
      else untaxedBase += v;
    }
    let total = taxableBase + untaxedBase;
    let tax = 0;
    let iterations = 0;
    let converged = false;
    for (let i = 0; i < 20; i++) {
      iterations = i + 1;
      const newTax = taxableBase * rate;
      const newTotal = taxableBase + untaxedBase + newTax;
      if (Math.abs(newTotal - total) <= 3) {
        tax = newTax;
        total = newTotal;
        converged = true;
        break;
      }
      tax = newTax;
      total = newTotal;
    }
    return { total, taxableBase, untaxedBase, tax, iterations, converged };
  }

  /**
   * Converged totals for the currently-selected locations — includes both the
   * VAT convergence (for consumption tax) AND the bracket-based income tax on
   * `this.annualIncome()`. The `total` field is the full monthly picture:
   * base categories + computed income tax + VAT-on-taxable.
   */
  readonly convergedTotals = computed(() => {
    const income = this.annualIncome();
    return this.selectedFullLocations().map(l => {
      const conv = this.computeConvergedTotal(l);
      const inc = this.computeIncomeTax(l, income);
      // Avoid double-counting: if computeIncomeTax returned a 'stored' value
      // that's already in conv.total (via untaxedBase), don't add it again.
      const addIncomeTax = inc.source === 'brackets' ? inc.monthlyTax : 0;
      return {
        id: l.id,
        name: l.name,
        country: l.country,
        currency: l.currency,
        total: conv.total + addIncomeTax,
        taxableBase: conv.taxableBase,
        untaxedBase: conv.untaxedBase,
        tax: conv.tax + addIncomeTax,
        incomeTax: inc.monthlyTax,
        incomeTaxSource: inc.source,
        iterations: conv.iterations,
        converged: conv.converged,
      };
    });
  });

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

  /** Preload neighborhoods supplement for every currently-selected location. */
  preloadNeighborhoodsForSelected(): void {
    for (const loc of this.selectedFullLocations()) {
      this.loadSupplement(loc.id, 'neighborhoods');
    }
  }

  /** Apply a bracket table to annual taxable income. Deductions applied first. */
  private applyBrackets(table: IncomeTaxTable | undefined, annualIncome: number): number {
    if (!table?.brackets?.length) return 0;
    const deduction = (table.standardDeduction ?? 0) + (table.deduction ?? 0);
    const taxable = Math.max(0, annualIncome - deduction);
    if (taxable <= 0) return 0;
    let tax = 0;
    for (const b of table.brackets) {
      const top = b.max ?? Number.POSITIVE_INFINITY;
      if (taxable <= b.min) break;
      const span = Math.min(taxable, top) - b.min;
      if (span > 0) tax += span * b.rate;
    }
    return tax;
  }

  /**
   * Monthly cost total with the computed income tax swapped in for whatever
   * stored tax value came from the API. Returns:
   *   baseMonthly (all non-tax categories) + computed monthly tax
   * Uses `this.annualIncome()` — so changing that signal fans out to every
   * screen that shows a total.
   */
  totalWithIncomeTax(loc: LocationFull, opts?: { healthcareMonthly?: number }): {
    total: number;
    baseMonthly: number;
    monthlyTax: number;
    taxSource: 'brackets' | 'stored' | 'vat-converged' | 'none';
  } {
    // Skip `taxes` (re-added via computeIncomeTax) AND any category flagged
    // as an alternate (e.g. healthcarePreMedicare) — those get resolved by
    // the HealthcareService into the `healthcare` slot.
    const alternateKeys = new Set(
      COST_CATEGORIES.filter(c => c.alternate).map(c => c.key),
    );
    const costs = loc.monthlyCosts ?? {};
    let baseMonthly = Object.entries(costs)
      .filter(([k]) => k !== 'taxes' && !alternateKeys.has(k))
      .reduce((s, [, v]) => s + (v?.typical ?? 0), 0);

    // Optional healthcare swap: replace the stored Medicare line with the
    // caller-supplied effective cost (e.g. ACA pricing for pre-65 adults).
    if (opts?.healthcareMonthly != null) {
      baseMonthly = baseMonthly - (costs['healthcare']?.typical ?? 0) + opts.healthcareMonthly;
    }

    const tax = this.computeIncomeTax(loc, this.annualIncome());
    return {
      total: baseMonthly + tax.monthlyTax,
      baseMonthly,
      monthlyTax: tax.monthlyTax,
      taxSource: tax.source,
    };
  }

  /**
   * Computes estimated monthly income tax for a location given annual income.
   * Uses federal + state brackets when available (US locations), otherwise
   * falls back to the stored `monthlyCosts.taxes.typical` if non-zero, then
   * to the VAT convergence estimate.
   */
  computeIncomeTax(loc: LocationFull, annualIncome: number): {
    monthlyTax: number;
    federalAnnual: number;
    stateAnnual: number;
    source: 'brackets' | 'stored' | 'vat-converged' | 'none';
  } {
    const t = loc.taxes;
    if (t?.federalIncomeTax?.brackets?.length || t?.stateIncomeTax?.brackets?.length) {
      const fed = this.applyBrackets(t.federalIncomeTax, annualIncome);
      const state = this.applyBrackets(t.stateIncomeTax, annualIncome);
      return {
        monthlyTax: (fed + state) / 12,
        federalAnnual: fed,
        stateAnnual: state,
        source: 'brackets',
      };
    }
    const stored = loc.monthlyCosts['taxes']?.typical ?? 0;
    if (stored > 0) {
      return { monthlyTax: stored, federalAnnual: 0, stateAnnual: 0, source: 'stored' };
    }
    const conv = this.computeConvergedTotal(loc);
    if (conv.tax > 0) {
      return { monthlyTax: conv.tax, federalAnnual: 0, stateAnnual: 0, source: 'vat-converged' };
    }
    return { monthlyTax: 0, federalAnnual: 0, stateAnnual: 0, source: 'none' };
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
