import { Injectable, inject, computed, signal } from '@angular/core';
import { ApiService } from './api.service';
import { LocationService } from './location.service';
import { HouseholdProfile, LocationFull, FinancialSettings } from '@models/api.model';

export type ApportionStrategy = 'proportional' | 'tax-efficient' | 'manual';

export type HealthcareSource = 'medicare' | 'aca-subsidized' | 'aca-unsubsidized' | 'mixed' | 'none';

export interface HealthcareDecision {
  monthlyCost: number;
  source: HealthcareSource;
  adultsPreMedicare: number;
  adultsMedicare: number;
  hasPreMedicareAdult: boolean;
  /** Year at which the last pre-Medicare adult crosses 65. null if everyone already 65+. */
  allEligibleYear: number | null;
  /** Subsidy-eligible (income below practical ACA benefit threshold)? */
  subsidyEligible: boolean;
  /** MAGI used for the ACA premium cap (see IncomeBreakdown.magiForAca). */
  magiUsed: number;
}

/**
 * Per-year income composition — drives the MAGI calc that feeds ACA subsidies.
 * Traditional 401k/IRA withdrawals hit MAGI dollar-for-dollar; Roth qualified
 * withdrawals don't touch MAGI; taxable-brokerage draws only count to the
 * extent they're dividends + realized cap gains (approximated via
 * `taxableBrokerageTaxablePct`). Social Security gets the special provisional-
 * income treatment for federal tax but counts 100% for ACA MAGI.
 */
export interface IncomeBreakdown {
  traditionalAnnual: number;
  rothAnnual: number;
  taxableBrokerageAnnual: number;
  taxableBrokerageTaxablePct: number;
  pensionAnnual: number;
  ssAnnual: number;
  /** Filing status used for SS taxability thresholds. */
  filingStatus: 'single' | 'joint';
}

export interface MagiResult {
  cashIn: number;
  /** Federal AGI — taxable income including the taxable portion of SS. */
  agi: number;
  /** ACA MAGI — AGI + 100% of SS (plus tax-exempt interest if we tracked it). */
  magiForAca: number;
  /** How much of SS is federally taxable given provisional income. */
  taxableSS: number;
  /** Taxable withdrawals + pension (pre-SS). */
  taxableBase: number;
}

/**
 * Computes the household's effective healthcare monthly cost for a given
 * location, based on adult ages and annual income. Handles three regimes:
 *
 *   1. All adults ≥ 65  → Medicare baseline (`monthlyCosts.healthcare`).
 *   2. Any adult < 65   → ACA pre-Medicare. Subsidized price uses enhanced
 *                         ACA premium cap (default 8.5% of MAGI), capped at
 *                         the unsubsidized benchmark.
 *   3. Split household (one spouse < 65, other ≥ 65) → blended per-adult.
 *
 * This is a calendar-year snapshot — Monte Carlo transitions adults through
 * 65 over the sim horizon separately (see MC integration).
 */
@Injectable({ providedIn: 'root' })
export class HealthcareService {
  private readonly api = inject(ApiService);
  private readonly loc = inject(LocationService);

  readonly household = signal<HouseholdProfile | null>(null);
  readonly financial = signal<FinancialSettings | null>(null);
  readonly loaded = signal(false);

  /** Auto-apportion mode — when not 'manual', traditional/Roth/taxable get derived. */
  readonly apportionStrategy = signal<ApportionStrategy>('manual');
  /** Total annual cash need (used by auto-apportion to derive portfolio draws). */
  readonly totalAnnualNeed = signal<number>(0);

  /**
   * Income composition — editable on the Assumptions screen. On first load the
   * composition is seeded from FinancialSettings + household (SS), with
   * everything else parked in `traditionalAnnual` so existing behavior is
   * preserved (MAGI ≈ annualIncome until the user splits).
   */
  readonly income = signal<IncomeBreakdown>({
    traditionalAnnual: 0,
    rothAnnual: 0,
    taxableBrokerageAnnual: 0,
    taxableBrokerageTaxablePct: 0.5,
    pensionAnnual: 0,
    ssAnnual: 0,
    filingStatus: 'joint',
  });

  /** Reference year used to compute adult ages. Defaults to household planningStartYear. */
  readonly referenceYear = computed(() => {
    const h = this.household();
    return h?.planningStartYear ?? new Date().getFullYear();
  });

  /** Non-dependent adults in the household. Dependents excluded from healthcare cost here. */
  readonly adults = computed(() =>
    (this.household()?.members ?? []).filter(m => m.role !== 'dependent')
  );

  /** MAGI + derived breakdown for the current income composition. */
  readonly magi = computed<MagiResult>(() => this.computeMagi(this.income()));

  /** Conservative MAGI threshold where ACA subsidies fully stop helping for a 2-adult household. */
  private readonly SUBSIDY_BENEFIT_CUTOFF = 200_000;

