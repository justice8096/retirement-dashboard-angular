import type { MonteCarloParams, MonteCarloResult } from '@retirement/shared/engine/monte-carlo.js';

/**
 * Message protocol between `MonteCarloRunnerService` and
 * `workers/monte-carlo.worker.ts` (A4 parity port #2 — real Web Worker
 * instead of a main-thread `setTimeout`).
 *
 * CRITICAL: `params` must never carry a `seededRandom` function.
 * Functions are not structured-cloneable, so `postMessage`/`Worker`
 * would silently drop it (Chrome/Firefox turn it into `null`; some
 * engines throw `DataCloneError`). Reproducible runs cross the
 * boundary as a plain numeric `seed` instead — the worker reconstructs
 * `seededRandom = mulberry32(seed)` on its own side (see the worker
 * file). Every other field the runner builds today (segments, life
 * events, per-year arrays, the regime config, etc.) is already plain
 * data — numbers, strings, booleans, plain objects/arrays, and
 * `undefined` — all of which structured-clone cleanly.
 */
export interface MonteCarloWorkerRequest {
  params: Omit<MonteCarloParams, 'seededRandom'>;
  /** Numeric seed for a reproducible run. Omitted (or `undefined`) for
   *  ordinary production runs, which stay non-deterministic — matching
   *  today's behavior where the kernel falls back to `Math.random`. */
  seed?: number;
}

export type MonteCarloWorkerResponse =
  | { result: MonteCarloResult; error?: undefined }
  | { error: string; result?: undefined };

/**
 * Builds the exact message object posted to the worker. Strips any
 * `seededRandom` the caller might have attached to `params` — a
 * function is never allowed to cross the boundary — and carries the
 * seed as a plain number field instead.
 */
export function buildWorkerRequest(
  params: MonteCarloParams,
  seed?: number,
): MonteCarloWorkerRequest {
  const { seededRandom: _drop, ...cloneableParams } = params;
  return seed != null ? { params: cloneableParams, seed } : { params: cloneableParams };
}

/**
 * True when `value` has no function- or symbol-valued property at any
 * depth — i.e. it's safe to pass through `structuredClone` / a
 * `postMessage` boundary. Dates, RegExps, arrays, plain objects,
 * `undefined`, and cyclic references are all fine (structured clone
 * handles them); only functions and symbols aren't cloneable and would
 * be silently dropped or throw.
 *
 * Used by tests to assert the worker request never regresses to
 * carrying a live RNG function (or any other non-cloneable value).
 */
export function isStructuredCloneable(value: unknown, seen: Set<unknown> = new Set()): boolean {
  if (value === null) return true;
  const t = typeof value;
  if (t === 'function' || t === 'symbol') return false;
  if (t !== 'object') return true; // string, number, boolean, bigint, undefined
  if (seen.has(value)) return true; // cyclic reference — structuredClone handles this fine
  seen.add(value);
  if (value instanceof Date || value instanceof RegExp) return true;
  if (Array.isArray(value)) {
    return value.every(v => isStructuredCloneable(v, seen));
  }
  return Object.values(value as Record<string, unknown>).every(v => isStructuredCloneable(v, seen));
}
