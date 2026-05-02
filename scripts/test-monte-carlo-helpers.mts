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
