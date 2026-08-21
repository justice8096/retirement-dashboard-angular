import {
  calcFixedPercentageWithdrawal,
  calcConstantPercentageWithdrawal,
  calcGuardrailsWithdrawal,
  calcVPWWithdrawal,
  calcBucketWithdrawal,
  calcFloorCeilingWithdrawal,
  calcCAPEWithdrawal,
} from '@retirement/shared/withdrawalStrategies.js';

/**
 * Multi-strategy withdrawal comparison + year-by-year projection (A4 parity
 * port #10).
 *
 * Ports the comparison calculator from the retired React app's
 * `WithdrawalTab.tsx` (per-strategy knobs + a 30-year projection table for
 * one selected strategy) and `WithdrawalStrategyTab.tsx` (side-by-side
 * summary across several strategies at once). All strategy math is
 * delegated to `@retirement/shared/withdrawalStrategies.js` — the same
 * dispatcher-backed library the API's `/api/me/withdrawal` route persists
 * against — rather than re-derived here.
 *
 * Strategy-set note: the A4 audit's deep-check line (`a4-parity-gaps.md`
 * row for WithdrawalStrategyTab/WithdrawalTab) says `WithdrawalTab` "compares
 * 7 methods... side by side", including `calcCAPEWithdrawal`. That function
 * originally only existed in a divergent copy of this package under
 * `retirement-dashboard/shared/` that this app never depended on (its
 * `package.json` resolves `@retirement/shared` to `retirement-api/shared`,
 * which lacked the export) — it has since been ported into the canonical
 * `retirement-api/shared/withdrawalStrategies.js` (see that package's
 * `feat(shared): port calcCAPEWithdrawal...` commit), so all 7 strategies
 * are now available here, called the same way as the other six.
 *
 * Note the API's persisted-strategy schema (`retirement-api/src/routes/
 * withdrawal.ts` `STRATEGY_TYPES`) still omits `'cape'` — a user can compare
 * it here but can't yet save it as their strategy of record. That's fine
 * for this exploratory comparison (see the "no save-back" note below), but
 * worth tracking separately if `/api/me/withdrawal` should grow a `cape`
 * strategy type.
 *
 * Bug fix vs. the retired React source: `WithdrawalTab.tsx`'s strategy
 * switch had no `case 'guardrails'` at all — selecting the guardrails card
 * silently fell through to the `default` branch (plain `portfolio * fixedRate`),
 * so `calcGuardrailsWithdrawal` was imported but never actually invoked.
 * This port wires it up for real, carrying `currentWithdrawal` forward
 * year-over-year as the shared function's own contract requires.
 *
 * Bug fix vs. the retired React source: the bucket strategy's "Bucket 1/2
 * Years" inputs were rendered but never fed into the math — bucket balances
 * were always an even three-way split of the current portfolio, regardless
 * of the years knobs. This port sizes buckets the way the persisted
 * `WithdrawalStrategy.bucket1Years`/`bucket2Years` fields and the API's
 * `bucket_strategy` glossary entry both describe it: bucket 1 and 2 hold
 * that many years of annual spending, with the remainder in bucket 3.
 */

export type ComparisonStrategy =
  | 'fixed'
  | 'constant'
  | 'guardrails'
  | 'vpw'
  | 'bucket'
  | 'floor-ceiling'
  | 'cape';

/** All strategies this comparison supports, in display order. The first
 *  six match the persisted `WithdrawalStrategy.strategyType` union exactly;
 *  `cape` does not (see the file header note) — comparable here, but not
 *  yet save-able as the user's strategy of record. */
export const COMPARISON_STRATEGIES: ComparisonStrategy[] = [
  'fixed',
  'constant',
  'guardrails',
  'vpw',
  'bucket',
  'floor-ceiling',
  'cape',
];

/** Plain-language card labels — fallback text when the glossary hasn't
 *  loaded yet or a term is missing. Prefer `GlossaryService` definitions
 *  over these where available (Dashboard Dyscalculia F-007). */
