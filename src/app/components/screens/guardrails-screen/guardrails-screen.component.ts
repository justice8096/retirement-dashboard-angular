import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { HealthcareService } from '@services/healthcare.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { FinancialSettings, HouseholdProfile, COST_CATEGORIES, LocationFull } from '@models/api.model';
import {
  FIRE_WITHDRAWAL_RATE as BASE_RATE,
  GUARDRAIL_FLOOR_RATE as FLOOR_RATE,
  GUARDRAIL_CEILING_RATE as CEILING_RATE,
} from '@app/lib/fire-math';

/* Guyton-Klinger guardrails.
 *   Base rate   : 4.0% of initial portfolio (inflation-adjusted annually).
 *   Floor       : 3.0%  — never withdraw less (preserves purchasing power).
 *   Ceiling     : 5.5%  — never withdraw more (preserves capital).
 *   Prosperity  : if current rate < 80% of initial AND portfolio > initial → +10% raise.
 *   Preservation: if current rate > 120% of initial → −10% cut.
 * All guardrails track inflation after year 0.
 */
const NOMINAL_RETURN = 0.07;
const INFLATION_RATE = 0.03;
const PROJECTION_YEARS = 20;
const PROSPERITY_THRESHOLD = 0.80;
const PRESERVATION_THRESHOLD = 1.20;

type Status = 'green' | 'yellow' | 'red';

interface ProjectionRow {
  year: number;
  age: number | null;
  portfolio: number;
  safeWithdrawal: number;
  actualExpenses: number;
  floor: number;
  ceiling: number;
  status: Status;
}

