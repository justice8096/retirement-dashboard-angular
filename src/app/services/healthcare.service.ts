import { Injectable, inject, computed, signal } from '@angular/core';
import { ApiService } from './api.service';
import { LocationService } from './location.service';
import { TaxService } from './tax.service';
import { HouseholdProfile, LocationFull, FinancialSettings } from '@models/api.model';
import {
  fpl2026 as fplForHousehold,
  applicablePctCliff2026 as applicablePctCliff,
} from '@retirement/shared/engine/aca-constants.js';
import { apportion as apportionPure, ApportionStrategy as PureApportionStrategy } from '../lib/apportion';

export type ApportionStrategy = PureApportionStrategy;

/**
 * ACA subsidy regime:
 *   - `cliff`    : pre-ARPA rules (current for 2026 plan year). Sliding
 *                  applicable-percentage by FPL bucket (2.10–9.96% per
 *                  Rev Proc 2025-25). Hard cliff at 400% FPL — zero
 *                  subsidy above.
 *   - `enhanced` : ARPA/IRA expanded rules. Flat 8.5% of MAGI cap,
 *                  no cliff. Expired Dec 31 2025; awaiting any new
 *                  extension.
 *
 * All constants + math live in `@retirement/shared/engine/aca-constants.ts` so the
 * per-year cost step in Monte Carlo can reuse them without duplication.
 */
