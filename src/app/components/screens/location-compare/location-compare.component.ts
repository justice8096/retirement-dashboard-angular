import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { NavigationService } from '@services/navigation.service';
import { fpl2026 } from '@app/lib/aca-constants';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { HealthcareService } from '@services/healthcare.service';
import { LocationFull, COST_CATEGORIES, bulletText } from '@models/api.model';

@Component({
  selector: 'app-location-compare',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './location-compare.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./location-compare.component.scss'],
})
export class LocationCompareComponent implements OnInit {
  readonly bulletText = bulletText;
  readonly loc = inject(LocationService);
  readonly tax = inject(TaxService);
  readonly healthcare = inject(HealthcareService);
  private readonly nav = inject(NavigationService);
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly currency = inject(CurrencyFormatService);

  /** Toggle: view Year 1 (transition) or Year 2+ (steady state) healthcare numbers. */
  readonly viewYear = signal<'transition' | 'steady'>('steady');

  /**
   * Per-city (decision, totalWithTax) map, memoized so change-detection
   * passes don't recompute `healthcare.decide()` 4× per city per render.
   * Rebuilds only when `locations()`, `annualIncome`, `viewYear`, or household ages shift.
   */
  readonly cityFinances = computed(() => {
    const map = new Map<string, {
      decision: ReturnType<HealthcareService['decide']>;
      totalWithTax: number;
      monthlyTax: number;
      /** Total assuming fully-subsidized ACA — what you'd pay at this city under the subsidy cap. */
      totalIfSubsidized: number;
      /** Monthly healthcare if fully subsidized (cap × MAGI / 12, capped at unsubsidized sticker). */
      subsidizedHealthcareMonthly: number;
      /** Cost penalty per month for being above the cliff (0 when already subsidized). */
      cliffPenaltyMonthly: number;
    }>();
    for (const city of this.locations()) {
      const decision = this.healthcare.decideForLocation(city, {
        transition: this.viewYear() === 'transition',
      });
      const bundle = this.tax.totalWithIncomeTax(city, { healthcareMonthly: decision.monthlyCost });

      // Compute "if fully subsidized" + "worst-case penalty" under CLIFF
      // regime (2026 reality). Two scenarios side-by-side:
      //   subsidizedMonthly — what you'd pay if you managed MAGI down to
      //                        just under 400% FPL (the aspirational ceiling).
      //   worstCaseMonthly  — what you'd pay if you drew the city's full
      //                        annual cost from taxable/trad/SS (no Roth buffer,
      //                        worst-case MAGI = city annual need). This is
      //                        the "penalty for moving here without tax-efficient
      //                        planning" signal.
      const acaFull = city.monthlyCosts?.['healthcarePreMedicare']?.typical
        ?? city.healthcare?.acaMarketplace?.benchmarkSilverMonthly2Adult
        ?? 0;
      const adults = Math.max(2,
        (this.healthcare.household()?.members ?? []).filter(m => m.role !== 'dependent').length
      );
      const fpl = this.healthcare.fpl(adults);

      // Aspirational: MAGI clamped to just under 400% FPL cliff.
      const cliffCeilingMagi = fpl * 3.99;
      const aspirationalMagi = Math.min(Math.max(decision.magiUsed, 0), cliffCeilingMagi);
      const aspirationalFplPct = (aspirationalMagi / fpl) * 100;
      const applicablePct = this.healthcare.applicablePctForCliff(aspirationalFplPct);
      const subsidizedMonthly = applicablePct != null && aspirationalMagi > 0
        ? Math.min(acaFull, aspirationalMagi * applicablePct / 12)
        : acaFull;
      const bundleIfSubsidized = this.tax.totalWithIncomeTax(city, {
        healthcareMonthly: subsidizedMonthly,
      });

      // Worst case: user needs the full city cost annually, all from sources
      // that hit MAGI (trad + SS + pension, no Roth). This is the cost
      // they'd pay if they moved here without planning tax-efficient draws.
      const cityAnnualCost = Object.values(city.monthlyCosts ?? {})
        .reduce((s, c) => s + (c?.typical ?? 0), 0) * 12;
      const worstCaseMagi = cityAnnualCost; // no Roth → full cost hits MAGI
      const worstCaseFplPct = (worstCaseMagi / fpl) * 100;
      const worstCaseApplicable = this.healthcare.applicablePctForCliff(worstCaseFplPct);
      const perAdultFull = city.healthcare?.acaMarketplace?.benchmarkSilverMonthlySingle
        ?? acaFull / 2;
      const worstCaseHealthcareMonthly = worstCaseApplicable != null
        ? Math.min(perAdultFull * adults, worstCaseMagi * worstCaseApplicable / 12)
        : perAdultFull * adults; // above cliff → full sticker
      const cliffPenaltyMonthly = Math.max(0, worstCaseHealthcareMonthly - subsidizedMonthly);

      map.set(city.id, {
        decision,
        totalWithTax: bundle.total,
        monthlyTax: bundle.monthlyTax,
        totalIfSubsidized: bundleIfSubsidized.total,
        subsidizedHealthcareMonthly: subsidizedMonthly,
        cliffPenaltyMonthly,
      });
    }
    return map;
  });

