/// <reference lib="webworker" />

/**
 * Dedicated Monte Carlo worker (A4 parity port #2, `a4-parity-gaps.md`
 * deep check #2). Runs the kernel entirely off the main thread so a
 * large `runs`/`years` configuration no longer freezes input,
 * scrolling, and animation for the run's duration — the gap the React
 * app's `montecarlo.worker.ts` closed but the Angular port initially
 * dropped (it ran the kernel synchronously inside a `setTimeout`).
 *
 * Message protocol — see `../lib/monte-carlo-worker-protocol.ts`:
 *   in:  `{ params, seed? }` — `params` is plain structured-cloneable
 *        data; `seed`, if present, is a plain number, never a function.
 *   out: `{ result }` on success, `{ error: message }` on throw.
 *
 * `seededRandom` never crosses this boundary as a function — functions
 * aren't structured-cloneable. When the caller wants a reproducible
 * run it sends a numeric `seed`; this worker reconstructs
 * `seededRandom = mulberry32(seed)` itself before calling the kernel.
 * Every other field the runner builds (segments, life events, per-year
 * arrays, the regime config, etc.) is already plain data, so it
 * crosses unmodified.
 */
import { runMonteCarlo, mulberry32 } from '@retirement/shared/engine/monte-carlo.js';
import type { MonteCarloWorkerRequest, MonteCarloWorkerResponse } from '../lib/monte-carlo-worker-protocol';

addEventListener('message', ({ data }: MessageEvent<MonteCarloWorkerRequest>) => {
  try {
    const { params, seed } = data;
    const result = runMonteCarlo(
      seed != null ? { ...params, seededRandom: mulberry32(seed) } : params,
    );
    const response: MonteCarloWorkerResponse = { result };
    postMessage(response);
  } catch (err) {
    const response: MonteCarloWorkerResponse = {
      error: err instanceof Error ? err.message : String(err),
    };
    postMessage(response);
  }
});
