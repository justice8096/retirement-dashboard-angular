import type { Source } from '@models/api.model';

/**
 * Structured citations for the 2026 US federal tax constants used on
 * the taxes screen and in Monte Carlo.
 *
 * NOTE — mirrors the equivalent exports in `retirement-api/shared/taxes.js`
 * (`FED_BRACKETS_2026_SOURCES`, `FED_STD_DEDUCTION_2026_SOURCES`,
 * `OBBBA_SENIOR_SOURCES`). The dashboard and API don't share a workspace
 * package today, so these are copied. Keep both sides in sync when
 * updating URLs or adding years.
 */

export const FED_BRACKETS_2026_SOURCES: Source[] = [
  {
    title: 'IRS Rev. Proc. 2025-32 (2026 inflation adjustments)',
    url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
    accessed: '2026-04-20',
  },
  {
    title: 'IRC § 1 — Tax imposed (statutory bracket structure)',
    url: 'https://www.law.cornell.edu/uscode/text/26/1',
    accessed: '2026-04-20',
  },
];

export const FED_STD_DEDUCTION_2026_SOURCES: Source[] = [
  {
    title: 'IRS Rev. Proc. 2025-32 § 3.17 (2026 standard deduction)',
    url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
    accessed: '2026-04-20',
  },
];

export const OBBBA_SENIOR_SOURCES: Source[] = [
  {
    title: 'One Big Beautiful Bill Act § 13301 — Senior bonus deduction',
    url: 'https://www.congress.gov/bill/119th-congress/house-bill/1/text',
    accessed: '2026-04-20',
  },
  {
    title: 'IRS guidance: Additional deduction for taxpayers aged 65+',
    url: 'https://www.irs.gov/newsroom/additional-deduction-for-taxpayers-aged-65-and-older',
    accessed: '2026-04-20',
  },
];

/** Social Security Trust Fund depletion projection. */
export const SS_CUT_SOURCES: Source[] = [
  {
    title: 'SSA 2025 Trustees Report — OASI fund projection',
    url: 'https://www.ssa.gov/OACT/TR/2025/',
    accessed: '2026-04-20',
  },
];

/** SECURE 2.0 RMD start ages. */
export const RMD_AGE_SOURCES: Source[] = [
  {
    title: 'SECURE 2.0 Act § 107 — Raised RMD age (73 / 75)',
    url: 'https://www.congress.gov/bill/117th-congress/house-bill/2617/text',
    accessed: '2026-04-20',
  },
  {
    title: 'IRS Notice 2023-23 — RMD guidance under SECURE 2.0',
    url: 'https://www.irs.gov/pub/irs-drop/n-23-23.pdf',
    accessed: '2026-04-20',
  },
];
