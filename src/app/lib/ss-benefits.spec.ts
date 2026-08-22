import { describe, it, expect } from 'vitest';
import { calcSSBenefit, calcSpousalBenefit, spousalTopUps } from './ss-benefits';

/**
 * Mirror of retirement-api/shared/__tests__/socialSecurity.test.js so the
 * dashboard's display math stays in sync with the canonical helpers
 * (spec: retirement-api docs/superpowers/specs/2026-08-22-spousal-ss-benefits-design.md).
 */

describe('calcSSBenefit', () => {
  it('returns PIA when claiming at FRA', () => {
    expect(calcSSBenefit(2400, 67, 67)).toBe(2400);
  });

  it('reduces for early claiming (62 with FRA 67 = 70%)', () => {
    expect(calcSSBenefit(2400, 67, 62)).toBe(Math.round(2400 * 0.7));
  });

  it('adds delayed credits (70 with FRA 67 = 124%)', () => {
    expect(calcSSBenefit(2400, 67, 70)).toBe(Math.round(2400 * 1.24));
  });

  it('supports month-precision claim ages (66y8m = 4 months early)', () => {
    expect(calcSSBenefit(2000, 67, 66 + 8 / 12)).toBe(1956);
  });
});

describe('calcSpousalBenefit', () => {
  it('returns spousal excess when half of spouse PIA > own PIA at FRA', () => {
    expect(calcSpousalBenefit(2400, 800, 67, 67)).toBe(400);
  });

  it('returns 0 when own PIA >= 50% of spouse PIA', () => {
    expect(calcSpousalBenefit(2400, 1400, 67, 67)).toBe(0);
  });

  it('applies the two-tier reduction at 60 months early (35%)', () => {
    const excess = 2400 * 0.5 - 800; // 400
    expect(calcSpousalBenefit(2400, 800, 67, 62)).toBe(Math.round(excess * 0.65));
  });

  it('uses the 5/12%-per-month tier past 36 months early', () => {
    // 42 months early: 36 * (25/3600) + 6 * (5/1200) = 0.275
    const excess = 2400 * 0.5 - 800;
    expect(calcSpousalBenefit(2400, 800, 67, 63.5)).toBe(Math.round(excess * 0.725));
  });
});

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

  it('reduces the top-up for an early-claiming lower earner', () => {
    // Sam claims at 62 (60 months early): 440 * 0.65 = 286
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
});