  /** Full data for each selected location, with computed total if missing */
  readonly locations = computed(() => {
    const ids = this.loc.selectedIds();
    const summaries = this.loc.locations();
    return this.loc.fullLocations()
      .filter(l => ids.has(l.id))
      .map(l => {
        if (l.monthlyCostTotal) return l;
        // monthlyCostTotal lives on the DB row, not inside locationData JSON.
        // Pull it from the summary list, or compute from monthlyCosts.
        const summary = summaries.find(s => s.id === l.id);
        const computed = summary?.monthlyCostTotal
          ?? Object.values(l.monthlyCosts)
              .reduce((sum, cr) => sum + (cr?.typical ?? 0), 0);
        return { ...l, monthlyCostTotal: computed };
      });
  });

  /** Cost rows that have data in at least one selected location */
  /**
   * Monthly-cost rows shown in the table. Excludes keys that the Compare
   * table surfaces via smarter rows at the top:
   *   - `healthcare`            → shown via our effective "Healthcare" row
   *   - `healthcarePreMedicare` → alternate (not in default sums)
   *   - `taxes`                 → shown via our computed "Income Tax" row
   * Excluding them here prevents the user seeing two different numbers for
   * the same concept.
   */
  private readonly hiddenCostKeys = new Set(['healthcare', 'healthcarePreMedicare', 'taxes']);
  readonly costRows = computed(() => {
    const locs = this.locations();
    return COST_CATEGORIES
      .filter(cat => !this.hiddenCostKeys.has(cat.key))
      .filter(cat => locs.some(l => (l.monthlyCosts[cat.key]?.typical ?? 0) > 0));
  });

  readonly hasLifestyle = computed(() =>
    this.locations().some(l => l.lifestyle)
  );
  readonly hasHealthcare = computed(() =>
    this.locations().some(l => l.healthcare)
  );
  readonly hasClimate = computed(() =>
    this.locations().some(l => l.climate)
  );
  readonly hasVisa = computed(() =>
    this.locations().some(l => l.visa)
  );
  readonly anyVisaCost = computed(() =>
    this.locations().some(l => l.visa?.costUSD)
  );
  readonly anyVisaIncomeReq = computed(() =>
    this.locations().some(l => l.visa?.incomeRequirement?.monthly)
  );

  climateHigh(city: LocationFull): string {
    const h = city.climate?.summerHighF ?? city.climate?.avgTemp?.high;
    return h != null ? `${h}°F` : '–';
  }

  climateLow(city: LocationFull): string {
    const l = city.climate?.winterLowF ?? city.climate?.avgTemp?.low;
    return l != null ? `${l}°F` : '–';
  }

  visaIncomeReq(city: LocationFull): string {
    const r = city.visa?.incomeRequirement;
    if (!r?.monthly) return '–';
    return `${r.currency ?? 'USD'} ${r.monthly.toLocaleString()}`;
  }

  ngOnInit(): void {
    // Ensure full location data is loaded for comparison
    this.loc.loadFull();
    this.healthcare.load();
  }

  /* ─── Helpers ─────────────────────────────────── */

  fmt(val: number): string { return this.currency.currency(val); }

  /** Currency with cents — for the Total Monthly + Income Tax rows. */
  fmtCents(val: number): string { return this.currency.currencyPrecise(val); }

  /** Yearly currency — whole dollars + "/yr" suffix. For the audit banner. */
  fmtYear(val: number): string { return this.currency.currencyYearly(val); }

  /** FPL percentage formatted in plain language + threaded through dyscalculia
   *  count formatting (Dashboard Dyslexia DFA-2026-04-19-001). */
  fmtFplPct(pct: number): string {
    return this.dyscalculia.formatCount(Math.round(pct), '% of the poverty line');
  }

  fmtCost(city: LocationFull, key: string): string {
    const val = city.monthlyCosts[key]?.typical ?? 0;
    if (!val) return '–';
    return this.fmt(val);
  }

