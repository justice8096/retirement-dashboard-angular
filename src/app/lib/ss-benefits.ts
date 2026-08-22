/**
 * Household-level Social Security aggregation for the Assumptions screen.
 *
 * Own-benefit math comes from `./social-security` (month-precise, age-70
 * credit cap); the spousal top-up comes from the canonical
 * `@retirement/shared` package so the numbers always match the server's
 * GET /api/me/household/ss-benefits (spec: retirement-api
 * docs/superpowers/specs/2026-08-22-spousal-ss-benefits-design.md).
 */
import { calcSpousalBenefit } from '@retirement/shared/socialSecurity.js';
import { benefitAtClaimMonths, type SsClaimFields } from './social-security';

/** The fields the household aggregators need from a member. */
export interface SsMemberLike extends SsClaimFields {
  role: string;
}

function pia(m: SsMemberLike): number {
  return Number(m.ssPia) || 0;
}

/** Claim age in fractional years, defaulting a missing claim age to FRA. */
function claimAgeYears(m: SsMemberLike, fra: number): number {
  return (m.ssClaimAge ?? fra) + (m.ssClaimAgeMonths ?? 0) / 12;
}

/**
 * Monthly spousal top-up per member, index-aligned with the input array.
 * Only a primary/spouse pair that both have a PIA qualifies; dependents and
 * everyone else get 0. A missing FRA defaults to 67, a missing claim age to
 * FRA — matching the form's displayed fallbacks.
 */
export function spousalTopUps(members: readonly SsMemberLike[]): number[] {
  const qualifying = members
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => (m.role === 'primary' || m.role === 'spouse') && pia(m) > 0);

  const topUps = members.map(() => 0);
  if (qualifying.length !== 2) return topUps;

  const [a, b] = qualifying;
  for (const [own, other] of [[a, b], [b, a]] as const) {
    const fra = own.m.ssFra ?? 67;
    topUps[own.i] = calcSpousalBenefit(pia(other.m), pia(own.m), fra, claimAgeYears(own.m, fra));
  }
  return topUps;
}

/**
 * Household annual Social Security income: each qualifying primary/spouse
 * member's own claim-age-adjusted benefit plus their spousal top-up, × 12.
 * Mirrors GET /api/me/household/ss-benefits `household.totalAnnual`, but
 * computed from the live (possibly unsaved) member draft.
 */
export function householdSsAnnual(members: readonly SsMemberLike[]): number {
  const topUps = spousalTopUps(members);
  let monthly = 0;
  members.forEach((m, i) => {
    if ((m.role === 'primary' || m.role === 'spouse') && pia(m) > 0) {
      const fra = m.ssFra ?? 67;
      const claimMonths = Math.round(claimAgeYears(m, fra) * 12);
      monthly += benefitAtClaimMonths(pia(m), fra, claimMonths) + topUps[i];
    }
  });
  return monthly * 12;
}
