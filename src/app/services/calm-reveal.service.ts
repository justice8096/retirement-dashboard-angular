import { Injectable, signal } from '@angular/core';

/**
 * Generic step-counter for "calm-mode" progressive reveal of multi-card
 * sections. Originally extracted from the Monte Carlo results section
 * (Dyscalculia F-006) where the user steps through outcome cards one at a
 * time instead of being shown all at once.
 *
 * Component-scoped, not providedIn: 'root', so each consumer gets an
 * independent step counter — different screens revealing simultaneously
 * don't trample each other's progress.
 *
 * Deliberately neutral about the *gating* signal (i.e. whether calm mode
 * is enabled). Each consumer wires its own predicate by combining
 * `step()` with a screen-specific accommodation toggle, e.g.:
 *
 *   showStep(n: number): boolean {
 *     return !this.dyscalc.isCalmMc() || this.calm.step() >= n;
 *   }
 *
 * Reset is also caller-driven — typically via an effect that watches
 * the screen's "results loaded" signal and calls `reset(1)` on each new
 * outcome.
 */
@Injectable()
export class CalmRevealService {
  private readonly _step = signal(1);
  private _max = 1;

  /** Read-only view of the current reveal step. */
  readonly step = this._step.asReadonly();

  /** Configure the maximum step. Call once on init (or whenever the card
   *  count changes — e.g. if a screen conditionally adds/removes cards). */
  setMax(n: number): void { this._max = Math.max(1, n); }

  /** Total step count, for "Step X of Y" UI. */
  max(): number { return this._max; }

  /** Reset to a starting step, typically 1. Call on new outcome. */
  reset(initial = 1): void {
    this._step.set(Math.min(Math.max(1, initial), this._max));
  }

  /** Reveal the next card. No-op once at max. */
  next(): void {
    this._step.update(s => Math.min(s + 1, this._max));
  }

  /** Skip to fully-revealed state. */
  all(): void {
    this._step.set(this._max);
  }
}
