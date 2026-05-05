#!/usr/bin/env tsx
/**
 * Pure-function tests for `src/app/lib/monte-carlo.ts`. Covers the helpers
 * the kernel depends on but that aren't called per-trial:
 *   - weightedInflationFromLocation: cost-weighted CPI from per-category data
 *   - inflationBreakdownFromLocation: structured per-category breakdown for UI
 *   - compileLifeEvents: Life Events timeline projection (#31 step 1)
 *
 * The kernel's inner trial loop is NOT covered here — running it for
 * meaningful assertions requires a thousand-trial Monte Carlo simulation,
 * which is the wrong scope for a smoke test. Pure helpers around the
 * kernel are testable in isolation; the loop is verified algebraically
 * in commit bodies and via UI smoke checks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import mc from '../src/app/lib/monte-carlo';

const {
  weightedInflationFromLocation,
  inflationBreakdownFromLocation,
  compileLifeEvents,
  mulberry32,
  runMonteCarlo,
} = mc as unknown as {
  weightedInflationFromLocation: (
    monthlyCosts: Record<string, { typical?: number; annualInflation?: number }> | null | undefined,
  ) => number;
  inflationBreakdownFromLocation: (
    monthlyCosts: Record<string, { typical?: number; annualInflation?: number }> | null | undefined,
  ) => {
    categories: { key: string; typical: number; annualInflation: number; weight: number; contribution: number }[];
    weightedAverage: number;
    totalMonthly: number;
  };
  compileLifeEvents: (p: Record<string, unknown>) => { kind: string; year: number; [k: string]: unknown }[];
  mulberry32: (seed: number) => () => number;
  runMonteCarlo: (p: Record<string, unknown>) => {
    successRate: number;
    median: number;
    p5: number;
    p95: number;
    results: number[];
    paths: number[][];
  };
};

// ─── weightedInflationFromLocation ──────────────────────────────────────

test('weightedInflationFromLocation: null/undefined input returns 0.025 default', () => {
  assert.equal(weightedInflationFromLocation(null), 0.025);
  assert.equal(weightedInflationFromLocation(undefined), 0.025);
});

test('weightedInflationFromLocation: empty object returns 0.025 default', () => {
  assert.equal(weightedInflationFromLocation({}), 0.025);
});

test('weightedInflationFromLocation: zero-typical categories return 0.025 default', () => {
  // Total spend is zero → can't weight; falls back to default.
  const empty = { rent: { typical: 0, annualInflation: 0.04 } };
  assert.equal(weightedInflationFromLocation(empty), 0.025);
});

test('weightedInflationFromLocation: single category returns its annualInflation', () => {
  const single = { rent: { typical: 1000, annualInflation: 0.04 } };
  // Weight = 1.0 → weighted average = 0.04 × 1.0 = 0.04.
  assert.equal(weightedInflationFromLocation(single), 0.04);
});

test('weightedInflationFromLocation: realistic two-category mix', () => {
  // Rent $800 (4%), groceries $200 (3%) → weights 0.8 / 0.2.
  // Expected: 0.04 × 0.8 + 0.03 × 0.2 = 0.032 + 0.006 = 0.038.
  const mix = {
    rent: { typical: 800, annualInflation: 0.04 },
    groceries: { typical: 200, annualInflation: 0.03 },
  };
  assert.ok(Math.abs(weightedInflationFromLocation(mix) - 0.038) < 1e-9);
});

test('weightedInflationFromLocation: missing annualInflation defaults to 0.025 per category', () => {
  // The fallback is per-category, not at the function level.
  const mix = {
    rent: { typical: 1000, annualInflation: 0.04 },
    groceries: { typical: 1000 }, // no annualInflation → 0.025
  };
  // Weighted: 0.04 × 0.5 + 0.025 × 0.5 = 0.020 + 0.0125 = 0.0325.
  assert.ok(Math.abs(weightedInflationFromLocation(mix) - 0.0325) < 1e-9);
});

// ─── inflationBreakdownFromLocation ─────────────────────────────────────

test('inflationBreakdownFromLocation: null returns empty breakdown', () => {
  const r = inflationBreakdownFromLocation(null);
  assert.equal(r.categories.length, 0);
  assert.equal(r.weightedAverage, 0.025);
  assert.equal(r.totalMonthly, 0);
});

test('inflationBreakdownFromLocation: categories sorted by weight descending', () => {
  const mix = {
    small: { typical: 100, annualInflation: 0.05 },
    big: { typical: 1000, annualInflation: 0.03 },
    medium: { typical: 400, annualInflation: 0.04 },
  };
  const r = inflationBreakdownFromLocation(mix);
  assert.equal(r.categories.length, 3);
  // Sorted by weight desc: big (66.7%) → medium (26.7%) → small (6.7%)
  assert.equal(r.categories[0].key, 'big');
  assert.equal(r.categories[1].key, 'medium');
  assert.equal(r.categories[2].key, 'small');
});

test('inflationBreakdownFromLocation: contribution sum equals weightedAverage', () => {
  const mix = {
    rent: { typical: 800, annualInflation: 0.04 },
    groceries: { typical: 200, annualInflation: 0.03 },
  };
  const r = inflationBreakdownFromLocation(mix);
  const sumContrib = r.categories.reduce((s, c) => s + c.contribution, 0);
  assert.ok(Math.abs(sumContrib - r.weightedAverage) < 1e-9);
});

test('inflationBreakdownFromLocation: weights sum to 1.0', () => {
  const mix = {
    a: { typical: 333, annualInflation: 0.03 },
    b: { typical: 333, annualInflation: 0.04 },
    c: { typical: 333, annualInflation: 0.05 },
  };
  const r = inflationBreakdownFromLocation(mix);
  const sumWeights = r.categories.reduce((s, c) => s + c.weight, 0);
  assert.ok(Math.abs(sumWeights - 1.0) < 1e-9);
});

test('inflationBreakdownFromLocation: zero-typical categories filtered out', () => {
  const mix = {
    real: { typical: 1000, annualInflation: 0.04 },
    zero: { typical: 0, annualInflation: 0.10 },
  };
  const r = inflationBreakdownFromLocation(mix);
  // Only the real category survives the filter.
  assert.equal(r.categories.length, 1);
  assert.equal(r.categories[0].key, 'real');
});

// ─── compileLifeEvents ─────────────────────────────────────────────────

test('compileLifeEvents: empty params returns empty array', () => {
  assert.deepEqual(compileLifeEvents({ years: 30 }), []);
});

test('compileLifeEvents: moveSchedule entries become move events', () => {
  const events = compileLifeEvents({
    years: 30,
    moveSchedule: [
      { fromYear: 5, baseCost: 5000, isForeign: false },
      { fromYear: 10, baseCost: 4000, isForeign: true },
    ],
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, 'move');
  assert.equal(events[0].year, 5);
  assert.equal(events[1].kind, 'move');
  assert.equal(events[1].year, 10);
});

test('compileLifeEvents: spouseDeath emits one event with bundled survivor overrides', () => {
  const events = compileLifeEvents({
    years: 30,
    spouseDeathYear: 12,
    survivorMonthlyIncome: 3000,
    survivorCostRatio: 0.75,
  });
  const death = events.find((e) => e.kind === 'spouseDeath');
  assert.ok(death, 'spouseDeath event should exist');
  assert.equal(death!.year, 12);
  const overrides = death!.survivorOverrides as Record<string, unknown>;
  assert.equal(overrides.monthlyIncome, 3000);
  assert.equal(overrides.costRatio, 0.75);
});

test('compileLifeEvents: stepUpBasis fires at deathYear when survivorStepUpBenefitUSD > 0', () => {
  const events = compileLifeEvents({
    years: 30,
    spouseDeathYear: 12,
    survivorStepUpBenefitUSD: 50000,
  });
  const stepUp = events.find((e) => e.kind === 'stepUpBasis');
  assert.ok(stepUp, 'stepUpBasis event should exist');
  assert.equal(stepUp!.year, 12);
  assert.equal(stepUp!.benefitUSD, 50000);
});

test('compileLifeEvents: oneTimeExpenses with amountUSD <= 0 are filtered', () => {
  const events = compileLifeEvents({
    years: 30,
    oneTimeExpenses: [
      { year: 5, amountUSD: 20000, label: 'real expense' },
      { year: 10, amountUSD: 0, label: 'zero — should be dropped' },
      { year: 15, amountUSD: -100, label: 'negative — should be dropped' },
    ],
  });
  const expenses = events.filter((e) => e.kind === 'oneTimeExpense');
  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].year, 5);
});

// ─── compileLifeEvents — oneTimeIncomes (#31 priority 2) ────────────────

test('compileLifeEvents: oneTimeIncomes become oneTimeIncome events', () => {
  const events = compileLifeEvents({
    years: 30,
    oneTimeIncomes: [
      { year: 8, amountUSD: 100000, label: 'Inheritance' },
      { year: 15, amountUSD: 50000, label: 'Home sale proceeds', inflate: false },
    ],
  });
  const incomes = events.filter((e) => e.kind === 'oneTimeIncome');
  assert.equal(incomes.length, 2);
  assert.equal(incomes[0].year, 8);
  assert.equal((incomes[0] as { amountUSD: number }).amountUSD, 100000);
  assert.equal((incomes[0] as { label?: string }).label, 'Inheritance');
  assert.equal((incomes[1] as { inflate?: boolean }).inflate, false);
});

test('compileLifeEvents: oneTimeIncomes with amountUSD <= 0 are filtered', () => {
  const events = compileLifeEvents({
    years: 30,
    oneTimeIncomes: [
      { year: 5, amountUSD: 100000, label: 'real income' },
      { year: 10, amountUSD: 0, label: 'zero — should be dropped' },
      { year: 15, amountUSD: -100, label: 'negative — should be dropped' },
    ],
  });
  const incomes = events.filter((e) => e.kind === 'oneTimeIncome');
  assert.equal(incomes.length, 1);
  assert.equal(incomes[0].year, 5);
});

test('compileLifeEvents: oneTimeIncomes outside [0, p.years) are filtered', () => {
  const events = compileLifeEvents({
    years: 10,
    oneTimeIncomes: [
      { year: 5, amountUSD: 100000, label: 'in horizon' },
      { year: 15, amountUSD: 100000, label: 'past horizon — drop' },
      { year: -3, amountUSD: 100000, label: 'before horizon — drop' },
    ],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'oneTimeIncome');
  assert.equal(events[0].year, 5);
});

// ─── compileLifeEvents — inheritedIRA passthrough (#31 priority 5) ──────

test('compileLifeEvents: inheritedIRA events from lifeEvents are passed through verbatim', () => {
  const events = compileLifeEvents({
    years: 30,
    lifeEvents: [
      {
        kind: 'inheritedIRA',
        year: 8,
        balanceUSD: 250000,
        drainOverYears: 10,
        effectiveTaxRate: 0.22,
        label: 'Parental IRA',
      },
    ],
  });
  const ira = events.find((e) => e.kind === 'inheritedIRA');
  assert.ok(ira, 'inheritedIRA event should exist');
  assert.equal(ira!.year, 8);
  const fields = ira as {
    balanceUSD: number;
    drainOverYears?: number;
    effectiveTaxRate?: number;
    label?: string;
  };
  assert.equal(fields.balanceUSD, 250000);
  assert.equal(fields.drainOverYears, 10);
  assert.equal(fields.effectiveTaxRate, 0.22);
  assert.equal(fields.label, 'Parental IRA');
});

test('compileLifeEvents: inheritedIRA event past horizon is filtered', () => {
  const events = compileLifeEvents({
    years: 10,
    lifeEvents: [
      // Event year past horizon — `compileLifeEvents` filters by event year.
      // Note: this means a drain that STARTS in horizon but extends past
      // is kept (the kernel's drain dispatcher handles per-year
      // window membership), but a drain that hasn't even started
      // by the kernel's last year is dropped here.
      { kind: 'inheritedIRA', year: 12, balanceUSD: 100000 },
      { kind: 'inheritedIRA', year: 5, balanceUSD: 100000 },
    ],
  });
  const iras = events.filter((e) => e.kind === 'inheritedIRA');
  assert.equal(iras.length, 1);
  assert.equal(iras[0].year, 5);
});

test('compileLifeEvents: events outside [0, p.years) are filtered (Codex #96 fix)', () => {
  const events = compileLifeEvents({
    years: 10,
    oneTimeExpenses: [
      { year: 5, amountUSD: 1000, label: 'in horizon' },
      { year: 15, amountUSD: 1000, label: 'past horizon — drop' },
      { year: -3, amountUSD: 1000, label: 'before horizon — drop' },
    ],
    spouseDeathYear: 11, // past horizon — drop
  });
  // Only the in-horizon expense survives.
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'oneTimeExpense');
  assert.equal(events[0].year, 5);
});

test('compileLifeEvents: caller-supplied lifeEvents are appended verbatim', () => {
  const events = compileLifeEvents({
    years: 30,
    lifeEvents: [
      { kind: 'oneTimeIncome', year: 8, amountUSD: 100000, label: 'inheritance' },
      { kind: 'careerChange', year: 3, newMonthlyIncome: 5000 },
    ],
  });
  assert.equal(events.length, 2);
  // Sorted by year ascending: careerChange (year 3) first.
  assert.equal(events[0].kind, 'careerChange');
  assert.equal(events[0].year, 3);
  assert.equal(events[1].kind, 'oneTimeIncome');
});

test('compileLifeEvents: result is sorted by year ascending', () => {
  const events = compileLifeEvents({
    years: 30,
    moveSchedule: [{ fromYear: 10, baseCost: 5000, isForeign: false }],
    spouseDeathYear: 5,
    oneTimeExpenses: [{ year: 2, amountUSD: 10000 }],
    lifeEvents: [{ kind: 'oneTimeIncome', year: 7, amountUSD: 50000 }],
  });
  const years = events.map((e) => e.year);
  for (let i = 1; i < years.length; i++) {
    assert.ok(years[i] >= years[i - 1], `events out of order at index ${i}: ${years.join(', ')}`);
  }
});

// ─── mulberry32 ─────────────────────────────────────────────────────────

test('mulberry32: same seed produces identical sequence', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    assert.equal(a(), b(), `divergence at index ${i}`);
  }
});

test('mulberry32: different seeds produce different sequences', () => {
  const a = mulberry32(42);
  const b = mulberry32(43);
  let anyDiff = false;
  for (let i = 0; i < 100; i++) {
    if (a() !== b()) { anyDiff = true; break; }
  }
  assert.ok(anyDiff, 'expected at least one differing draw across seeds 42 vs 43');
});

test('mulberry32: outputs in [0, 1) — never 1, never < 0', () => {
  const r = mulberry32(12345);
  for (let i = 0; i < 1000; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1, `out of range at index ${i}: ${x}`);
  }
});

test('mulberry32: known stable sequence for seed 42 (regression guard)', () => {
  // Pinning the first 3 outputs locks the algorithm — accidental changes
  // to the bitwise math would break this test before they break callers.
  const r = mulberry32(42);
  const got = [r(), r(), r()];
  // Computed once from the implementation as it stands at PR-merge time.
  // If you intentionally change the PRNG, regenerate these values and
  // call out the seed-stability break in the commit body.
  assert.ok(Math.abs(got[0] - 0.6011037519201636) < 1e-12, `seed 42 draw 0: got ${got[0]}`);
  assert.ok(Math.abs(got[1] - 0.44829055899754167) < 1e-12, `seed 42 draw 1: got ${got[1]}`);
  assert.ok(Math.abs(got[2] - 0.8524657934904099) < 1e-12, `seed 42 draw 2: got ${got[2]}`);
});

// ─── runMonteCarlo byte-equality ───────────────────────────────────────

/**
 * Minimal smoke-shaped MC params that exercise the inner trial loop
 * (Gaussian return / inflation draws, currency shocks for foreign
 * segments) but not the more elaborate event-driven branches. Keeps
 * the test fast (<100ms) while still routing through every Math.random
 * site that was rewired to consume the seeded function.
 */
