# Self-consistent per-location ACA MAGI & subsidy

## Problem

The ACA subsidy decision uses a MAGI that is **understated**, so it over-applies
subsidies:

1. The per-location need that drives MAGI uses the stored **Medicare** healthcare
   figure (`monthlyCosts.healthcare.typical`, e.g. $500) instead of the real
   **pre-Medicare ACA premium** (`healthcarePreMedicare`, e.g. $2,050). A
   pre-65 household actually has to withdraw enough to pay the ACA premium.
2. **Income tax** is not included in the need at all.
3. The **first (transition) year** ignores the pre-retirement income spike, so a
   mid-year retiree is shown as subsidized in a year their actual MAGI is high.

Net effect: households are shown below the 400% FPL cliff (subsidized) when
their real draw would put them above it (unsubsidized). And it **changes per
location** — a cheaper city needs smaller withdrawals → lower MAGI → may
genuinely qualify, while an expensive one does not.

## The circularity

```
Need  = NonHealthcare + Healthcare + Tax
MAGI  = taxablePortionOf(withdrawals to fund Need)   (Roth excluded)
Healthcare = unsubsidized if MAGI > cliff, else MAGI-capped subsidy
Tax        = brackets(taxable income from those withdrawals)
```

Healthcare and Tax both depend on MAGI, and MAGI depends on both — a fixed point
in `(Healthcare, Tax, MAGI)`.

## Algorithm — fixed-point iteration (per location, per phase)

Seed at the **unsubsidized** premium (the conservative bound — the user's
"test against unsubsidized first" instinct), then iterate to convergence:

```
H ← unsubsidized healthcare (full ACA sticker for pre-65 adults; Medicare cost for 65+)
T ← 0
repeat (max 12 iters):
  need      = (nonHealthcareMonthly + H + T) * 12
  residual  = max(0, need - ssAnnual - pensionAnnual)
  (trad, roth, taxable) = apportion(residual, strategy, balances)
  magi      = computeMagi({...income, trad, taxable, roth}).magiForAca + transitionExtra
  H'        = decideWithMagi(location, magi).monthlyCost     # cliff test inside
  T'        = computeIncomeTax(location, taxableBase(magi)).monthlyTax
  if |H'-H| < $1 and |T'-T| < $1: return {magi, H', T', subsidized: magi <= cliff}
  H, T = H', T'
```

**Convergence.** Starting from the max (unsubsidized) H:
- If `magi > cliff` even at full H → `decideWithMagi` returns the full sticker →
  H is unchanged → converges in 1–2 iterations (unsubsidized, self-consistent).
- If `magi <= cliff` → subsidized H is MAGI-capped and **monotonically**
  decreasing as H falls, so it converges (no oscillation in practice); the
  iteration cap + $1 tolerance bound it regardless.

## Transition (first) year — made explicit

ACA APTC is based on **estimated current-year MAGI**, reconciled at tax time —
not a prior-year lookback (that is Medicare IRMAA). But a mid-year retiree's
**actual** first-year MAGI includes pre-retirement W-2 / severance / final-year
RMDs, which usually clears the cliff. So:

- **Year 0 (transition):** `transitionExtra = transitionYearExtraIncome`. When
  the user has not entered a figure, **default the first year to unsubsidized**
  (assume year-0 MAGI is above the cliff) rather than silently granting a
  subsidy that reconciliation would claw back. Surface this in the UI with an
  input to override (e.g. "already-low first-year income").
- **Year 1+ (steady state):** `transitionExtra = 0`; MAGI is the converged
  steady-state draw for that location.

## Where it lives (dashboard-only)

- **`healthcare.service.ts`** — new `decideConsistent(location, {transition})`
  runs the fixed point (reuses existing `apportion` / `computeMagi` /
  `decideWithMagi`; injects `TaxService.computeIncomeTax`). `decideForLocation`
  delegates to it.
- **`monte-carlo-runner.service.ts`** — derives `magiAnnual` (steady) and
  `transitionMagiAnnual` (year-0) for the sim location from `decideConsistent`,
  and passes them to the kernel. **The kernel is unchanged** — it already reads
  those fields and applies the identical cliff formula, so the simulation and
  Compare agree by construction.
- **`location-compare.component.ts`** — consumes the consistent decision; its
  "if subsidized / worst-case" rows simplify to reading the converged result.

No change to `monte-carlo.ts` (the kernel) → no `engine:sync` / API redeploy.

## Edge cases

- **All-Medicare household** (both 65+): no ACA path; H = Medicare cost,
  subsidy logic inert; fixed point converges in 1 iteration.
- **Mixed ages**: per-adult blend (Medicare adults + ACA adults) already in
  `decideWithMagi`; the loop wraps it unchanged.
- **Roth-only draw**: Roth withdrawals don't hit MAGI, so a household funding
  the gap from Roth can stay subsidized — the apportionment already models this.
- **Territories** (`premiumCapPctOfIncome = 0`): off-marketplace, always full
  sticker; loop converges immediately.
- **Convergence failure**: after 12 iters, return the last (unsubsidized-biased)
  estimate — fails safe toward the conservative number.

## Tests

- Solver unit tests: above-cliff → unsubsidized + self-consistent; below-cliff →
  subsidized + converged; transition year → unsubsidized by default; Roth-buffer
  keeps subsidy; all-Medicare path.
- Runner: `magiAnnual` from `decideConsistent` reproduces the kernel's healthcare
  cost for the same location (Compare ↔ sim parity).
