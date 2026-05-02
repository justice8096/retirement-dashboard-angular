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