  load(): void {
    if (this.loaded()) return;
    this.api.getHousehold().subscribe({
      next: (h) => {
        this.household.set(h);
        this.seedIncomeFromHousehold(h);
        this.totalAnnualNeed.set(Number(h.targetAnnualIncome) || this.loc.annualIncome());
      },
      error: () => {},
    });
    this.api.getFinancial().subscribe({
      next: (f) => { this.financial.set(f); this.loaded.set(true); },
      error: () => this.loaded.set(true),
    });
  }

  /**
   * Apportion residual (totalNeed − SS − pension) across traditional / Roth /
   * taxable buckets based on the chosen strategy. Writes results into the
   * `income` signal. Called on Apply button click.
   *
   *   proportional   — split by account balance ratio (preserves current mix)
   *   tax-efficient  — fill taxable first, then traditional, then Roth last
   *                    (classic "draw taxable first" retirement advice)
   */
  applyApportionment(): void {
    const total = this.totalAnnualNeed();
    const cur = this.income();
    const residual = Math.max(0, total - cur.ssAnnual - cur.pensionAnnual);
    const f = this.financial();
    const balances = {
      traditional: Number(f?.traditionalBalance) || 0,
      roth: Number(f?.rothBalance) || 0,
      taxable: Number(f?.taxableBalance) || 0,
    };
    let trad = 0, roth = 0, tax = 0;

    if (this.apportionStrategy() === 'tax-efficient') {
      // Loose rule-of-thumb draws (4% of each bucket before spilling to next).
      // This is deliberately approximate — it's a starting split the user can
      // tweak. Real tax-efficient order would also consider bracket fill-up.
      const taxableCap = balances.taxable * 0.04;
      tax = Math.min(residual, taxableCap);
      let left = residual - tax;
      const tradCap = balances.traditional * 0.04;
      trad = Math.min(left, tradCap);
      left -= trad;
      roth = left;
      // If caps weren't enough to cover residual, fall through to proportional.
      if (tax + trad + roth < residual) {
        const total3 = balances.traditional + balances.roth + balances.taxable;
        if (total3 > 0) {
          const leftover = residual - tax - trad - roth;
          trad += leftover * (balances.traditional / total3);
          roth += leftover * (balances.roth / total3);
          tax  += leftover * (balances.taxable / total3);
        } else {
          trad = residual;
        }
      }
    } else {
      // Default: proportional to balance.
      const total3 = balances.traditional + balances.roth + balances.taxable;
      if (total3 <= 0) {
        trad = residual; // no balance info — dump everything in traditional
      } else {
        trad = residual * (balances.traditional / total3);
        roth = residual * (balances.roth / total3);
        tax  = residual * (balances.taxable / total3);
      }
    }

    this.income.update(prev => ({
      ...prev,
      traditionalAnnual: Math.round(trad),
      rothAnnual: Math.round(roth),
      taxableBrokerageAnnual: Math.round(tax),
    }));
  }

  /**
   * On first load, fill in a sensible income composition:
   *   - SS annual: sum of household member PIAs × 12 (best available proxy)
   *   - Traditional: everything else in annualIncome (preserves current behavior
   *     until the user edits the split)
   *   - Filing status: 'joint' if 2+ adults, else 'single'
   */
  private seedIncomeFromHousehold(h: HouseholdProfile): void {
    const adults = (h.members ?? []).filter(m => m.role !== 'dependent');
    const ssAnnual = adults.reduce((s, m) => s + (Number(m.ssPia) || 0), 0) * 12;
    const target = Number(h.targetAnnualIncome) || this.loc.annualIncome();
    const traditional = Math.max(0, target - ssAnnual);
    this.income.update(prev => ({
      ...prev,
      ssAnnual,
      traditionalAnnual: traditional,
      filingStatus: adults.length >= 2 ? 'joint' : 'single',
    }));
  }

  /**
   * Compute federal AGI + ACA MAGI from the income composition.
   *
   * Social Security taxability uses the provisional-income formula (IRC §86):
   *   provisional = all other income (incl. tax-exempt interest, not modeled)
   *                 + 0.5 × gross SS benefit
   *   thresholds (2025):
   *     single:  $25k / $34k
   *     joint:   $32k / $44k
   *   taxable SS is the smaller of (0.85 × SS) and tiered amount from thresholds.
   *
   * ACA MAGI = AGI + 100% of SS. Because AGI already includes the taxable part
   * of SS, this simplifies to: taxableBase + fullSS.
   */
  computeMagi(b: IncomeBreakdown): MagiResult {
    const taxableBrokerage = b.taxableBrokerageAnnual * b.taxableBrokerageTaxablePct;
    const taxableBase = b.traditionalAnnual + taxableBrokerage + b.pensionAnnual;

    const thresholds = b.filingStatus === 'joint' ? [32_000, 44_000] : [25_000, 34_000];
    const provisional = taxableBase + 0.5 * b.ssAnnual;

    let taxableSS = 0;
    if (provisional > thresholds[0]) {
      const tier1 = Math.min(0.5 * b.ssAnnual, 0.5 * (provisional - thresholds[0]));
      taxableSS = tier1;
      if (provisional > thresholds[1]) {
        const tier2Cap = 0.85 * b.ssAnnual - tier1;
        const tier2Provisional = 0.85 * (provisional - thresholds[1]);
        taxableSS = tier1 + Math.max(0, Math.min(tier2Cap, tier2Provisional));
      }
      taxableSS = Math.min(taxableSS, 0.85 * b.ssAnnual);
    }

    const agi = taxableBase + taxableSS;
    const magiForAca = taxableBase + b.ssAnnual; // AGI + non-taxable portion of SS

    const cashIn = b.traditionalAnnual + b.rothAnnual + b.taxableBrokerageAnnual
                 + b.pensionAnnual + b.ssAnnual;

    return { cashIn, agi, magiForAca, taxableSS, taxableBase };
  }

