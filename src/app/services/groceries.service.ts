import { Injectable, computed, inject, signal } from '@angular/core';
import { of, tap, catchError } from 'rxjs';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import {
  DetailedCosts,
  GroceryCatalogCategory,
  GroceryCategoryGroup,
  GroceryData,
  GroceryItemOverride,
  GroceryList,
  GroceryListsMap,
  GroceryOverridesMap,
  GroceryWorkingItem,
} from '@models/api.model';

const SAVE_DEBOUNCE_MS = 3000;

/**
 * Persistent state for grocery per-item overrides and saved shopping
 * lists (A4 parity port #3, replacing the retired React `GroceriesTab` +
 * `useGrocerySync`).
 *
 * The item *catalog* (name/baseline cost/quantity/unit) is location-scoped
 * data served as the `detailed-costs` supplement (`LocationService.
 * loadSupplement` / `getSupplement`); this service only owns the
 * *overrides* layered on top, which — matching both the retired React
 * behavior and the flat `UserGroceryData.overrides` column on the API —
 * are NOT location-scoped. Switching the active location swaps the
 * catalog but keeps the same override map, exactly as the React tab did.
 *
 * Writes are debounced 3s (matches `useGrocerySync`'s `SAVE_DEBOUNCE_MS`)
 * and marked `dirty` until they land. Call `flush()` from a screen's
 * `ngOnDestroy` so navigating away doesn't drop the last few seconds of
 * edits — list save/delete flush immediately instead, mirroring the
 * `saveGroceries(data, true)` calls React made for those actions.
 */
@Injectable({ providedIn: 'root' })
export class GroceriesService {
  private readonly api = inject(ApiService);
  private readonly loc = inject(LocationService);

  /* ─── State ─────────────────────────────────────────────────────── */
  readonly overrides = signal<GroceryOverridesMap>({});
  readonly lists = signal<GroceryListsMap>({});
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly error = signal<string | null>(null);

  /** Location whose detailed-costs catalog is currently being browsed. */
  readonly activeLocationId = signal<string | null>(null);

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /* ─── Catalog + working items ────────────────────────────────────── */

  /** Sets the active location and kicks off its `detailed-costs` supplement
   *  fetch (no-op if already cached — see `LocationService.loadSupplement`). */
  setActiveLocation(locId: string): void {
    this.activeLocationId.set(locId);
    this.loc.loadSupplement(locId, 'detailed-costs');
  }

  private catalogFor(locId: string | null): GroceryCatalogCategory[] {
    if (!locId) return [];
    const supp = this.loc.getSupplement(locId, 'detailed-costs') as DetailedCosts | null;
    return supp?.groceries?.categories ?? [];
  }

  readonly activeCatalog = computed<GroceryCatalogCategory[]>(() =>
    this.catalogFor(this.activeLocationId()),
  );

  /** True once the active location's catalog has resolved (empty or not) —
   *  distinguishes "still loading" from "no detailed grocery data for this
   *  location" in the template. */
  readonly catalogLoaded = computed(() => {
    const id = this.activeLocationId();
    return id ? this.loc.getSupplement(id, 'detailed-costs') !== null : false;
  });

  /** Plain-language message when the active location's catalog fetch failed
   *  (`catalogLoaded` stays false in that case, so check this first to show
   *  an error + retry instead of an infinite "Loading…"). Null while
   *  loading, on success, and for locations with no detailed data. */
  readonly catalogError = computed(() => {
    const id = this.activeLocationId();
    return id ? this.loc.supplementError(id, 'detailed-costs') : null;
  });

  /** Refetches the active location's catalog after a failed load. */
  retryCatalog(): void {
    const id = this.activeLocationId();
    if (id) this.loc.retrySupplement(id, 'detailed-costs');
  }

  /** Catalog items merged with overrides — the source for both the item
   *  table and every total below. */
  readonly workingItems = computed<GroceryWorkingItem[]>(() => {
    const overrides = this.overrides();
    const items: GroceryWorkingItem[] = [];
    for (const cat of this.activeCatalog()) {
      for (const item of cat.items) {
        const key = `${cat.id}::${item.name}`;
        const ov = overrides[key];
        items.push({
          key,
          categoryId: cat.id,
          categoryName: cat.name,
          name: item.name,
          unit: item.unit ?? '',
          forWhom: item.forWhom ?? 'adults',
          notes: item.notes ?? '',
          enabled: ov?.enabled ?? true,
          quantity: ov?.quantity ?? item.quantity ?? 1,
          monthlyCost: ov?.monthlyCost ?? item.monthlyCost ?? 0,
          baseMonthlyCost: item.monthlyCost ?? 0,
        });
      }
    }
    return items;
  });

  readonly itemsByCategory = computed<GroceryCategoryGroup[]>(() => {
    const groups: GroceryCategoryGroup[] = [];
    const byId = new Map<string, GroceryCategoryGroup>();
    for (const item of this.workingItems()) {
      let g = byId.get(item.categoryId);
      if (!g) {
        g = { id: item.categoryId, name: item.categoryName, items: [] };
        byId.set(item.categoryId, g);
        groups.push(g);
      }
      g.items.push(item);
    }
    return groups;
  });

  readonly enabledItems = computed(() => this.workingItems().filter(i => i.enabled));
  readonly enabledItemCount = computed(() => this.enabledItems().length);

