import { Injectable, inject, computed, signal } from '@angular/core';
import { LocationService } from './location.service';
import { LocationFull, IncomeTaxTable, COST_CATEGORIES } from '@models/api.model';
import { FED_BRACKETS_2026_MFJ, FED_STD_DEDUCTION_2026 } from '@retirement/shared/engine/tax-sources.js';
import { taxableSocialSecurity, type SsFilingStatus } from '../lib/taxable-social-security';

/** How much of the annual income is Social Security, and the filing status
 *  for the IRC §86 thresholds. */
export interface SsIncomeContext {
  ssAnnual: number;
  filingStatus: SsFilingStatus;
}

/** US-state location heuristic — drives the shared 2026-MFJ federal fallback
 *  when the seed doesn't ship location-level federal brackets (most don't). */
function isUsLocation(loc: LocationFull): boolean {
  const c = (loc.country ?? '').toLowerCase();
  return c === 'us' || c === 'usa' || c === 'united states' || loc.id?.startsWith('us-');
}

/**
 * Tax computation helpers extracted from LocationService. All methods are pure
 * functions of (location, income) — the service is a stateless facade over
 * the bracket/VAT math that the UI can inject anywhere.
 *
 * Dependency direction: TaxService → LocationService (reads `annualIncome`
 * and `selectedFullLocations` signals). No reverse coupling.
 */
@Injectable({ providedIn: 'root' })
export class TaxService {
  private readonly loc = inject(LocationService);

  /**
   * SS portion of the household income, pushed by HealthcareService whenever
   * its income composition changes (Healthcare → Tax dependency direction —
   * TaxService cannot inject HealthcareService without a DI cycle). Used as
   * the default `ss` context by convergedTotals / totalWithIncomeTax so the
   * bracket calc taxes only the IRC §86 portion of Social Security.
   */
  readonly ssContext = signal<SsIncomeContext>({ ssAnnual: 0, filingStatus: 'joint' });

  /**
   * Normalize a rate that might be stored as a decimal fraction (0.22) or a
   * whole-number percent (22). Anything > 1 is treated as whole-%. Returns a
   * decimal fraction. Used only inside this service; the display-side scaling
   * on Taxes/Withdrawal screens lives in those components.
   */
  private static normalizeRate(r: number | undefined | null): number {
    const n = Number(r ?? 0);
    if (!isFinite(n) || n <= 0) return 0;
    return n > 1 ? n / 100 : n;
  }

  /**
   * Apply a bracket table to annual taxable income. Deductions applied first.
   * Pure function — no dependencies on service state.
   */
  private applyBrackets(table: IncomeTaxTable | undefined, annualIncome: number): number {
    if (!table?.brackets?.length) return 0;
    const deduction = (table.standardDeduction ?? 0) + (table.deduction ?? 0);
    const taxable = Math.max(0, annualIncome - deduction);
    if (taxable <= 0) return 0;
    let tax = 0;
    for (const b of table.brackets) {
      const top = b.max ?? Number.POSITIVE_INFINITY;
      if (taxable <= b.min) break;
      const span = Math.min(taxable, top) - b.min;
      if (span > 0) tax += span * b.rate;
    }
    return tax;
  }

  /**
   * VAT / social-charges tax on the "taxable" category base for a location.
   * Single-iteration — when tax itself is not part of the taxable base (always
   * true today), one pass is sufficient. Returns 0/all-unchanged when the
   * location has no VAT or no taxable-flagged categories.
   */
  computeConvergedTotal(loc: LocationFull): {
    total: number;
    taxableBase: number;
    untaxedBase: number;
    tax: number;
  } {
    const rate = TaxService.normalizeRate(loc.taxes?.vatRate)
               + TaxService.normalizeRate(loc.taxes?.socialChargesRate);
    let taxableBase = 0;
    let untaxedBase = 0;
    for (const cat of COST_CATEGORIES) {
      if (cat.key === 'taxes') continue;
      const v = loc.monthlyCosts[cat.key]?.typical ?? 0;
      if (cat.taxable) taxableBase += v;
      else untaxedBase += v;
    }
    const tax = taxableBase * rate;
    return { total: taxableBase + untaxedBase + tax, taxableBase, untaxedBase, tax };
  }

