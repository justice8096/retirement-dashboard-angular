/**
 * Admin location catalog CRUD + version history (A4 parity port #6 — the
 * retired React `AdminPanel.tsx` / `ManageLocationsTab.tsx`). All routes
 * live under `/api/admin/locations`, gated server-side by `requireAdmin`
 * (tier === 'admin'); see retirement-api `src/routes/admin.ts` +
 * `src/middleware/auth.ts`.
 */

/** One row from `GET /api/locations` (public catalog) — the same shape
 *  the admin screen lists for editing. See `LocationSummary` in
 *  `location.model.ts`; re-declared here isn't needed, the screen uses
 *  `LocationSummary` directly. This file only carries the admin-specific
 *  mutation-response and history shapes. */
export interface AdminLocationRow {
  id: string;
  version: number;
  name: string;
  country: string;
  region: string;
  subregion: string | null;
  currency: string;
  monthlyCostTotal: number;
  updatedAt: string;
  /** Present on create/update responses (the row echoes the JSONB it just wrote). */
  locationData?: Record<string, unknown>;
}

/** One row from `GET /api/admin/locations/:id/history` — a prior version's
 *  full `locationData` snapshot, captured whenever an admin PUT/POST wrote it. */
export interface AdminLocationHistoryEntry {
  locationId: string;
  version: number;
  locationData: Record<string, unknown>;
  changedBy: string;
  createdAt: string;
}