@Component({
  selector: 'app-guardrails-screen',
  standalone: true,
  imports: [FormsModule, NumericInputDirective],
  templateUrl: './guardrails-screen.component.html',
  styleUrls: ['./guardrails-screen.component.scss'],
})
export class GuardrailsScreenComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly loc = inject(LocationService);
  readonly healthcareSvc = inject(HealthcareService);
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly currencySvc = inject(CurrencyFormatService);

  readonly PROJECTION_YEARS = PROJECTION_YEARS;

  readonly portfolio = signal(0);
  readonly annualSpending = signal(0);
  readonly household = signal<HouseholdProfile | null>(null);

  readonly primary = computed(() => {
    const h = this.household();
    if (!h) return null;
    return h.members.find(m => m.role === 'primary') ?? null;
  });

  readonly primaryAge = computed<number | null>(() => {
    const p = this.primary();
    const h = this.household();
    if (!p || !h) return null;
    return h.planningStartYear - p.birthYear;
  });

  /** Plain-language magnitude anchor for the portfolio input. Yearly-spending
   *  context is passed so the anchor reads as "about N years of your planned
   *  spending" rather than the generic bracket. */
  readonly portfolioAnchor = computed(() =>
    this.dyscalculia.getAnchor(this.portfolio(), 'portfolio', this.annualSpending() || undefined)
  );

  /** Current-year bands. `baseRate` etc. are DOLLAR values (portfolio × rate).
   *
   *  Floor semantics (#24): two floors, take the larger.
   *    - Static Guyton-Klinger floor: portfolio × FLOOR_RATE (3%) — purchasing
   *      power preservation; protects against over-cutting in real terms.
   *    - Dynamic essential-spending floor: essentialAnnual — livelihood
   *      preservation; the dollar amount the household genuinely cannot
   *      cut without hitting rent/food/healthcare/insurance/utilities.
   *  When essential > 3% of portfolio, the dynamic floor binds and the
   *  household has a tighter floor than the rule-of-thumb implies. */
  readonly guardrails = computed(() => {
    const p = this.portfolio();
    if (p <= 0) {
      return {
        baseRate: 0, floor: 0, ceiling: 0, safeWithdrawal: 0,
        staticFloor: 0, essentialFloor: 0, floorBinding: 'static' as 'static' | 'essential',
        status: 'red' as Status,
      };
    }
    const baseRate = p * BASE_RATE;
    const staticFloor = p * FLOOR_RATE;
    const essentialFloor = this.essentialMonthly() * 12;
    const floor    = Math.max(staticFloor, essentialFloor);
    const floorBinding: 'static' | 'essential' =
      essentialFloor > staticFloor ? 'essential' : 'static';
    const ceiling  = p * CEILING_RATE;
    const safeWithdrawal = Math.max(floor, Math.min(ceiling, baseRate));
    const spending = this.annualSpending();
    const status: Status =
      spending < floor ? 'green' :
      spending <= ceiling ? 'yellow' : 'red';
    return { baseRate, floor, ceiling, safeWithdrawal, staticFloor, essentialFloor, floorBinding, status };
  });

  readonly monthlyHeadroom = computed(() =>
    Math.max(0, (this.guardrails().ceiling - this.annualSpending()) / 12)
  );

  /**
   * Sum of essential monthly cost categories in the user's selected location
   * — the spending floor the household genuinely cannot cut in a bad-sequence
   * year. Discretionary (entertainment, clothing, subscriptions, pet care,
   * personal care, miscellaneous, buffer) flexes; essential stays.
   */
  readonly essentialMonthly = computed(() => this.sumByEssential(true));
  readonly discretionaryMonthly = computed(() => this.sumByEssential(false));

  /** Essential spending as a % of portfolio — the dynamic spending floor.
   *  When > 3% (the static Guyton-Klinger floor), the household has a
   *  tighter floor than the rule-of-thumb assumes — bad-sequence years
   *  bind harder. When < 3%, more headroom than the static floor implies. */
  readonly essentialFloorPct = computed<number | null>(() => {
    const p = this.portfolio();
    const annual = this.essentialMonthly() * 12;
    if (p <= 0 || annual <= 0) return null;
    return (annual / p) * 100;
  });

  private sumByEssential(wantEssential: boolean): number {
    const ids = this.loc.selectedIds();
    const locs = this.loc.fullLocations().filter(l => ids.has(l.id));
    const target: LocationFull | undefined = locs[0] ?? this.loc.fullLocations()[0];
    if (!target) return 0;
    const mc = target.monthlyCosts ?? {};
    let total = 0;
    for (const cat of COST_CATEGORIES) {
      // Skip both healthcare alternates here — the effective cost (Medicare
      // vs ACA-subsidized vs ACA-unsubsidized, household-age + MAGI aware)
      // is added below via HealthcareService. Skipping the seed `healthcare`
      // line here avoids double-counting and underrepresenting pre-Medicare
      // households whose actual floor includes ACA premiums, not Medicare.
      if (cat.alternate) continue;
      if (cat.key === 'healthcare') continue;
      if (!!cat.essential !== wantEssential) continue;
      const v = mc[cat.key]?.typical;
      if (typeof v === 'number') total += v;
    }
    if (wantEssential) {
      total += this.healthcareSvc.decide(target).monthlyCost;
    }
    return total;
  }

  readonly currentRatePct = computed(() => {
    const p = this.portfolio();
    if (p <= 0) return '0.00';
    return ((this.annualSpending() / p) * 100).toFixed(2);
  });

  readonly projectionTable = computed<ProjectionRow[]>(() => {
    const p = this.portfolio();
    if (p <= 0) return [];
    const h = this.household();
    const startYear = h?.planningStartYear ?? new Date().getFullYear();
    const primaryBirth = this.primary()?.birthYear ?? null;
    const spend0 = this.annualSpending();
    const baseDollars = p * BASE_RATE;
    // Same dual-floor semantics as `guardrails()`: take the larger of the
    // 3% static floor and the essential-spending dollar floor (#24).
    // Both inflate at the same rate, so taking max() at year 0 and
    // multiplying by inflMult preserves the binding floor across years.
    const staticFloor0 = p * FLOOR_RATE;
    const essentialFloor0 = this.essentialMonthly() * 12;
    const floor0 = Math.max(staticFloor0, essentialFloor0);
    const ceiling0 = p * CEILING_RATE;

    let projPortfolio = p;
    let currentWithdrawal = baseDollars;
    const rows: ProjectionRow[] = [];

    for (let y = 0; y <= PROJECTION_YEARS; y++) {
      const inflMult = Math.pow(1 + INFLATION_RATE, y);
      const inflatedFloor = floor0 * inflMult;
      const inflatedCeiling = ceiling0 * inflMult;

      // Prosperity: below 80% of initial rate AND portfolio above starting value → +10%.
      if (currentWithdrawal < baseDollars * PROSPERITY_THRESHOLD && projPortfolio > p) {
        currentWithdrawal *= 1.1;
      }
      // Preservation: above 120% of initial → −10%.
      if (currentWithdrawal > baseDollars * PRESERVATION_THRESHOLD) {
        currentWithdrawal *= 0.9;
      }
      currentWithdrawal = Math.max(inflatedFloor, Math.min(inflatedCeiling, currentWithdrawal));

      const actualExpenses = spend0 * inflMult;
      const status: Status =
        actualExpenses < inflatedFloor ? 'green' :
        actualExpenses <= inflatedCeiling ? 'yellow' : 'red';

      rows.push({
        year: startYear + y,
        age: primaryBirth !== null ? (startYear + y) - primaryBirth : null,
        portfolio: Math.round(projPortfolio),
        safeWithdrawal: Math.round(currentWithdrawal),
        actualExpenses: Math.round(actualExpenses),
        floor: Math.round(inflatedFloor),
        ceiling: Math.round(inflatedCeiling),
        status,
      });

      // Grow for next year using nominal return, net of this year's withdrawal.
      projPortfolio = (projPortfolio - currentWithdrawal) * (1 + NOMINAL_RETURN);
    }

    return rows;
  });

  readonly yearsUntilBreach = computed<number | null>(() => {
    const idx = this.projectionTable().findIndex(r => r.status === 'red');
    return idx < 0 ? null : idx;
  });

  ngOnInit(): void {
    this.api.getFinancial().subscribe({
      next: (f: FinancialSettings) => {
        if (this.portfolio() === 0) this.portfolio.set(f.portfolioBalance ?? 0);
      },
      error: (err) => console.warn('Guardrails: financial fetch failed.', err),
    });

    this.api.getHousehold().subscribe({
      next: (h) => {
        this.household.set(h);
        // Seed annual spending from household target if we don't already have a better signal.
        if (this.annualSpending() === 0 && h.targetAnnualIncome) {
          this.annualSpending.set(Number(h.targetAnnualIncome) || 0);
        }
      },
      error: (err) => console.warn('Guardrails: household fetch failed.', err),
    });

    this.loc.loadFull();
    // Seed spending from the cheapest full location × 12 if nothing else populates it.
    queueMicrotask(() => {
      if (this.annualSpending() > 0) return;
      const full = this.loc.fullLocations();
      if (!full.length) return;
      const selectedIds = this.loc.selectedIds();
      const pool = selectedIds.size
        ? full.filter(l => selectedIds.has(l.id))
        : full;
      if (!pool.length) return;
      const monthly = pool[0]!.monthlyCostTotal ?? 0;
      if (monthly > 0) this.annualSpending.set(Math.round(monthly * 12));
    });
  }

  statusLabel(s: Status): string {
    return s === 'green' ? '✓ Safe' : s === 'yellow' ? '⚠ Caution' : '✗ Over Ceiling';
  }

  statusDetail(s: Status): string {
    return s === 'green' ? 'Well within the safe range'
         : s === 'yellow' ? 'Inside the band, monitor each year'
         : 'Spending exceeds the preservation ceiling';
  }

  /** Annual-dollar amount — used for withdrawals, expenses, floor/ceiling. */
  fmt(amount: number): string { return this.currencySvc.currencyYearly(amount); }

  /** Lump sum, no time-unit suffix — used for the portfolio column. */
  lump(amount: number): string { return this.currencySvc.currency(amount); }

  /** Monthly amount — used for the headroom card. */
  monthly(amount: number): string { return this.currencySvc.currencyMonthly(amount); }
}
