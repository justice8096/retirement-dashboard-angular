import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { HouseholdProfile, InheritanceTaxInfo, LocationFull } from '@models/api.model';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';

/* 2026 federal estate tax parameters.
 *   - Exemption: $13.61M per person (reverts to ~$7M in 2026 if not extended).
 *   - Top federal estate tax rate: 40%.
 *   - Annual QCD limit from IRAs directly to charity: $105,000 (2024+ inflation-indexed).
 * Source: IRS rev. proc. 2024-40, §2010, §408(d)(8).
 */
const ESTATE_EXEMPTION_2026 = 13_610_000;
const ESTATE_TAX_RATE = 0.40;
const QCD_LIMIT = 105_000;
const RETURN_RATE = 0.06;

interface EstateYear {
  age: number;
  year: number;
  portfolioValue: number;
  annualExpenses: number;
  charityGiving: number;
  withdrawal: number;
  estateTax: number;
  netEstate: number;
}

@Component({
  selector: 'app-estate-screen',
  standalone: true,
  imports: [FormsModule, NumericInputDirective, SourceTooltipComponent],
  templateUrl: './estate-screen.component.html',
  styleUrls: ['./estate-screen.component.scss'],
})
export class EstateScreenComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly ESTATE_EXEMPTION_2026 = ESTATE_EXEMPTION_2026;
  readonly QCD_LIMIT = QCD_LIMIT;

  /** Selected location for the inheritance/estate-tax card (Phase 3a).
   *  Defaults to the first full location once they load — same pattern as
   *  the Monte Carlo screen. */
  readonly selectedLocationId = signal<string>('');

  readonly selectedLocationFull = computed<LocationFull | null>(() =>
    this.loc.fullLocations().find(l => l.id === this.selectedLocationId()) ?? null
  );

  readonly selectedLocationCountry = computed(() =>
    this.selectedLocationFull()?.country ?? '—'
  );

  readonly selectedLocationInheritance = computed<InheritanceTaxInfo | null>(() =>
    this.selectedLocationFull()?.taxes?.inheritance ?? null
  );

  /** Currency symbol for the selected location — used by `exemptionDisplay`
   *  to render local-currency thresholds (€ for EU, $ for US/Ecuador, etc.).
   *  Falls back to the location's currency code when no symbol is registered. */
  private readonly currencySymbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', HRK: 'kn', JPY: '¥',
  };

  readonly initialPortfolio = signal(500_000);
  readonly desiredLegacy = signal(500_000);
  readonly charityPerYear = signal(5_000);
  readonly annualExpenses = signal(60_000);
  readonly projectionAge = signal(100);
  readonly household = signal<HouseholdProfile | null>(null);

  /** Year 0 calendar year. Uses the household planning-start year if set so
   *  projections start where the Monte Carlo and Guardrails screens start. */
  readonly startYear = computed(() => this.household()?.planningStartYear ?? new Date().getFullYear());

  /** Primary member's birth year — drives the starting age. Defaults to 62
   *  (retirement-ish) if no household profile is loaded. */
  readonly startAge = computed(() => {
    const h = this.household();
    const primary = h?.members?.find(m => m.role === 'primary');
    if (!primary) return 62;
    return this.startYear() - primary.birthYear;
  });

  /** Plain-language magnitude anchor for the initial portfolio input. */
  readonly portfolioAnchor = computed(() =>
    this.dyscalculia.getAnchor(this.initialPortfolio(), 'portfolio', this.annualExpenses() || undefined)
  );

  readonly projections = computed<EstateYear[]>(() => {
    const start = this.startAge();
    const end = this.projectionAge();
    if (end < start) return [];
    const rows: EstateYear[] = [];
    let portfolio = this.initialPortfolio();
    const baseCharity = this.charityPerYear();
    const expenses = this.annualExpenses();
    const legacyTarget = this.desiredLegacy();

    for (let y = 0; y <= end - start; y++) {
      const age = start + y;
      const year = this.startYear() + y;

      // Charity boost: if portfolio exceeds 130% of legacy target, bump charity up to 1.5×
      // but don't exceed the annual QCD ceiling — matches legacy formula.
      const charity = portfolio > legacyTarget * 1.3
        ? Math.min(baseCharity * 1.5, QCD_LIMIT)
        : baseCharity;

      const withdrawal = Math.min(charity + expenses, portfolio);
      const afterWithdrawal = Math.max(0, portfolio - withdrawal);
      const afterGrowth = afterWithdrawal * (1 + RETURN_RATE);

      const taxableEstate = Math.max(0, afterGrowth - ESTATE_EXEMPTION_2026);
      const estateTax = taxableEstate * ESTATE_TAX_RATE;
      const netEstate = afterGrowth - estateTax;

      rows.push({
        age, year,
        portfolioValue: Math.round(afterGrowth),
        annualExpenses: Math.round(expenses),
        charityGiving: Math.round(charity),
        withdrawal: Math.round(withdrawal),
        estateTax: Math.round(estateTax),
        netEstate: Math.round(netEstate),
      });
      portfolio = afterGrowth;
    }
    return rows;
  });

  readonly finalRow = computed<EstateYear | null>(() => {
    const p = this.projections();
    return p.length ? p[p.length - 1]! : null;
  });

  readonly totalCharityGiven = computed(() =>
    this.projections().reduce((s, r) => s + r.charityGiving, 0)
  );

  readonly maxValueOnChart = computed(() =>
    this.projections().reduce((m, r) => Math.max(m, r.portfolioValue, r.netEstate), 1)
  );

  /** Seed the inheritance-tax card's location selector once full locations
   *  load. Mirrors the MC screen's defaultLocationEffect — auto-cleans up
   *  on component destroy via Angular's effect lifecycle. */
  private defaultLocationEffect = effect(() => {
    const list = this.loc.fullLocations();
    if (list.length && !this.selectedLocationId()) {
      this.selectedLocationId.set(list[0].id);
    }
  });

  ngOnInit(): void {
    this.loc.loadFull();
    this.api.getHousehold().subscribe({
      next: (h) => {
        this.household.set(h);
        if (h.targetAnnualIncome && this.annualExpenses() === 60_000) {
          this.annualExpenses.set(Math.round(Number(h.targetAnnualIncome) || 60_000));
        }
      },
      error: (err) => console.warn('Estate: household fetch failed.', err),
    });
    this.api.getFinancial().subscribe({
      next: (f) => {
        if (f.portfolioBalance && this.initialPortfolio() === 500_000) {
          this.initialPortfolio.set(Math.round(Number(f.portfolioBalance) || 500_000));
          this.desiredLegacy.set(Math.round(Number(f.portfolioBalance) || 500_000));
        }
      },
      error: (err) => console.warn('Estate: financial fetch failed.', err),
    });
  }

  atAge(age: number): EstateYear | null {
    return this.projections().find(r => r.age === age) ?? null;
  }

  pctOfMax(value: number): number {
    const max = this.maxValueOnChart();
    return max > 0 ? Math.min(100, (value / max) * 100) : 0;
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(Math.round(amount), '')
      : '$' + Math.round(amount).toLocaleString();
  }

  /** Plain-language label for the spouseExemption enum. */
  spouseLabel(exemption: 'full' | 'partial' | 'none'): string {
    if (exemption === 'full') return 'Fully exempt';
    if (exemption === 'partial') return 'Partial exemption';
    return 'No exemption';
  }

  /** Render an exemptionLocal threshold in the location's local currency.
   *  Phase 1 / Phase 2 store these as raw numbers in primary local currency
   *  (e.g. 100000 EUR for France). Show with the currency symbol prefix. */
  exemptionDisplay(amountLocal: number): string {
    const cur = this.selectedLocationFull()?.currency ?? 'USD';
    const symbol = this.currencySymbols[cur] ?? cur + ' ';
    return symbol + amountLocal.toLocaleString();
  }
}
