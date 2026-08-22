/**
 * Federally taxable portion of Social Security benefits — the IRC §86
 * provisional-income phase-in:
 *
 *   provisional = other taxable income (incl. tax-exempt interest, not
 *                 modeled) + 0.5 × gross SS benefit
 *   thresholds:  joint $32k / $44k · single $25k / $34k
 *
 *   below the base threshold: none of SS is taxable
 *   between thresholds:       up to 50% phases in
 *   above the second:         up to 85%, capped at 0.85 × SS
 *
 * Single source for this math — used by HealthcareService.computeMagi (AGI /
 * ACA MAGI) and TaxService (SS-aware bracket income tax).
 */
export type SsFilingStatus = 'single' | 'joint';

export function taxableSocialSecurity(
  ssAnnual: number,
  otherTaxableIncome: number,
  filingStatus: SsFilingStatus,
): number {
  if (ssAnnual <= 0) return 0;
  const thresholds = filingStatus === 'joint' ? [32_000, 44_000] : [25_000, 34_000];
  const provisional = otherTaxableIncome + 0.5 * ssAnnual;

  let taxableSS = 0;
  if (provisional > thresholds[0]) {
    const tier1 = Math.min(0.5 * ssAnnual, 0.5 * (provisional - thresholds[0]));
    taxableSS = tier1;
    if (provisional > thresholds[1]) {
      const tier2Cap = 0.85 * ssAnnual - tier1;
      const tier2Provisional = 0.85 * (provisional - thresholds[1]);
      taxableSS = tier1 + Math.max(0, Math.min(tier2Cap, tier2Provisional));
    }
    taxableSS = Math.min(taxableSS, 0.85 * ssAnnual);
  }
  return taxableSS;
}
