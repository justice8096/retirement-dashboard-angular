/**
 * Median annual long-term-care cost estimates by country (Todo #21).
 *
 * All values are USD per year, representing a rough median for
 * institutional / nursing-home care. These are estimates only —
 * actual costs vary by region within country, by tier of care
 * (assisted living vs skilled nursing), and by whether the user
 * qualifies for public-program subsidies (e.g., France APA, Spain
 * Sistema para la Autonomía y Atención a la Dependencia).
 *
 * Sources (best-effort 2024 data points):
 *   - US: Genworth Cost of Care Survey 2024 (private nursing-home room
 *     national median).
 *   - EU: OECD Health at a Glance 2023 + Eurostat long-term-care
 *     expenditure tables. Values approximate private out-of-pocket
 *     after typical public subsidies.
 *   - LATAM (Mexico, Costa Rica, Panama, Colombia, Ecuador, Uruguay):
 *     country-specific reports + International Living retirement
 *     surveys; very wide variance (private rooms in capital cities
 *     can run 2-3× the country median).
 *   - Other: country-specific gov / OECD reports.
 *
 * Caveats:
 *   - The dashboard surfaces these as "starting-point hints" only.
 *     Users are expected to research their specific situation —
 *     these numbers can be off by 50% in either direction depending
 *     on city tier and care level.
 *   - Public LTC programs that cap out-of-pocket (Germany Pflege-
 *     versicherung, Japan Kaigo Hoken, France APA, Australia
 *     Aged Care subsidies, etc.) are reflected in conservative
 *     post-subsidy estimates where applicable, but not all the
 *     countries in this list have such programs.
 *
 * The covered countries match the 16 in the location dataset
 * (api/data/locations/*\/location.json). Countries not in the map
 * fall back to LTC_COST_FOREIGN_DEFAULT.
 */

import type { Source } from '@models/api.model';

/** USD per year — median private nursing-home / institutional LTC cost. */
export const LTC_COST_BY_COUNTRY: Readonly<Record<string, number>> = Object.freeze({
  'Colombia': 15_000,
  'Costa Rica': 20_000,
  'Croatia': 18_000,
  'Cyprus': 30_000,
  'Ecuador': 12_000,
  'France': 40_000,         // post-APA subsidy estimate
  'Greece': 25_000,
  'Ireland': 50_000,
  'Italy': 30_000,
  'Malta': 25_000,
  'Mexico': 20_000,
  'Panama': 20_000,
  'Portugal': 25_000,
  'Spain': 30_000,
  'United States': 108_000, // Genworth 2024 median (private room)
  'Uruguay': 25_000,
});

/** Fallback for any country not in the map. Conservative mid-range. */
export const LTC_COST_FOREIGN_DEFAULT = 25_000;

/** Source citations for the country LTC cost table. */
export const LTC_COST_SOURCES: Source[] = [
  {
    title: 'Genworth Cost of Care Survey 2024 (US median nursing-home cost)',
    url: 'https://www.genworth.com/aging-and-you/finances/cost-of-care.html',
    accessed: '2026-05-03',
  },
  {
    title: 'OECD Health at a Glance 2023 — Long-term care expenditure by country',
    url: 'https://www.oecd.org/health/health-at-a-glance/',
    accessed: '2026-05-03',
  },
  {
    title: 'Eurostat — Long-term care expenditure (HEA1)',
    url: 'https://ec.europa.eu/eurostat/web/health/data/database',
    accessed: '2026-05-03',
  },
];

/**
 * Returns the seeded median LTC cost (USD/yr) for a country, with a
 * conservative foreign-default fallback for countries not in the
 * lookup. Country name must match the dataset's `country` field
 * exactly (case-sensitive — same convention the location seeds use).
 */
export function defaultLtcCostForCountry(country: string | null | undefined): number {
  if (!country) return LTC_COST_FOREIGN_DEFAULT;
  // Own-property lookup defends against prototype-key access (e.g.
  // 'toString'). Mirrors the LTCG_BRACKETS guard in tax-sources.ts.
  if (Object.prototype.hasOwnProperty.call(LTC_COST_BY_COUNTRY, country)) {
    return LTC_COST_BY_COUNTRY[country];
  }
  return LTC_COST_FOREIGN_DEFAULT;
}