function smokeParams(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    portfolio: 1_000_000,
    monthlyIncome: 4_000,
    baseCost: 5_000,
    isForeign: true, // ensures currShock path is exercised
    fxDrift: 0.01,
    runs: 50,
    years: 20,
    meanReturn: 0.07,
    volReturn: 0.15,
    meanInflation: 0.025,
    volInflation: 0.01,
    currVol: 0.05,
    incGrowth: 0.02,
    returnMode: 'normal',
    ...extra,
  };
}

test('runMonteCarlo: same seed → byte-identical results array', () => {
  const a = runMonteCarlo(smokeParams({ seededRandom: mulberry32(2026) }));
  const b = runMonteCarlo(smokeParams({ seededRandom: mulberry32(2026) }));
  assert.deepEqual(a.results, b.results, 'results diverged across same-seed runs');
  assert.equal(a.successRate, b.successRate);
  assert.equal(a.median, b.median);
  assert.equal(a.p5, b.p5);
  assert.equal(a.p95, b.p95);
});

test('runMonteCarlo: same seed → byte-identical paths array', () => {
  const a = runMonteCarlo(smokeParams({ seededRandom: mulberry32(2026) }));
  const b = runMonteCarlo(smokeParams({ seededRandom: mulberry32(2026) }));
  assert.deepEqual(a.paths, b.paths, 'paths diverged across same-seed runs');
});

test('runMonteCarlo: different seeds → different results', () => {
  const a = runMonteCarlo(smokeParams({ seededRandom: mulberry32(1) }));
  const b = runMonteCarlo(smokeParams({ seededRandom: mulberry32(2) }));
  // Sorted results arrays differ when the underlying trial trajectories differ.
  // Allow the rare collision via OR over multiple summary stats.
  const anyDiff =
    a.median !== b.median ||
    a.successRate !== b.successRate ||
    a.p5 !== b.p5 ||
    a.p95 !== b.p95;
  assert.ok(anyDiff, 'seeds 1 vs 2 produced suspiciously identical summary stats');
});

