/**
 * Canonical item catalog for the "Items" setup tab. Defines selectable items
 * in 5 categories that scale the corresponding cost category's monthly total.
 *
 * Mechanic: each category has a default set (all items enabled). If the user
 * deselects items, the cost screen scales `monthlyCosts[costKey].typical` by
 * `selected.length / defaults.length`. This is a first-cut approximation —
 * upgrades to per-item pricing can come later when supplements support it.
 */

export type ItemCategoryKey = 'groceries' | 'medicines' | 'streaming' | 'internet' | 'ai';

export interface CatalogItem {
  id: string;
  label: string;
}

export interface ItemCategory {
  key: ItemCategoryKey;
  label: string;
  icon: string;
  /** Cost screen this category scales; null = informational only. */
  costKey: string | null;
  items: CatalogItem[];
}

export const ITEM_CATEGORIES: ItemCategory[] = [
  {
    key: 'groceries',
    label: 'Groceries',
    icon: '🛒',
    costKey: 'groceries',
    items: [
      { id: 'milk',      label: 'Milk / dairy' },
      { id: 'bread',     label: 'Bread / baked goods' },
      { id: 'eggs',      label: 'Eggs' },
      { id: 'produce',   label: 'Fresh produce' },
      { id: 'meat',      label: 'Meat / poultry' },
      { id: 'fish',      label: 'Fish / seafood' },
      { id: 'grains',    label: 'Rice / pasta / grains' },
      { id: 'canned',    label: 'Canned goods' },
      { id: 'frozen',    label: 'Frozen foods' },
      { id: 'snacks',    label: 'Snacks' },
      { id: 'beverages', label: 'Beverages (non-alcoholic)' },
      { id: 'alcohol',   label: 'Beer / wine / spirits' },
    ],
  },
  {
    key: 'medicines',
    label: 'Medicines',
    icon: '💊',
    costKey: 'medicine',
    items: [
      { id: 'statin',       label: 'Statin (cholesterol)' },
      { id: 'bp',           label: 'Blood pressure' },
      { id: 'thyroid',      label: 'Thyroid (levothyroxine)' },
      { id: 'diabetes',     label: 'Diabetes (metformin/insulin)' },
      { id: 'gerd',         label: 'GERD (PPI / H2 blocker)' },
      { id: 'allergy',      label: 'Allergy / antihistamine' },
      { id: 'pain',         label: 'NSAID / pain management' },
      { id: 'multivitamin', label: 'Multivitamin / supplements' },
      { id: 'antidepress',  label: 'Antidepressant / SSRI' },
      { id: 'sleep',        label: 'Sleep aid' },
    ],
  },
  {
    key: 'streaming',
    label: 'Streaming',
    icon: '📺',
    costKey: 'subscriptions',
    items: [
      { id: 'netflix',     label: 'Netflix' },
      { id: 'disney',      label: 'Disney+' },
      { id: 'hulu',        label: 'Hulu' },
      { id: 'max',         label: 'Max (HBO)' },
      { id: 'prime',       label: 'Amazon Prime Video' },
      { id: 'appletv',     label: 'Apple TV+' },
      { id: 'spotify',     label: 'Spotify / Apple Music' },
      { id: 'youtubeprem', label: 'YouTube Premium' },
      { id: 'paramount',   label: 'Paramount+' },
      { id: 'peacock',     label: 'Peacock' },
    ],
  },
  {
    key: 'internet',
    label: 'Internet',
    icon: '🌐',
    costKey: 'utilities',
    items: [
      { id: 'basic',     label: 'Basic (≤25 Mbps)' },
      { id: 'standard',  label: 'Standard (100 Mbps)' },
      { id: 'fast',      label: 'Fast (500 Mbps)' },
      { id: 'gigabit',   label: 'Gigabit (1 Gbps)' },
      { id: 'cellular',  label: 'Cellular hotspot backup' },
      { id: 'vpn',       label: 'VPN service' },
    ],
  },
  {
    key: 'ai',
    label: 'AI Services',
    icon: '🤖',
    costKey: null,
    items: [
      { id: 'chatgpt',    label: 'ChatGPT Plus' },
      { id: 'claude',     label: 'Claude Pro' },
      { id: 'gemini',     label: 'Gemini Advanced' },
      { id: 'perplexity', label: 'Perplexity Pro' },
      { id: 'midjourney', label: 'Midjourney' },
      { id: 'copilot',    label: 'GitHub Copilot' },
      { id: 'grammarly',  label: 'Grammarly' },
    ],
  },
];

/** All items selected by default. Seeded on first load. */
export function defaultItemSelections(): Record<ItemCategoryKey, string[]> {
  const out = {} as Record<ItemCategoryKey, string[]>;
  for (const cat of ITEM_CATEGORIES) {
    out[cat.key] = cat.items.map(i => i.id);
  }
  return out;
}
