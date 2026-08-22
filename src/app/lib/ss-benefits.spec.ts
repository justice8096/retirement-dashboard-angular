import { describe, it, expect } from 'vitest';
import { spousalTopUps, householdSsAnnual } from './ss-benefits';

/**
 * Household SS aggregation tests. Own-benefit math is covered by
 * social-security.spec.ts; spousal math is canonical in
 * @retirement/shared (mirrored coverage lives in
 * retirement-api/shared/__tests__/socialSecurity.test.js). These tests pin
 * the pairing/aggregation semantics and the spec's worked example
 * (retirement-api docs/superpowers/specs/2026-08-22-spousal-ss-benefits-design.md).
 */

describe('spousalTopUps', () => {
  const pat = { role: 'primary', ssPia: 2400, ssFra: 67, ssClaimAge: 67, ssClaimAgeMonths: 0 };
  const sam = { role: 'spouse', ssPia: 760, ssFra: 67, ssClaimAge: 67, ssClaimAgeMonths: 0 };

  it('gives the lower earner the excess and the higher earner zero', () => {
    // Half of Pat's 2400 = 1200; Sam's own 760 → top-up 440 (spec worked example)
    expect(spousalTopUps([pat, sam])).toEqual([0, 440]);
  });

  it('is zero for both when the lower earner exceeds half the higher PIA', () => {
    expect(spousalTopUps([pat, { ...sam, ssPia: 1300 }])).toEqual([0, 0]);
  });

  it('reduces the top-up for an early-claiming lower earner (two-tier)', () => {
    // Sam claims at 62 (60 months early): 440 * (1 - 0.35) = 286
    expect(spousalTopUps([pat, { ...sam, ssClaimAge: 62 }])).toEqual([0, 286]);
  });

  it('honors month-precision claim ages', () => {
    // 66y8m = 4 months early: 440 * (1 - 4 * 25/3600) = 427.78 → 428
    expect(spousalTopUps([pat, { ...sam, ssClaimAge: 66, ssClaimAgeMonths: 8 }])).toEqual([0, 428]);
  });

  it('returns zeros when only one member has SS data', () => {
    expect(spousalTopUps([pat, { ...sam, ssPia: null }])).toEqual([0, 0]);
  });

  it('ignores dependents and preserves member order', () => {
    const kid = { role: 'dependent', ssPia: null, ssFra: null, ssClaimAge: null, ssClaimAgeMonths: 0 };
    expect(spousalTopUps([kid, pat, sam])).toEqual([0, 0, 440]);
  });

  it('defaults a missing claim age to FRA', () => {
    expect(spousalTopUps([pat, { ...sam, ssClaimAge: null }])).toEqual([0, 440]);
  });

  it('coerces string PIAs (encrypted-field round trips)', () => {
    expect(spousalTopUps([{ ...pat, ssPia: '2400' }, { ...sam, ssPia: '760' }])).toEqual([0, 440]);
  });
});

describe('householdSsAnnual', () => {
  const pat = { role: 'primary', ssPia: 2400, ssFra: 67, ssClaimAge: 67, ssClaimAgeMonths: 0 };
  const sam = { role: 'spouse', ssPia: 760, ssFra: 67, ssClaimAge: 67, ssClaimAgeMonths: 0 };

  it('annualizes own benefits plus top-ups (spec worked example)', () => {
    // Pat 2400 + Sam (760 + 440) = 3600/mo → 43200/yr
    expect(householdSsAnnual([pat, sam])).toBe(43_200);
  });

  it('counts a single qualifying member without a top-up', () => {
    expect(householdSsAnnual([pat, { ...sam, ssPia: null }])).toBe(2400 * 12);
  });

  it('returns 0 when nobody has SS data', () => {
    expect(householdSsAnnual([{ ...pat, ssPia: null }, { ...sam, ssPia: null }])).toBe(0);
  });

  it('defaults a missing FRA to 67', () => {
    expect(householdSsAnnual([{ ...pat, ssFra: null }, sam])).toBe(43_200);
  });

  it('applies claim-age adjustments to both parts', () => {
    // Sam at 62: own 760*0.70=532, top-up 440*0.65=286 → (2400+818)*12
    expect(householdSsAnnual([pat, { ...sam, ssClaimAge: 62 }])).toBe((2400 + 532 + 286) * 12);
  });
});