  /** Monthly cost total including computed income tax + effective healthcare. */
  totalWithTax(city: LocationFull): number {
    return this.cityFinances().get(city.id)?.totalWithTax ?? 0;
  }

  /** "What-if under the cliff" total — assumes ACA subsidy fully applies. */
  totalIfSubsidized(city: LocationFull): number {
    return this.cityFinances().get(city.id)?.totalIfSubsidized ?? 0;
  }

  /** Monthly cost of being above the 400% FPL cliff vs under. 0 if already subsidized. */
  cliffPenaltyMonthly(city: LocationFull): number {
    return this.cityFinances().get(city.id)?.cliffPenaltyMonthly ?? 0;
  }

  monthlyTax(city: LocationFull): number {
    return this.cityFinances().get(city.id)?.monthlyTax ?? 0;
  }

  healthcareMonthly(city: LocationFull): number {
    return this.cityFinances().get(city.id)?.decision.monthlyCost ?? 0;
  }

  healthcareSource(city: LocationFull): string {
    return this.cityFinances().get(city.id)?.decision.source ?? 'none';
  }

  /**
   * Returns the ACA estimate metadata (rateArea, level, disclaimer) for a
   * city when the household's healthcare regime is ACA-based. null for
   * Medicare-only households — no benchmark is in play.
   */
  acaEstimateFor(city: LocationFull) {
    const decision = this.cityFinances().get(city.id)?.decision;
    if (!decision || !decision.source.startsWith('aca')) return null;
    return decision.acaEstimate ?? null;
  }

  /**
   * Build a multi-line tooltip explaining the healthcare cell — surfaces the
   * location-specific MAGI, FPL%, regime (cliff/enhanced), and coverage
   * source so the user can see why a cheaper city produces a different
   * subsidy outcome than a more expensive one.
   */
  healthcareTooltip(city: LocationFull): string {
    const d = this.cityFinances().get(city.id)?.decision;
    if (!d) return '';
    const lines = [
      `Coverage: ${d.source}`,
      `MAGI for this city: ${this.fmtYear(d.magiUsed)}`,
      `FPL: ${this.fmtFplPct(d.fplPct ?? 0)}`,
      `Adults <65 / 65+: ${d.adultsPreMedicare} / ${d.adultsMedicare}`,
    ];
    if (d.aboveFplCliff) lines.push('Above 400% FPL cliff → no subsidy');
    if (d.subsidyEligible) lines.push('Subsidy active');
    return lines.join('\n');
  }

  /* ─── Audit banner helpers — surface the inputs driving the numbers ── */

  auditAdults(): string {
    const adults = (this.healthcare.household()?.members ?? [])
      .filter(m => m.role !== 'dependent');
    if (!adults.length) return 'none set';
    const yr = this.healthcare.household()?.planningStartYear ?? new Date().getFullYear();
    return adults.map(m => `${m.name || 'adult'} (${yr - m.birthYear})`).join(', ');
  }

  auditCashIn(): number { return this.healthcare.magi().cashIn; }
  auditMagi(): number { return this.healthcare.magi().magiForAca; }

  auditFplPct(): number {
    const magi = this.healthcare.magi().magiForAca;
    const adults = Math.max(1,
      (this.healthcare.household()?.members ?? []).filter(m => m.role !== 'dependent').length || 2
    );
    const fpl = fpl2026(adults);
    return magi > 0 ? (magi / fpl) * 100 : 0;
  }

  isCheapest(city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const min = Math.min(...locs.map(l => this.totalWithTax(l)));
    return this.totalWithTax(city) === min;
  }

  isPriciest(city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const max = Math.max(...locs.map(l => this.totalWithTax(l)));
    return this.totalWithTax(city) === max;
  }

  isBestInRow(key: string, city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const val = city.monthlyCosts[key]?.typical ?? 0;
    if (!val) return false;
    const min = Math.min(...locs.map(l => l.monthlyCosts[key]?.typical ?? Infinity));
    return val === min && val !== Infinity;
  }

  isWorstInRow(key: string, city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const val = city.monthlyCosts[key]?.typical ?? 0;
    if (!val) return false;
    const max = Math.max(...locs.filter(l => (l.monthlyCosts[key]?.typical ?? 0) > 0)
      .map(l => l.monthlyCosts[key]?.typical ?? 0));
    return val === max;
  }

  /** Simple block bar for 0–10 ratings */
  ratingBar(val: number | undefined): string {
    if (val == null) return '';
    const filled = Math.round(val);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  goToOverview(): void {
    this.nav.selectScreen('overview');
  }
}
