import { describe, it, expect } from 'vitest';
import { benefitAtClaimMonths, estimateBenefitAtClaim, formatClaimAge } from './social-security';

describe('benefitAtClaimMonths', () => {
  const PIA = 2000;
  const FRA = 67;

  it('pays exactly PIA at FRA', () => {
    expect(benefitAtClaimMonths(PIA, FRA, 67 * 12)).toBe(2000);
  });

  it('matches the legacy whole-year factors at integer years', () => {
    // 1 year early: 5/9% × 12 = 6.667% → 2000 × 0.93333 = 1867
    expect(benefitAtClaimMonths(PIA, FRA, 66 * 12)).toBe(1867);
    // 3 years early: 20% reduction
    expect(benefitAtClaimMonths(PIA, FRA, 64 * 12)).toBe(1600);
    // 5 years early (62): 20% + 2yr × 5% = 30%
    expect(benefitAtClaimMonths(PIA, FRA, 62 * 12)).toBe(1400);
    // 3 years delayed (70): +24%
    expect(benefitAtClaimMonths(PIA, FRA, 70 * 12)).toBe(2480);
  });

  it('is month-precise between whole years', () => {
    // 4 months early: 4 × 5/9% = 2.222% → 2000 × 0.977778 = 1956
    expect(benefitAtClaimMonths(PIA, FRA, 66 * 12 + 8)).toBe(1956);
    // 40 months early: 36 × 5/9% + 4 × 5/12% = 20% + 1.667% → 1567
    expect(benefitAtClaimMonths(PIA, FRA, 63 * 12 + 8)).toBe(1567);
    // 7 months delayed: 7 × 2/3% = 4.667% → 2093
    expect(benefitAtClaimMonths(PIA, FRA, 67 * 12 + 7)).toBe(2093);
  });

  it('stops delayed credits at age 70', () => {
    const at70 = benefitAtClaimMonths(PIA, FRA, 70 * 12);
    expect(benefitAtClaimMonths(PIA, FRA, 72 * 12)).toBe(at70);
    expect(benefitAtClaimMonths(PIA, FRA, 70 * 12 + 6)).toBe(at70);
  });
});

describe('estimateBenefitAtClaim', () => {
  it('combines years + months and tolerates string PIA (encrypted round-trip)', () => {
    expect(estimateBenefitAtClaim({ ssPia: '2000', ssFra: 67, ssClaimAge: 66, ssClaimAgeMonths: 8 })).toBe(1956);
    expect(estimateBenefitAtClaim({ ssPia: 2000, ssFra: 67, ssClaimAge: 67 })).toBe(2000);
  });

  it('returns 0 when PIA, FRA, or claim age is missing', () => {
    expect(estimateBenefitAtClaim({ ssPia: null, ssFra: 67, ssClaimAge: 67 })).toBe(0);
    expect(estimateBenefitAtClaim({ ssPia: 2000, ssFra: null, ssClaimAge: 67 })).toBe(0);
    expect(estimateBenefitAtClaim({ ssPia: 2000, ssFra: 67, ssClaimAge: null })).toBe(0);
  });
});

describe('formatClaimAge', () => {
  it('renders plain-language labels', () => {
    expect(formatClaimAge(67)).toBe('67');
    expect(formatClaimAge(67, 0)).toBe('67');
    expect(formatClaimAge(67, 4)).toBe('67 yr 4 mo');
    expect(formatClaimAge(null)).toBe('—');
  });
});
