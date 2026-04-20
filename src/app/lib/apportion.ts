/**
 * Apportion a residual annual cash need across Traditional / Roth / Taxable
 * buckets. Extracted from HealthcareService so the math can be unit-tested
 * and verified independently of the UI.
 *
 *   proportional   — split by account-balance ratio (preserves current mix).
 *                    If every balance is zero, fall back to Traditional.
 *
 *   tax-efficient  — fill Taxable first, then Traditional, then Roth last.
 *                    Each account capped by its actual balance. Roth is the
 *                    last-resort draw because it grows tax-free with no
 *                    RMDs — preserving it maximises after-tax longevity.
 *                    If balances can't cover the residual, the remainder
 *                    overflows into Roth (then Traditional if Roth also
 *                    empty). All-zero fallback matches proportional:
 *                    Traditional absorbs the full residual.
 *
 *   manual         — not handled here; caller decides apportionment by hand.
 */

export type ApportionStrategy = 'proportional' | 'tax-efficient' | 'manual';

export interface AccountBalances {
  traditional: number;
  roth: number;
  taxable: number;
}

export interface ApportionResult {
  trad: number;
  roth: number;
  tax: number;
}

export function apportion(
  residual: number,
  strategy: ApportionStrategy,
  balances: AccountBalances,
): ApportionResult {
  if (residual <= 0) return { trad: 0, roth: 0, tax: 0 };

  const { traditional, roth: rothBal, taxable } = balances;
  const total = traditional + rothBal + taxable;

  if (strategy === 'tax-efficient') {
    // Classic "draw taxable first" order: taxable → traditional → Roth.
    // Each cap = account balance. Never dilutes Roth when other accounts
    // can cover the need.
    let left = residual;
    const tax = Math.min(left, Math.max(0, taxable));
    left -= tax;
    const trad = Math.min(left, Math.max(0, traditional));
    left -= trad;
    const rothDraw = Math.min(left, Math.max(0, rothBal));
    left -= rothDraw;
    // Residual still uncovered (every account empty or insufficient).
    // Put the overflow in Traditional to match the proportional fallback —
    // gives a deterministic, balanced answer rather than silently shorting
    // the user.
    const trad2 = trad + left;
    return { trad: trad2, roth: rothDraw, tax };
  }

  // Proportional (default)
  if (total <= 0) return { trad: residual, roth: 0, tax: 0 };
  return {
    trad: residual * (traditional / total),
    roth: residual * (rothBal / total),
    tax:  residual * (taxable / total),
  };
}
