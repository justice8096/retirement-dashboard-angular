/**
 * 2026 Medicare IRMAA (Income-Related Monthly Adjustment Amount) brackets.
 *
 * Source: CMS finalized 2026 Medicare Part A & B premiums/deductibles and
 * IRMAA amounts, released November 14, 2025.
 *   https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles
 * 2026 standard Part B premium $202.90 (up from $185.00 in 2025). Tier-1
 * IRMAA thresholds: $109,000 single / $218,000 MFJ (up from $106k/$212k).
 *
 * Single-filer thresholds are roughly half of MFJ — so a surviving spouse with
 * unchanged MAGI can jump into a higher surcharge tier just by losing joint
 * filing status. That's why the Monte Carlo's survivor phase needs to
 * recompute Medicare premium using the single brackets, not the MFJ ones.
 *
 * Income lookback is 2 years (2026 premiums set by 2024 income).
 */
export interface IRMAABracket {
  min: number;
  max: number;
  partBSurcharge: number; // monthly $ added to base Part B premium
  partDSurcharge: number; // monthly $ added to Part D plan premium
}

export const IRMAA_BRACKETS_2026: Record<'single' | 'married', IRMAABracket[]> = {
  single: [
    { min: 0,       max: 109000,   partBSurcharge: 0,     partDSurcharge: 0 },
    { min: 109000,  max: 137000,   partBSurcharge: 81.2,  partDSurcharge: 14.5 },
    { min: 137000,  max: 171000,   partBSurcharge: 202.9, partDSurcharge: 37.5 },
    { min: 171000,  max: 205000,   partBSurcharge: 324.6, partDSurcharge: 60.4 },
    { min: 205000,  max: 500000,   partBSurcharge: 446.3, partDSurcharge: 83.3 },
    { min: 500000,  max: Infinity, partBSurcharge: 487.0, partDSurcharge: 91.0 },
  ],
  married: [
    { min: 0,       max: 218000,   partBSurcharge: 0,     partDSurcharge: 0 },
    { min: 218000,  max: 274000,   partBSurcharge: 81.2,  partDSurcharge: 14.5 },
    { min: 274000,  max: 342000,   partBSurcharge: 202.9, partDSurcharge: 37.5 },
    { min: 342000,  max: 410000,   partBSurcharge: 324.6, partDSurcharge: 60.4 },
    { min: 410000,  max: 750000,   partBSurcharge: 446.3, partDSurcharge: 83.3 },
    { min: 750000,  max: Infinity, partBSurcharge: 487.0, partDSurcharge: 91.0 },
  ],
};

export const BASE_PART_B_PREMIUM_2026 = 202.90; // monthly USD (2026 standard)

/** Look up the IRMAA bracket for a given filing status + MAGI. */
export function irmaaBracketFor(
  filingStatus: 'single' | 'married',
  magi: number,
): IRMAABracket {
  const table = IRMAA_BRACKETS_2026[filingStatus];
  for (const b of table) {
    if (magi >= b.min && magi < b.max) return b;
  }
  return table[table.length - 1];
}

/**
 * Monthly Medicare cost for one adult at the given filing status + MAGI.
 * Includes base Part B premium + IRMAA surcharges on both Part B and Part D.
 * Returns 0 if not Medicare-eligible — caller's responsibility to check age.
 */
export function monthlyMedicareFor(
  filingStatus: 'single' | 'married',
  magi: number,
): number {
  const b = irmaaBracketFor(filingStatus, magi);
  return BASE_PART_B_PREMIUM_2026 + b.partBSurcharge + b.partDSurcharge;
}
