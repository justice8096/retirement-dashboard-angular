import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@retirement/shared/engine/monte-carlo.js';
import type { MonteCarloParams } from '@retirement/shared/engine/monte-carlo.js';
import { buildWorkerRequest, isStructuredCloneable } from './monte-carlo-worker-protocol';

/**
 * A4 parity port #2 (Monte Carlo real Web Worker). The whole point of
 * `buildWorkerRequest` is to guarantee the object posted to the worker
 * can survive `postMessage`'s structured-clone algorithm — in
 * particular that a `seededRandom` function never crosses the
 * boundary (functions aren't cloneable; a seed does the same job as a
 * plain number instead). These tests exercise a representative params
 * object — including the seeded case a test harness or a future
 * reproducibility feature would use — and assert the resulting
 * request is fully cloneable.
 */

/** Representative kernel params covering the field shapes the runner
 *  actually builds: scalars, an optional segment schedule, per-year
 *  arrays with holes, nested objects (regime), and arrays of plain
 *  objects (life events). Not exhaustive of every optional field —
 *  just enough shape diversity to catch a stray function/class
 *  instance slipping into the message. */
function representativeParams(): MonteCarloParams {
  return {
    portfolio: 1_000_000,
    monthlyIncome: 4_000,
    baseCost: 5_000,
    isForeign: true,
    fxDrift: 0.01,
    runs: 500,
    years: 30,
    meanReturn: 0.07,
    volReturn: 0.15,
    meanInflation: 0.025,
    volInflation: 0.01,
    currVol: 0.05,
    incGrowth: 0.02,
    returnMode: 'normal',
    historicalStartYear: 1990,
    moveSchedule: [
      { fromYear: 0, baseCost: 5_000, isForeign: true, label: 'Panama City' },
      { fromYear: 10, baseCost: 4_000, isForeign: false, label: 'Austin' },
    ],
    oneTimeExpenses: [{ year: 5, amountUSD: 20_000, label: 'Roof', inflate: true }],
    lifeEvents: [{ kind: 'careerChange', year: 3, newMonthlyIncome: 5_000 }],
    adultBirthYears: [1960, 1962],
    simStartYear: 2026,
    magiAnnual: 80_000,
    transitionMagiAnnual: undefined,
    subsidyRegime: 'enhanced',
    medicareMonthlyByYear: [undefined, undefined, 850, undefined],
    petCostByYear: [1200, 1236, 1273],
    dependentCostByYear: undefined,
    regime: {
      bullMean: 0.12,
      bullVol: 0.12,
      bearMean: -0.12,
      bearVol: 0.22,
      pBullToBear: 0.15,
      pBearToBull: 0.45,
    },
  } as unknown as MonteCarloParams;
}

describe('isStructuredCloneable', () => {
  it('accepts plain data: numbers, strings, booleans, undefined, nested objects/arrays', () => {
    expect(isStructuredCloneable(representativeParams())).toBe(true);
  });

  it('rejects a function anywhere in the tree', () => {
    const withFn = { ...representativeParams(), seededRandom: mulberry32(1) };
    expect(isStructuredCloneable(withFn)).toBe(false);
  });

  it('rejects a nested function (e.g. inside an array element)', () => {
    const nested = { moveSchedule: [{ fromYear: 0, callback: () => 1 }] };
    expect(isStructuredCloneable(nested)).toBe(false);
  });

  it('rejects a symbol value', () => {
    expect(isStructuredCloneable({ tag: Symbol('x') })).toBe(false);
  });

  it('tolerates cyclic references (structuredClone supports them)', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj['self'] = obj;
    expect(isStructuredCloneable(obj)).toBe(true);
  });
});

describe('buildWorkerRequest', () => {
  it('produces a fully cloneable message for a representative params object', () => {
    const req = buildWorkerRequest(representativeParams());
    expect(isStructuredCloneable(req)).toBe(true);
    expect(req.seed).toBeUndefined();
  });

  it('drops a caller-supplied seededRandom function and carries a numeric seed instead', () => {
    const paramsWithFn = { ...representativeParams(), seededRandom: mulberry32(42) };
    const req = buildWorkerRequest(paramsWithFn, 42);

    // The seed crosses as a plain number...
    expect(req.seed).toBe(42);
    expect(typeof req.seed).toBe('number');
    // ...and the function itself never makes it into the message.
    expect('seededRandom' in req.params).toBe(false);
    expect(isStructuredCloneable(req)).toBe(true);
  });

  it('round-trips through the real structuredClone API used by postMessage', () => {
    // jsdom/Node both implement global structuredClone — the same
    // algorithm the browser's postMessage uses to hand data to a
    // Worker. If buildWorkerRequest ever regressed to including a
    // function, this call would throw a DataCloneError.
    const paramsWithFn = { ...representativeParams(), seededRandom: mulberry32(7) };
    const req = buildWorkerRequest(paramsWithFn, 7);
    expect(() => structuredClone(req)).not.toThrow();
    const cloned = structuredClone(req);
    expect(cloned.seed).toBe(7);
    expect(cloned.params.portfolio).toBe(1_000_000);
  });
});
