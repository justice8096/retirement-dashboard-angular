/**
 * Social Security claim-age math for the Assumptions screen.
 *
 * Mirror of retirement-api/shared/socialSecurity.js — keep the two in sync
 * (spec: retirement-api docs/superpowers/specs/2026-08-22-spousal-ss-benefits-design.md).
 * Claim ages accept fractional years (ssClaimAge + ssClaimAgeMonths / 12);
 * both helpers round to whole months, matching how SSA reckons claim dates.
 */

/** Own benefit at a claim age: early reduction or delayed credits vs FRA. */
export function calcSSBenefit(pia: number, fra: number, claimAge: number): number {
  if (claimAge === fra) return pia;
  if (claimAge < fra) {
    const monthsEarly = Math.round((fra - claimAge) * 12);
    // First 36 months: 5/9 of 1% per month. Beyond 36: 5/12 of 1% per month
    const reduction = monthsEarly <= 36
      ? monthsEarly * (5 / 900)
      : 36 * (5 / 900) + (monthsEarly - 36) * (5 / 1200);
    return Math.round(pia * (1 - reduction));
  }
  // Delayed credits: 8% per year beyond FRA
  return Math.round(pia * (1 + (claimAge - fra) * 0.08));
}

/**
 * Spousal top-up: excess of 50% of the other spouse's PIA over the
 * claimant's own PIA, reduced when claimed before the claimant's FRA
 * (25/36 of 1% per month for 36 months, then 5/12 of 1% per month).
 */
export function calcSpousalBenefit(
  spousePIA: number,
  ownPIA: number,
  ownFRA: number,
  claimAge: number,
): number {
  const maxSpousal = spousePIA * 0.5;
  if (maxSpousal <= ownPIA) return 0; // Own benefit is higher
  let spousalOnly = maxSpousal - ownPIA;
  if (claimAge < ownFRA) {
    const monthsEarly = Math.round((ownFRA - claimAge) * 12);
    const reduction = monthsEarly <= 36
      ? monthsEarly * (25 / 3600)
      : 36 * (25 / 3600) + (monthsEarly - 36) * (5 / 1200);
    spousalOnly *= 1 - reduction;
  }
  return Math.max(0, Math.round(spousalOnly));
}

/** The SS fields spousalTopUps needs from a household member. */
export interface SsMemberLike {
  role: string;
  ssPia: number | null;
  ssFra: number | null;
  ssClaimAge: number | null;
  ssClaimAgeMonths?: number | null;
}

/**
 * Monthly spousal top-up per member, index-aligned with the input array.
 * Only a primary/spouse pair that both have a PIA qualifies; dependents and
 * everyone else get 0. A missing claim age defaults to FRA (67 fallback).
 */
/**
 * Household annual Social Security income: each qualifying primary/spouse
 * member's own claim-age-adjusted benefit plus their spousal top-up, × 12.
 * Mirrors GET /api/me/household/ss-benefits `household.totalAnnual`.
 */
export function householdSsAnnual(members: readonly SsMemberLike[]): number {
  const topUps = spousalTopUps(members);
  let monthly = 0;
  members.forEach((m, i) => {
    if ((m.role === 'primary' || m.role === 'spouse') && (m.ssPia ?? 0) > 0) {
      const fra = m.ssFra ?? 67;
      const claimAge = (m.ssClaimAge ?? fra) + (m.ssClaimAgeMonths ?? 0) / 12;
      monthly += calcSSBenefit(m.ssPia!, fra, claimAge) + topUps[i];
    }
  });
  return monthly * 12;
}

export function spousalTopUps(members: readonly SsMemberLike[]): number[] {
  const qualifying = members
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => (m.role === 'primary' || m.role === 'spouse') && (m.ssPia ?? 0) > 0);

  const topUps = members.map(() => 0);
  if (qualifying.length !== 2) return topUps;

  const [a, b] = qualifying;
  for (const [own, other] of [[a, b], [b, a]] as const) {
    const fra = own.m.ssFra ?? 67;
    const claimAge = (own.m.ssClaimAge ?? fra) + (own.m.ssClaimAgeMonths ?? 0) / 12;
    topUps[own.i] = calcSpousalBenefit(other.m.ssPia!, own.m.ssPia!, fra, claimAge);
  }
  return topUps;
}