  /** Effective monthly healthcare cost for a given location under current household + income. */
  decide(location: LocationFull): HealthcareDecision {
    const year = this.referenceYear();
    const adults = this.adults();
    // ACA subsidy is driven by MAGI, NOT gross cash-in. This is the key
    // correction for 401k/SS retirees — SS counts 100% toward MAGI.
    const magi = this.magi().magiForAca;

    const medicareMonthly = location.monthlyCosts['healthcare']?.typical ?? 0;
    const acaFull = location.monthlyCosts['healthcarePreMedicare']?.typical
      ?? location.healthcare?.acaMarketplace?.benchmarkSilverMonthly2Adult
      ?? 0;

    // Count adults by Medicare eligibility (65+ in reference year).
    let adultsPre = 0;
    let adultsMed = 0;
    let latestCrossing: number | null = null;
    for (const m of adults) {
      const age = year - m.birthYear;
      if (age >= 65) adultsMed++;
      else {
        adultsPre++;
        const crossYear = m.birthYear + 65;
        if (latestCrossing === null || crossYear > latestCrossing) latestCrossing = crossYear;
      }
    }

    if (adultsPre + adultsMed === 0) {
      return {
        monthlyCost: medicareMonthly,
        source: 'none',
        adultsPreMedicare: 0,
        adultsMedicare: 0,
        hasPreMedicareAdult: false,
        allEligibleYear: null,
        subsidyEligible: false,
        magiUsed: magi,
      };
    }

    // Per-adult prices derived from the location's full-household figures.
    const perAdultMedicare = adultsMed > 0
      ? medicareMonthly / Math.max(1, adults.length || 2)
      : 0;

    // If acaFull is a 2-adult figure, halve it per-adult; if single figure is given, prefer that.
    const acaSinglePrice = location.healthcare?.acaMarketplace?.benchmarkSilverMonthlySingle;
    const perAdultAcaFull = acaSinglePrice ?? (acaFull / 2);

    // ACA subsidy calc (enhanced rules through 2025): cap premium at X% of MAGI.
    const cap = location.healthcare?.acaMarketplace?.premiumCapPctOfIncome ?? 0.085;
    const annualCap = magi * cap;
    const perAdultAcaSubsidized = adultsPre > 0
      ? Math.min(perAdultAcaFull, (annualCap / 12) / adultsPre)
      : 0;
    const subsidyEligible = magi > 0 && magi < this.SUBSIDY_BENEFIT_CUTOFF &&
      perAdultAcaSubsidized < perAdultAcaFull;

    const acaPerAdult = subsidyEligible ? perAdultAcaSubsidized : perAdultAcaFull;

    const monthlyCost = adultsMed * perAdultMedicare + adultsPre * acaPerAdult;

    const source: HealthcareSource =
      adultsPre === 0 ? 'medicare' :
      adultsMed === 0 ? (subsidyEligible ? 'aca-subsidized' : 'aca-unsubsidized') :
      'mixed';

    return {
      monthlyCost,
      source,
      adultsPreMedicare: adultsPre,
      adultsMedicare: adultsMed,
      hasPreMedicareAdult: adultsPre > 0,
      allEligibleYear: latestCrossing,
      subsidyEligible,
      magiUsed: magi,
    };
  }

  /** Partial update helper for income composition. */
  patchIncome(partial: Partial<IncomeBreakdown>): void {
    this.income.update(prev => ({ ...prev, ...partial }));
  }

  /** Monthly total for a location with healthcare effectively swapped in. */
  locationTotalWithHealthcare(location: LocationFull): number {
    const decision = this.decide(location);
    let total = 0;
    for (const [key, val] of Object.entries(location.monthlyCosts ?? {})) {
      if (key === 'healthcare' || key === 'healthcarePreMedicare' || key === 'taxes') continue;
      total += (val?.typical ?? 0);
    }
    return total + decision.monthlyCost;
  }
}