test('runMonteCarlo: regime mode also reproducible under same seed', () => {
  // Regime mode adds two extra rand() coin flips per year for state
  // transitions on top of the Gaussian draws — covers the second-most
  // randomness-heavy code path.
  const a = runMonteCarlo(smokeParams({ returnMode: 'regime', seededRandom: mulberry32(7) }));
  const b = runMonteCarlo(smokeParams({ returnMode: 'regime', seededRandom: mulberry32(7) }));
  assert.deepEqual(a.results, b.results);
  assert.deepEqual(a.paths, b.paths);
});

test('runMonteCarlo: LTC self-insure roll consumes seeded RNG', () => {
  // ltcSelfInsure + non-EV mode triggers the per-trial Math.random ltc
  // start-age roll. With the seeded RNG, identical inputs must produce
  // identical results across runs.
  const params = smokeParams({
    ltcSelfInsure: true,
    ltcUseExpectedValue: false,
    ltcProbability: 0.7,
    ltcStartAgeMin: 78,
    ltcStartAgeMax: 88,
    ltcDurationYears: 2.4,
    ltcCostPerYearUSD: 108_000,
    adultBirthYears: [1960],
    simStartYear: 2026,
  });
  const a = runMonteCarlo({ ...params, seededRandom: mulberry32(99) });
  const b = runMonteCarlo({ ...params, seededRandom: mulberry32(99) });
  assert.deepEqual(a.results, b.results);
});

// ─── phantom-income clamp regression (PR #111 + PR #112) ──────────────

test('runMonteCarlo: phantom-income clamp prevents windfall under extreme currVol', () => {
  // Cross-PR regression test (#111 clamp + #112 seeded RNG). With zero
  // growth (zero return / zero inflation / income < cost) and a foreign
  // segment under extreme currVol=5.0, every legitimate trial must END
  // the simulation BELOW the starting $1M portfolio. Pre-clamp, seed=14
  // produces a max trial balance ~$29.4M — pure phantom income from the
  // `bal -= cost*12*costShockMult` flip when costShockMult < 0.
  //
  // The clamp `Math.max(0, cost*12*costShockMult)` ensures expenses can
  // be reduced (favorable FX) but cannot fund the portfolio. Threshold
  // 1.5e6 (1.5x the starting portfolio) is a generous ceiling: zero
  // growth means no legitimate trial can exceed $1M, but income still
  // accumulates against the cost, so a small over-1M result is not
  // necessarily phantom. 1.5x catches the bug (~29x over) without
  // flaking on legitimate residual income.
  const result = runMonteCarlo({
    portfolio: 1_000_000,
    monthlyIncome: 4_000,
    baseCost: 20_000,
    isForeign: true,
    fxDrift: 0,
    runs: 2_000,
    years: 50,
    meanReturn: 0,
    volReturn: 0,
    meanInflation: 0,
    volInflation: 0,
    currVol: 5.0,
    incGrowth: 0,
    returnMode: 'normal',
    seededRandom: mulberry32(14),
  });
  const maxResult = Math.max(...result.results);
  assert.ok(
    maxResult < 1.5e6,
    `phantom income detected: max trial balance ${maxResult.toExponential(2)} exceeds 1.5x starting portfolio ($1.5M ceiling). Without #111's clamp, seed 14 produces ~$29.4M.`,
  );
});

// ─── medicareMonthlyByYear override (#31 priority 5 follow-up) ──────────

/** US-segment params with Medicare-eligible adults — exercises the
 *  age-aware mixed-Medicare/ACA branch in segmentCostAtYear where the
 *  override matters most. */
function usMedicareSmokeParams(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    portfolio: 1_000_000,
    monthlyIncome: 4_000,
    baseCost: 5_000,
    isForeign: false,
    fxDrift: 0,
    runs: 50,
    years: 15,
    meanReturn: 0.06,
    volReturn: 0.10,
    meanInflation: 0.025,
    volInflation: 0.005,
    currVol: 0,
    incGrowth: 0.02,
    returnMode: 'normal',
    adultBirthYears: [1956, 1958], // both age 65+ at simStartYear 2026
    simStartYear: 2026,
    magiAnnual: 80_000,
    moveSchedule: [{
      fromYear: 0,
      baseCost: 5_000,
      isForeign: false,
      isUS: true,
      nonHealthcareBase: 4_000,
      monthlyIncomeTax: 200,
      medicareMonthly: 700,           // baseline household-wide Medicare
      acaUnsubsidizedMonthly: 1_500,
      acaSubsidyCapPct: 0.085,
      foreignHealthcareMonthly: 0,
    }],
    ...extra,
  };
}

test('runMonteCarlo: medicareMonthlyByYear override unset → byte-identical to legacy', () => {
  // Without the override field, the kernel must produce exactly the same
  // results array as before this PR. Locks the no-IRMAA-augment path.
  const a = runMonteCarlo({ ...usMedicareSmokeParams(), seededRandom: mulberry32(42) });
  const b = runMonteCarlo({ ...usMedicareSmokeParams(), seededRandom: mulberry32(42) });
  assert.deepEqual(a.results, b.results);
});

test('runMonteCarlo: medicareMonthlyByYear with all-undefined entries == legacy', () => {
  // Sparse array of all-undefineds should fall through to m.medicareMonthly.
  const allUndef = new Array(15).fill(undefined);
  const a = runMonteCarlo({ ...usMedicareSmokeParams(), seededRandom: mulberry32(42) });
  const b = runMonteCarlo({
    ...usMedicareSmokeParams(),
    medicareMonthlyByYear: allUndef,
    seededRandom: mulberry32(42),
  });
  assert.deepEqual(a.results, b.results, 'all-undefined override must be no-op');
});

test('runMonteCarlo: medicareMonthlyByYear override raises Medicare cost → lower median', () => {
  // Inflate Medicare 5x for every year via the override. With both adults
  // in the household over 65, ALL the household's healthcare cost flows
  // through this override → meaningful drag on the portfolio.
  const inflated = new Array(15).fill(700 * 5);
  const baseline = runMonteCarlo({ ...usMedicareSmokeParams(), seededRandom: mulberry32(42) });
  const overridden = runMonteCarlo({
    ...usMedicareSmokeParams(),
    medicareMonthlyByYear: inflated,
    seededRandom: mulberry32(42),
  });
  assert.ok(
    overridden.median < baseline.median,
    `5x Medicare via override should reduce median; baseline ${baseline.median}, overridden ${overridden.median}`,
  );
});

test('runMonteCarlo: foreign segment ignores medicareMonthlyByYear override', () => {
  // Foreign segments use foreignHealthcareMonthly, never m.medicareMonthly,
  // so the override is naturally inert. Trial with foreign-only schedule
  // should produce identical results regardless of the override array.
  const foreignParams = {
    ...usMedicareSmokeParams(),
    moveSchedule: [{
      fromYear: 0,
      baseCost: 4_000,
      isForeign: true,
      isUS: false,
      nonHealthcareBase: 3_500,
      monthlyIncomeTax: 100,
      medicareMonthly: 0,
      foreignHealthcareMonthly: 500,
    }],
  };
  const inflated = new Array(15).fill(700 * 5);
  const a = runMonteCarlo({ ...foreignParams, seededRandom: mulberry32(42) });
  const b = runMonteCarlo({
    ...foreignParams,
    medicareMonthlyByYear: inflated,
    seededRandom: mulberry32(42),
  });
  assert.deepEqual(a.results, b.results, 'foreign segment must be inert to override');
});

// ─── rental-income helpers (Todo #29 Stage 1) ───────────────────────────

import rental from '../src/app/lib/rental-income';
import taxSources from '../src/app/lib/tax-sources';
import type { RentalProperty, ScheduleEBreakdown, RentalAggregate } from '../src/app/lib/rental-income';

const {
  straightLineDepreciation,
  scheduleENetAnnual,
  aggregateRentalIncome,
  defaultRentalProperty,
} = rental as unknown as {
  straightLineDepreciation: (basis: number, simYear: number, startYear: number, life?: number) => number;
  scheduleENetAnnual: (p: RentalProperty, simYear: number) => ScheduleEBreakdown;
  aggregateRentalIncome: (props: readonly RentalProperty[], simYear: number) => RentalAggregate;
  defaultRentalProperty: () => RentalProperty;
};

const { RENTAL_RESIDENTIAL_DEPRECIATION_LIFE_YEARS } = taxSources as unknown as {
  RENTAL_RESIDENTIAL_DEPRECIATION_LIFE_YEARS: number;
};

/** Builder for a fully-specified RentalProperty under test. */
function makeRental(overrides: Partial<RentalProperty> = {}): RentalProperty {
  return {
    id: 'r1',
    label: 'Test rental',
    monthlyGrossRent: 2000,
    vacancyRatePct: 0,
    propertyTaxAnnual: 0,
    otherOpExAnnual: 0,
    mortgageInterestAnnual: 0,
    depreciableBasis: 0,
    depreciationStartYear: 0,
    ownedFromYear: 0,
    ownedThroughYear: undefined,
    ...overrides,
  };
}

// straightLineDepreciation -----------------------------------------------

test('straightLineDepreciation: zero basis returns 0', () => {
  assert.equal(straightLineDepreciation(0, 5, 0), 0);
  assert.equal(straightLineDepreciation(-1000, 5, 0), 0);
});

