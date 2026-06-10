import { describe, it, expect } from 'vitest';
import { runMonteCarlo, mulberry32, type MonteCarloParams, type LocationMove } from './monte-carlo';

/**
 * Regression test for Codex P2: after a move, the ACA subsidy must reflect the
 * ACTIVE segment's own self-consistent MAGI (`m.magiAnnual`), not the global
 * primary-location `p.magiAnnual`. Two otherwise-identical runs that differ
 * ONLY in the second segment's `magiAnnual` (subsidized vs above-cliff) must
 * produce different outcomes — proving the per-segment MAGI is consumed.
 */
function segment(fromYear: number, magiAnnual: number): LocationMove {
  return {
    fromYear,
    baseCost: 0, // unused when the richer breakdown is present
    isForeign: false,
    isUS: true,
    nonHealthcareBase: 3_000,
    monthlyIncomeTax: 0,
    medicareMonthly: 600,
    acaUnsubsidizedMonthly: 2_400, // 2 adults; pricey if unsubsidized
    acaSubsidyCapPct: 0.085,
    magiAnnual,
  };
}

function baseParams(secondSegmentMagi: number): MonteCarloParams {
  return {
    portfolio: 1_500_000,
    monthlyIncome: 0,
    baseCost: 3_000,
    isForeign: false,
    fxDrift: 0,
    runs: 400,
    years: 30,
    meanReturn: 0.05,
    volReturn: 0.10,
    meanInflation: 0.025,
    volInflation: 0.01,
    currVol: 0,
    incGrowth: 0,
    returnMode: 'normal',
    adultBirthYears: [1968, 1968], // ~58 in 2026 → pre-Medicare (ACA applies)
    simStartYear: 2026,
    subsidyRegime: 'cliff',
    magiAnnual: 50_000, // global fallback
    moveSchedule: [
      segment(0, 50_000), // identical across both runs
      segment(5, secondSegmentMagi),
    ],
    seededRandom: mulberry32(99),
  };
}

describe('per-segment ACA MAGI after a move', () => {
  it('the moved-to segment’s own magiAnnual drives its subsidy', () => {
    // Run A: second segment well below the cliff → subsidized → cheap ACA.
    const subsidized = runMonteCarlo(baseParams(45_000));
    // Run B: second segment far above the ~$86.6k cliff → unsubsidized → full
    // $2,400/mo sticker for years 5+.
    const unsubsidized = runMonteCarlo(baseParams(300_000));

    // Same seed, same everything except segment-2 MAGI. The pricier
    // (unsubsidized) post-move healthcare must leave a lower median balance.
    expect(unsubsidized.median).toBeLessThan(subsidized.median);
  });
});
