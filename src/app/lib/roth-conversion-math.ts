import type { TaxBracket } from '@retirement/shared/engine/types.js';

/**
 * Roth-conversion tax math (A4 parity port #7).
 *
 * Ports two things from the retired React app's `RothConversionTab.tsx` +
 * `RothPlannerTab.tsx` (the A4 audit merged both into one row):
 *
 *   1. `conversionBracketBreakdown` — a genuinely progressive per-bracket
 *      chunk breakdown of the tax owed on a conversion. Neither React tab
 *      actually did this correctly: `RothConversionTab` applied the *top*
 *      marginal rate to the whole conversion-caused income delta (wrong
 *      when the conversion spans more than one bracket), and
 *      `RothPlannerTab` defined a per-bracket `calcTaxOnIncome` helper but
 *      never called it — the schedule used a flat user-set
 *      `currentTaxBracket * conversionThisYear` instead. This port fixes
 *      both: it walks every bracket the conversion touches and taxes each
 *      chunk at its own rate.
 *
 *   2. `buildDepletionSchedule` — the year-by-year Traditional -> Roth
 *      depletion table, matching the shape of `RothPlannerTab`'s
 *      `schedule` (traditionalStart/End, conversionAmount, taxOnConversion,
 *      rothBalance), with a real per-bracket tax figure substituted in.
 *
 * Bracket data comes from `@retirement/shared/engine/tax-sources.js`
 * (`FED_BRACKETS_2026_SINGLE` / `FED_BRACKETS_2026_MFJ`) — the maintained,
 * current-year source — rather than either React tab's hardcoded tables.
 * Both React tables were stale: `RothConversionTab`'s 4-bracket table
 * (stops at 24%, thresholds ~2025-ish) and `RothPlannerTab`'s 7-bracket
 * "2026" tables actually carry 2024 IRS thresholds (11600/47150/... single;
 * 23200/94300/... MFJ) — inflation-adjusted since. The shared package's
 * 2026 tables (12400/50400/... single; 24800/100800/... MFJ, per IRS Rev.
 * Proc. 2025-32) are authoritative here; that's what this port uses.
 */

/** One bracket-slice of a Roth conversion — the portion of the conversion
 *  that falls inside a single federal bracket, stacked on top of the
 *  household's other ordinary taxable income for the year. */
export interface ConversionBracketChunk {
  min: number;
  max: number | null;
  rate: number;
  /** Dollars of the conversion that land in this bracket. */
  amount: number;
  /** Tax owed on just this chunk (amount * rate). */
  tax: number;
}

export interface ConversionBracketBreakdown {
  chunks: ConversionBracketChunk[];
  /** Total federal tax attributable to the conversion (sum of chunk taxes). */
  totalTax: number;
  /** Rate on the conversion's last dollar — the top bracket it touched. 0 when conversion is 0. */
  marginalRate: number;
  /** totalTax / conversionAmount. 0 when conversion is 0. */
  effectiveRate: number;
}

/**
 * Break a Roth conversion into the federal brackets it fills, stacked on
 * top of the household's other taxable ordinary income for the year
 * (Social Security, pension, RMDs, etc.).
 *
 * `otherIncome` and `standardDeduction` are both gross figures — the
 * deduction is applied here, once, so callers never have to remember to
 * net it out themselves.
 */
export function conversionBracketBreakdown(
  otherIncome: number,
  conversionAmount: number,
  brackets: readonly TaxBracket[],
  standardDeduction = 0,
): ConversionBracketBreakdown {
  const baseline = Math.max(0, otherIncome - standardDeduction);
  const conversion = Math.max(0, conversionAmount);
  const chunks: ConversionBracketChunk[] = [];
  let totalTax = 0;
  let marginalRate = 0;

  if (conversion > 0) {
    // NOT `baseline + conversion` — when otherIncome < standardDeduction,
    // the leftover deduction must offset the conversion itself, not just
    // vanish at the baseline floor. E.g. otherIncome=0, deduction=16100,
    // conversion=20000: baseline clamps to 0, but only $3,900 is actually
    // taxable (20000 - 16100), not the full $20,000. This is the flagship
    // early-retiree bridge scenario (converting in a low/no-income year),
    // so getting the deduction applied to the conversion itself matters.
    const top = Math.max(0, otherIncome + conversion - standardDeduction);
    for (const b of brackets) {
      const bMax = b.max ?? Infinity;
      const overlapStart = Math.max(baseline, b.min);
      const overlapEnd = Math.min(top, bMax);
      const amount = Math.max(0, overlapEnd - overlapStart);
      if (amount > 0) {
        const tax = amount * b.rate;
        chunks.push({ min: b.min, max: b.max, rate: b.rate, amount, tax });
        totalTax += tax;
        marginalRate = b.rate;
      }
    }
  }

  return {
    chunks,
    totalTax: Math.round(totalTax * 100) / 100,
    marginalRate,
    effectiveRate: conversion > 0 ? totalTax / conversion : 0,
  };
}