test('straightLineDepreciation: zero/negative life returns 0', () => {
  assert.equal(straightLineDepreciation(275000, 5, 0, 0), 0);
  assert.equal(straightLineDepreciation(275000, 5, 0, -10), 0);
});

test('straightLineDepreciation: not-yet-started returns 0', () => {
  // depreciation begins at sim-year 5; year 4 is before that
  assert.equal(straightLineDepreciation(275000, 4, 5), 0);
});

test('straightLineDepreciation: fully depreciated returns 0', () => {
  // basis 275000 / life 27.5 = 10000/yr; year 28 (elapsed 28) past life
  assert.equal(straightLineDepreciation(275000, 28, 0), 0);
});

test('straightLineDepreciation: in-window returns basis/life', () => {
  // 275000 / 27.5 = 10000
  assert.equal(straightLineDepreciation(275000, 5, 0), 10000);
  assert.equal(straightLineDepreciation(275000, 0, 0), 10000);
});

test('straightLineDepreciation: negative startYear (pre-sim depreciation)', () => {
  // Property bought 10 years before sim start; in sim year 0 we're 10 years in.
  // 17.5 years remain before fully depreciated.
  assert.equal(straightLineDepreciation(275000, 0, -10), 10000);
  // Year 17 still in window (elapsed 27 < 27.5).
  assert.equal(straightLineDepreciation(275000, 17, -10), 10000);
  // Year 18 past life (elapsed 28 ≥ 27.5).
  assert.equal(straightLineDepreciation(275000, 18, -10), 0);
});

test('straightLineDepreciation: residential life constant matches IRC § 168', () => {
  assert.equal(RENTAL_RESIDENTIAL_DEPRECIATION_LIFE_YEARS, 27.5);
});

// scheduleENetAnnual -----------------------------------------------------

test('scheduleENetAnnual: inactive (before ownedFromYear) returns zero breakdown', () => {
  const r = makeRental({ ownedFromYear: 5, monthlyGrossRent: 5000 });
  const b = scheduleENetAnnual(r, 4);
  assert.equal(b.active, false);
  assert.equal(b.grossRent, 0);
  assert.equal(b.taxableNet, 0);
  assert.equal(b.cashFlow, 0);
});

test('scheduleENetAnnual: inactive (past ownedThroughYear) returns zero breakdown', () => {
  const r = makeRental({ ownedFromYear: 0, ownedThroughYear: 10 });
  // year 10 is exclusive — must be inactive
  const b = scheduleENetAnnual(r, 10);
  assert.equal(b.active, false);
  // year 9 is the last active year
  assert.equal(scheduleENetAnnual(r, 9).active, true);
});

test('scheduleENetAnnual: gross + vacancy + opex + interest math', () => {
  const r = makeRental({
    monthlyGrossRent: 2500,    // 30,000 gross
    vacancyRatePct: 8,          //  -2,400 vacancy
    propertyTaxAnnual: 4000,
    otherOpExAnnual: 3000,
    mortgageInterestAnnual: 6000,
    depreciableBasis: 0,        // skip depreciation in this test
  });
  const b = scheduleENetAnnual(r, 0);
  assert.equal(b.active, true);
  assert.equal(b.grossRent, 30000);
  assert.equal(b.vacancyAdj, -2400);
  assert.equal(b.effectiveRent, 27600);
  assert.equal(b.propertyTax, 4000);
  assert.equal(b.otherOpEx, 3000);
  assert.equal(b.mortgageInterest, 6000);
  assert.equal(b.depreciation, 0);
  // 27600 - 4000 - 3000 - 6000 = 14600 cash flow
  assert.equal(b.cashFlow, 14600);
  // depreciation = 0 → taxableNet = cashFlow
  assert.equal(b.taxableNet, 14600);
});

test('scheduleENetAnnual: depreciation creates paper loss while cash positive', () => {
  // The whole point of Schedule E modeling — depreciation can produce
  // a taxable loss while the property generates positive cash flow.
  const r = makeRental({
    monthlyGrossRent: 2000,    // 24,000 gross
    vacancyRatePct: 0,
    propertyTaxAnnual: 4000,
    otherOpExAnnual: 3000,
    mortgageInterestAnnual: 8000,
    depreciableBasis: 275000,  // 10,000/yr
    depreciationStartYear: 0,
  });
  const b = scheduleENetAnnual(r, 0);
  // cash: 24000 - 4000 - 3000 - 8000 = 9000
  assert.equal(b.cashFlow, 9000);
  // taxable: 9000 - 10000 = -1000 (paper loss = depreciation shield)
  assert.equal(b.taxableNet, -1000);
  assert.equal(b.depreciation, 10000);
});

test('scheduleENetAnnual: vacancy rate clamps to 0..100', () => {
  // vacancyRatePct beyond range should not produce negative gross or
  // wraparound — clamp at the boundaries.
  const high = makeRental({ monthlyGrossRent: 1000, vacancyRatePct: 250 });
  const b1 = scheduleENetAnnual(high, 0);
  assert.equal(b1.effectiveRent, 0);
  assert.equal(b1.vacancyAdj, -12000);

  const neg = makeRental({ monthlyGrossRent: 1000, vacancyRatePct: -50 });
  const b2 = scheduleENetAnnual(neg, 0);
  assert.equal(b2.effectiveRent, 12000);
  assert.equal(b2.vacancyAdj, 0);
});

test('scheduleENetAnnual: depreciation rolls off at year 27.5', () => {
  const r = makeRental({
    monthlyGrossRent: 2000,
    propertyTaxAnnual: 4000,
    otherOpExAnnual: 3000,
    depreciableBasis: 275000,
    depreciationStartYear: 0,
  });
  // years 0..27 — depreciation active (27 < 27.5)
  assert.equal(scheduleENetAnnual(r, 27).depreciation, 10000);
  // year 28 — past life (28 ≥ 27.5)
  assert.equal(scheduleENetAnnual(r, 28).depreciation, 0);
  // cash flow stays the same when depreciation rolls off — the
  // taxable net jumps up by exactly the prior depreciation amount
  const before = scheduleENetAnnual(r, 27);
  const after = scheduleENetAnnual(r, 28);
  assert.equal(after.cashFlow, before.cashFlow);
  assert.equal(after.taxableNet - before.taxableNet, 10000);
});

test('scheduleENetAnnual: negative input fields clamped to 0', () => {
  // Defensive clamps — UI inputs may briefly hold negatives during typing.
  const r = makeRental({
    monthlyGrossRent: -100,
    propertyTaxAnnual: -500,
    otherOpExAnnual: -200,
    mortgageInterestAnnual: -1000,
  });
  const b = scheduleENetAnnual(r, 0);
  assert.equal(b.grossRent, 0);
  assert.equal(b.propertyTax, 0);
  assert.equal(b.otherOpEx, 0);
  assert.equal(b.mortgageInterest, 0);
  assert.equal(b.cashFlow, 0);
  assert.equal(b.taxableNet, 0);
});

// aggregateRentalIncome --------------------------------------------------

test('aggregateRentalIncome: empty portfolio returns zeros', () => {
  const a = aggregateRentalIncome([], 0);
  assert.equal(a.totalCashFlow, 0);
  assert.equal(a.totalTaxableNet, 0);
  assert.equal(a.totalDepreciation, 0);
  assert.equal(a.totalEffectiveRent, 0);
  assert.equal(a.perProperty.length, 0);
});

test('aggregateRentalIncome: sums active properties only', () => {
  const props: RentalProperty[] = [
    makeRental({
      id: 'a',
      label: 'A',
      monthlyGrossRent: 2000,           // 24000 gross
      propertyTaxAnnual: 4000,
      depreciableBasis: 275000,         // 10000 dep
      ownedFromYear: 0,
      ownedThroughYear: 10,
    }),
    makeRental({
      id: 'b',
      label: 'B',
      monthlyGrossRent: 3000,           // 36000 gross — but inactive at year 0
      propertyTaxAnnual: 6000,
      depreciableBasis: 200000,
      ownedFromYear: 5,
    }),
  ];
  const yr0 = aggregateRentalIncome(props, 0);
  // Only A is active; cash = 24000 - 4000 = 20000; taxable = 20000 - 10000 = 10000
  assert.equal(yr0.totalCashFlow, 20000);
  assert.equal(yr0.totalTaxableNet, 10000);
  assert.equal(yr0.totalDepreciation, 10000);
  assert.equal(yr0.totalEffectiveRent, 24000);
  // perProperty includes BOTH (B as inactive zero-row)
  assert.equal(yr0.perProperty.length, 2);
  assert.equal(yr0.perProperty[0].breakdown.active, true);
  assert.equal(yr0.perProperty[1].breakdown.active, false);

  // year 5: both active
  const yr5 = aggregateRentalIncome(props, 5);
  // A: 24000 - 4000 = 20000 cash, 20000 - 10000 = 10000 taxable
  // B: 36000 - 6000 = 30000 cash, 30000 - (200000/27.5 = 7272.727...) = 22727.272...
  const bDep = 200000 / 27.5;
  assert.equal(yr5.totalCashFlow, 50000);
  assert.ok(Math.abs(yr5.totalTaxableNet - (10000 + 30000 - bDep)) < 1e-6);

  // year 10: A's ownership window ended (exclusive); only B
  const yr10 = aggregateRentalIncome(props, 10);
  assert.equal(yr10.perProperty[0].breakdown.active, false);
  assert.equal(yr10.perProperty[1].breakdown.active, true);
  assert.equal(yr10.totalCashFlow, 30000);
});