  readonly monthlyTotal = computed(() =>
    this.enabledItems().reduce((sum, i) => sum + i.monthlyCost, 0),
  );
  readonly weeklyTotal = computed(() => this.monthlyTotal() / (52 / 12));
  readonly annualTotal = computed(() => this.monthlyTotal() * 12);

  readonly categoryTotals = computed<Record<string, number>>(() => {
    const totals: Record<string, number> = {};
    for (const item of this.enabledItems()) {
      totals[item.categoryId] = (totals[item.categoryId] ?? 0) + item.monthlyCost;
    }
    return totals;
  });

  /** Sorted saved-lists array for template iteration (object insertion
   *  order isn't guaranteed stable across JSON round-trips). */
  readonly sortedLists = computed<{ id: string; list: GroceryList }[]>(() =>
    Object.entries(this.lists())
      .map(([id, list]) => ({ id, list }))
      .sort((a, b) => b.list.createdAt.localeCompare(a.list.createdAt)),
  );

  /* ─── Load / save round trip ─────────────────────────────────────── */

  /** One-shot fetch of overrides + saved lists. Idempotent once loaded —
   *  safe to call from every screen visit's `ngOnInit`. */
  load(): void {
    if (this.loaded()) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.getGroceries().pipe(
      tap((data: GroceryData) => {
        this.overrides.set(data.overrides ?? {});
        this.lists.set(data.lists ?? {});
        this.loaded.set(true);
        this.loading.set(false);
        this.dirty.set(false);
      }),
      catchError(err => {
        console.warn('GroceriesService: load failed.', err);
        this.error.set('Could not load your saved grocery changes. You can keep editing this session, but it may not carry over.');
        this.loaded.set(true);
        this.loading.set(false);
        return of(null);
      }),
    ).subscribe();
  }

  /** Cancels any pending debounce and saves immediately. No-op if nothing
   *  is dirty. Call from a screen's `ngOnDestroy` so quick navigation
   *  never drops an in-flight edit. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty()) return;
    this.saving.set(true);
    this.api.saveGroceries({ overrides: this.overrides(), lists: this.lists() }).pipe(
      tap(() => {
        this.dirty.set(false);
        this.saving.set(false);
      }),
      catchError(err => {
        console.warn('GroceriesService: save failed.', err);
        this.error.set('Failed to save your grocery changes. They are kept locally — try again shortly.');
        this.saving.set(false);
        return of(null);
      }),
    ).subscribe();
  }

  /** Marks dirty and (re)schedules a debounced save 3s out — matches
   *  `useGrocerySync`'s `SAVE_DEBOUNCE_MS`. */
  private scheduleSave(): void {
    this.dirty.set(true);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
  }

  /* ─── Item mutations ─────────────────────────────────────────────── */

  toggleItem(key: string): void {
    const current = this.overrides()[key] ?? {};
    const wasEnabled = current.enabled ?? true;
    this.setOverride(key, { ...current, enabled: !wasEnabled });
  }

  updateCost(key: string, monthlyCost: number): void {
    const current = this.overrides()[key] ?? {};
    this.setOverride(key, { ...current, monthlyCost });
  }

  updateQuantity(key: string, quantity: number): void {
    const current = this.overrides()[key] ?? {};
    this.setOverride(key, { ...current, quantity });
  }

  private setOverride(key: string, ov: GroceryItemOverride): void {
    this.overrides.update(m => ({ ...m, [key]: ov }));
    this.scheduleSave();
  }

  /** Clears every override, reverting the active catalog to its baseline
   *  prices/quantities/enabled state. Mirrors React's "Reset Defaults". */
  resetDefaults(): void {
    this.overrides.set({});
    this.scheduleSave();
  }

  /* ─── Saved lists ─────────────────────────────────────────────────── */

  /** Snapshots the current overrides map as a named list and saves
   *  immediately (not debounced) — matches React's `saveList` calling
   *  `saveGroceries(..., true)`. Returns the new list's id. */
  saveCurrentAsList(name: string): string {
    const id = this.generateListId();
    const list: GroceryList = {
      name,
      createdAt: new Date().toISOString(),
      locationId: this.activeLocationId(),
      itemCount: this.enabledItemCount(),
      monthlyTotal: Math.round(this.monthlyTotal()),
      overrides: { ...this.overrides() },
    };
    this.lists.update(m => ({ ...m, [id]: list }));
    this.dirty.set(true);
    this.flush();
    return id;
  }

  renameList(id: string, name: string): void {
    const existing = this.lists()[id];
    if (!existing || !name.trim()) return;
    this.lists.update(m => ({ ...m, [id]: { ...existing, name: name.trim() } }));
    this.dirty.set(true);
    this.flush();
  }

  /** Applies a saved list's overrides as the current working overrides
   *  (mirrors React's `loadList`). Debounced like any other edit — the
   *  server already has this exact list, so there's no urgency. */
  applyList(id: string): void {
    const list = this.lists()[id];
    if (!list) return;
    this.overrides.set({ ...list.overrides });
    this.scheduleSave();
  }

  deleteList(id: string): void {
    if (!(id in this.lists())) return;
    this.lists.update(m => {
      const next = { ...m };
      delete next[id];
      return next;
    });
    this.dirty.set(true);
    this.flush();
  }

  private generateListId(): string {
    const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
    return g.crypto?.randomUUID?.() ?? `list-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  }
}