export type SubsidyRegime = 'cliff' | 'enhanced';

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
  /** Precision + caveat for the underlying ACA benchmark price (when source = aca-*). */
  acaEstimate?: {
    rateArea?: string;
    level?: 'county' | 'state';
    disclaimer?: string;
  };
  /**
   * True when the decision used a fallback assumption because household data
   * was missing or had invalid birth years. UI should prompt the user to
   * fill in Setup → Assumptions rather than trust the number blindly.
   */
  usedFallback?: boolean;
  fallbackReason?: string;
  /** Which ACA regime was applied (cliff pre-ARPA, enhanced post-ARPA). */
  regime?: SubsidyRegime;
  /** MAGI as a percentage of Federal Poverty Level — informs cliff lookup. */
  fplPct?: number;
  /** True when MAGI is above the 400% FPL cliff under cliff-regime. */
  aboveFplCliff?: boolean;
  /**
   * Monthly income tax at the converged draw — populated by `decideConsistent`
   * (the self-consistent need→MAGI→healthcare+tax solver). Undefined on the
   * legacy `decide` / `decideForLocation` fixed-MAGI paths.
   */
  monthlyTax?: number;
  /** Number of fixed-point iterations `decideConsistent` ran (diagnostic). */
  solveIterations?: number;
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
  private readonly taxSvc = inject(TaxService);

  readonly household = signal<HouseholdProfile | null>(null);
  readonly financial = signal<FinancialSettings | null>(null);
  readonly loaded = signal(false);

  /** Auto-apportion mode — when not 'manual', traditional/Roth/taxable get derived. */
  readonly apportionStrategy = signal<ApportionStrategy>('manual');
  /** Total annual cash need (used by auto-apportion to derive portfolio draws). */
  readonly totalAnnualNeed = signal<number>(0);

  /**
   * ACA subsidy regime — defaults to `cliff` (pre-ARPA rules, in effect for
   * 2026). Flip to `enhanced` if Congress extends the ARPA/IRA expansion.
   */
  readonly subsidyRegime = signal<SubsidyRegime>('cliff');

  /**
   * Transition-year income — extra MAGI in sim year 0 only, on top of the
   * steady-state composition. Captures W-2 wages earned Jan-retirement,
   * severance, unused PTO payout, final-year bonuses, and any year-of-
   * retirement RMDs. Not a common steady-state expense — it's a one-year
   * spike that can blow up ACA subsidies if the user retires mid-year.
   */
  readonly transitionYearExtraIncome = signal<number>(0);

  /** MAGI used for ACA calc in year 0 of a simulation or "Year 1" view. */
  readonly transitionMagi = computed(() =>
    this.magi().magiForAca + this.transitionYearExtraIncome()
  );

  /**
   * When true (default), the first projection year is modeled as ACA-
   * UNSUBSIDIZED. ACA subsidies are based on estimated current-year MAGI
   * reconciled at tax time — and a mid-year retiree's actual first-year MAGI
   * usually includes pre-retirement wages / severance / final-year RMDs above
   * the 400% FPL cliff. Defaulting year 0 to unsubsidized avoids crediting a
   * subsidy that reconciliation would claw back. The user overrides by entering
   * a genuinely-low `transitionYearExtraIncome` (none) and unsetting this, or
   * leaves it on. See docs/ACA-MAGI-CONSISTENCY.md.
   */
  readonly firstYearUnsubsidized = signal<boolean>(true);

  /**
   * Applicable-percentage under the cliff regime. Exposed so callers (e.g.
   * the Compare "if subsidized" row) can compute an aspirational cost
   * without reimplementing the bucket table.
   */
  applicablePctForCliff(fplPct: number): number | null {
    return applicablePctCliff(fplPct);
  }

  /** Federal Poverty Level for a household of N adults (continental US, 2024). */
  fpl(householdSize: number): number {
    return fplForHousehold(householdSize);
  }

  /** 400% FPL — the ACA cliff ceiling under the 2026 cliff regime. The
   *  magi-targeted apportion strategy keeps the trad+taxable draw below
   *  this line so the household doesn't trip from partial subsidy to $0. */
  magiCliffCeiling(): number {
    const adults = (this.household()?.members ?? [])
      .filter(m => m.role !== 'dependent').length;
    return fplForHousehold(Math.max(1, adults)) * 4;
  }

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

  /* The old SUBSIDY_BENEFIT_CUTOFF constant was redundant: whenever MAGI × 8.5%
   * exceeds the unsubsidized premium, Math.min() below pins the subsidized
   * price to the full sticker and `perAdultAcaSubsidized < perAdultAcaFull`
   * becomes false anyway. Removed to drop one magic number. */

  load(): void {
    if (this.loaded()) return;
    // Load both in parallel; mark `loaded` only when both settle (success or
    // failure). Prevents downstream code from reading `household()` as null
    // when the fetch is still in flight.
    let pending = 2;
    const settle = () => { if (--pending === 0) this.loaded.set(true); };

    this.api.getHousehold().subscribe({
      next: (h) => {
        this.household.set(h);
        this.seedIncomeFromHousehold(h);
        this.totalAnnualNeed.set(Number(h.targetAnnualIncome) || this.loc.annualIncome());
        settle();
      },
      error: (err) => {
        console.warn('HealthcareService: household fetch failed; regime decisions will fall back to defaults.', err);
        settle();
      },
    });
    this.api.getFinancial().subscribe({
      next: (f) => { this.financial.set(f); this.restoreFromFinancial(f); settle(); },
      error: (err) => {
        console.warn('HealthcareService: financial fetch failed; auto-apportionment disabled.', err);
        settle();
      },
    });
  }

  /** True once a persisted income composition has been restored, so the
   *  household seed (targetAnnualIncome) doesn't clobber it regardless of which
   *  fetch resolves first. */
  private incomeRestored = false;

  /**
   * Restore the persisted income composition + ACA assumptions from
   * FinancialSettings. Assumption fields (strategy/regime/flag) always apply;
   * the income split + Total Annual Need only override the household seed when
   * the user actually saved one (any annual $ > 0), so a fresh user still gets
   * the targetAnnualIncome-derived default.
   */
  private restoreFromFinancial(f: FinancialSettings): void {
    if (f.apportionStrategy) this.apportionStrategy.set(f.apportionStrategy);
    if (f.subsidyRegime) this.subsidyRegime.set(f.subsidyRegime);
    if (typeof f.firstYearUnsubsidized === 'boolean') this.firstYearUnsubsidized.set(f.firstYearUnsubsidized);

    const amounts = [f.traditionalAnnual, f.rothAnnual, f.taxableBrokerageAnnual, f.pensionAnnual, f.ssAnnual];
    const hasComposition = amounts.some(v => (Number(v) || 0) > 0);
    if (hasComposition) {
      this.income.set({
        traditionalAnnual: Number(f.traditionalAnnual) || 0,
        rothAnnual: Number(f.rothAnnual) || 0,
        taxableBrokerageAnnual: Number(f.taxableBrokerageAnnual) || 0,
        taxableBrokerageTaxablePct: f.taxableBrokerageTaxablePct ?? 0.5,
        pensionAnnual: Number(f.pensionAnnual) || 0,
        ssAnnual: Number(f.ssAnnual) || 0,
        filingStatus: f.filingStatus ?? 'joint',
      });
      this.incomeRestored = true;
    }
    if (Number(f.totalAnnualNeed) > 0) this.totalAnnualNeed.set(Number(f.totalAnnualNeed));
  }

  /** The income/ACA assumptions as a flat object for the financial PUT payload. */
  incomeSavePayload(): Partial<FinancialSettings> {
    const i = this.income();
    return {
      traditionalAnnual: i.traditionalAnnual,
      rothAnnual: i.rothAnnual,
      taxableBrokerageAnnual: i.taxableBrokerageAnnual,
      taxableBrokerageTaxablePct: i.taxableBrokerageTaxablePct,
      pensionAnnual: i.pensionAnnual,
      ssAnnual: i.ssAnnual,
      filingStatus: i.filingStatus,
      totalAnnualNeed: this.totalAnnualNeed(),
      apportionStrategy: this.apportionStrategy() as FinancialSettings['apportionStrategy'],
      subsidyRegime: this.subsidyRegime(),
      firstYearUnsubsidized: this.firstYearUnsubsidized(),
    };
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
  /**
   * Thin delegate around the pure `apportion` lib so callers who already hold
   * this service don't need to import the module directly. The math + test
   * coverage live in `src/app/lib/apportion.ts`.
   */
  private apportion(
    residual: number,
    strategy: ApportionStrategy,
    balances: { traditional: number; roth: number; taxable: number },
    opts?: { magiCeiling?: number; magiBuffer?: number; magiBaseline?: number },
  ): { trad: number; roth: number; tax: number } {
    return apportionPure(residual, strategy, balances, opts);
  }

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
    // For magi-targeted draws, feed the ACA cliff ceiling + current
    // non-drawable baseline (SS + pension). The apportion lib keeps the
    // trad+taxable draw under `ceiling - buffer - baseline` and pushes
    // everything else to Roth.
    const magiOpts = this.apportionStrategy() === 'magi-targeted'
      ? { magiCeiling: this.magiCliffCeiling(), magiBaseline: cur.ssAnnual + cur.pensionAnnual }
      : undefined;
    const { trad, roth, tax } = this.apportion(residual, this.apportionStrategy(), balances, magiOpts);

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
    // A persisted composition (restored from FinancialSettings) wins over the
    // targetAnnualIncome seed, regardless of which fetch resolved first.
    if (this.incomeRestored) return;
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

  /**
   * Location-aware healthcare decision. When the user is in auto-apportion
   * mode, this recomputes MAGI for each location based on that location's
   * actual cost-of-living (not the globally-entered totalAnnualNeed). Lets
   * Compare show "if you moved to Summerville, your MAGI would drop below
   * the FPL cliff and you'd qualify for subsidies" without manual re-entry.
   *
   * In manual mode, MAGI is fixed across all locations (matches current
   * behavior — the user has explicit control).
   */
  decideForLocation(location: LocationFull, opts?: { transition?: boolean }): HealthcareDecision {
    return this.decideConsistent(location, opts);
  }

  /**
   * Unsubsidized monthly healthcare for a location under the current household
   * (full ACA sticker for pre-65 adults, Medicare cost for 65+). Priced by
   * passing an above-cliff MAGI so no subsidy applies. Used to size the MAGI
   * that forces year-0 sticker pricing under the enhanced regime too, where the
   * cliff is ignored and premiums cap at `magi × capPct`.
   */
  unsubsidizedMonthly(location: LocationFull): number {
    return this.decideWithMagi(location, Number.POSITIVE_INFINITY).monthlyCost;
  }

  /**
   * Self-consistent healthcare + income-tax + MAGI for a location, via
   * fixed-point iteration. See `docs/ACA-MAGI-CONSISTENCY.md`.
   *
   * The household's annual draw must cover non-healthcare costs PLUS the real
   * healthcare premium PLUS income tax. That draw determines MAGI, which in
   * turn determines whether ACA is subsidized (MAGI ≤ 400% FPL cliff) and how
   * much tax is owed — a circular relationship. We seed at the UNSUBSIDIZED
   * premium (the conservative bound) and iterate to a fixed point: if the real
   * draw clears the cliff, healthcare stays unsubsidized and it's already
   * consistent; otherwise the MAGI-capped subsidized premium converges
   * monotonically downward. Per location, because cheaper places need smaller
   * draws → lower MAGI → may genuinely qualify where pricier ones don't.
   *
   * `manual` apportion mode: the user controls the income composition directly,
   * so MAGI is fixed — we don't re-derive draws, just price healthcare + tax at
   * the stated MAGI (with the optional transition-year spike).
   *
   * Returns the `HealthcareDecision` augmented with `monthlyTax` and
   * `solveIterations`.
   */
  decideConsistent(location: LocationFull, opts?: { transition?: boolean }): HealthcareDecision {
    const extraIncome = opts?.transition ? this.transitionYearExtraIncome() : 0;
    const strategy = this.apportionStrategy();
    const cur = this.income();

    if (strategy === 'manual') {
      const magi = this.magi().magiForAca + extraIncome;
      const decision = this.decideWithMagi(location, magi);
      // Brackets apply to AGI (incl. the taxable portion of Social Security),
      // not taxableBase — computeIncomeTax subtracts the standard deduction.
      // The transition spike (W-2 / severance / final-year RMDs) is ordinary
      // taxable income, so it belongs in the tax base too, not just MAGI.
      const monthlyTax = this.taxSvc.computeIncomeTax(location, this.computeMagi(cur).agi + extraIncome).monthlyTax;
      return { ...decision, monthlyTax, solveIterations: 0 };
    }

    const nonHealthcareMonthly = this.loc.nonHealthcareBaseMonthly(location);
    const f = this.financial();
    const balances = {
      traditional: Number(f?.traditionalBalance) || 0,
      roth: Number(f?.rothBalance) || 0,
      taxable: Number(f?.taxableBalance) || 0,
    };
    // magi-targeted draws buffer trad+taxable under the cliff via Roth — pass
    // the same ceiling/baseline `applyApportionment` uses, else the strategy
    // silently degrades to tax-efficient ordering inside the loop.
    const magiOpts = strategy === 'magi-targeted'
      ? { magiCeiling: this.magiCliffCeiling(), magiBaseline: cur.ssAnnual + cur.pensionAnnual }
      : undefined;

    // Seed at the unsubsidized premium: pass an above-cliff MAGI so
    // `decideWithMagi` returns the full sticker (Medicare adults priced at
    // their Medicare cost, ACA adults at the full benchmark).
    let decision = this.decideWithMagi(location, Number.POSITIVE_INFINITY);
    let healthcareMonthly = decision.monthlyCost;
    let taxMonthly = 0;
    let magi = decision.magiUsed;
    let iterations = 0;

    const MAX_ITERS = 12;
    for (let i = 0; i < MAX_ITERS; i++) {
      iterations = i + 1;
      const needAnnual = (nonHealthcareMonthly + healthcareMonthly + taxMonthly) * 12;
      const residual = Math.max(0, needAnnual - cur.ssAnnual - cur.pensionAnnual);
      const { trad, roth, tax } = this.apportion(residual, strategy, balances, magiOpts);
      const breakdown: IncomeBreakdown = {
        ...cur,
        traditionalAnnual: Math.round(trad),
        rothAnnual: Math.round(roth),
        taxableBrokerageAnnual: Math.round(tax),
      };
      const m = this.computeMagi(breakdown);
      magi = m.magiForAca + extraIncome;
      decision = this.decideWithMagi(location, magi);
      const nextHealthcare = decision.monthlyCost;
      // AGI (incl. taxable SS), not taxableBase — see manual branch above.
      // Transition spike is ordinary taxable income — include it in the tax
      // base, mirroring its inclusion in `magi` above (Codex P2 on #153).
      const nextTax = this.taxSvc.computeIncomeTax(location, m.agi + extraIncome).monthlyTax;
      const converged = Math.abs(nextHealthcare - healthcareMonthly) < 1
        && Math.abs(nextTax - taxMonthly) < 1;
      healthcareMonthly = nextHealthcare;
      taxMonthly = nextTax;
      if (converged) break;
    }

    return {
      ...decision,
      monthlyCost: healthcareMonthly,
      magiUsed: magi,
      monthlyTax: taxMonthly,
      solveIterations: iterations,
    };
  }

  /** Effective monthly healthcare cost for a given location under current household + income. */
  decide(location: LocationFull): HealthcareDecision {
    return this.decideWithMagi(location, this.magi().magiForAca);
  }

  /**
   * Core decision logic. Separated from `decide()` so `decideForLocation`
   * can pass a location-specific MAGI without mutating the global income
   * signal.
   */
  private decideWithMagi(location: LocationFull, magi: number): HealthcareDecision {
    const year = this.referenceYear();
    const adults = this.adults();

    const medicareMonthly = location.monthlyCosts['healthcare']?.typical ?? 0;
    const acaFull = location.monthlyCosts['healthcarePreMedicare']?.typical
      ?? location.healthcare?.acaMarketplace?.benchmarkSilverMonthly2Adult
      ?? 0;
    const marketplace = location.healthcare?.acaMarketplace;
    const acaEstimate = marketplace ? {
      rateArea: marketplace.rateArea,
      level: marketplace.estimationLevel,
      disclaimer: marketplace.disclaimer,
    } : undefined;

    // Count adults by Medicare eligibility (65+ in reference year).
    // Guard against invalid birthYears (0/null/future) — those are treated
    // as pre-Medicare (conservative default) with a fallback flag so the UI
    // can prompt the user to fix the data.
    let adultsPre = 0;
    let adultsMed = 0;
    let latestCrossing: number | null = null;
    let invalidBirthYears = 0;
    for (const m of adults) {
      const by = Number(m.birthYear);
      const validBy = isFinite(by) && by > 1900 && by <= year;
      if (!validBy) {
        invalidBirthYears++;
        adultsPre++;
        continue;
      }
      const age = year - by;
      if (age >= 65) adultsMed++;
      else {
        adultsPre++;
        const crossYear = by + 65;
        if (latestCrossing === null || crossYear > latestCrossing) latestCrossing = crossYear;
      }
    }

    // Default assumption when no household data is available: 2 adults, both
    // pre-Medicare. Uses the location's ACA unsubsidized benchmark since
    // that's the conservative (higher) planning figure — encourages the user
    // to fill in Setup → Assumptions rather than silently show a misleading
    // Medicare-only cost.
    if (adultsPre + adultsMed === 0) {
      return {
        monthlyCost: acaFull,
        source: 'aca-unsubsidized',
        adultsPreMedicare: 2,
        adultsMedicare: 0,
        hasPreMedicareAdult: true,
        allEligibleYear: null,
        subsidyEligible: false,
        magiUsed: magi,
        acaEstimate,
        usedFallback: true,
        fallbackReason: 'No household members configured — assumed 2 adults, both pre-Medicare. Set birth years in Setup → Assumptions for an accurate number.',
        regime: this.subsidyRegime(),
        fplPct: 0,
        aboveFplCliff: false,
      };
    }

    // Per-adult prices derived from the location's full-household figures.
    const perAdultMedicare = adultsMed > 0
      ? medicareMonthly / Math.max(1, adults.length || 2)
      : 0;

    // If acaFull is a 2-adult figure, halve it per-adult; if single figure is given, prefer that.
    const acaSinglePrice = location.healthcare?.acaMarketplace?.benchmarkSilverMonthlySingle;
    const perAdultAcaFull = acaSinglePrice ?? (acaFull / 2);

    // ACA subsidy calc — regime-dependent:
    //   `cliff`    (default for 2026): sliding applicable-pct by FPL bucket,
    //              hard cliff above 400% FPL → no subsidy.
    //   `enhanced` (if Senate extends): flat 8.5% of MAGI cap, no cliff.
    // Territories have premiumCapPctOfIncome = 0 in their location data, which
    // disables the subsidy calc entirely (they're off the federal marketplace).
    const regime = this.subsidyRegime();
    const cap = location.healthcare?.acaMarketplace?.premiumCapPctOfIncome ?? 0.085;
    const fpl = fplForHousehold(adults.length || 2);
    const fplPct = magi > 0 ? (magi / fpl) * 100 : 0;

    let annualCap: number;
    let aboveCliff = false;
    if (cap === 0) {
      // Off-marketplace (territories) — no federal subsidy at all.
      annualCap = Number.POSITIVE_INFINITY;
      aboveCliff = true;
    } else if (regime === 'enhanced') {
      annualCap = magi * cap;
    } else {
      const pct = applicablePctCliff(fplPct);
      if (pct === null) {
        annualCap = Number.POSITIVE_INFINITY;
        aboveCliff = true;
      } else {
        annualCap = magi * pct;
      }
    }

    const perAdultAcaSubsidized = adultsPre > 0 && isFinite(annualCap)
      ? Math.min(perAdultAcaFull, (annualCap / 12) / adultsPre)
      : perAdultAcaFull;
    // Subsidy helps iff the computed cap produces a price below the sticker.
    const subsidyEligible = magi > 0 && !aboveCliff && perAdultAcaSubsidized < perAdultAcaFull;

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
      acaEstimate,
      usedFallback: invalidBirthYears > 0,
      fallbackReason: invalidBirthYears > 0
        ? `${invalidBirthYears} household adult(s) have missing or invalid birth year — treated as pre-Medicare. Fix in Setup → Assumptions.`
        : undefined,
      regime,
      fplPct,
      aboveFplCliff: aboveCliff,
    };
  }

  /** Partial update helper for income composition. */
  patchIncome(partial: Partial<IncomeBreakdown>): void {
    this.income.update(prev => ({ ...prev, ...partial }));
  }

  /** Monthly total for a location with healthcare effectively swapped in. */
  locationTotalWithHealthcare(location: LocationFull): number {
    const decision = this.decide(location);
    return this.loc.nonHealthcareBaseMonthly(location) + decision.monthlyCost;
  }
}
