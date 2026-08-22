import { describe, it, expect } from 'vitest';
import { taxableSocialSecurity } from './taxable-social-security';

/**
 * IRC §86 provisional-income phase-in. provisional = other taxable income
 * + 0.5 × SS; thresholds joint $32k/$44k, single $25k/$34k. Extracted from
 * HealthcareService.computeMagi so TaxService can reuse it.
 */
describe('taxableSocialSecurity', () => {
  it('is 0 below the base threshold', () => {
    // provisional = 10k + 15k = 25k ≤ 32k (joint)
    expect(taxableSocialSecurity(30_000, 10_000, 'joint')).toBe(0);
  });

  it('phases in at 50% between the thresholds', () => {
    // provisional = 25k + 15k = 40k; tier1 = min(15k, 0.5×(40k−32k)) = 4k
    expect(taxableSocialSecurity(30_000, 25_000, 'joint')).toBe(4_000);
  });

  it('adds the 85% tier above the second threshold', () => {
    // other=42k, SS=30k → provisional 57k; tier1 = min(15k, 12.5k) = 12.5k
    // tier2 = min(0.85×30k − 12.5k = 13k, 0.85×(57k−44k) = 11.05k) = 11.05k
    expect(taxableSocialSecurity(30_000, 42_000, 'joint')).toBeCloseTo(23_550, 5);
  });

  it('caps at 85% of the benefit for high income', () => {
    expect(taxableSocialSecurity(30_000, 500_000, 'joint')).toBeCloseTo(25_500, 5);
  });

  it('uses the single-filer thresholds', () => {
    // provisional = 20k + 10k = 30k; single tiers 25k/34k → tier1 = min(10k, 2.5k)
    expect(taxableSocialSecurity(20_000, 20_000, 'single')).toBe(2_500);
  });

  it('is 0 when there is no SS benefit', () => {
    expect(taxableSocialSecurity(0, 100_000, 'joint')).toBe(0);
  });
});
