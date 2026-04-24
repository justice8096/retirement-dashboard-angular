import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { HouseholdProfile } from '@models/api.model';

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
  imports: [FormsModule, NumericInputDirective],
  template: `
    <div class="estate-screen">
      <div class="screen-header">
        <span class="header-icon">🏛️</span>
        <div>
          <h2 class="header-title">Estate Planning</h2>
          <p class="header-sub">
            Portfolio depletion, charitable giving, and estate-tax impact through to your projection age.
          </p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      <div class="card exemption-note">
        <strong>2026 federal exemption: {{ fmt(ESTATE_EXEMPTION_2026) }} per person.</strong>
        Estates below this threshold owe no federal estate tax. The exemption is scheduled to sunset
        to roughly $7M in 2026 unless Congress extends it.
      </div>

      <div class="card">
        <h3 class="card-title">Your Inputs</h3>
        <div class="param-grid">
          <label class="param">
            <span class="param-label">Initial Portfolio</span>
            <input appNumeric="currency" class="param-input"
              [class]="dyscalculia.numberSpacingClass()"
              [ngModel]="initialPortfolio()" (ngModelChange)="initialPortfolio.set($event)" />
            @if (dyscalculia.isEnabled() && initialPortfolio() > 0) {
              <span class="param-hint">{{ portfolioAnchor() }}</span>
            }
          </label>
          <label class="param">
            <span class="param-label">Desired Legacy</span>
            <input appNumeric="currency" class="param-input"
              [class]="dyscalculia.numberSpacingClass()"
              [ngModel]="desiredLegacy()" (ngModelChange)="desiredLegacy.set($event)" />
            <span class="param-hint">Used to trigger a charity boost when the portfolio grows past 130% of this amount.</span>
          </label>
          <label class="param">
            <span class="param-label">Annual Expenses</span>
            <input appNumeric="currency" class="param-input"
              [class]="dyscalculia.numberSpacingClass()"
              [ngModel]="annualExpenses()" (ngModelChange)="annualExpenses.set($event)" />
          </label>
          <label class="param">
            <span class="param-label">Charity per Year (QCD)</span>
            <input appNumeric="currency" class="param-input"
              [class]="dyscalculia.numberSpacingClass()"
              [ngModel]="charityPerYear()" (ngModelChange)="charityPerYear.set($event)" />
            <span class="param-hint"
              [class.warn]="charityPerYear() > QCD_LIMIT">
              {{ charityPerYear() > QCD_LIMIT ? 'Exceeds annual QCD limit of ' + fmt(QCD_LIMIT) : 'Max QCD: ' + fmt(QCD_LIMIT) + '/yr' }}
            </span>
          </label>
          <label class="param">
            <span class="param-label">Project to Age</span>
            <input type="range" min="80" max="105" class="range-input"
              [ngModel]="projectionAge()" (ngModelChange)="projectionAge.set(+$event)" />
            <span class="param-hint">Age {{ projectionAge() }}</span>
          </label>
        </div>
      </div>

      <!-- Key milestones -->
      <div class="results">
        @for (age of [90, 95, 100]; track age) {
          <div class="result-card" [class.highlight]="age === projectionAge()">
            <div class="result-label">Projected at {{ age }}</div>
            @if (atAge(age); as row) {
              <div class="result-value">{{ fmt(row.netEstate) }}</div>
              <div class="result-explain">Taxes: {{ fmt(row.estateTax) }}</div>
            } @else {
              <div class="result-value muted">—</div>
              <div class="result-explain">Beyond projection</div>
            }
          </div>
        }
      </div>

      <!-- Portfolio + net estate over time (CSS bar chart) -->
      <div class="card">
        <h3 class="card-title">Net Legacy Over Time</h3>
        <div class="chart">
          @for (row of projections(); track row.year) {
            <div class="chart-bar" [title]="'Age ' + row.age + ' — portfolio ' + fmt(row.portfolioValue) + ', net ' + fmt(row.netEstate)">
              <div class="bar-portfolio" [style.height.%]="pctOfMax(row.portfolioValue)"></div>
              <div class="bar-net" [style.height.%]="pctOfMax(row.netEstate)"></div>
            </div>
          }
        </div>
        <div class="chart-legend">
          <span><span class="swatch sw-portfolio"></span> Portfolio</span>
          <span><span class="swatch sw-net"></span> Net Estate (after taxes)</span>
        </div>
      </div>

      <!-- Final composition -->
      <div class="card">
        <h3 class="card-title">Final Estate Composition — Age {{ projectionAge() }}</h3>
        @if (finalRow(); as fr) {
          <div class="composition">
            <div class="comp-bar">
              <div class="comp-seg charity" [style.flex-grow]="totalCharityGiven()"></div>
              <div class="comp-seg tax"     [style.flex-grow]="fr.estateTax"></div>
              <div class="comp-seg heirs"   [style.flex-grow]="fr.netEstate"></div>
            </div>
            <div class="comp-legend">
              <div><span class="swatch sw-charity"></span> Charity (lifetime): <strong>{{ fmt(totalCharityGiven()) }}</strong></div>
              <div><span class="swatch sw-tax"></span> Estate tax: <strong>{{ fmt(fr.estateTax) }}</strong></div>
              <div><span class="swatch sw-heirs"></span> Net to heirs: <strong>{{ fmt(fr.netEstate) }}</strong></div>
            </div>
          </div>
        } @else {
          <p class="muted">Set household birth years on Assumptions to see a projection.</p>
        }
      </div>

      <!-- Year-by-year table -->
      <div class="card">
        <h3 class="card-title">Year-by-Year Projection</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Age</th>
                <th>Year</th>
                <th class="right">Portfolio</th>
                <th class="right">Expenses</th>
                <th class="right">Charity (QCD)</th>
                <th class="right">Withdrawal</th>
                <th class="right">Estate Tax</th>
                <th class="right">Net Legacy</th>
              </tr>
            </thead>
            <tbody>
              @for (row of projections(); track row.year) {
                <tr>
                  <td>{{ row.age }}</td>
                  <td>{{ row.year }}</td>
                  <td class="right">{{ fmt(row.portfolioValue) }}</td>
                  <td class="right">{{ fmt(row.annualExpenses) }}</td>
                  <td class="right green">{{ fmt(row.charityGiving) }}</td>
                  <td class="right">{{ fmt(row.withdrawal) }}</td>
                  <td class="right red">{{ fmt(row.estateTax) }}</td>
                  <td class="right strong">{{ fmt(row.netEstate) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="insights">
        <h3 class="card-title">Estate Planning Strategies</h3>
        <ul>
          <li><strong>QCD:</strong> IRA → charity distributions (up to {{ fmt(QCD_LIMIT) }}/yr) reduce MAGI and sidestep IRMAA.</li>
          <li><strong>Annual exclusion gifts:</strong> $18,000/person/yr (2024) tax-free, doesn't chip at lifetime exemption.</li>
          <li><strong>Roth conversion:</strong> Convert pre-death to shrink the taxable estate (taxes paid now, heirs inherit tax-free).</li>
          <li><strong>CRT:</strong> Charitable Remainder Trust gives income to you/heirs with remainder to charity.</li>
          <li><strong>Portability:</strong> Surviving spouse can claim the deceased spouse's unused exemption on timely filing.</li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .estate-screen { display: flex; flex-direction: column; gap: 16px; }
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
    .exemption-note {
      font-size: 13px; color: var(--dark-text-sec); line-height: var(--prose-line-height, 1.5);
      border-left: 4px solid var(--dark-amber); padding-left: 20px;
    }
    .exemption-note strong { color: var(--dark-amber); }

    .param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
    .param { display: flex; flex-direction: column; gap: 4px; }
    .param-label { font-size: 11px; color: var(--dark-text-muted); }
    .param-input {
      padding: 8px 12px; border-radius: 8px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text);
      font-size: 14px; font-family: var(--font-sans); outline: none;
    }
    .param-input:focus { border-color: var(--dark-blue); }
    .range-input { width: 100%; accent-color: var(--dark-amber); }
    .param-hint {
      font-size: 12px; color: var(--dark-text-muted);
      line-height: var(--prose-line-height, 1.5); margin-top: 4px;
    }
    .param-hint.warn { color: var(--dark-neutral); }

    .results { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .result-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .result-card.highlight { border-color: var(--dark-amber); background: rgba(212, 148, 58, 0.05); }
    .result-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .result-value { font-size: 22px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; font-variant-numeric: tabular-nums; }
    .result-value.muted { color: var(--dark-text-muted); }
    .result-explain { font-size: 11px; color: var(--dark-text-muted); margin-top: 4px; }

    .chart {
      display: flex; align-items: flex-end; gap: 2px; height: 240px;
      padding: 8px; background: var(--dark-bg-secondary); border-radius: 8px;
      overflow-x: auto;
    }
    .chart-bar {
      flex: 1 1 0; min-width: 10px; height: 100%;
      position: relative; display: flex; flex-direction: column; justify-content: flex-end;
    }
    .bar-portfolio {
      background: var(--dark-blue); width: 100%; opacity: 0.45;
      position: absolute; bottom: 0; left: 0;
    }
    .bar-net {
      background: var(--dark-green); width: 100%;
      position: absolute; bottom: 0; left: 0;
    }
    .chart-legend {
      display: flex; gap: 16px; padding-top: 10px; font-size: 11px; color: var(--dark-text-sec);
    }
    .swatch {
      display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px;
      vertical-align: middle;
    }
    .sw-portfolio { background: var(--dark-blue); }
    .sw-net       { background: var(--dark-green); }
    .sw-charity   { background: var(--dark-green); }
    .sw-tax       { background: var(--dark-neutral); }
    .sw-heirs     { background: var(--dark-amber); }

    .composition { display: flex; flex-direction: column; gap: 14px; }
    .comp-bar { display: flex; height: 26px; border-radius: 6px; overflow: hidden; }
    .comp-seg.charity { background: var(--dark-green); }
    .comp-seg.tax     { background: var(--dark-neutral); }
    .comp-seg.heirs   { background: var(--dark-amber); }
    .comp-legend { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--dark-text-sec); }
    .comp-legend strong { color: var(--dark-text); font-variant-numeric: tabular-nums; }

    .table-wrap { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table th, .data-table td {
      padding: 8px 10px; border-bottom: 1px solid var(--dark-border); text-align: left;
    }
    .data-table th {
      font-weight: 600; font-size: 11px; color: var(--dark-text-muted);
      text-transform: uppercase; letter-spacing: 0.4px;
    }
    .data-table td { color: var(--dark-text); }
    .data-table .right { text-align: right; font-variant-numeric: tabular-nums; }
    .data-table .strong { font-weight: 700; color: var(--dark-amber); }
    .green { color: var(--dark-green); }
    .red   { color: var(--dark-neutral); }
    .muted { color: var(--dark-text-muted); }

    .insights {
      background: rgba(76, 175, 80, 0.08); border-left: 4px solid var(--dark-green);
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
export class EstateScreenComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly ESTATE_EXEMPTION_2026 = ESTATE_EXEMPTION_2026;
  readonly QCD_LIMIT = QCD_LIMIT;

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

  ngOnInit(): void {
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
}