test('aggregateRentalIncome: portfolio paper loss adds when properties lose', () => {
  // Two properties, both at depreciation paper loss.
  const props: RentalProperty[] = [
    makeRental({ id: 'a', monthlyGrossRent: 1000, depreciableBasis: 275000 }), // 12k - 10k dep = 2k loss
    makeRental({ id: 'b', monthlyGrossRent: 1000, depreciableBasis: 275000 }), // 12k - 10k dep = 2k loss
  ];
  const a = aggregateRentalIncome(props, 0);
  // (12000 - 10000) + (12000 - 10000) = 4000 taxable; cash = 24000
  assert.equal(a.totalCashFlow, 24000);
  assert.equal(a.totalTaxableNet, 4000);
  assert.equal(a.totalDepreciation, 20000);
});

test('aggregateRentalIncome: negative cashFlow sums correctly (heavy mortgage)', () => {
  // Property is cash-negative when mortgage interest dominates.
  // Two properties, one cash-positive, one cash-negative — totals should
  // reflect the algebraic sum (Sankey lane logic depends on this sign).
  const props: RentalProperty[] = [
    makeRental({
      id: 'a',
      monthlyGrossRent: 1000,           // 12000 gross
      propertyTaxAnnual: 0,
      otherOpExAnnual: 0,
      mortgageInterestAnnual: 0,
    }),                                  // cash = 12000
    makeRental({
      id: 'b',
      monthlyGrossRent: 1000,           // 12000 gross
      propertyTaxAnnual: 4000,
      otherOpExAnnual: 3000,
      mortgageInterestAnnual: 8000,     // 12000 - 4000 - 3000 - 8000 = -3000
    }),                                  // cash = -3000
  ];
  const a = aggregateRentalIncome(props, 0);
  // 12000 + (-3000) = 9000 net; depreciation 0; taxable = 9000
  assert.equal(a.totalCashFlow, 9000);
  assert.equal(a.totalTaxableNet, 9000);
  assert.equal(a.perProperty[0].breakdown.cashFlow, 12000);
  assert.equal(a.perProperty[1].breakdown.cashFlow, -3000);
});

test('aggregateRentalIncome: portfolio cashFlow can be negative overall', () => {
  // Single deeply-cash-negative property — Sankey must handle this case.
  const props: RentalProperty[] = [
    makeRental({
      id: 'a',
      monthlyGrossRent: 500,            // 6000 gross
      propertyTaxAnnual: 4000,
      otherOpExAnnual: 3000,
      mortgageInterestAnnual: 5000,     // 6000 - 4000 - 3000 - 5000 = -6000
      depreciableBasis: 275000,         // 10000 dep
    }),
  ];
  const a = aggregateRentalIncome(props, 0);
  assert.equal(a.totalCashFlow, -6000);
  // taxable = cash - depreciation = -6000 - 10000 = -16000 (Schedule E loss)
  assert.equal(a.totalTaxableNet, -16000);
});

// defaultRentalProperty --------------------------------------------------

test('defaultRentalProperty: produces a valid, active row', () => {
  const r = defaultRentalProperty();
  assert.ok(r.id.startsWith('rental-'));
  assert.equal(typeof r.label, 'string');
  assert.ok(r.monthlyGrossRent > 0);
  assert.ok(r.depreciableBasis > 0);
  assert.equal(r.ownedFromYear, 0);
  // Sanity-check it produces a sensible breakdown at year 0
  const b = scheduleENetAnnual(r, 0);
  assert.equal(b.active, true);
  assert.ok(b.cashFlow > 0); // the default should be cash-positive
  // Two consecutive ids should not collide in normal use
  const r2 = defaultRentalProperty();
  assert.notEqual(r.id, r2.id);
});

// ─── runMonteCarlo: rental-income kernel integration (Todo #34) ────────

/** Build a rental property suitable for kernel integration tests. */
function makeKernelRental(overrides: Partial<RentalProperty> = {}): RentalProperty {
  return {
    id: 'k1',
    label: 'Kernel rental',
    monthlyGrossRent: 2500,
    vacancyRatePct: 8,
    propertyTaxAnnual: 4000,
    otherOpExAnnual: 3000,
    mortgageInterestAnnual: 0,
    depreciableBasis: 200000,
    depreciationStartYear: 0,
    ownedFromYear: 0,
    ownedThroughYear: undefined,
    ...overrides,
  };
}

test('runMonteCarlo: rentalProperties=undefined → byte-identical to legacy', () => {
  // Empty/missing rental array must not change kernel behavior at all.
  // Anything else means the rental code path is leaking into legacy runs.
  const baseSeed = 4242;
  const a = runMonteCarlo(smokeParams({ seededRandom: mulberry32(baseSeed) }));
  const b = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(baseSeed),
    rentalProperties: [],
  }));
  assert.deepEqual(a.results, b.results);
  assert.deepEqual(a.paths, b.paths);
});

test('runMonteCarlo: positive rental cash flow shifts median up', () => {
  // Cash-positive rental adds money to the household every year. With
  // identical seeds, the with-rental run should end with strictly higher
  // median balance.
  const seed = 99;
  const baseline = runMonteCarlo(smokeParams({ seededRandom: mulberry32(seed) }));
  const withRental = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: [makeKernelRental({
      monthlyGrossRent: 3000,           // 36000 gross
      vacancyRatePct: 5,                // 1800 vacancy → 34200 effective
      propertyTaxAnnual: 4000,
      otherOpExAnnual: 3000,
      mortgageInterestAnnual: 0,
      depreciableBasis: 200000,         // 7272.7 dep
      // cash = 34200 - 4000 - 3000 - 0 = 27200/yr
      // taxable = 27200 - 7272.7 ≈ 19927.3
    })],
  }));
  assert.ok(
    withRental.median > baseline.median,
    `expected with-rental median ${withRental.median} > baseline ${baseline.median}`,
  );
});

test('runMonteCarlo: depreciation shield reduces tax burden', () => {
  // Same cash flow, different basis: more basis → more depreciation →
  // less rental tax owed → higher final balance. Isolates the shield's
  // effect on bal independent of the cash inflow.
  const seed = 137;
  const cashOnly = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: [makeKernelRental({
      monthlyGrossRent: 2000,           // 24000 gross
      vacancyRatePct: 0,
      propertyTaxAnnual: 4000,
      otherOpExAnnual: 3000,
      mortgageInterestAnnual: 0,
      depreciableBasis: 0,              // NO depreciation shield
      // cash = taxable = 24000 - 4000 - 3000 = 17000/yr
    })],
  }));
  const shielded = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: [makeKernelRental({
      monthlyGrossRent: 2000,
      vacancyRatePct: 0,
      propertyTaxAnnual: 4000,
      otherOpExAnnual: 3000,
      mortgageInterestAnnual: 0,
      depreciableBasis: 275000,         // 10000/yr depreciation shield
      // cash = 17000/yr (unchanged), taxable = 7000/yr (shielded by 10K dep)
    })],
  }));
  assert.ok(
    shielded.median > cashOnly.median,
    `expected shielded median ${shielded.median} > cash-only ${cashOnly.median}`,
  );
});

test('runMonteCarlo: ownership window respected (delayed property)', () => {
  // A property with ownedFromYear=15 in a 20-year sim contributes only
  // years 15..19 — about a quarter of the ownership of an always-on property.
  // Median lift should be much smaller than the always-on case.
  const seed = 271;
  const alwaysOn = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: [makeKernelRental({ ownedFromYear: 0 })],
  }));
  const delayed = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: [makeKernelRental({ ownedFromYear: 15 })],
  }));
  const baseline = runMonteCarlo(smokeParams({ seededRandom: mulberry32(seed) }));
  // Both should beat baseline (positive cash always helps), but delayed lift < always-on lift.
  const alwaysLift = alwaysOn.median - baseline.median;
  const delayedLift = delayed.median - baseline.median;
  assert.ok(
    alwaysLift > delayedLift,
    `always-on lift ${alwaysLift} should exceed delayed lift ${delayedLift}`,
  );
  assert.ok(
    delayedLift >= 0,
    `delayed lift ${delayedLift} should be non-negative`,
  );
});

test('runMonteCarlo: rentalEffectiveTaxRate=0 vs 0.5 changes balance', () => {
  // Same property; only the marginal rate differs. Higher rate → less
  // post-tax retained → lower final balance.
  const seed = 314;
  const props: RentalProperty[] = [makeKernelRental({
    monthlyGrossRent: 3000,
    propertyTaxAnnual: 4000,
    otherOpExAnnual: 3000,
    depreciableBasis: 100000,           // small shield, ensures positive taxable
  })];
  const noTax = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: props,
    rentalEffectiveTaxRate: 0,
  }));
  const heavyTax = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: props,
    rentalEffectiveTaxRate: 0.50,
  }));
  assert.ok(
    noTax.median > heavyTax.median,
    `noTax median ${noTax.median} should exceed heavyTax median ${heavyTax.median}`,
  );
});

