import { describe, it, expect } from 'vitest';
import {
  ltcgZeroBracketHeadroom,
  ltcgHarvestingSummary,
  LTCG_BRACKETS_2026,
} from './tax-sources';

/**
 * Pure-helper tests for the LTCG harvesting advisor (#27). Mirror the
 * retirement-api/shared/__tests__/taxes.test.js coverage on the dashboard
 * side so the two stay in sync. Vitest harness from PR #113.
 */

describe('ltcgZeroBracketHeadroom (#27)', () => {
  it('zero ordinary income → full 0% bracket headroom (MFJ)', () => {
    expect(ltcgZeroBracketHeadroom(0, 'mfj')).toBe(98_900);
  });

  it('partial ordinary income subtracts from headroom', () => {
    // $40k ordinary leaves $58,900 of MFJ 0% headroom.
    expect(ltcgZeroBracketHeadroom(40_000, 'mfj')).toBe(58_900);
  });

  it('ordinary income at the 0% top → zero headroom', () => {
    expect(ltcgZeroBracketHeadroom(98_900, 'mfj')).toBe(0);
  });

  it('ordinary income above 0% top → still zero (not negative)', () => {
    expect(ltcgZeroBracketHeadroom(150_000, 'mfj')).toBe(0);
  });

  it('alreadyPreferential stacks below new harvest', () => {
    // $40k ordinary + $20k preferential already → $98,900 - 60,000 = 38,900 left.
    expect(ltcgZeroBracketHeadroom(40_000, 'mfj', 20_000)).toBe(38_900);
  });

  it('single filer uses single bracket', () => {
    // Single 0% top is $49,450.
    expect(ltcgZeroBracketHeadroom(0, 'single')).toBe(49_450);
  });

  it('hoh and mfs filers route to their own brackets', () => {
    expect(ltcgZeroBracketHeadroom(0, 'hoh')).toBe(66_200);
    expect(ltcgZeroBracketHeadroom(0, 'mfs')).toBe(49_450);
  });

  it('negative ordinary income clamped at 0', () => {
    expect(ltcgZeroBracketHeadroom(-5_000, 'mfj')).toBe(98_900);
  });
});

describe('ltcgHarvestingSummary (#27)', () => {
  it('returns full 0% headroom and 0 marginal when stack is below 0% top', () => {
    const s = ltcgHarvestingSummary(0, 'mfj');
    expect(s.zeroBracketHeadroom).toBe(98_900);
    expect(s.fifteenBracketHeadroom).toBe(613_700 - 98_900);
    expect(s.currentMarginalRate).toBe(0);
  });

  it('returns 15% marginal when ordinary alone exceeds 0% top', () => {
    const s = ltcgHarvestingSummary(150_000, 'mfj');
    expect(s.zeroBracketHeadroom).toBe(0);
    expect(s.fifteenBracketHeadroom).toBe(613_700 - 150_000);
    expect(s.currentMarginalRate).toBe(0.15);
  });

  it('returns 20% marginal when stack pushes past 15% top', () => {
    const s = ltcgHarvestingSummary(700_000, 'mfj');
    expect(s.currentMarginalRate).toBe(0.20);
    expect(s.fifteenBracketHeadroom).toBe(0);
  });

  it('alreadyPreferential pushes the stack base up', () => {
    // ordinary $80k + preferential $30k = stack base $110k → above 0% top, in 15% bracket.
    const s = ltcgHarvestingSummary(80_000, 'mfj', 30_000);
    expect(s.zeroBracketHeadroom).toBe(0);
    expect(s.currentMarginalRate).toBe(0.15);
    expect(s.fifteenBracketHeadroom).toBe(613_700 - 110_000);
  });

  it('echoes back filing status and bracket boundaries', () => {
    const s = ltcgHarvestingSummary(0, 'single');
    expect(s.filingStatus).toBe('single');
    expect(s.zeroTop).toBe(LTCG_BRACKETS_2026.single.zeroTop);
    expect(s.fifteenTop).toBe(LTCG_BRACKETS_2026.single.fifteenTop);
  });

  it('headroom values are non-negative even in degenerate inputs', () => {
    const s = ltcgHarvestingSummary(1_000_000, 'mfj');
    expect(s.zeroBracketHeadroom).toBeGreaterThanOrEqual(0);
    expect(s.fifteenBracketHeadroom).toBeGreaterThanOrEqual(0);
  });
});
