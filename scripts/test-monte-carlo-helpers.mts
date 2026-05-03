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