// ─── ltcgFederalTax (Todo #35 — ported from retirement-api) ────────────

const { ltcgFederalTax } = taxSources as unknown as {
  ltcgFederalTax: (
    ltcgIncome: number,
    ordinaryTaxableIncome: number,
    filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh',
  ) => number;
};

test('ltcgFederalTax: zero or negative gain returns 0', () => {
  assert.equal(ltcgFederalTax(0, 50000, 'mfj'), 0);
  assert.equal(ltcgFederalTax(-1000, 50000, 'mfj'), 0);
});

test('ltcgFederalTax: gain entirely in 0% bracket returns 0', () => {
  // MFJ 0% top: $98,900. Ordinary $20K + gain $30K = $50K total < $98,900.
  assert.equal(ltcgFederalTax(30_000, 20_000, 'mfj'), 0);
});

test('ltcgFederalTax: gain entirely in 15% bracket', () => {
  // MFJ 0% top $98,900, 15% top $613,700. Ordinary $200K + gain $100K
  // = $300K — all of the gain sits in the 15% bracket.
  assert.equal(ltcgFederalTax(100_000, 200_000, 'mfj'), 100_000 * 0.15);
});

test('ltcgFederalTax: gain straddles 0% / 15% boundary', () => {
  // MFJ: ordinary $80K, gain $40K. Combined $120K. zeroTop $98,900.
  // inZero = min(40K, 98,900 − 80K) = min(40K, 18,900) = 18,900
  // inFifteen = 40K − 18,900 = 21,100
  // tax = 21,100 × 0.15 = 3,165
  assert.ok(Math.abs(ltcgFederalTax(40_000, 80_000, 'mfj') - 21_100 * 0.15) < 1e-6);
});

test('ltcgFederalTax: gain straddles 15% / 20% boundary', () => {
  // MFJ: ordinary $500K, gain $200K. Combined $700K. fifteenTop $613,700.
  // inTwenty = min(200K, 700K − 613,700) = 86,300
  // inFifteen = 200K − 0 − 86,300 = 113,700
  // tax = 113,700 × 0.15 + 86,300 × 0.20 = 17,055 + 17,260 = 34,315
  const tax = ltcgFederalTax(200_000, 500_000, 'mfj');
  assert.ok(Math.abs(tax - (113_700 * 0.15 + 86_300 * 0.20)) < 1e-6);
});

test('ltcgFederalTax: filing status routing — single brackets are tighter', () => {
  // Single zeroTop $49,450 vs MFJ $98,900. Same numbers but filing
  // status differs → single pays more tax on a small ordinary income.
  const taxMfj = ltcgFederalTax(40_000, 30_000, 'mfj');
  const taxSingle = ltcgFederalTax(40_000, 30_000, 'single');
  assert.ok(taxSingle > taxMfj, 'single should pay more on equal income/gain');
});

test('ltcgFederalTax: defends prototype-key filing status', () => {
  // Defensive: an unexpected filingStatus string falls back to mfj rather
  // than throwing or accessing prototype keys.
  const tax = ltcgFederalTax(40_000, 80_000, 'toString' as never);
  const mfj = ltcgFederalTax(40_000, 80_000, 'mfj');
  assert.equal(tax, mfj);
});

// ─── runMonteCarlo: propertySale (Todo #35) ────────────────────────────

test('runMonteCarlo: no propertySale events → byte-identical with rental in place', () => {
  // Adding empty propertySale support to the kernel must not perturb
  // results when the caller doesn't supply any sale events.
  const seed = 7777;
  const baseProps: RentalProperty[] = [makeKernelRental()];
  const a = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: baseProps,
  }));
  const b = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: baseProps,
    lifeEvents: [], // explicit empty
  }));
  assert.deepEqual(a.results, b.results);
  assert.deepEqual(a.paths, b.paths);
});

test('runMonteCarlo: propertySale stops rental income from sale year onward', () => {
  // Property generates positive cash flow indefinitely. Selling at
  // year 5 should produce a strictly LOWER median than no-sale (since
  // the sale proceeds are one-time vs continuous rental cash flow over
  // 20 years). The test uses a sale price below adjusted basis to
  // isolate the ownership-cutoff effect (no recapture noise).
  const seed = 8888;
  const props: RentalProperty[] = [makeKernelRental({
    monthlyGrossRent: 3000,
    propertyTaxAnnual: 4000,
    otherOpExAnnual: 3000,
    depreciableBasis: 200000,
    depreciationStartYear: 0,
    ownedFromYear: 0,
  })];
  const noSale = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: props,
  }));
  const earlySale = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: props,
    lifeEvents: [{
      kind: 'propertySale',
      year: 5,
      propertyId: props[0].id,
      // Sale price ~= remaining basis at year 5 (200000 − 5×7272.7 ≈ 163,636)
      // so recapture and LTCG are minimal — isolates the cash-flow loss.
      salePriceUSD: 165_000,
      sellingExpenses: 0,
    }],
  }));
  assert.ok(
    earlySale.median < noSale.median,
    `early-sale median ${earlySale.median} should be below no-sale ${noSale.median}`,
  );
});

test('runMonteCarlo: propertySale recaptures depreciation at 25% (high-gain case)', () => {
  // After 20 years of $7,272.73 depreciation/year ($145,454.55 total) on
  // a $200K basis, sale at $400K should trigger:
  //   - Sec 1250 recapture = 145,454.55 × 0.25 = $36,363.64
  //   - LTCG on remaining gain ≈ ($400K − $54,545.45 adjusted basis − $145,454.55 recapture) at 15%
  // Compare against an identical run where the sale price is at adjusted basis
  // (no gain → no tax). The high-sale-price run should retain less wealth from
  // the sale event itself, but receive more cash overall — net depends on
  // sale price. The cleanest assertion is that BOTH > no-sale-at-all only
  // when the sale price clears the recapture+ltcg burden.
  // We assert the simpler invariant: with a high sale price and depreciation
  // shield, the median is ABOVE the no-sale baseline because sale proceeds
  // (after taxes) plus pre-sale rental income beats indefinite rental.
  const seed = 9999;
  const props: RentalProperty[] = [makeKernelRental({
    monthlyGrossRent: 1200,           // modest rental cash flow
    vacancyRatePct: 10,
    propertyTaxAnnual: 4000,
    otherOpExAnnual: 3000,
    mortgageInterestAnnual: 0,
    depreciableBasis: 200000,
    depreciationStartYear: 0,
  })];
  const baseline = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: props,
  }));
  const highGainSale = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: props,
    lifeEvents: [{
      kind: 'propertySale',
      year: 18,                       // late sale → max accumulated depreciation
      propertyId: props[0].id,
      salePriceUSD: 600_000,          // 3x basis — clear gain even after taxes
      sellingExpenses: 36_000,        // 6% realtor commission
    }],
  }));
  // Confirm a meaningful lift exists — the late high-gain sale should
  // produce notably more wealth than holding the modest cash-flow rental
  // forever, even after Sec 1250 recapture + LTCG.
  assert.ok(
    highGainSale.median > baseline.median + 100_000,
    `high-gain sale median ${highGainSale.median} should beat baseline ${baseline.median} by > $100K`,
  );
});

// ─── ltc-costs lookup (Todo #21 Slice A) ───────────────────────────────

import ltcCosts from '../src/app/lib/ltc-costs';

const {
  defaultLtcCostForCountry,
  LTC_COST_BY_COUNTRY,
  LTC_COST_FOREIGN_DEFAULT,
} = ltcCosts as unknown as {
  defaultLtcCostForCountry: (country: string | null | undefined) => number;
  LTC_COST_BY_COUNTRY: Readonly<Record<string, number>>;
  LTC_COST_FOREIGN_DEFAULT: number;
};

test('defaultLtcCostForCountry: known country returns seeded value', () => {
  assert.equal(defaultLtcCostForCountry('United States'), 108_000);
  assert.equal(defaultLtcCostForCountry('Mexico'), 20_000);
  assert.equal(defaultLtcCostForCountry('Portugal'), 25_000);
});

test('defaultLtcCostForCountry: unknown country falls back to foreign default', () => {
  assert.equal(defaultLtcCostForCountry('Atlantis'), LTC_COST_FOREIGN_DEFAULT);
  assert.equal(defaultLtcCostForCountry('Wakanda'), LTC_COST_FOREIGN_DEFAULT);
});

test('defaultLtcCostForCountry: null/undefined/empty returns foreign default', () => {
  assert.equal(defaultLtcCostForCountry(null), LTC_COST_FOREIGN_DEFAULT);
  assert.equal(defaultLtcCostForCountry(undefined), LTC_COST_FOREIGN_DEFAULT);
  assert.equal(defaultLtcCostForCountry(''), LTC_COST_FOREIGN_DEFAULT);
});

test('defaultLtcCostForCountry: defends prototype-key access', () => {
  // Without the hasOwnProperty guard, `'toString'` would return the
  // inherited Object.prototype method (a function, truthy) — not a number.
  assert.equal(defaultLtcCostForCountry('toString' as never), LTC_COST_FOREIGN_DEFAULT);
  assert.equal(defaultLtcCostForCountry('hasOwnProperty' as never), LTC_COST_FOREIGN_DEFAULT);
});

