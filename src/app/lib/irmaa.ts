/**
 * 2026 Medicare IRMAA (Income-Related Monthly Adjustment Amount) brackets.
 *
 * Source: CMS Medicare Part B premium and IRMAA 2026 release.
 *   https://www.cms.gov/newsroom/press-releases/cms-announces-2026-medicare-part-b-premiums-deductibles-and-irmaa-amounts
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
    { min: 0,       max: 106000,   partBSurcharge: 0,     partDSurcharge: 0 },
    { min: 106000,  max: 133000,   partBSurcharge: 74.0,  partDSurcharge: 13.7 },
    { min: 133000,  max: 167000,   partBSurcharge: 185.0, partDSurcharge: 35.5 },
    { min: 167000,  max: 200000,   partBSurcharge: 295.9, partDSurcharge: 57.3 },
    { min: 200000,  max: 500000,   partBSurcharge: 406.9, partDSurcharge: 79.0 },
    { min: 500000,  max: Infinity, partBSurcharge: 444.0, partDSurcharge: 85.8 },
  ],
  married: [
    { min: 0,       max: 212000,   partBSurcharge: 0,     partDSurcharge: 0 },
    { min: 212000,  max: 266000,   partBSurcharge: 74.0,  partDSurcharge: 13.7 },
    { min: 266000,  max: 334000,   partBSurcharge: 185.0, partDSurcharge: 35.5 },
    { min: 334000,  max: 400000,   partBSurcharge: 295.9, partDSurcharge: 57.3 },
    { min: 400000,  max: 750000,   partBSurcharge: 406.9, partDSurcharge: 79.0 },
    { min: 750000,  max: Infinity, partBSurcharge: 444.0, partDSurcharge: 85.8 },
  ],
};

export const BASE_PART_B_PREMIUM_2026 = 185; // monthly USD

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
