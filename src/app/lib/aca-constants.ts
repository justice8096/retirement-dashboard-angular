/**
 * Single source of truth for ACA subsidy math constants and helpers.
 *
 * Previously these lived in two places:
 *   - `src/app/services/healthcare.service.ts` (UI decisions)
 *   - `src/app/lib/monte-carlo.ts` (per-year simulation cost step)
 *
 * Keeping two copies led to drift — the 2026-04-20 law-conformance
 * review found both tables were still pre-ARPA 2021 values. Extracted
 * here so future updates happen in one place. See also the structured
 * `*_SOURCES_2026` exports below which UI components surface through
 * <app-source-tooltip>.
 */

import type { Source } from '@models/api.model';

/** Structured citations for the 2026 ACA applicable-percentage table. */
export const ACA_PCT_SOURCES_2026: Source[] = [
  {
    title: 'IRS Rev. Proc. 2025-25 (2026 applicable-percentage table)',
    url: 'https://www.irs.gov/pub/irs-drop/rp-25-25.pdf',
    accessed: '2026-04-20',
  },
  {
    title: 'IRC § 36B — Premium tax credit',
    url: 'https://www.law.cornell.edu/uscode/text/26/36B',
    accessed: '2026-04-20',
  },
];

/** Structured citations for the 2026 HHS Federal Poverty Level table. */
export const FPL_SOURCES_2026: Source[] = [
  {
    title: 'HHS 2026 Poverty Guidelines (effective 2026-01-13)',
    url: 'https://aspe.hhs.gov/sites/default/files/documents/b1bfa16b20ae9b89d525bc35de7c1643/detailed-guidelines-2026.pdf',
    accessed: '2026-04-20',
  },
];

// ─── Federal Poverty Level (HHS 2026, continental US) ───────────────
// Alaska + Hawaii carry higher FPLs and are not modeled separately.
// If/when AK/HI coverage is added, branch on state and use the AK/HI
// HHS tables.
export const FPL_2026_BASE = 15_960;        // household of 1
export const FPL_2026_PER_ADDL = 5_600;     // each additional person

/** 2026 HHS Federal Poverty Level for a continental-US household. */
export function fpl2026(size: number): number {
  return FPL_2026_BASE + FPL_2026_PER_ADDL * Math.max(0, size - 1);
}

// ─── ACA applicable-percentage sliding scale (IRC § 36B, 2026) ──────
//
// Per Rev Proc 2025-25, the 2026 applicable-percentage endpoints are
// **2.10% at 133% FPL** and **9.96% at 400% FPL** (interpolated
// linearly within each bucket). Pre-ARPA endpoints were 2.07 / 9.83
// for 2021 — do not use those values.
//
// Under **cliff regime** (the 2026 default after ARPA/IRA enhanced
// subsidies expired), above 400% FPL the enrollee is responsible for
// the full benchmark silver premium — no subsidy, no cap.

interface AcaBracket {
  fplPctUpper: number;  // exclusive upper bound for this bucket
  startPct: number;     // applicable-pct at bucket's lower edge
  endPct: number;       // applicable-pct at bucket's upper edge (linear interp)
}

/**
 * 2026 applicable-percentage brackets. Each bracket runs from the
 * previous bracket's upper bound (or 100% / 133%) up to its own
 * `fplPctUpper`, interpolating linearly from `startPct` to `endPct`.
 *
 * Order matters — `applicablePctCliff2026` iterates and picks the
 * first whose upper bound exceeds the input.
 */
const ACA_BRACKETS_2026: readonly AcaBracket[] = [
  { fplPctUpper: 133, startPct: 0.0210, endPct: 0.0210 }, // flat 2.10%
  { fplPctUpper: 150, startPct: 0.0315, endPct: 0.0420 },
  { fplPctUpper: 200, startPct: 0.0420, endPct: 0.0660 },
  { fplPctUpper: 250, startPct: 0.0660, endPct: 0.0844 },
  { fplPctUpper: 300, startPct: 0.0844, endPct: 0.0996 },
  { fplPctUpper: 400, startPct: 0.0996, endPct: 0.0996 }, // flat 9.96%
];

/**
 * 2026 cliff-regime applicable-percentage. Returns the fraction of
 * MAGI the enrollee contributes toward the benchmark silver plan, or
 * `null` below 100% FPL (Medicaid territory in most states) or above
 * 400% FPL (the cliff — no subsidy).
 */
export function applicablePctCliff2026(fplPct: number): number | null {
  if (fplPct < 100) return null;
  let prevUpper = 100;
  for (const b of ACA_BRACKETS_2026) {
    if (fplPct < b.fplPctUpper) {
      if (b.startPct === b.endPct) return b.startPct;
      const span = b.fplPctUpper - prevUpper;
      return b.startPct + ((fplPct - prevUpper) / span) * (b.endPct - b.startPct);
    }
    prevUpper = b.fplPctUpper;
  }
  return null; // cliff
}

// ─── Enhanced regime (ARPA/IRA, expired 2025) ────────────────────────
// Flat 8.5% MAGI cap, no cliff. Re-enabled if Congress extends.
export const ENHANCED_MAGI_CAP = 0.085;

// ─── Medicare eligibility ────────────────────────────────────────────
export const MEDICARE_ELIGIBILITY_AGE = 65;