  /**
   * Estimated monthly income tax for a location given annual income.
   * Uses federal + state brackets when available (US locations); otherwise
   * falls back to stored tax line, then VAT convergence, then zero.
   */
  computeIncomeTax(loc: LocationFull, annualIncome: number, ss?: SsIncomeContext): {
    monthlyTax: number;
    federalAnnual: number;
    stateAnnual: number;
    taxableSSAnnual: number;
    source: 'brackets' | 'stored' | 'vat-converged' | 'none';
  } {
    // SS-aware bracket base: only the IRC §86 portion of the Social Security
    // benefit is ordinary income. OPT-IN via `ss` — the healthcare/MAGI
    // solver passes an already-adjusted AGI and must not adjust twice.
    let bracketIncome = annualIncome;
    let taxableSSAnnual = 0;
    if (ss && ss.ssAnnual > 0) {
      const other = Math.max(0, annualIncome - ss.ssAnnual);
      taxableSSAnnual = taxableSocialSecurity(ss.ssAnnual, other, ss.filingStatus);
      bracketIncome = other + taxableSSAnnual;
    }
    const t = loc.taxes;
    // US locations: apply the shared 2026 MFJ federal table when the seed
    // doesn't ship federal brackets. Matches what retirement-api/shared/
    // taxes.js does in calcTaxesForLocation — the dashboard was out of sync.
    const hasSeedFed   = !!t?.federalIncomeTax?.brackets?.length;
    const hasSeedState = !!t?.stateIncomeTax?.brackets?.length;
    const fallbackFed  = !hasSeedFed && isUsLocation(loc);

    if (hasSeedFed || hasSeedState || fallbackFed) {
      const fedTable: IncomeTaxTable | undefined = hasSeedFed
        ? t!.federalIncomeTax
        : (fallbackFed ? {
            brackets: FED_BRACKETS_2026_MFJ,
            standardDeduction: FED_STD_DEDUCTION_2026.mfj,
          } : undefined);
      const fed = this.applyBrackets(fedTable, bracketIncome);
      const state = this.applyBrackets(t?.stateIncomeTax, bracketIncome);
      return {
        monthlyTax: (fed + state) / 12,
        federalAnnual: fed,
        stateAnnual: state,
        taxableSSAnnual,
        source: 'brackets',
      };
    }
    const stored = loc.monthlyCosts['taxes']?.typical ?? 0;
    if (stored > 0) {
      return { monthlyTax: stored, federalAnnual: 0, stateAnnual: 0, taxableSSAnnual: 0, source: 'stored' };
    }
    const conv = this.computeConvergedTotal(loc);
    if (conv.tax > 0) {
      return { monthlyTax: conv.tax, federalAnnual: 0, stateAnnual: 0, taxableSSAnnual: 0, source: 'vat-converged' };
    }
    return { monthlyTax: 0, federalAnnual: 0, stateAnnual: 0, taxableSSAnnual: 0, source: 'none' };
  }

  /**
   * Monthly total with the computed income tax swapped in for whatever stored
   * tax value came from the API. Callers can optionally override healthcare
   * (e.g. HealthcareService passes the effective ACA/Medicare cost).
   */
  totalWithIncomeTax(loc: LocationFull, opts?: { healthcareMonthly?: number }): {
    total: number;
    baseMonthly: number;
    monthlyTax: number;
    taxSource: 'brackets' | 'stored' | 'vat-converged' | 'none';
  } {
    const nonHealthcare = this.loc.nonHealthcareBaseMonthly(loc);
    const healthcare = opts?.healthcareMonthly
      ?? (loc.monthlyCosts?.['healthcare']?.typical ?? 0);
    const baseMonthly = nonHealthcare + healthcare;
    const tax = this.computeIncomeTax(loc, this.loc.annualIncome(), this.ssContext());
    return {
      total: baseMonthly + tax.monthlyTax,
      baseMonthly,
      monthlyTax: tax.monthlyTax,
      taxSource: tax.source,
    };
  }

  /**
   * Converged totals for the currently-selected locations — combines the VAT
   * convergence (consumption tax on taxable categories) with bracket-based
   * income tax on `loc.annualIncome()`. The `total` field is the full monthly
   * picture: base categories + computed income tax + VAT-on-taxable.
   */
  readonly convergedTotals = computed(() => {
    const income = this.loc.annualIncome();
    const ss = this.ssContext();
    return this.loc.selectedFullLocations().map(l => {
      const conv = this.computeConvergedTotal(l);
      const inc = this.computeIncomeTax(l, income, ss);
      // Avoid double-counting: only add bracket-computed income tax on top.
      // Stored/VAT values are already in conv.total via untaxedBase (taxes
      // category) or conv.tax (VAT-converged).
      const addIncomeTax = inc.source === 'brackets' ? inc.monthlyTax : 0;
      return {
        id: l.id,
        name: l.name,
        country: l.country,
        currency: l.currency,
        total: conv.total + addIncomeTax,
        taxableBase: conv.taxableBase,
        untaxedBase: conv.untaxedBase,
        tax: conv.tax + addIncomeTax,
        incomeTax: inc.monthlyTax,
        incomeTaxSource: inc.source,
        taxableSSAnnual: inc.taxableSSAnnual,
      };
    });
  });
}
