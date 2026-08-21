import type { GroceryCatalogCategory } from './location.model';

/**
 * Per-item override for a grocery-catalog entry (A4 parity port #3 —
 * retired React `GroceriesTab` + `useGrocerySync`). Keyed by
 * `${categoryId}::${itemName}` to match the retired dashboard's key
 * scheme — the detailed-costs seed data has no stable item id, only a
 * name unique within its category. Any subset of the three fields may
 * be present; omitted fields fall back to the location's catalog
 * default (see `GroceryCatalogItem` in `location.model.ts`).
 */
export interface GroceryItemOverride {
  enabled?: boolean;
  monthlyCost?: number;
  quantity?: number;
}

export type GroceryOverridesMap = Record<string, GroceryItemOverride>;

/**
 * A saved shopping list — a named snapshot of the overrides map at save
 * time. `locationId` records which location's catalog was active when
 * the list was saved (for display only — overrides themselves are not
 * location-scoped, matching the retired React behavior and the API's
 * flat `UserGroceryData.overrides` column).
 */
export interface GroceryList {
  name: string;
  createdAt: string;
  locationId: string | null;
  itemCount: number;
  monthlyTotal: number;
  overrides: GroceryOverridesMap;
}

/**
 * The API stores `lists` as a JSON object (`safeJsonRecord` = `z.record`),
 * not an array — see retirement-api `src/routes/groceries.ts`. The retired
 * React dashboard used a plain array in localStorage; we follow the API
 * here per the port's "API is the source of truth" rule, keying each list
 * by a client-generated id.
 */
export type GroceryListsMap = Record<string, GroceryList>;

/** Shape of GET/PUT `/api/me/groceries`. */
export interface GroceryData {
  overrides: GroceryOverridesMap;
  lists: GroceryListsMap;
}

/**
 * One rendered row for the item-override table — a catalog item merged
 * with any override, computed by `GroceriesService.workingItems()`.
 */
export interface GroceryWorkingItem {
  key: string;
  categoryId: string;
  categoryName: string;
  name: string;
  unit: string;
  forWhom: string;
  notes: string;
  enabled: boolean;
  quantity: number;
  monthlyCost: number;
  baseMonthlyCost: number;
}

export interface GroceryCategoryGroup {
  id: string;
  name: string;
  items: GroceryWorkingItem[];
}

/** Re-exported for convenience so consumers of groceries.model.ts don't
 *  also need a separate location.model.ts import for the catalog shape. */
export type { GroceryCatalogCategory };
