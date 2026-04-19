import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import {
  ITEM_CATEGORIES, ItemCategoryKey, defaultItemSelections,
} from '../data/item-catalog';

/**
 * Tracks which catalog items the user has selected under the Setup → Items tab.
 * Persisted through the existing `/me/preferences` JSONB blob under the
 * `itemSelections` top-level key. Defaults to all-selected on first load.
 */
@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly api = inject(ApiService);

  readonly selections = signal<Record<ItemCategoryKey, string[]>>(defaultItemSelections());
  readonly loaded = signal(false);

  /** Scale factor for a given cost category key. 1.0 when no catalog maps to it. */
  readonly scaleByCostKey = computed(() => {
    const sel = this.selections();
    const out: Record<string, number> = {};
    for (const cat of ITEM_CATEGORIES) {
      if (!cat.costKey) continue;
      const selected = sel[cat.key]?.length ?? 0;
      const total = cat.items.length;
      // Empty selection = defaults (ratio 1.0) per user spec.
      out[cat.costKey] = selected === 0 ? 1 : selected / total;
    }
    return out;
  });

  load(): void {
    if (this.loaded()) return;
    this.api.getPreferences().subscribe({
      next: (prefs) => {
        const stored = (prefs as Record<string, unknown>)['itemSelections'] as
          Record<ItemCategoryKey, string[]> | undefined;
        if (stored) {
          this.selections.set({ ...defaultItemSelections(), ...stored });
        }
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  toggle(cat: ItemCategoryKey, id: string): void {
    this.selections.update(s => {
      const list = new Set(s[cat] ?? []);
      if (list.has(id)) list.delete(id);
      else list.add(id);
      return { ...s, [cat]: Array.from(list) };
    });
    this.persist();
  }

  resetCategory(cat: ItemCategoryKey): void {
    const meta = ITEM_CATEGORIES.find(c => c.key === cat);
    if (!meta) return;
    this.selections.update(s => ({ ...s, [cat]: meta.items.map(i => i.id) }));
    this.persist();
  }

  clearCategory(cat: ItemCategoryKey): void {
    this.selections.update(s => ({ ...s, [cat]: [] }));
    this.persist();
  }

  private persist(): void {
    this.api.updatePreferences({ itemSelections: this.selections() }).subscribe({
      error: (err) => console.warn('ItemsService: persist selections failed.', err),
    });
  }
}
