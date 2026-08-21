import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { FinancialSettings, HouseholdProfile } from '@models/api.model';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';
import {
  ltcgHarvestingSummary,
  LTCG_BRACKETS_2026_SOURCES,
  FED_BRACKETS_2026_SINGLE,
  FED_BRACKETS_2026_MFJ,
  FED_STD_DEDUCTION_2026,
  FED_BRACKETS_2026_SOURCES,
  type LtcgFilingStatus,
} from '@retirement/shared/engine/tax-sources.js';
import {
  conversionBracketBreakdown,
  buildDepletionSchedule,
  type ConversionBracketChunk,
  type DepletionYearRow,
} from '@app/lib/roth-conversion-math';

@Component({
  selector: 'app-roth-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective, SourceTooltipComponent],
  template: `
    <div class="roth-screen">
      <div class="screen-header">
        <span class="header-icon">🔄</span>
        <div>
          <h2 class="header-title">Roth Conversion Planner</h2>
          <p class="header-sub">Estimate tax savings from systematic Roth conversions</p>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading financial data…</div>
      } @else if (!fin()) {
        <div class="status-msg">Configure your financial settings first in Setup → Settings.</div>
      } @else {

        <!-- Account balances -->
        <div class="balance-row">
          <div class="bal-card">
            <div class="bal-label">Traditional IRA/401k</div>
            <div class="bal-value" [class]="dyscalculia.numberSpacingClass()">
              {{ fmt(fin()!.traditionalBalance ?? 0) }}
            </div>
          </div>
          <div class="bal-card roth">
            <div class="bal-label">Roth IRA/401k</div>
            <div class="bal-value" [class]="dyscalculia.numberSpacingClass()">
              {{ fmt(fin()!.rothBalance ?? 0) }}
            </div>
          </div>
          <div class="bal-card">
            <div class="bal-label">Taxable</div>
            <div class="bal-value" [class]="dyscalculia.numberSpacingClass()">
              {{ fmt(fin()!.taxableBalance ?? 0) }}
            </div>
          </div>
          @if (fin()!.hsaBalance) {
            <div class="bal-card">
              <div class="bal-label">HSA</div>
              <div class="bal-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(fin()!.hsaBalance!) }}
              </div>
            </div>
          }
        </div>

        <!-- Conversion planner -->
        <div class="planner-card">
          <h3 class="card-title">Conversion Parameters</h3>
          <div class="param-grid">
            <label class="param">
              <span class="param-label">Annual Conversion Amount</span>
              <input appNumeric="currency" class="param-input" [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="conversionAmount()"
                (ngModelChange)="conversionAmount.set($event)" />
              <span class="param-hint" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(conversionAmount()) }} · {{ dyscalculia.getAnchor(conversionAmount(), 'withdrawal-year') }}
              </span>
            </label>
            <label class="param">
              <span class="param-label">Years to Convert</span>
              <input appNumeric="age" class="param-input" min="1" max="50"
                [ngModel]="yearsToConvert()"
                (ngModelChange)="yearsToConvert.set($event)" />
            </label>
            <label class="param">
              <span class="param-label">Filing Status</span>
              <select class="param-input"
                [ngModel]="filingStatus()"
                (ngModelChange)="filingStatus.set($event)">
                <option value="joint">Married filing jointly</option>
                <option value="single">Single</option>
              </select>
              <span class="param-hint">Selects which federal bracket table fills the conversion.</span>
            </label>
            <label class="param">
              <span class="param-label">Other Taxable Income (this year)</span>
              <input appNumeric="currency" class="param-input" step="1000"
                [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="otherTaxableIncome()"
                (ngModelChange)="otherTaxableIncome.set($event)" />
              <span class="param-hint">
                Social Security, pension, RMDs, etc. — before the standard deduction. The
                conversion stacks on top of this when filling brackets below.
              </span>
            </label>
          </div>
        </div>

        <!-- Marginal bracket breakdown (A4 port #7) — shows how the chosen
             conversion amount fills federal brackets one chunk at a time,
             each taxed at its own bracket's rate. -->
        <div class="planner-card">
          <h3 class="card-title">
            Marginal Bracket Breakdown
            <app-source-tooltip
              [sources]="bracketSources"
              label="2026 federal bracket sources" />
          </h3>
          <p class="card-sub">
            A conversion doesn't get taxed at one flat rate — it fills your remaining
            federal brackets one chunk at a time, starting just above your other taxable
            income. Each chunk below is taxed at that bracket's own rate; only the last
            dollar converted is taxed at the "marginal rate" shown at the bottom.
          </p>
          @if (bracketBreakdown().chunks.length === 0) {
            <p class="param-hint">Enter a conversion amount above $0 to see the bracket fill.</p>
          } @else {
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Bracket</th>
                    <th class="right">Rate</th>
                    <th class="right">Amount in Bracket</th>
                    <th class="right">Tax on Chunk</th>
                  </tr>
                </thead>
                <tbody>
                  @for (chunk of bracketBreakdown().chunks; track chunk.min) {
                    <tr>
                      <td>{{ chunkRangeLabel(chunk) }}</td>
                      <td class="right">{{ pctLabel(chunk.rate) }}</td>
                      <td class="right" [class]="dyscalculia.numberSpacingClass()">{{ fmt(chunk.amount) }}</td>
                      <td class="right strong" [class]="dyscalculia.numberSpacingClass()">{{ fmt(chunk.tax) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          <div class="result-grid harvest-results">
            <div class="result">
              <span class="result-label">Total Tax on This Conversion</span>
              <span class="result-value tax" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(bracketBreakdown().totalTax) }}
              </span>
            </div>
            <div class="result">
              <span class="result-label">Marginal Rate (last dollar converted)</span>
              <span class="result-value">{{ pctLabel(bracketBreakdown().marginalRate) }}</span>
            </div>
            <div class="result">
              <span class="result-label">Effective Rate (this conversion)</span>
              <span class="result-value">{{ pctLabel(bracketBreakdown().effectiveRate) }}</span>
            </div>
          </div>
        </div>

        <!-- LTCG harvesting advisor (#27) — sibling tax-bracket optimization
             to Roth conversions. Surfaces "realize LTCG at 0%" headroom for
             early retirees in the taxable-drawdown phase. Pure helper math
             from @retirement/shared/engine/tax-sources.js; no API call. -->
        <div class="planner-card">
          <h3 class="card-title">
            Tax-Free LTCG Harvesting (0% bracket)
            <app-source-tooltip
              [sources]="ltcgSources"
              label="2026 LTCG bracket sources" />
          </h3>
          <p class="card-sub">
            Long-term capital gains and qualified dividends fall in the 0%
            federal bracket up to a taxable-income ceiling. If you're below
            it, you can sell appreciated taxable-account positions and
            realize gains tax-free — sibling to the Roth-conversion lever
            above. Combined caps still apply: harvested gains stack on
            ordinary income, and the next $1 over the ceiling jumps to 15%.
          </p>
          <div class="param-grid">
            <label class="param">
              <span class="param-label">Filing Status</span>
              <select class="param-input"
                [ngModel]="ltcgFilingStatus()"
                (ngModelChange)="ltcgFilingStatus.set($event)">
                <option value="mfj">Married filing jointly</option>
                <option value="single">Single</option>
                <option value="hoh">Head of household</option>
                <option value="mfs">Married filing separately</option>
              </select>
            </label>
            <label class="param">
              <span class="param-label">Ordinary Taxable Income</span>
              <input appNumeric="currency" class="param-input" step="1000"
                [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="ltcgOrdinaryIncome()"
                (ngModelChange)="ltcgOrdinaryIncome.set($event)" />
              <span class="param-hint">After standard / itemized deduction.</span>
            </label>
            <label class="param">
              <span class="param-label">Already Realized Preferential</span>
              <input appNumeric="currency" class="param-input" step="1000"
                [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="ltcgAlreadyPreferential()"
                (ngModelChange)="ltcgAlreadyPreferential.set($event)" />
              <span class="param-hint">LTCG + qualified dividends taken so far this year.</span>
            </label>
          </div>
          <div class="result-grid harvest-results">
            <div class="result">
              <span class="result-label">0% Bracket Headroom</span>
              <span class="result-value harvest-zero" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(ltcgSummary().zeroBracketHeadroom) }}
              </span>
              <span class="param-hint">
                Realizable at 0% federal tax. Ceiling: {{ fmt(ltcgSummary().zeroTop) }}.
              </span>
            </div>
            <div class="result">
              <span class="result-label">15% Bracket Headroom</span>
              <span class="result-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(ltcgSummary().fifteenBracketHeadroom) }}
              </span>
              <span class="param-hint">
                After 0% is exhausted; 20% kicks in above {{ fmt(ltcgSummary().fifteenTop) }}.
              </span>
            </div>
            <div class="result">
              <span class="result-label">Marginal Rate (next $1)</span>
              <span class="result-value">
                {{ (ltcgSummary().currentMarginalRate * 100).toFixed(0) }}%
              </span>
              <span class="param-hint">
                @if (ltcgSummary().currentMarginalRate === 0) {
                  Harvest aggressively up to the ceiling.
                } @else if (ltcgSummary().currentMarginalRate === 0.15) {
                  Above the 0% top; harvesting now costs 15%.
                } @else {
                  In the 20% bracket; defer harvesting if possible.
                }
              </span>
            </div>
          </div>
        </div>

        <!-- Results -->
        <div class="results-card">
          <h3 class="card-title">Conversion Summary</h3>
          <div class="result-grid">
            <div class="result">
              <span class="result-label">Total Converted</span>
              <span class="result-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(totalConverted()) }}
              </span>
            </div>
            <div class="result">
              <span class="result-label">Taxes Paid</span>
              <span class="result-value tax" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(taxesPaid()) }}
              </span>
            </div>
            <div class="result">
              <span class="result-label">New Roth Balance</span>
              <span class="result-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(finalRothBalance()) }}
              </span>
            </div>
            <div class="result">
              <span class="result-label">Remaining Traditional</span>
              <span class="result-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(finalTraditionalBalance()) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Year-by-year depletion table (A4 port #7) -->
        <div class="planner-card">
          <h3 class="card-title">Year-by-Year Depletion Schedule</h3>
          <p class="card-sub">
            Conversion tax uses the bracket breakdown above, recomputed for each year
            (other taxable income is held flat). Both balances grow at your Settings
            screen's expected return ({{ pctLabel(growthRate()) }}) once per year, after
            that year's conversion moves dollars from Traditional to Roth.
          </p>
          @if (depletionSchedule().length === 0) {
            <p class="param-hint">No years to project — check the Traditional balance and conversion amount above.</p>
          } @else {
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Age</th>
                    <th class="right">Traditional (start)</th>
                    <th class="right">Conversion</th>
                    <th class="right">Tax Paid</th>
                    <th class="right">Traditional (end)</th>
                    <th class="right">Roth Balance</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of depletionSchedule(); track row.year) {
                    <tr [class.row-current]="row.conversionAmount === 0 && row.traditionalEnd === 0">
                      <td>{{ row.year }}</td>
                      <td>{{ row.age ?? '—' }}</td>
                      <td class="right" [class]="dyscalculia.numberSpacingClass()">{{ fmt(row.traditionalStart) }}</td>
                      <td class="right" [class]="dyscalculia.numberSpacingClass()">{{ fmt(row.conversionAmount) }}</td>
                      <td class="right" [class]="dyscalculia.numberSpacingClass()">{{ fmt(row.taxPaid) }}</td>
                      <td class="right" [class]="dyscalculia.numberSpacingClass()">{{ fmt(row.traditionalEnd) }}</td>
                      <td class="right strong" [class]="dyscalculia.numberSpacingClass()">{{ fmt(row.rothBalance) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .roth-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .balance-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .bal-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .bal-card.roth { border-color: var(--dark-purple); }
    .bal-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .bal-value { font-size: 18px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; }

    .planner-card, .results-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
    .param { display: flex; flex-direction: column; gap: 4px; }
    .param-label { font-size: 11px; color: var(--dark-text-muted); }
    .param-hint { font-size: 10px; color: var(--dark-text-muted); font-style: italic; margin-top: 2px; line-height: 1.4; }
    .param-input {
      padding: 8px 12px; border-radius: 8px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text); font-size: 14px;
      font-family: var(--font-sans); outline: none;
    }
    .param-input:focus { border-color: var(--dark-blue); }

    .result-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
    .result { display: flex; flex-direction: column; gap: 4px; }
    .result-label { font-size: 11px; color: var(--dark-text-muted); }
    .result-value { font-size: 18px; font-weight: 700; color: var(--dark-amber); }
    .result-value.tax { color: var(--dark-amber); }
    .result-value.harvest-zero { color: var(--dark-green, #4ade80); }
    .card-sub {
      font-size: 12px; color: var(--dark-text-muted); line-height: 1.5;
      margin: 0 0 14px;
    }
    .harvest-results { margin-top: 14px; }
    select.param-input { cursor: pointer; }

    .table-wrap { overflow-x: auto; margin-bottom: 14px; }
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
    .data-table .strong { font-weight: 700; color: var(--dark-amber); }
    .data-table tr.row-current { background: rgba(212, 148, 58, 0.08); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class RothScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loading = signal(false);
  readonly fin = signal<FinancialSettings | null>(null);
  readonly household = signal<HouseholdProfile | null>(null);

  readonly conversionAmount = signal(50000);
  readonly yearsToConvert = signal(5);

  // ── Marginal bracket breakdown + depletion schedule (A4 port #7) ──
  readonly filingStatus = signal<'single' | 'joint'>('joint');
  readonly otherTaxableIncome = signal(40_000);
  readonly bracketSources = FED_BRACKETS_2026_SOURCES;

  /** 2026 federal bracket table for the selected filing status — sourced from
   *  `@retirement/shared/engine/tax-sources.js` (maintained, current-year),
   *  not either retired React tab's stale/incomplete hardcoded table. See
   *  the header comment in `roth-conversion-math.ts` for the discrepancy. */
  readonly brackets = computed(() =>
    this.filingStatus() === 'single' ? FED_BRACKETS_2026_SINGLE : FED_BRACKETS_2026_MFJ
  );
  readonly standardDeduction = computed(() =>
    this.filingStatus() === 'single' ? FED_STD_DEDUCTION_2026.single : FED_STD_DEDUCTION_2026.mfj
  );

  readonly bracketBreakdown = computed(() =>
    conversionBracketBreakdown(
      this.otherTaxableIncome(),
      this.conversionAmount(),
      this.brackets(),
      this.standardDeduction(),
    )
  );

  /** Whole-number percent, e.g. `0.07 -> "7%"`. FinancialSettings.expectedReturn
   *  is already a whole-number percent (not a fraction), so it's normalized
   *  here for both the growth rate calc and this label. */
  readonly growthRate = computed(() => (this.fin()?.expectedReturn ?? 7) / 100);

  /** Earliest adult birth year in the household drives the depletion table's
   *  age column — same approach as MedicareIrmaaScreenComponent. */
  readonly startAge = computed<number | null>(() => {
    const h = this.household();
    if (!h) return null;
    const adults = h.members.filter(m => m.role === 'primary' || m.role === 'spouse');
    if (!adults.length) return null;
    const earliestBirthYear = Math.min(...adults.map(a => a.birthYear));
    return new Date().getFullYear() - earliestBirthYear;
  });

  readonly depletionSchedule = computed<DepletionYearRow[]>(() =>
    buildDepletionSchedule({
      traditionalStart: this.fin()?.traditionalBalance ?? 0,
      rothStart: this.fin()?.rothBalance ?? 0,
      annualConversion: this.conversionAmount(),
      yearsToConvert: this.yearsToConvert(),
      otherTaxableIncome: this.otherTaxableIncome(),
      standardDeduction: this.standardDeduction(),
      brackets: this.brackets(),
      growthRate: this.growthRate(),
      startYear: new Date().getFullYear(),
      startAge: this.startAge(),
    })
  );

  readonly totalConverted = computed(() =>
    this.depletionSchedule().reduce((sum, row) => sum + row.conversionAmount, 0)
  );
  readonly taxesPaid = computed(() =>
    this.depletionSchedule().reduce((sum, row) => sum + row.taxPaid, 0)
  );
  readonly finalRothBalance = computed(() => {
    const rows = this.depletionSchedule();
    return rows.length ? rows[rows.length - 1]!.rothBalance : (this.fin()?.rothBalance ?? 0);
  });
  readonly finalTraditionalBalance = computed(() => {
    const rows = this.depletionSchedule();
    return rows.length ? rows[rows.length - 1]!.traditionalEnd : (this.fin()?.traditionalBalance ?? 0);
  });

  // ── LTCG harvesting advisor state (#27) ──
  readonly ltcgFilingStatus = signal<LtcgFilingStatus>('mfj');
  readonly ltcgOrdinaryIncome = signal(60_000);
  readonly ltcgAlreadyPreferential = signal(0);
  readonly ltcgSummary = computed(() => ltcgHarvestingSummary(
    this.ltcgOrdinaryIncome(),
    this.ltcgFilingStatus(),
    this.ltcgAlreadyPreferential(),
  ));
  readonly ltcgSources = LTCG_BRACKETS_2026_SOURCES;

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getFinancial().subscribe({
      next: (f) => { this.fin.set(f); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.api.getHousehold().subscribe({
      next: (h) => this.household.set(h),
      error: (err) => console.warn('RothScreen: household fetch failed.', err),
    });
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, '')
      : '$' + Math.round(amount).toLocaleString();
  }

  /** Whole-number percent label for a decimal-fraction rate, e.g. `0.22 -> "22%"`. */
  pctLabel(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  /** Plain-language bracket-range label for one chunk row, e.g. "$12,400 – $50,400". */
  chunkRangeLabel(chunk: ConversionBracketChunk): string {
    if (chunk.max === null) return `${this.fmt(chunk.min)}+`;
    return `${this.fmt(chunk.min)} – ${this.fmt(chunk.max)}`;
  }
}