export const STRATEGY_LABELS: Record<ComparisonStrategy, string> = {
  fixed: 'Fixed Percentage',
  constant: 'Constant Percentage',
  guardrails: 'Guardrails (Guyton-Klinger)',
  vpw: 'Variable Percentage (VPW)',
  bucket: 'Bucket Strategy',
  'floor-ceiling': 'Floor & Ceiling',
  cape: 'CAPE-Based (Shiller PE)',
};

/** Every strategy-specific knob this comparison exposes. Rate fields are
 *  decimal fractions (0.04 = 4%), matching the API's withdrawal-route
 *  convention. Amount fields are whole currency units. */
export interface StrategyKnobs {
  fixedWithdrawalRate: number;
  constantWithdrawalRate: number;
  /** Year-1 withdrawal rate guardrails starts from, before the ceiling/floor
   *  bands take over in later years. The retired React tab never actually
   *  seeded this (see file header) — 4% matches the classic-rule default
   *  used elsewhere in this app (`WithdrawalStrategyTab.tsx`'s local
   *  guardrails simulation, `fire-math.ts`'s `FIRE_WITHDRAWAL_RATE`). */
  guardrailsInitialRate: number;
  guardrailsFloorRate: number;
  guardrailsCeilingRate: number;
  guardrailsAdjustmentPct: number;
  /** Years of annual spending held in bucket 1 (cash). */
  bucket1Years: number;
  /** Years of annual spending held in bucket 2 (bonds). */
  bucket2Years: number;
  /** Multiplier of annual spending that triggers a bucket-1 refill from
   *  bucket 2 (shared lib's own semantics — see `calcBucketWithdrawal`). */
  bucketRefillThreshold: number;
  floorGuaranteedIncome: number;
  floorEssentialSpending: number;
  floorDiscretionaryBudget: number;
  floorMaxDiscretionaryRate: number;
  /** Shiller CAPE (cyclically-adjusted P/E) ratio input. */
  capeRatio: number;
  /** Weight applied to 1/capeRatio in the CAPE rate formula. */
  capeMultiplier: number;
  /** Constant added to the CAPE-derived rate, decimal fraction. */
  capeFixedComponent: number;
  /** Minimum CAPE withdrawal rate, decimal fraction. */
  capeFloorRate: number;
  /** Maximum CAPE withdrawal rate, decimal fraction. */
  capeCeilingRate: number;
}

/** Default knobs — one-to-one with the retired React `WithdrawalTab.tsx`'s
 *  `useState` initial values, except `guardrailsInitialRate` (added; see
 *  the `StrategyKnobs` doc comment above). */
export const DEFAULT_KNOBS: StrategyKnobs = {
  fixedWithdrawalRate: 0.04,
  constantWithdrawalRate: 0.05,
  guardrailsInitialRate: 0.04,
  guardrailsFloorRate: 0.03,
  guardrailsCeilingRate: 0.06,
  guardrailsAdjustmentPct: 0.1,
  bucket1Years: 2,
  bucket2Years: 7,
  bucketRefillThreshold: 1,
  floorGuaranteedIncome: 30_000,
  floorEssentialSpending: 50_000,
  floorDiscretionaryBudget: 30_000,
  floorMaxDiscretionaryRate: 0.05,
  capeRatio: 30,
  capeMultiplier: 0.5,
  capeFixedComponent: 0.015,
  capeFloorRate: 0.02,
  capeCeilingRate: 0.06,
};

/** Annual return-rate assumption per bucket (cash / bonds / growth) —
 *  matches the retired React `WithdrawalTab.tsx`'s hardcoded 2% / 5% / 7%.
 *  Not exposed as a knob; neither was it in the React source. */
const BUCKET_RETURN_RATES: readonly [number, number, number] = [0.02, 0.05, 0.07];

