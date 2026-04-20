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
 *   magi-targeted  — fill taxable + traditional only up to `magiCeiling`
 *                    (minus an optional `magiBuffer`), then pull the rest
 *                    from Roth. Used to stay under the ACA-cliff MAGI
 *                    threshold while still meeting the residual cash need.
 *                    Requires `magiCeiling` + existing MAGI baseline in
 *                    `opts`. Falls back to tax-efficient when `magiCeiling`
 *                    is not provided.
 *
 *   manual         — not handled here; caller decides apportionment by hand.
 */

export type ApportionStrategy =
  | 'proportional'
  | 'tax-efficient'
  | 'magi-targeted'
  | 'manual';

export interface AccountBalances {
  traditional: number;
  roth: number;
  taxable: number;
}

export interface ApportionOptions {
  /** Annual MAGI ceiling to stay under (e.g. 400% FPL for the household).
   *  Required for the `magi-targeted` strategy; ignored otherwise. */
  magiCeiling?: number;
  /** Dollars of headroom to keep below `magiCeiling` — absorbs next
   *  year's cola/inflation drift without tripping the cliff. Default 5000. */
  magiBuffer?: number;
  /** Baseline MAGI already in play from non-drawable sources (SS, pension,
   *  dividends). MAGI-counted draws (taxable capital gains + traditional
   *  withdrawals) are added to this to compute the stop-line. Default 0. */
  magiBaseline?: number;
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
  opts: ApportionOptions = {},
): ApportionResult {
  if (residual <= 0) return { trad: 0, roth: 0, tax: 0 };

  const { traditional, roth: rothBal, taxable } = balances;
  const total = traditional + rothBal + taxable;

  if (strategy === 'tax-efficient' || strategy === 'magi-targeted') {
    // Classic "draw taxable first" order: taxable → traditional → Roth.
    // Each cap = account balance. Never dilutes Roth when other accounts
    // can cover the need.
    //
    // For `magi-targeted`, cap the combined taxable+trad draw so the
    // running MAGI (baseline + taxable draws + traditional draws) stays
    // under `magiCeiling - magiBuffer`. Everything above that line goes
    // to Roth, which doesn't count toward MAGI.
    let left = residual;
    let tax = Math.min(left, Math.max(0, taxable));
    left -= tax;
    let trad = Math.min(left, Math.max(0, traditional));
    left -= trad;

    if (strategy === 'magi-targeted' && opts.magiCeiling != null) {
      const buffer = opts.magiBuffer ?? 5000;
      const baseline = opts.magiBaseline ?? 0;
      // Budget of MAGI-counted draw remaining under the stop-line.
      const magiBudget = Math.max(0, opts.magiCeiling - buffer - baseline);
      const magiDraw = tax + trad;
      if (magiDraw > magiBudget) {
        // Push the overshoot back to Roth. Prefer pulling from traditional
        // first (keeps the taxable draw intact as a baseline) since
        // reducing traditional usually has the smaller tax penalty trade.
        const overshoot = magiDraw - magiBudget;
        const tradPullback = Math.min(overshoot, trad);
        trad -= tradPullback;
        left += tradPullback;
        const stillOver = overshoot - tradPullback;
        if (stillOver > 0) {
          const taxPullback = Math.min(stillOver, tax);
          tax -= taxPullback;
          left += taxPullback;
        }
      }
    }

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