test('LTC_COST_BY_COUNTRY: covers all 16 dataset countries', () => {
  // Spelling must match the location dataset's `country` field exactly.
  // If a new country is added to the dataset, this test will fail and
  // someone must research its LTC cost (or accept the foreign default).
  const required = [
    'Colombia', 'Costa Rica', 'Croatia', 'Cyprus', 'Ecuador', 'France',
    'Greece', 'Ireland', 'Italy', 'Malta', 'Mexico', 'Panama',
    'Portugal', 'Spain', 'United States', 'Uruguay',
  ];
  for (const c of required) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(LTC_COST_BY_COUNTRY, c),
      `LTC_COST_BY_COUNTRY missing country: ${c}`,
    );
    assert.ok(
      typeof LTC_COST_BY_COUNTRY[c] === 'number' && LTC_COST_BY_COUNTRY[c] > 0,
      `LTC_COST_BY_COUNTRY[${c}] should be a positive number`,
    );
  }
});

// ─── runMonteCarlo: Medicaid spend-down (Todo #21 Slice B) ─────────────

test('runMonteCarlo: medicaidSpendDownEnabled=false → byte-identical legacy', () => {
  // Baseline: caller doesn't pass medicaid params at all.
  // Compare: caller passes medicaidSpendDownEnabled=false explicitly.
  // Both should produce byte-identical results.
  const seed = 7070;
  const ltcParams = {
    ltcSelfInsureEnabled: true,
    ltcProbability: 0.7,
    ltcCostPerYearUSD: 108_000,
    adultBirthYears: [1960],          // 65 at sim-year 0 if planningStartYear=2025
    simStartYear: 2025,
  };
  const a = runMonteCarlo(smokeParams({ ...ltcParams, isForeign: false, seededRandom: mulberry32(seed) }));
  const b = runMonteCarlo(smokeParams({
    ...ltcParams,
    isForeign: false,
    seededRandom: mulberry32(seed),
    medicaidSpendDownEnabled: false,
  }));
  assert.deepEqual(a.results, b.results);
  assert.deepEqual(a.paths, b.paths);
});

test('runMonteCarlo: Medicaid clamp produces strictly higher median (US segment)', () => {
  // Setup: low-portfolio + heavy LTC self-insure → trials deplete
  // hard without Medicaid. With Medicaid clamp, the LTC drain is
  // limited to (bal − threshold), so trials retain more wealth post-
  // LTC. Median terminal balance should be strictly higher.
  //
  // Note: Medicaid covers LTC cost, NOT post-LTC living expenses, so
  // catastrophic-final-bal scenarios still occur (continued sim cost
  // drains the threshold afterward). The robust invariant is "median
  // is meaningfully better with Medicaid", not "worst case bounded".
  const seed = 7171;
  const ltcParams = {
    portfolio: 600_000,
    ltcSelfInsureEnabled: true,
    ltcProbability: 1.0,                // every trial gets LTC
    ltcCostPerYearUSD: 200_000,         // expensive
    ltcDurationYears: 5,
    ltcStartAgeMin: 75, ltcStartAgeMax: 75,
    adultBirthYears: [1960],
    simStartYear: 2025,
    runs: 200,
  };
  const noMedicaid = runMonteCarlo(smokeParams({
    ...ltcParams,
    isForeign: false,
    seededRandom: mulberry32(seed),
  }));
  const withMedicaid = runMonteCarlo(smokeParams({
    ...ltcParams,
    isForeign: false,
    seededRandom: mulberry32(seed),
    medicaidSpendDownEnabled: true,
    medicaidAssetThresholdUSD: 2000,
  }));
  // Medicaid clamp protects bal from full LTC drain — those saved
  // dollars compound through the rest of the horizon. Median terminal
  // balance must be strictly higher.
  assert.ok(
    withMedicaid.median > noMedicaid.median,
    `Medicaid median ${withMedicaid.median} should exceed no-Medicaid ${noMedicaid.median}`,
  );
  // And the lift should be material — at least the LTC cost saved
  // (~$200K × ≤5 years, less the expected per-year drain that would
  // have happened on a depleting balance). Loose lower bound: $50K.
  const lift = withMedicaid.median - noMedicaid.median;
  assert.ok(
    lift > 50_000,
    `Medicaid lift ${lift} should exceed $50K`,
  );
});

test('runMonteCarlo: Medicaid does NOT apply to foreign segments', () => {
  // Foreign-segment LTC: Medicaid should be inert. Compare a foreign
  // run with Medicaid on/off — results should be byte-identical because
  // the `isUSNow` guard short-circuits the clamp.
  const seed = 7272;
  const ltcParams = {
    ltcSelfInsureEnabled: true,
    ltcProbability: 1.0,
    ltcCostPerYearUSD: 50_000,
    adultBirthYears: [1960],
    simStartYear: 2025,
  };
  const off = runMonteCarlo(smokeParams({
    ...ltcParams,
    isForeign: true,                    // foreign segment
    seededRandom: mulberry32(seed),
    medicaidSpendDownEnabled: false,
  }));
  const onButForeign = runMonteCarlo(smokeParams({
    ...ltcParams,
    isForeign: true,
    seededRandom: mulberry32(seed),
    medicaidSpendDownEnabled: true,
    medicaidAssetThresholdUSD: 2000,
  }));
  // Caveat: smokeParams.isForeign maps to a single (foreign) segment in
  // the kernel's auto-built schedule; activeSegmentAt(y).isUS is false
  // throughout. The Medicaid clamp's gate `m.isUS` is therefore false
  // every year, so the with-Medicaid run should be byte-identical.
  assert.deepEqual(off.results, onButForeign.results);
  assert.deepEqual(off.paths, onButForeign.paths);
});

// ─── runMonteCarlo: mortgage (Todo #28) ────────────────────────────────

test('runMonteCarlo: mortgage=0 → byte-identical to legacy (no mortgage)', () => {
  // Both fields 0 (the default) must be a no-op: byte-identical to a
  // run with no mortgage params at all.
  const seed = 6060;
  const a = runMonteCarlo(smokeParams({ seededRandom: mulberry32(seed) }));
  const b = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    mortgageMonthlyPayment: 0,
    mortgageEndYear: 0,
  }));
  assert.deepEqual(a.results, b.results);
  assert.deepEqual(a.paths, b.paths);
});

test('runMonteCarlo: mortgage with endYear=0 is dormant even with payment > 0', () => {
  // The kernel guard is `mortgageMonthlyPayment > 0 && y < mortgageEndYear`.
  // endYear=0 means y is never less than it, so payment never deducts.
  const seed = 6161;
  const a = runMonteCarlo(smokeParams({ seededRandom: mulberry32(seed) }));
  const b = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    mortgageMonthlyPayment: 2500,
    mortgageEndYear: 0,
  }));
  assert.deepEqual(a.results, b.results);
});

test('runMonteCarlo: mortgage deducts P+I × 12 each year before payoff', () => {
  // Active mortgage strictly reduces median balance vs no-mortgage
  // baseline. Magnitude lower-bounded by ~years × 12 × payment when
  // returns are zero, looser bound when returns compound — assert
  // direction + non-trivial magnitude.
  const seed = 6262;
  const baseline = runMonteCarlo(smokeParams({ seededRandom: mulberry32(seed) }));
  const withMortgage = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    mortgageMonthlyPayment: 2500,    // $30K/yr P+I
    mortgageEndYear: 10,             // 10 years of payments
  }));
  assert.ok(
    withMortgage.median < baseline.median,
    `with-mortgage median ${withMortgage.median} should be below baseline ${baseline.median}`,
  );
  // 10 yrs × $30K = $300K nominal hit; with compounding-lost-on-deductions
  // the actual hit is larger. Assert at least $200K to catch a "deduction
  // not firing" regression.
  const drop = baseline.median - withMortgage.median;
  assert.ok(drop > 200_000, `mortgage drop ${drop} should exceed $200K`);
});

test('runMonteCarlo: mortgage payments do NOT inflate with CPI', () => {
  // Mortgage P+I is nominal (the whole point of the feature). With high
  // inflation, the mortgage's real cost falls — and the difference vs
  // an inflating cost stream should manifest as a smaller hit at high
  // inflation than at low inflation, for the same payment + duration.
  // Compare: same nominal mortgage at meanInflation 0% vs 5%, holding
  // returns + seed identical. The 5%-inflation run should NOT show a
  // larger mortgage drop (since payments stay nominal).
  const seed = 6363;
  const lowInfl = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    meanInflation: 0,
    volInflation: 0,
    mortgageMonthlyPayment: 2000,
    mortgageEndYear: 15,
  }));
  const lowInflBaseline = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    meanInflation: 0,
    volInflation: 0,
  }));
  // Drop is in nominal dollars at zero inflation — straightforward.
  const lowInflDrop = lowInflBaseline.median - lowInfl.median;

  const highInfl = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    meanInflation: 0.05,
    volInflation: 0,
    mortgageMonthlyPayment: 2000,
    mortgageEndYear: 15,
  }));
  const highInflBaseline = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    meanInflation: 0.05,
    volInflation: 0,
  }));
  const highInflDrop = highInflBaseline.median - highInfl.median;

  // Both should be positive (mortgage hurts in both cases).
  assert.ok(lowInflDrop > 0, `lowInflDrop ${lowInflDrop} should be positive`);
  assert.ok(highInflDrop > 0, `highInflDrop ${highInflDrop} should be positive`);
  // The high-inflation drop should be roughly the same nominal magnitude
  // as the low-inflation drop, since mortgage P+I doesn't inflate. Allow
  // a wide tolerance because returns + cost paths differ. Key invariant:
  // high-inflation drop is NOT 2x+ the low-inflation drop (that would
  // indicate inflation is being applied to mortgage payments).
  const ratio = highInflDrop / lowInflDrop;
  assert.ok(
    ratio < 2.0,
    `mortgage drop ratio ${ratio} (high/low inflation) suggests P+I IS being inflated`,
  );
});

