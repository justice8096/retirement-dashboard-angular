import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { HealthcareService } from '@services/healthcare.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { FinancialSettings, HouseholdProfile, COST_CATEGORIES, LocationFull } from '@models/api.model';

/* Guyton-Klinger guardrails.
 *   Base rate   : 4.0% of initial portfolio (inflation-adjusted annually).
 *   Floor       : 3.0%  — never withdraw less (preserves purchasing power).
 *   Ceiling     : 5.5%  — never withdraw more (preserves capital).
 *   Prosperity  : if current rate < 80% of initial AND portfolio > initial → +10% raise.
 *   Preservation: if current rate > 120% of initial → −10% cut.
 * All guardrails track inflation after year 0.
 */
const BASE_RATE = 0.04;
const FLOOR_RATE = 0.03;
const CEILING_RATE = 0.055;
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
  template: `
    <div class="gr-screen">
      <div class="screen-header">
        <span class="header-icon">🛡️</span>
        <div>
          <h2 class="header-title">Spending Guardrails</h2>
          <p class="header-sub">
            Guyton-Klinger bands — the safe corridor for withdrawals, with
            prosperity and preservation rules baked in.
          </p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      <div class="card">
        <h3 class="card-title">Your Inputs</h3>
        <div class="param-grid">
          <label class="param">
            <span class="param-label">Portfolio Balance</span>
            <input appNumeric="currency" class="param-input"
              [class]="dyscalculia.numberSpacingClass()"
              [ngModel]="portfolio()" (ngModelChange)="portfolio.set($event)" />
            @if (dyscalculia.isEnabled() && portfolio() > 0) {
              <span class="param-hint">{{ portfolioAnchor() }}</span>
            }
          </label>
          <label class="param">
            <span class="param-label">Annual Spending</span>
            <input appNumeric="currency" class="param-input"
              [class]="dyscalculia.numberSpacingClass()"
              [ngModel]="annualSpending()" (ngModelChange)="annualSpending.set($event)" />
            <span class="param-hint">Seeded from the first selected location × 12. Override freely.</span>
          </label>
        </div>
      </div>

      <div class="results">
        <div class="result-card highlight">
          <div class="result-label">Current Status</div>
          <div class="result-value status" [class.s-green]="guardrails().status === 'green'"
               [class.s-yellow]="guardrails().status === 'yellow'"
               [class.s-red]="guardrails().status === 'red'">
            {{ statusLabel(guardrails().status) }}
          </div>
          <div class="result-explain">{{ statusDetail(guardrails().status) }}</div>
        </div>
        <div class="result-card">
          <div class="result-label">Monthly Headroom</div>
          <div class="result-value lg" [class]="dyscalculia.numberSpacingClass()">
            {{ monthly(monthlyHeadroom()) }}
          </div>
          <div class="result-explain">
            Before ceiling: {{ monthly(guardrails().ceiling / 12) }}
          </div>
        </div>
        <div class="result-card">
          <div class="result-label">Years Until Breach</div>
          <div class="result-value lg">
            {{ yearsUntilBreach() === null ? 'Never' : yearsUntilBreach() + ' yrs' }}
          </div>
          <div class="result-explain">At current spending level</div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">Safe Spending Corridor (Annual)</h3>
        <div class="corridor">
          <div class="corridor-bar">
            <div class="corr-seg s-floor">
              <div class="corr-label">Floor (3%)</div>
              <div class="corr-val">{{ fmt(guardrails().floor) }}</div>
            </div>
            <div class="corr-seg s-base">
              <div class="corr-label">Base (4%)</div>
              <div class="corr-val">{{ fmt(guardrails().baseRate) }}</div>
            </div>
            <div class="corr-seg s-ceiling">
              <div class="corr-label">Ceiling (5.5%)</div>
              <div class="corr-val">{{ fmt(guardrails().ceiling) }}</div>
            </div>
          </div>
          <div class="corridor-marker">
            <span class="marker-pill">
              You spend {{ fmt(annualSpending()) }}
              <span class="marker-rate">({{ currentRatePct() }}% of portfolio)</span>
            </span>
          </div>

          @if (essentialFloorPct() != null) {
            <div class="ess-row">
              <div class="ess-cell">
                <div class="corr-label">Essential floor (dynamic)</div>
                <div class="corr-val">{{ fmt(essentialMonthly() * 12) }}</div>
                <div class="result-explain">
                  {{ essentialFloorPct()!.toFixed(2) }}% of portfolio — the dollar amount you genuinely
                  can't cut (rent, food, healthcare, insurance, utilities, transportation, taxes).
                </div>
              </div>
              <div class="ess-cell">
                <div class="corr-label">Discretionary (flex room)</div>
                <div class="corr-val">{{ fmt(discretionaryMonthly() * 12) }}</div>
                <div class="result-explain">
                  Entertainment, clothing, personal care, pet care, subscriptions, miscellaneous,
                  buffer. Cut here first in bad years before touching essentials.
                </div>
              </div>
            </div>
            @if (essentialFloorPct()! > 3) {
              <p class="ess-warn">
                ⚠ Your essential-spending floor ({{ essentialFloorPct()!.toFixed(2) }}%) is
                <strong>tighter than</strong> the static Guyton-Klinger 3% floor. Bad-sequence
                years bind harder than the rule-of-thumb implies — consider building a larger
                cash buffer or planning a lower-cost-of-living move as a backup.
              </p>
            }
          }
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">{{ PROJECTION_YEARS }}-Year Projection</h3>
        @if (!projectionTable().length) {
          <p class="param-hint">Add a portfolio balance to see a projection.</p>
        } @else {
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Year</th>
                  @if (primaryAge() !== null) { <th>Age</th> }
                  <th class="right">Portfolio</th>
                  <th class="right">Safe Withdrawal</th>
                  <th class="right">Spending</th>
                  <th class="right">Floor</th>
                  <th class="right">Ceiling</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (r of projectionTable(); track r.year) {
                  <tr>
                    <td>{{ r.year }}</td>
                    @if (primaryAge() !== null) { <td>{{ r.age }}</td> }
                    <td class="right">{{ lump(r.portfolio) }}</td>
                    <td class="right">{{ fmt(r.safeWithdrawal) }}</td>
                    <td class="right">{{ fmt(r.actualExpenses) }}</td>
                    <td class="right">{{ fmt(r.floor) }}</td>
                    <td class="right">{{ fmt(r.ceiling) }}</td>
                    <td>
                      <span class="status-pill"
                        [class.s-green]="r.status === 'green'"
                        [class.s-yellow]="r.status === 'yellow'"
                        [class.s-red]="r.status === 'red'">
                        {{ statusLabel(r.status) }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <div class="insights">
        <h3 class="card-title">How the bands work</h3>
        <ul>
          <li><strong>Base:</strong> start at 4% of portfolio, inflation-adjust every year.</li>
          <li><strong>Prosperity rule:</strong> if your rate drops below 80% of initial AND portfolio exceeded initial, raise withdrawal by 10%.</li>
          <li><strong>Preservation rule:</strong> if your rate exceeds 120% of initial, cut by 10%.</li>
          <li><strong>Floor / ceiling:</strong> never outside the 3% – 5.5% band (inflation-adjusted).</li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .gr-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; line-height: var(--prose-line-height, 1.5); }
    .badge-new {
      font-size: 10px; font-weight: 700; color: var(--dark-green);
      padding: 2px 8px; background: rgba(76, 175, 80, 0.12); border-radius: 4px;
    }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
    .param { display: flex; flex-direction: column; gap: 4px; }
    .param-label { font-size: 11px; color: var(--dark-text-muted); }
    .param-input {
      padding: 8px 12px; border-radius: 8px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text);
      font-size: 14px; font-family: var(--font-sans); outline: none;
    }
    .param-input:focus { border-color: var(--dark-blue); }
    .param-hint {
      font-size: 12px; color: var(--dark-text-muted);
      line-height: var(--prose-line-height, 1.5); margin-top: 4px;
    }

    .results { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .result-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .result-card.highlight { border-color: var(--dark-amber); }
    .result-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .result-value { font-size: 15px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; }
    .result-value.lg { font-size: 22px; line-height: 1.2; }
    .result-value.status { font-size: 18px; }
    .result-value.status.s-green { color: var(--dark-green); }
    .result-value.status.s-yellow { color: var(--dark-amber); }
    .result-value.status.s-red { color: var(--dark-neutral); }
    .result-explain { font-size: 11px; color: var(--dark-text-muted); margin-top: 4px; }

    .corridor { display: flex; flex-direction: column; gap: 14px; }
    .corridor-bar {
      display: grid; grid-template-columns: 1fr 1.5fr 1.5fr; gap: 2px;
      border-radius: 10px; overflow: hidden;
    }
    .corr-seg {
      padding: 14px 12px; display: flex; flex-direction: column; gap: 4px;
      background: var(--dark-bg-secondary);
    }
    .corr-seg.s-floor    { border-left: 3px solid var(--dark-neutral); }
    .corr-seg.s-base     { border-left: 3px solid var(--dark-green); }
    .corr-seg.s-ceiling  { border-left: 3px solid var(--dark-blue); }
    .corr-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .corr-val {
      font-size: 15px; font-weight: 700; color: var(--dark-text);
      font-variant-numeric: tabular-nums;
    }
    .corridor-marker { display: flex; justify-content: center; }
    .ess-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
    .ess-cell {
      padding: 14px 16px; background: var(--dark-bg-secondary); border-radius: 8px;
      border-left: 3px solid var(--dark-amber);
    }
    .ess-cell:first-child { border-left-color: var(--dark-neutral); }
    .ess-warn {
      margin-top: 12px; padding: 10px 14px; font-size: 13px; line-height: 1.4;
      background: rgba(212, 148, 58, 0.08); border-left: 3px solid var(--dark-amber);
      border-radius: 6px; color: var(--dark-text-sec);
    }
    .marker-pill {
      padding: 8px 14px; border-radius: 999px;
      background: rgba(212, 148, 58, 0.12); color: var(--dark-amber);
      font-size: 13px; font-weight: 600;
    }
    .marker-rate { color: var(--dark-text-muted); font-weight: 500; margin-left: 4px; }

    .table-wrap { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table th, .data-table td {
      padding: 8px 10px; border-bottom: 1px solid var(--dark-border);
      text-align: left;
    }
    .data-table th {
      font-weight: 600; font-size: 11px; color: var(--dark-text-muted);
      text-transform: uppercase; letter-spacing: 0.4px;
    }
    .data-table td { color: var(--dark-text); }
    .data-table .right { text-align: right; font-variant-numeric: tabular-nums; }

    .status-pill {
      display: inline-block; padding: 2px 10px; border-radius: 10px;
      font-size: 11px; font-weight: 600;
    }
    .status-pill.s-green  { background: rgba(76, 175, 80, 0.15); color: var(--dark-green); }
    .status-pill.s-yellow { background: rgba(212, 148, 58, 0.15); color: var(--dark-amber); }
    .status-pill.s-red    { background: rgba(139, 157, 195, 0.18); color: var(--dark-neutral); }

    .insights {
      background: rgba(92, 156, 230, 0.08); border-left: 4px solid var(--dark-blue);
      border-radius: 8px; padding: 16px 20px;
    }
    .insights ul {
      margin: 0; padding-left: 20px;
      font-size: 13px; color: var(--dark-text-sec);
      line-height: var(--prose-line-height, 1.6);
    }
    .insights strong { color: var(--dark-text); }
  `],
})
export class GuardrailsScreenComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly loc = inject(LocationService);
  readonly healthcareSvc = inject(HealthcareService);
  readonly dyscalculia = inject(DyscalculiaService);

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

  /** Current-year bands. `baseRate` etc. are DOLLAR values (portfolio × rate). */
  readonly guardrails = computed(() => {
    const p = this.portfolio();
    if (p <= 0) {
      return { baseRate: 0, floor: 0, ceiling: 0, safeWithdrawal: 0, status: 'red' as Status };
    }
    const baseRate = p * BASE_RATE;
    const floor    = p * FLOOR_RATE;
    const ceiling  = p * CEILING_RATE;
    const safeWithdrawal = Math.max(floor, Math.min(ceiling, baseRate));
    const spending = this.annualSpending();
    const status: Status =
      spending < floor ? 'green' :
      spending <= ceiling ? 'yellow' : 'red';
    return { baseRate, floor, ceiling, safeWithdrawal, status };
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
    const floor0 = p * FLOOR_RATE;
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
  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(Math.round(amount), '/yr')
      : '$' + Math.round(amount).toLocaleString() + '/yr';
  }

  /** Lump sum, no time-unit suffix — used for the portfolio column. */
  lump(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(Math.round(amount), '')
      : '$' + Math.round(amount).toLocaleString();
  }

  /** Monthly amount — used for the headroom card. */
  monthly(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(Math.round(amount), '/mo')
      : '$' + Math.round(amount).toLocaleString() + '/mo';
  }
}