export interface ProjectionYearRow {
  year: number;
  age: number | null;
  withdrawal: number;
  /** Decimal fraction: withdrawal / portfolioStart (0 when portfolioStart is 0). */
  effectiveRate: number;
  portfolioStart: number;
  portfolioEnd: number;
}

export interface StrategyProjection {
  strategy: ComparisonStrategy;
  rows: ProjectionYearRow[];
  year1Withdrawal: number;
  finalBalance: number;
  /** Count of projected years that ended with a positive balance. */
  yearsFunded: number;
  /** True when the portfolio hit zero before the projection horizon ended. */
  depleted: boolean;
}

export interface ProjectionInput {
  strategy: ComparisonStrategy;
  initialPortfolio: number;
  /** Annual spending need. Only consumed by the `bucket` strategy (bucket
   *  sizing + the shared lib's own `annualSpending` param) — matches how
   *  the retired React `WithdrawalTab.tsx` actually used this field; the
   *  other strategies derive withdrawals from the portfolio and their own
   *  dedicated knobs (e.g. floor-ceiling's essential/discretionary knobs). */
  annualSpending: number;
  startAge: number | null;
  startYear: number;
  yearsToProject: number;
  /** Decimal fraction, e.g. 0.05 for 5%. */
  expectedReturn: number;
  /** Decimal fraction, e.g. 0.03 for 3%. */
  inflationRate: number;
  knobs: StrategyKnobs;
}

/** Run one strategy's year-by-year projection. All strategy math comes from
 *  `@retirement/shared/withdrawalStrategies.js`; this function only carries
 *  state between years (guardrails' running withdrawal, bucket balances)
 *  and applies the shared portfolio-growth model each year. */