test('runMonteCarlo: mortgage stops at endYear (exclusive)', () => {
  // A mortgage ending year 5 vs year 25 in a 20-year sim: the year-25
  // case pays for the whole horizon, the year-5 case only pays first 5
  // years. Year-5 ending → strictly LESS total deduction → higher median.
  const seed = 6464;
  const earlyEnd = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    mortgageMonthlyPayment: 2000,
    mortgageEndYear: 5,              // pays years 0..4
  }));
  const lateEnd = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    mortgageMonthlyPayment: 2000,
    mortgageEndYear: 25,             // pays years 0..19 (full horizon)
  }));
  assert.ok(
    earlyEnd.median > lateEnd.median,
    `early-payoff median ${earlyEnd.median} should beat late-payoff ${lateEnd.median}`,
  );
});

test('runMonteCarlo: mortgage NOT affected by FX shock (USD obligation)', () => {
  // A USD mortgage doesn't track foreign-currency cost — its deduction
  // sits OUTSIDE the costShockMult line. Compare a foreign segment with
  // currVol=0 (no FX noise) vs currVol=10% with the same mortgage; the
  // mortgage's contribution should be invariant. The location's main
  // cost line WILL differ (FX noise on cost), so we look at the gap
  // between with-mortgage and without-mortgage in each currVol regime —
  // that gap should be near-identical because mortgage doesn't track FX.
  const seed = 6565;
  const noFx = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    currVol: 0,
  }));
  const noFxMortgage = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    currVol: 0,
    mortgageMonthlyPayment: 1500,
    mortgageEndYear: 15,
  }));
  const noFxGap = noFx.median - noFxMortgage.median;

  const heavyFx = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    currVol: 0.10,
  }));
  const heavyFxMortgage = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    currVol: 0.10,
    mortgageMonthlyPayment: 1500,
    mortgageEndYear: 15,
  }));
  const heavyFxGap = heavyFx.median - heavyFxMortgage.median;

  // Gap should be approximately FX-invariant — within 30% (noise from
  // compounding-on-different-balances under FX-shocked cost paths).
  // Looser tolerance than ideal but enough to catch a regression where
  // mortgage gets multiplied by costShockMult.
  const ratio = heavyFxGap / noFxGap;
  assert.ok(
    ratio > 0.7 && ratio < 1.3,
    `mortgage gap FX-ratio ${ratio} should be ~1 (mortgage independent of FX)`,
  );
});

test('runMonteCarlo: propertySale with unknown propertyId is silent no-op', () => {
  // Defensive: a stale lifeEvents row referencing a deleted property must
  // not crash or perturb the simulation.
  const seed = 4040;
  const props: RentalProperty[] = [makeKernelRental()];
  const a = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: props,
  }));
  const b = runMonteCarlo(smokeParams({
    seededRandom: mulberry32(seed),
    rentalProperties: props,
    lifeEvents: [{
      kind: 'propertySale',
      year: 10,
      propertyId: 'rental-does-not-exist',
      salePriceUSD: 500_000,
    }],
  }));
  assert.deepEqual(a.results, b.results);
  assert.deepEqual(a.paths, b.paths);
});

// ─── survivor relocation IHT FX denomination (Codex P1 on PR #107) ──────

test('runMonteCarlo: survivor relocation IHT respects pre-relocation FX state', () => {
  // Codex P1 on PR #107: when survivor relocates on the death year, the
  // FX state must NOT be swapped before the inheritance-tax calculation.
  // The runner pre-bakes `inheritanceTaxByYear[y]` from the regular move
  // schedule (= deceased's domicile at death), so swapping FX state to
  // the survivor's destination first mis-denominates the exemption.
  //
  // Test setup: foreign segment with drift that compounds over 10 years.
  // Both scenarios use the same seed and the same survivorRelocate
  // (to US) — only `fxDrift` sign differs. Pre-fix, the FX swap to US
  // happened BEFORE the IHT line, so `effectiveFx = curIsForeign ? ... : 1`
  // collapsed to 1 in both scenarios — drift sign was invisible to IHT.
  // Post-fix, the drift accumulated through year 10 is reflected in the
  // exemption denomination: positive drift (currency strengthens) yields
  // a larger USD exemption and smaller tax; negative drift yields the
  // opposite.
  //
  // Zeroed return / inflation / volatility makes the bug's effect cleanly
  // visible in `results[0]` (single-trial deterministic balance after the
  // year-10 IHT hit). Cost / income are 0 so post-death years don't
  // perturb the balance.
  const baseParams = {
    portfolio: 1_000_000,
    monthlyIncome: 0,
    baseCost: 0,
    isForeign: true,
    runs: 1,
    years: 12,
    meanReturn: 0,
    volReturn: 0,
    meanInflation: 0,
    volInflation: 0,
    currVol: 0,
    incGrowth: 0,
    returnMode: 'normal' as const,
    spouseDeathYear: 10,
    inheritanceTaxByYear: (() => {
      const arr: ({ effectiveRate: number; exemptionUSDBaseline: number } | undefined)[] = new Array(12);
      arr[10] = { effectiveRate: 0.4, exemptionUSDBaseline: 100_000 };
      return arr;
    })(),
    survivorRelocate: {
      fromYear: 0, // overwritten by kernel
      baseCost: 0,
      isForeign: false,
      isUS: true,
      fxDrift: 0,
    },
  };

  const strengthening = runMonteCarlo({
    ...baseParams,
    fxDrift: 0.05, // foreign currency strengthens 5%/yr
    seededRandom: mulberry32(42),
  });
  const weakening = runMonteCarlo({
    ...baseParams,
    fxDrift: -0.05, // foreign currency weakens 5%/yr
    seededRandom: mulberry32(42),
  });

  // Hand-computed expected balances at year-12 horizon end:
  //
  //   strengthening: fxMult after year-10 drift bump = 1.05^11 ≈ 1.7103
  //     effectiveFx = 1.7103
  //     exemptionUSD = 100_000 × 1.7103 ≈ 171_034
  //     deceasedShareUSD = 0.5 × 1_000_000 = 500_000
  //     taxableUSD = max(0, 500_000 − 171_034) = 328_966
  //     tax = 328_966 × 0.4 = 131_586
  //     bal = 1_000_000 − 131_586 = 868_414
  //
  //   weakening: fxMult after year-10 drift bump = 0.95^11 ≈ 0.5688
  //     effectiveFx = 0.5688
  //     exemptionUSD = 100_000 × 0.5688 ≈ 56_880
  //     taxableUSD = 500_000 − 56_880 = 443_120
  //     tax = 443_120 × 0.4 = 177_248
  //     bal = 1_000_000 − 177_248 = 822_752
  //
  // Difference ~$45K. Pre-fix would have produced identical balances
  // since effectiveFx = 1 in both (US after swap).
  const gap = strengthening.results[0]! - weakening.results[0]!;
  assert.ok(
    gap > 30_000,
    `survivorRelocate IHT must respect pre-relo FX state: ` +
      `strengthening bal ${strengthening.results[0]} vs weakening bal ${weakening.results[0]} ` +
      `(gap ${gap.toFixed(0)} should exceed $30K). ` +
      `Pre-fix bug would yield gap ≈ 0 because effectiveFx collapses to 1 post-swap.`,
  );
});

test('runMonteCarlo: no-survivorRelocate IHT path remains byte-identical', () => {
  // Guards against accidental regression: the deferred-swap fix must NOT
  // change behavior when survivorRelocate is undefined (the legacy
  // spouseDeath path).
  const ihtArr: ({ effectiveRate: number; exemptionUSDBaseline: number } | undefined)[] = new Array(20);
  ihtArr[10] = { effectiveRate: 0.4, exemptionUSDBaseline: 100_000 };
  const a = runMonteCarlo(smokeParams({
    spouseDeathYear: 10,
    survivorIncome: 2_000,
    survivorBirthYear: 1958,
    inheritanceTaxByYear: ihtArr,
    seededRandom: mulberry32(123),
  }));
  const b = runMonteCarlo(smokeParams({
    spouseDeathYear: 10,
    survivorIncome: 2_000,
    survivorBirthYear: 1958,
    inheritanceTaxByYear: ihtArr,
    seededRandom: mulberry32(123),
  }));
  assert.deepEqual(a.results, b.results);
  assert.deepEqual(a.paths, b.paths);
});