export interface DepletionYearRow {
  year: number;
  /** null when no household birth year is available to anchor an age column. */
  age: number | null;
  traditionalStart: number;
  conversionAmount: number;
  taxPaid: number;
  traditionalEnd: number;
  rothBalance: number;
}

export interface DepletionScheduleParams {
  traditionalStart: number;
  rothStart: number;
  annualConversion: number;
  yearsToConvert: number;
  /** Gross other ordinary taxable income for the year (SS, pension, RMDs). Held flat across years. */
  otherTaxableIncome: number;
  standardDeduction: number;
  brackets: readonly TaxBracket[];
  /** Decimal fraction, e.g. 0.07 for 7%. Applied to both accounts, once per year, after the conversion moves dollars across. */
  growthRate: number;
  startYear: number;
  startAge: number | null;
  /** Extra years to project after conversions stop, so the reader sees the balances settle. Default 10. */
  tailYears?: number;
  /** Safety cap on total rows. Default 60. */
  maxYears?: number;
}

/**
 * Year-by-year Traditional -> Roth depletion schedule.
 *
 * Growth order mirrors both retired React tabs: the conversion moves
 * dollars from Traditional to Roth first, *then* both balances compound
 * for the year (`RothPlannerTab`: `roth = roth*(1+r) + conv`,
 * `trad = tradEnd*(1+r)`; `RothConversionTab`: same order, but with a
 * hardcoded 7% instead of a rate parameter). This port takes the growth
 * rate as an argument — callers pass the app's existing
 * `FinancialSettings.expectedReturn` — rather than re-hardcoding either
 * React tab's constant or duplicating a second local growth-rate input.
 *
 * One deliberate fix vs. `RothPlannerTab`'s table: there, the displayed
 * "Trad IRA End" column was the pre-growth balance (immediately after the
 * conversion, before that year's compounding), so it never matched the
 * next row's "Start" — growth happened silently between rows. Here
 * `traditionalEnd` is the actual post-growth end-of-year balance, so
 * `rows[i].traditionalEnd === rows[i+1].traditionalStart`, consistent
 * with how every other table on this app (Projections, Medicare IRMAA)
 * presents a year's ending figure.
 *
 * Stops early once the Traditional balance is depleted and the conversion
 * window has closed (nothing left to convert or grow toward zero).
 */
export function buildDepletionSchedule(params: DepletionScheduleParams): DepletionYearRow[] {
  const {
    traditionalStart, rothStart, annualConversion, yearsToConvert,
    otherTaxableIncome, standardDeduction, brackets, growthRate,
    startYear, startAge, tailYears = 10, maxYears = 60,
  } = params;

  const years = Math.max(0, yearsToConvert);
  const totalYears = Math.min(Math.max(1, maxYears), Math.max(1, years + Math.max(0, tailYears)));

  let traditional = Math.max(0, traditionalStart);
  let roth = Math.max(0, rothStart);
  const rows: DepletionYearRow[] = [];

  for (let y = 0; y < totalYears; y++) {
    const traditionalBegin = traditional;
    const conversion = y < years ? Math.min(annualConversion, traditionalBegin) : 0;
    const { totalTax } = conversionBracketBreakdown(otherTaxableIncome, conversion, brackets, standardDeduction);

    const traditionalAfterConversion = traditionalBegin - conversion;
    roth = roth * (1 + growthRate) + conversion;
    traditional = traditionalAfterConversion * (1 + growthRate);

    rows.push({
      year: startYear + y,
      age: startAge === null ? null : startAge + y,
      traditionalStart: Math.round(traditionalBegin),
      conversionAmount: Math.round(conversion),
      taxPaid: Math.round(totalTax),
      traditionalEnd: Math.round(traditional),
      rothBalance: Math.round(roth),
    });

    if (traditionalAfterConversion <= 0 && y + 1 >= years) break;
  }

  return rows;
}