export function projectStrategy(input: ProjectionInput): StrategyProjection {
  const {
    strategy,
    initialPortfolio,
    annualSpending,
    startAge,
    startYear,
    yearsToProject,
    expectedReturn,
    inflationRate,
    knobs,
  } = input;

  const rows: ProjectionYearRow[] = [];
  let portfolio = initialPortfolio;

  // Guardrails carries its own withdrawal amount forward across years.
  const guardrailsInitialWithdrawal = initialPortfolio * knobs.guardrailsInitialRate;
  let guardrailsWithdrawal = guardrailsInitialWithdrawal;

  // Bucket strategy carries its own 3-bucket state, sized in years-of-spending.
  let buckets: Array<{ balance: number; returnRate: number }> | null = null;
  if (strategy === 'bucket') {
    const bucket1Target = Math.max(0, knobs.bucket1Years) * annualSpending;
    const bucket2Target = Math.max(0, knobs.bucket2Years) * annualSpending;
    const bucket1 = Math.min(bucket1Target, initialPortfolio);
    const remainingAfterB1 = Math.max(0, initialPortfolio - bucket1);
    const bucket2 = Math.min(bucket2Target, remainingAfterB1);
    const bucket3 = Math.max(0, remainingAfterB1 - bucket2);
    buckets = [
      { balance: bucket1, returnRate: BUCKET_RETURN_RATES[0] },
      { balance: bucket2, returnRate: BUCKET_RETURN_RATES[1] },
      { balance: bucket3, returnRate: BUCKET_RETURN_RATES[2] },
    ];
  }

  for (let y = 0; y < yearsToProject; y++) {
    const year = startYear + y;
    const age = startAge !== null ? startAge + y : null;
    const portfolioStart = portfolio;
    let withdrawal: number;

    switch (strategy) {
      case 'fixed': {
        const r = calcFixedPercentageWithdrawal(
          initialPortfolio,
          y,
          0,
          inflationRate,
          knobs.fixedWithdrawalRate,
        );
        withdrawal = r.amount;
        break;
      }
      case 'constant': {
        const r = calcConstantPercentageWithdrawal(portfolio, knobs.constantWithdrawalRate);
        withdrawal = r.amount;
        break;
      }
      case 'guardrails': {
        if (y > 0) {
          const r = calcGuardrailsWithdrawal({
            currentPortfolio: portfolio,
            initialWithdrawal: guardrailsInitialWithdrawal,
            currentWithdrawal: guardrailsWithdrawal,
            initialPortfolio,
            ceilingRate: knobs.guardrailsCeilingRate,
            floorRate: knobs.guardrailsFloorRate,
            adjustmentPercent: knobs.guardrailsAdjustmentPct,
            inflationRate,
          });
          guardrailsWithdrawal = r.amount;
        }
        withdrawal = guardrailsWithdrawal;
        break;
      }
      case 'vpw': {
        const r = calcVPWWithdrawal(portfolio, age ?? 65);
        withdrawal = r.amount;
        break;
      }
      case 'bucket': {
        const r = calcBucketWithdrawal({
          buckets: buckets!,
          annualSpending,
          refillThreshold: knobs.bucketRefillThreshold,
        });
        withdrawal = r.amount;
        buckets = r.buckets.map((b: { balance: number }, i: number) => ({
          balance: b.balance,
          returnRate: BUCKET_RETURN_RATES[i]!,
        }));
        break;
      }
      case 'floor-ceiling': {
        const r = calcFloorCeilingWithdrawal({
          guaranteedIncome: knobs.floorGuaranteedIncome,
          essentialSpending: knobs.floorEssentialSpending,
          discretionaryBudget: knobs.floorDiscretionaryBudget,
          currentPortfolio: portfolio,
          maxDiscretionaryRate: knobs.floorMaxDiscretionaryRate,
        });
        withdrawal = r.amount;
        break;
      }
      case 'cape': {
        const r = calcCAPEWithdrawal({
          currentPortfolio: portfolio,
          capeRatio: knobs.capeRatio,
          capeMultiplier: knobs.capeMultiplier,
          fixedComponent: knobs.capeFixedComponent,
          floorRate: knobs.capeFloorRate,
          ceilingRate: knobs.capeCeilingRate,
        });
        withdrawal = r.amount;
        break;
      }
    }

    const effectiveRate = portfolioStart > 0 ? withdrawal / portfolioStart : 0;

    let portfolioEnd: number;
    if (strategy === 'bucket' && buckets) {
      // Bucket balances already reflect this year's withdrawal (and any
      // refill — which only moves money between buckets, not the total).
      // Grow each bucket at its own return rate, then report the sum, so
      // the displayed portfolio balance stays consistent with the same
      // bucket state that actually drove this year's withdrawal — rather
      // than a second, disconnected balance grown at the blanket
      // "Expected Return" input. (An earlier version of this port made
      // that mistake: it tracked the buckets' own 2%/5%/7% growth
      // internally for withdrawal math, but reported a totally separate
      // top-level balance grown at the single "Expected Return" knob,
      // so the two would silently diverge year over year.)
      buckets = buckets.map((b) => ({ ...b, balance: b.balance * (1 + b.returnRate) }));
      portfolioEnd = Math.max(0, buckets.reduce((sum, b) => sum + b.balance, 0));
    } else {
      portfolioEnd = Math.max(0, (portfolio - withdrawal) * (1 + expectedReturn));
    }

    rows.push({ year, age, withdrawal, effectiveRate, portfolioStart, portfolioEnd });

    portfolio = portfolioEnd;
  }

  const finalBalance = rows.length ? rows[rows.length - 1]!.portfolioEnd : initialPortfolio;

  return {
    strategy,
    rows,
    year1Withdrawal: rows[0]?.withdrawal ?? 0,
    finalBalance,
    yearsFunded: rows.filter((r) => r.portfolioEnd > 0).length,
    depleted: finalBalance <= 0,
  };
}

/** Run all (or a subset of) the comparison strategies against the same
 *  common inputs, each with its own knobs. */
export function compareStrategies(
  strategies: ComparisonStrategy[],
  base: Omit<ProjectionInput, 'strategy'>,
): StrategyProjection[] {
  return strategies.map((strategy) => projectStrategy({ ...base, strategy }));
}
