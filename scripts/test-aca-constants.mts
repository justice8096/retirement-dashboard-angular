#!/usr/bin/env tsx
/**
 * Pure-function tests for `src/app/lib/aca-constants.ts`. Covers:
 *   - fpl2026: HHS 2026 Federal Poverty Level computation
 *   - applicablePctCliff2026: Rev Proc 2025-25 ACA applicable-pct ladder
 *
 * Both helpers are critical to ACA subsidy math; silent regressions here
 * would produce wrong premium-cap values for every household.
 *
 * Mirrors the tsx + node:test pattern from test-text-escape.mts. Run via
 * `npm run test:pure`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import acaConstants from '../src/app/lib/aca-constants';

const {
  fpl2026,
  applicablePctCliff2026,
  FPL_2026_BASE,
  FPL_2026_PER_ADDL,
} = acaConstants as unknown as {
  fpl2026: (size: number) => number;
  applicablePctCliff2026: (fplPct: number) => number | null;
  FPL_2026_BASE: number;
  FPL_2026_PER_ADDL: number;
};

// ─── fpl2026 — HHS 2026 Federal Poverty Level (continental US) ──────────

test('fpl2026: 1-person household = $15,960 base', () => {
  assert.equal(fpl2026(1), 15960);
});

test('fpl2026: 2-person household = $21,640 (base + 1 × $5,680)', () => {
  // Pinned against HHS ASPE 2026 table (Federal Register 2026-00755).
  assert.equal(fpl2026(2), 21640);
});

test('fpl2026: 4-person household = $33,000 (base + 3 × $5,680)', () => {
  // From the published HHS table.
  assert.equal(fpl2026(4), 33000);
});

test('fpl2026: 8-person household = $55,720 matches HHS published table', () => {
  assert.equal(fpl2026(8), 55720);
});

test('fpl2026: size <= 0 returns base (defensive against bad input)', () => {
  // Math.max(0, size - 1) clamps the per-addl multiplier to 0.
  assert.equal(fpl2026(0), FPL_2026_BASE);
  assert.equal(fpl2026(-5), FPL_2026_BASE);
});

test('fpl2026: per-additional-person increment = $5,680 (Codex P2 fix #91)', () => {
  // Regression test for the 2026-04-30 fix: previously $5,600 (inferred
  // wrong from a misread 2-person value); now $5,680 per HHS ASPE.
  assert.equal(FPL_2026_PER_ADDL, 5680);
  assert.equal(fpl2026(3) - fpl2026(2), 5680);
});

// ─── applicablePctCliff2026 — Rev Proc 2025-25 ACA applicable-% ladder ──

test('applicablePctCliff2026: below 100% FPL returns null (Medicaid territory)', () => {
  assert.equal(applicablePctCliff2026(50), null);
  assert.equal(applicablePctCliff2026(99), null);
});

test('applicablePctCliff2026: 100% to <133% returns flat 2.10% (post-ARPA cliff regime)', () => {
  // Bracket boundaries are exclusive at the upper edge — fplPct=133 falls
  // into the *next* bracket (133-150 interp), not this one.
  assert.ok(applicablePctCliff2026(100)! < 0.022);
  assert.ok(applicablePctCliff2026(100)! > 0.020);
  assert.ok(applicablePctCliff2026(132.9)! < 0.022);
});

test('applicablePctCliff2026: just below 400% returns flat 9.96% (top bracket)', () => {
  // 300-400 bracket is flat at 9.96%. fplPct=400 itself falls past all
  // brackets (cliff). Probe just below.
  const pct = applicablePctCliff2026(399);
  assert.ok(pct !== null);
  assert.ok(pct! >= 0.099 && pct! <= 0.10);
});

test('applicablePctCliff2026: at or above 400% FPL returns null (the cliff)', () => {
  // 400% FPL is the hard cliff in the cliff-regime — no subsidy at or above.
  // The loop's `fplPct < b.fplPctUpper` makes 400 itself fall through.
  assert.equal(applicablePctCliff2026(400), null);
  assert.equal(applicablePctCliff2026(401), null);
  assert.equal(applicablePctCliff2026(500), null);
});

test('applicablePctCliff2026: monotonic increasing across brackets', () => {
  const samples = [100, 133, 150, 175, 200, 225, 250, 275, 300, 350, 399];
  const values = samples
    .map((p) => applicablePctCliff2026(p))
    .filter((v): v is number => v !== null);
  for (let i = 1; i < values.length; i++) {
    assert.ok(
      values[i] >= values[i - 1] - 1e-9,
      `Non-monotonic at sample[${i}]: ${values[i - 1]} → ${values[i]}`,
    );
  }
});
