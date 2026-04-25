/**
 * FIRE / Guyton-Klinger guardrail constants and helpers.
 *
 * Single source of truth — previously duplicated across report-screen and
 * guardrails-screen with divergent constant names (BASE_RATE / FLOOR_RATE /
 * CEILING_RATE vs FIRE_WITHDRAWAL_RATE / GUARDRAIL_FLOOR / GUARDRAIL_CEILING).
 */

/** The 4% rule. Annual safe withdrawal as a fraction of initial portfolio. */
export const FIRE_WITHDRAWAL_RATE = 0.04;

/** Guyton-Klinger floor — never withdraw less than this fraction of portfolio. */
export const GUARDRAIL_FLOOR_RATE = 0.03;

/** Guyton-Klinger ceiling — never withdraw more than this fraction of portfolio. */
export const GUARDRAIL_CEILING_RATE = 0.055;

/**
 * FIRE target portfolio for a given annual spend, using the 4% rule.
 * Returns 0 for non-positive spend.
 */
export function fireNumber(annualSpend: number): number {
  return annualSpend > 0 ? annualSpend / FIRE_WITHDRAWAL_RATE : 0;
}
