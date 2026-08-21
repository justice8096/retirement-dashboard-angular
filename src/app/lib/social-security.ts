/**
 * Social Security claim-age benefit math — month-precise, per SSA rules.
 *
 * Single source of truth for the "benefit at chosen claim age" estimate
 * that was previously duplicated (at whole-year granularity) across the
 * Monte Carlo, SS, Sankey, and Report screens.
 *
 * SSA factors (https://www.ssa.gov/oact/quickcalc/early_late.html):
 *   - Early claiming: benefit reduced 5/9 of 1% per month for the first
 *     36 months before FRA, then 5/12 of 1% per month beyond that.
 *   - Delayed claiming: benefit increased 2/3 of 1% per month (8%/yr)
 *     after FRA; delayed credits stop accruing at age 70.
 *
 * At whole-year claim ages ≤ 70 this matches the legacy per-year formula
 * (6.67%/yr first 3 years, 5%/yr beyond; 8%/yr delayed) exactly.
 */

/** Minimal member shape the estimator needs (subset of HouseholdMember). */
export interface SsClaimFields {
  ssPia?: number | string | null;
  ssFra?: number | null;
  ssClaimAge?: number | null;
  ssClaimAgeMonths?: number | null;
}

const DELAYED_CREDIT_STOP_AGE_MONTHS = 70 * 12;

/**
 * Monthly benefit for a PIA claimed at `claimMonths` (age in total months)
 * against an FRA of `fraYears`. Rounded to the nearest dollar.
 */
export function benefitAtClaimMonths(pia: number, fraYears: number, claimMonths: number): number {
  const fraMonths = fraYears * 12;
  const diff = claimMonths - fraMonths;
  if (diff === 0) return Math.round(pia);
  if (diff > 0) {
    // Delayed retirement credits: 2/3 of 1% per month, none past age 70.
    const creditMonths = Math.min(diff, Math.max(0, DELAYED_CREDIT_STOP_AGE_MONTHS - fraMonths));
    return Math.round(pia * (1 + creditMonths * (2 / 3) / 100));
  }
  const earlyMonths = -diff;
  const first36 = Math.min(earlyMonths, 36);
  const beyond36 = earlyMonths - first36;
  const reduction = first36 * (5 / 9) / 100 + beyond36 * (5 / 12) / 100;
  return Math.round(pia * (1 - reduction));
}

/**
 * Monthly SS benefit for a household member at their chosen claim age
 * (years + months). 0 when PIA / FRA / claim age are not all set.
 */
export function estimateBenefitAtClaim(m: SsClaimFields): number {
  const pia = Number(m.ssPia) || 0;
  if (!pia || !m.ssFra || !m.ssClaimAge) return 0;
  const claimMonths = m.ssClaimAge * 12 + (m.ssClaimAgeMonths ?? 0);
  return benefitAtClaimMonths(pia, m.ssFra, claimMonths);
}

/** Plain-language claim-age label: "67" or "67 yr 4 mo". */
export function formatClaimAge(years: number | null | undefined, months?: number | null): string {
  if (years == null) return '—';
  const m = months ?? 0;
  return m > 0 ? `${years} yr ${m} mo` : `${years}`;
}
