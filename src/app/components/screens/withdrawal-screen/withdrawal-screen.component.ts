import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { GlossaryService } from '@services/glossary.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { WithdrawalStrategy } from '@models/api.model';
import type { FinancialSettings } from '@models/financial.model';
import type { HouseholdProfile } from '@models/household.model';
import {
  compareStrategies,
  projectStrategy,
  COMPARISON_STRATEGIES,
  STRATEGY_LABELS,
  DEFAULT_KNOBS,
  type ComparisonStrategy,
  type StrategyKnobs,
  type StrategyProjection,
} from '@app/lib/withdrawal-comparison';

/** Glossary key for each comparison strategy's plain-language description
 *  (Dashboard Dyscalculia F-007) — reuses `/api/glossary` entries rather
 *  than redefining descriptions inline. `fixed`/`constant` both map to the
 *  general safe-withdrawal-rate entry; there's no dedicated glossary term
 *  for "constant percentage" specifically. `/api/glossary` now defines a
 *  `cape` term too (added alongside the API's persisted `cape` strategy
 *  support), but `strategyDescription()` below still falls back to
 *  `CAPE_FALLBACK_DESC` if an older API build hasn't picked it up yet. */
const STRATEGY_GLOSSARY_KEY: Record<ComparisonStrategy, string> = {
  fixed: 'safe_withdrawal_rate',
  constant: 'safe_withdrawal_rate',
  guardrails: 'guardrails',
  vpw: 'vpw',
  bucket: 'bucket_strategy',
  'floor-ceiling': 'floor_ceiling',
  cape: 'cape',
};

/** Fallback description for CAPE, used only if `/api/glossary` hasn't
 *  loaded its `cape` term (e.g. an older API build). Text matches the
 *  retired React `WithdrawalTab.tsx`'s own inline description for this
 *  strategy, since that's the only existing plain-language source for it. */
const CAPE_FALLBACK_DESC =
  'Withdrawal rate adjusts based on the Shiller CAPE ratio — higher market valuations mean lower withdrawal rates.';

@Component({
  selector: 'app-withdrawal-screen',
  standalone: true,
  imports: [FormsModule, NumericInputDirective],
  template: `
    <div class="wd-screen">
      <div class="screen-header">
        <span class="header-icon">💸</span>
        <div>
          <h2 class="header-title">Withdrawal Strategy</h2>
          <p class="header-sub">Configure how you draw down your portfolio in retirement</p>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading withdrawal settings…</div>
      } @else if (!wd()) {
        <div class="status-msg">No withdrawal strategy configured yet.</div>
      } @else {
        <div class="cards">
          <!-- Strategy type -->
          <div class="card">
            <h3 class="card-title">Your Saved Strategy</h3>
            <div class="kv-grid">
              <div class="kv">
                <span class="k">Type</span>
                <span class="v cap">{{ wd()!.strategyType }}</span>
              </div>
              <div class="kv">
                <span class="k">Withdrawal Rate</span>
                <span class="v">{{ pct(wd()!.withdrawalRate) }}%</span>
              </div>
              <div class="kv">
                <span class="k">Spending Model</span>
                <span class="v cap">{{ wd()!.spendingModel }}</span>
              </div>
              @if (wd()!.ceilingRate) {
                <div class="kv">
                  <span class="k">Ceiling Rate</span>
                  <span class="v">{{ pct(wd()!.ceilingRate) }}%</span>
                </div>
              }
              @if (wd()!.floorRate) {
                <div class="kv">
                  <span class="k">Floor Rate</span>
                  <span class="v">{{ pct(wd()!.floorRate) }}%</span>
                </div>
              }
              @if (wd()!.declineRate) {
                <div class="kv">
                  <span class="k">Decline Rate</span>
                  <span class="v">{{ pct(wd()!.declineRate) }}%/yr</span>
                </div>
              }
            </div>
          </div>

          <!-- Bucket strategy details -->
          @if (wd()!.strategyType === 'bucket') {
            <div class="card">
              <h3 class="card-title">Bucket Allocation</h3>
              <div class="kv-grid">
                <div class="kv">
                  <span class="k">Bucket 1 (Cash)</span>
                  <span class="v">{{ wd()!.bucket1Years }} years</span>
                </div>
                <div class="kv">
                  <span class="k">Bucket 2 (Bonds)</span>
                  <span class="v">{{ wd()!.bucket2Years }} years</span>
                </div>
                @if (wd()!.refillThreshold) {
                  <div class="kv">
                    <span class="k">Refill Threshold</span>
                    <span class="v">{{ pct(wd()!.refillThreshold) }}%</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Essential vs discretionary -->
          @if (wd()!.essentialSpending) {
            <div class="card">
              <h3 class="card-title">Spending Breakdown</h3>
              <div class="kv-grid">
                <div class="kv">
                  <span class="k">Essential Spending</span>
                  <span class="v" [class]="dyscalculia.numberSpacingClass()">{{ fmt(wd()!.essentialSpending!) }}</span>
                </div>
                @if (wd()!.discretionaryBudget) {
                  <div class="kv">
                    <span class="k">Discretionary Budget</span>
                    <span class="v" [class]="dyscalculia.numberSpacingClass()">{{ fmt(wd()!.discretionaryBudget!) }}</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Roth conversion -->
          @if (wd()!.rothConversionEnabled) {
            <div class="card roth">
              <h3 class="card-title">Roth Conversion</h3>
              <div class="kv-grid">
                <div class="kv">
                  <span class="k">Annual Amount</span>
                  <span class="v" [class]="dyscalculia.numberSpacingClass()">
                    {{ wd()!.rothConversionAmount ? fmt(wd()!.rothConversionAmount!) : '—' }}
                  </span>
                </div>
                @if (wd()!.rothConversionEndAge) {
                  <div class="kv">
                    <span class="k">End Age</span>
                    <span class="v">{{ wd()!.rothConversionEndAge }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- ── Multi-strategy comparison calculator (A4 port #10) ───────── -->
        <div class="compare-header">
          <h3 class="card-title">Compare Withdrawal Strategies</h3>
          <p class="card-sub">
            Explore how all seven strategies would play out for you.
            This calculator is exploratory only — it doesn't change your saved strategy above.
          </p>
        </div>

        <div class="card note">
          <span class="note-icon">ⓘ</span>
          <span>
            Every strategy here, including CAPE (Shiller PE), is exploratory only —
            this comparison view doesn't write back to your saved strategy above,
            no matter which one you pick.
          </span>
        </div>

        <!-- Common inputs -->
        <div class="planner-card">
          <h3 class="card-title">Common Inputs</h3>
          <div class="param-grid">
            <label class="param">
              <span class="param-label">Initial Portfolio</span>
              <input appNumeric="currency" class="param-input" [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="initialPortfolio()" (ngModelChange)="initialPortfolio.set($event)" />
              <span class="param-hint" [class]="dyscalculia.numberSpacingClass()">{{ fmt(initialPortfolio()) }}</span>
            </label>
            <label class="param">
              <span class="param-label">Annual Spending Need</span>
              <input appNumeric="currency" class="param-input" [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="annualSpendingNeed()" (ngModelChange)="annualSpendingNeed.set($event)" />
              <span class="param-hint">Used to size the Bucket strategy's buckets below.</span>
            </label>
            <label class="param">
              <span class="param-label">Current Age</span>
              <input appNumeric="age" class="param-input"
                [ngModel]="currentAge()" (ngModelChange)="currentAge.set($event)" />
              <span class="param-hint">Drives the VPW divisor and each row's age column.</span>
            </label>
            <label class="param">
              <span class="param-label">Years to Project</span>
              <input appNumeric="age" class="param-input" min="1" max="60"
                [ngModel]="yearsToProject()" (ngModelChange)="yearsToProject.set($event)" />
            </label>
            <label class="param">
              <span class="param-label">Expected Return</span>
              <input appNumeric="percent" class="param-input"
                [ngModel]="expectedReturnPct()" (ngModelChange)="expectedReturnPct.set($event)" />
              <span class="param-hint">{{ expectedReturnPct() }}% per year, applied after each year's withdrawal.</span>
            </label>
            <label class="param">
              <span class="param-label">Inflation</span>
              <input appNumeric="percent" class="param-input"
                [ngModel]="inflationPct()" (ngModelChange)="inflationPct.set($event)" />
              <span class="param-hint">{{ inflationPct() }}% per year. Only the Fixed strategy uses this directly.</span>
            </label>
          </div>
        </div>

        <!-- Strategy cards -->
        <div class="planner-card">
          <h3 class="card-title">Strategy Detail &amp; Projection</h3>
          <p class="card-sub">
            Pick a strategy to edit its own knobs and see its full year-by-year projection below.
            All six strategies are still compared side-by-side in the summary table further down.
          </p>
          <div class="strategy-grid">
            @for (s of strategies; track s) {
              <div
                role="button"
                tabindex="0"
                (keydown.enter)="focusStrategy.set(s)"
                (keydown.space)="focusStrategy.set(s)"
                (click)="focusStrategy.set(s)"
                class="strategy-card"
                [class.selected]="focusStrategy() === s"
              >
                <div class="strategy-name">{{ strategyLabel(s) }}</div>
                <div class="strategy-desc">{{ strategyDescription(s) }}</div>
              </div>
            }
          </div>

          <!-- Per-strategy knobs -->
          @if (focusStrategy() === 'fixed') {
            <div class="param-grid knob-grid">
              <label class="param">
                <span class="param-label">Fixed Withdrawal Rate</span>
                <input appNumeric="percent" class="param-input"
                  [ngModel]="fixedRatePct()" (ngModelChange)="fixedRatePct.set($event)" />
              </label>
            </div>
          }
          @if (focusStrategy() === 'constant') {
            <div class="param-grid knob-grid">
              <label class="param">
                <span class="param-label">Constant Withdrawal Rate</span>
                <input appNumeric="percent" class="param-input"
                  [ngModel]="constantRatePct()" (ngModelChange)="constantRatePct.set($event)" />
              </label>
            </div>
          }
          @if (focusStrategy() === 'guardrails') {
            <div class="param-grid knob-grid">
              <label class="param">
                <span class="param-label">Initial Withdrawal Rate</span>
                <input appNumeric="percent" class="param-input"
                  [ngModel]="guardrailsInitialRatePct()" (ngModelChange)="guardrailsInitialRatePct.set($event)" />
              </label>
              <label class="param">
                <span class="param-label">Floor Rate</span>
                <input appNumeric="percent" class="param-input"
                  [ngModel]="guardrailsFloorPct()" (ngModelChange)="guardrailsFloorPct.set($event)" />
              </label>
              <label class="param">
                <span class="param-label">Ceiling Rate</span>
                <input appNumeric="percent" class="param-input"
                  [ngModel]="guardrailsCeilingPct()" (ngModelChange)="guardrailsCeilingPct.set($event)" />
              </label>
              <label class="param">
                <span class="param-label">Adjustment</span>
                <input appNumeric="percent" class="param-input"
                  [ngModel]="guardrailsAdjPct()" (ngModelChange)="guardrailsAdjPct.set($event)" />
                <span class="param-hint">How much spending moves when a guardrail is crossed.</span>
              </label>
            </div>
          }
          @if (focusStrategy() === 'vpw') {
            <div class="knob-note">
              VPW divides your portfolio by a life-expectancy-based divisor that shrinks as you
              age — higher withdrawals early, lower later. No extra knobs to set.
            </div>
          }
          @if (focusStrategy() === 'bucket') {
            <div class="param-grid knob-grid">
              <label class="param">
                <span class="param-label">Bucket 1 (Cash) Years</span>
                <input appNumeric="age" class="param-input" min="1" max="10"
                  [ngModel]="bucket1Years()" (ngModelChange)="bucket1Years.set($event)" />
              </label>
              <label class="param">
                <span class="param-label">Bucket 2 (Bonds) Years</span>
                <input appNumeric="age" class="param-input" min="1" max="20"
                  [ngModel]="bucket2Years()" (ngModelChange)="bucket2Years.set($event)" />
              </label>
              <label class="param">
                <span class="param-label">Refill Threshold</span>
                <input appNumeric="rate" class="param-input" min="0.5" max="3" step="0.5"
                  [ngModel]="bucketRefillThreshold()" (ngModelChange)="bucketRefillThreshold.set($event)" />
                <span class="param-hint">Multiple of annual spending that triggers a refill from bucket 2.</span>
              </label>
            </div>
          }
          @if (focusStrategy() === 'floor-ceiling') {
            <div class="param-grid knob-grid">
              <label class="param">
                <span class="param-label">Guaranteed Annual Income</span>
                <input appNumeric="currency" class="param-input" [class]="dyscalculia.numberSpacingClass()"
                  [ngModel]="floorGuaranteedIncome()" (ngModelChange)="floorGuaranteedIncome.set($event)" />
                <span class="param-hint">Social Security, pensions, annuities.</span>
              </label>
              <label class="param">
                <span class="param-label">Essential Annual Spending</span>
                <input appNumeric="currency" class="param-input" [class]="dyscalculia.numberSpacingClass()"
                  [ngModel]="floorEssentialSpending()" (ngModelChange)="floorEssentialSpending.set($event)" />
              </label>
              <label class="param">
                <span class="param-label">Discretionary Budget</span>
                <input appNumeric="currency" class="param-input" [class]="dyscalculia.numberSpacingClass()"
                  [ngModel]="floorDiscretionaryBudget()" (ngModelChange)="floorDiscretionaryBudget.set($event)" />
              </label>
              <label class="param">
                <span class="param-label">Max Discretionary Rate</span>
                <input appNumeric="percent" class="param-input"
                  [ngModel]="floorMaxDiscretionaryRatePct()" (ngModelChange)="floorMaxDiscretionaryRatePct.set($event)" />
                <span class="param-hint">Ceiling on discretionary spending as a share of portfolio.</span>
              </label>
            </div>
          }
          @if (focusStrategy() === 'cape') {
            <div class="param-grid knob-grid">
              <label class="param">
                <span class="param-label">CAPE Ratio (Shiller PE)</span>
                <input appNumeric="rate" class="param-input" min="10" max="50" step="1"
                  [ngModel]="capeRatio()" (ngModelChange)="capeRatio.set($event)" />
                <span class="param-hint">10 = cheap market, 30 = long-run average, 50 = expensive.</span>
              </label>
              <label class="param">
                <span class="param-label">CAPE Multiplier</span>
                <input appNumeric="rate" class="param-input" min="0.1" max="1" step="0.05"
                  [ngModel]="capeMultiplier()" (ngModelChange)="capeMultiplier.set($event)" />
                <span class="param-hint">Weight applied to 1 / CAPE ratio.</span>
              </label>
              <label class="param">
                <span class="param-label">Fixed Component</span>
                <input appNumeric="percent" class="param-input"
                  [ngModel]="capeFixedComponentPct()" (ngModelChange)="capeFixedComponentPct.set($event)" />
                <span class="param-hint">Added on top of the CAPE-derived rate.</span>
              </label>
              <div class="knob-note">
                Computed rate: {{ pctLabel(capeComputedRawRate()) }}, clamped between
                {{ pctLabel(knobs().capeFloorRate) }} and {{ pctLabel(knobs().capeCeilingRate) }}.
              </div>
            </div>
          }
        </div>

        <!-- Comparison summary table -->
        <div class="planner-card">
          <h3 class="card-title">Strategy Comparison Summary</h3>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th class="right">Year 1 Withdrawal</th>
                  <th class="right">Year 1 Rate</th>
                  <th class="right">Final Balance</th>
                  <th class="right">Years Funded</th>
                  <th class="right">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (r of comparisonResults(); track r.strategy) {
                  <tr [class.row-current]="r.strategy === focusStrategy()">
                    <td>{{ strategyLabel(r.strategy) }}</td>
                    <td class="right" [class]="dyscalculia.numberSpacingClass()">{{ fmt(r.year1Withdrawal) }}</td>
                    <td class="right">{{ pctLabel(r.rows[0]?.effectiveRate ?? 0) }}</td>
                    <td class="right" [class]="dyscalculia.numberSpacingClass()">{{ fmt(r.finalBalance) }}</td>
                    <td class="right">{{ r.yearsFunded }} / {{ yearsToProject() }}</td>
                    <td class="right" [class.depleted]="r.depleted">{{ r.depleted ? 'Depleted' : 'Survives' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Year-by-year projection table for the focus strategy -->
        <div class="planner-card">
          <h3 class="card-title">{{ strategyLabel(focusStrategy()) }} — Year-by-Year Projection</h3>
          @if (focusProjection().rows.length === 0) {
            <p class="param-hint">No years to project — check the inputs above.</p>
          } @else {
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th class="right">Age</th>
                    <th class="right">Withdrawal</th>
                    <th class="right">Effective Rate</th>
                    <th class="right">Portfolio Balance</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of focusProjection().rows; track row.year) {
                    <tr [class.row-depleted]="row.portfolioEnd === 0">
                      <td>{{ row.year }}</td>
                      <td class="right">{{ row.age ?? '—' }}</td>
                      <td class="right" [class]="dyscalculia.numberSpacingClass()">{{ fmt(row.withdrawal) }}</td>
                      <td class="right">{{ pctLabel(row.effectiveRate) }}</td>
                      <td class="right strong" [class]="dyscalculia.numberSpacingClass()">{{ fmt(row.portfolioEnd) }}</td>
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
    .wd-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .cards { display: flex; flex-direction: column; gap: 12px; }
    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card.roth { border-color: var(--dark-purple); }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }
    .card-sub { font-size: 12px; color: var(--dark-text-muted); line-height: 1.5; margin: 0 0 14px; }

    .kv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .kv { display: flex; flex-direction: column; gap: 4px; }
    .k { font-size: 11px; color: var(--dark-text-muted); }
    .v { font-size: 15px; font-weight: 600; color: var(--dark-amber); }
    .v.cap { text-transform: capitalize; color: var(--dark-text); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }

    .compare-header { margin-top: 8px; }
    .compare-header .card-sub { margin: 0; }

    .card.note {
      display: flex; align-items: flex-start; gap: 10px;
      font-size: 12px; color: var(--dark-text-sec); padding: 14px 18px;
    }
    .note-icon { font-size: 14px; color: var(--dark-text-muted); flex-shrink: 0; }

    .planner-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }

    .param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
    .knob-grid { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--dark-border); }
    .param { display: flex; flex-direction: column; gap: 4px; }
    .param-label { font-size: 11px; color: var(--dark-text-muted); }
    .param-hint { font-size: 10px; color: var(--dark-text-muted); font-style: italic; margin-top: 2px; line-height: 1.4; }
    .param-input {
      padding: 8px 12px; border-radius: 8px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text); font-size: 14px;
      font-family: var(--font-sans); outline: none;
    }
    .param-input:focus { border-color: var(--dark-blue); }

    .knob-note {
      margin-top: 16px; padding: 14px; border-radius: 8px;
      background: var(--dark-bg-hover, rgba(255,255,255,0.04));
      border: 1px solid var(--dark-border); font-size: 12px; color: var(--dark-text-sec);
    }

    .strategy-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .strategy-card {
      padding: 14px; border-radius: 8px; cursor: pointer;
      border: 1px solid var(--dark-border); background: var(--dark-bg-secondary);
    }
    .strategy-card.selected { border-color: var(--dark-blue); background: var(--dark-bg-hover, rgba(255,255,255,0.06)); }
    .strategy-card:focus-visible { outline: 2px solid var(--dark-blue); outline-offset: 1px; }
    .strategy-name { font-size: 13px; font-weight: 700; color: var(--dark-text); margin-bottom: 4px; }
    .strategy-desc { font-size: 11px; color: var(--dark-text-muted); line-height: 1.35; }

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
    .data-table td.depleted { color: var(--dark-red, #f87171); font-weight: 600; }
    .data-table tr.row-current { background: rgba(212, 148, 58, 0.08); }
    .data-table tr.row-depleted { background: rgba(248, 113, 113, 0.08); }
  `],
})
export class WithdrawalScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly glossary = inject(GlossaryService);

  readonly loading = signal(false);
  readonly wd = signal<WithdrawalStrategy | null>(null);

  readonly strategies = COMPARISON_STRATEGIES;

  // ── Common comparison inputs ────────────────────────────────────────
  readonly initialPortfolio = signal(0);
  readonly annualSpendingNeed = signal(50_000);
  readonly currentAge = signal(65);
  readonly yearsToProject = signal(30);
  readonly expectedReturnPct = signal(7);
  readonly inflationPct = signal(3);

  // ── Per-strategy knobs (whole-number percent in the UI; converted to
  //    decimal fractions in `knobs()` below to match the shared library's
  //    and the API's decimal-fraction convention). ──────────────────────
  readonly fixedRatePct = signal(DEFAULT_KNOBS.fixedWithdrawalRate * 100);
  readonly constantRatePct = signal(DEFAULT_KNOBS.constantWithdrawalRate * 100);
  readonly guardrailsInitialRatePct = signal(DEFAULT_KNOBS.guardrailsInitialRate * 100);
  readonly guardrailsFloorPct = signal(DEFAULT_KNOBS.guardrailsFloorRate * 100);
  readonly guardrailsCeilingPct = signal(DEFAULT_KNOBS.guardrailsCeilingRate * 100);
  readonly guardrailsAdjPct = signal(DEFAULT_KNOBS.guardrailsAdjustmentPct * 100);
  readonly bucket1Years = signal(DEFAULT_KNOBS.bucket1Years);
  readonly bucket2Years = signal(DEFAULT_KNOBS.bucket2Years);
  readonly bucketRefillThreshold = signal(DEFAULT_KNOBS.bucketRefillThreshold);
  readonly floorGuaranteedIncome = signal(DEFAULT_KNOBS.floorGuaranteedIncome);
  readonly floorEssentialSpending = signal(DEFAULT_KNOBS.floorEssentialSpending);
  readonly floorDiscretionaryBudget = signal(DEFAULT_KNOBS.floorDiscretionaryBudget);
  readonly floorMaxDiscretionaryRatePct = signal(DEFAULT_KNOBS.floorMaxDiscretionaryRate * 100);

  // CAPE knobs. `capeRatio`/`capeMultiplier` match the retired React
  // `WithdrawalTab.tsx`'s own slider ranges (10-50 / 0.1-1.0) and aren't
  // rate-like enough for appNumeric="percent" — `appNumeric="rate"` fits
  // both. Floor/ceiling rates aren't exposed as knobs, matching React (no
  // UI control there either — just a computed-rate hint text).
  readonly capeRatio = signal(DEFAULT_KNOBS.capeRatio);
  readonly capeMultiplier = signal(DEFAULT_KNOBS.capeMultiplier);
  readonly capeFixedComponentPct = signal(DEFAULT_KNOBS.capeFixedComponent * 100);

  readonly focusStrategy = signal<ComparisonStrategy>('fixed');

  readonly knobs = computed<StrategyKnobs>(() => ({
    fixedWithdrawalRate: this.fixedRatePct() / 100,
    constantWithdrawalRate: this.constantRatePct() / 100,
    guardrailsInitialRate: this.guardrailsInitialRatePct() / 100,
    guardrailsFloorRate: this.guardrailsFloorPct() / 100,
    guardrailsCeilingRate: this.guardrailsCeilingPct() / 100,
    guardrailsAdjustmentPct: this.guardrailsAdjPct() / 100,
    bucket1Years: this.bucket1Years(),
    bucket2Years: this.bucket2Years(),
    bucketRefillThreshold: this.bucketRefillThreshold(),
    floorGuaranteedIncome: this.floorGuaranteedIncome(),
    floorEssentialSpending: this.floorEssentialSpending(),
    floorDiscretionaryBudget: this.floorDiscretionaryBudget(),
    floorMaxDiscretionaryRate: this.floorMaxDiscretionaryRatePct() / 100,
    capeRatio: this.capeRatio(),
    capeMultiplier: this.capeMultiplier(),
    capeFixedComponent: this.capeFixedComponentPct() / 100,
    capeFloorRate: DEFAULT_KNOBS.capeFloorRate,
    capeCeilingRate: DEFAULT_KNOBS.capeCeilingRate,
  }));

  /** Unclamped CAPE rate, for the "computed rate" hint text — mirrors the
   *  retired React `WithdrawalTab.tsx`'s own preview line, computed the
   *  same way `calcCAPEWithdrawal` does internally. */
  readonly capeComputedRawRate = computed(
    () => (1 / this.capeRatio()) * this.capeMultiplier() + this.capeFixedComponentPct() / 100,
  );

  private readonly commonInput = computed(() => ({
    initialPortfolio: this.initialPortfolio(),
    annualSpending: this.annualSpendingNeed(),
    startAge: this.currentAge(),
    startYear: new Date().getFullYear(),
    yearsToProject: this.yearsToProject(),
    expectedReturn: this.expectedReturnPct() / 100,
    inflationRate: this.inflationPct() / 100,
    knobs: this.knobs(),
  }));

  /** Side-by-side results for all six comparable strategies (A4 port #10). */
  readonly comparisonResults = computed<StrategyProjection[]>(() =>
    compareStrategies(COMPARISON_STRATEGIES, this.commonInput())
  );

  /** Full year-by-year projection for whichever strategy is currently focused. */
  readonly focusProjection = computed<StrategyProjection>(() =>
    projectStrategy({ ...this.commonInput(), strategy: this.focusStrategy() })
  );

  ngOnInit(): void {
    this.glossary.load();

    this.loading.set(true);
    this.api.getWithdrawal().subscribe({
      next: (w) => {
        this.wd.set(w);
        this.loading.set(false);
        this.seedFromSavedStrategy(w);
      },
      error: () => this.loading.set(false),
    });

    this.api.getFinancial().subscribe({
      next: (f) => this.seedFromFinancial(f),
      error: (err) => console.warn('WithdrawalScreen: financial fetch failed.', err),
    });

    this.api.getHousehold().subscribe({
      next: (h) => this.seedAgeFromHousehold(h),
      error: (err) => console.warn('WithdrawalScreen: household fetch failed.', err),
    });
  }

  /** Seeds the comparison calculator's focus strategy and knobs from the
   *  user's actually-saved strategy, so the "what-if" tool starts from where
   *  they already are. Purely a read; nothing here writes back to the API
   *  (the retired React tabs had no save action either — see the A4 audit's
   *  WithdrawalStrategyTab/WithdrawalTab row — so this comparison stays
   *  exploratory only, same as the source it replaces). */
  private seedFromSavedStrategy(w: WithdrawalStrategy): void {
    if ((COMPARISON_STRATEGIES as string[]).includes(w.strategyType)) {
      this.focusStrategy.set(w.strategyType as ComparisonStrategy);
    }
    if (w.withdrawalRate != null) {
      const pct = w.withdrawalRate * 100;
      if (w.strategyType === 'fixed') this.fixedRatePct.set(pct);
      if (w.strategyType === 'constant') this.constantRatePct.set(pct);
      if (w.strategyType === 'guardrails') this.guardrailsInitialRatePct.set(pct);
    }
    if (w.floorRate != null) this.guardrailsFloorPct.set(w.floorRate * 100);
    if (w.ceilingRate != null) this.guardrailsCeilingPct.set(w.ceilingRate * 100);
    if (w.adjustmentPct != null) this.guardrailsAdjPct.set(w.adjustmentPct * 100);
    if (w.bucket1Years != null) this.bucket1Years.set(w.bucket1Years);
    if (w.bucket2Years != null) this.bucket2Years.set(w.bucket2Years);
    if (w.essentialSpending != null) this.floorEssentialSpending.set(w.essentialSpending);
    if (w.discretionaryBudget != null) this.floorDiscretionaryBudget.set(w.discretionaryBudget);
    if (w.maxDiscretionaryRate != null) this.floorMaxDiscretionaryRatePct.set(w.maxDiscretionaryRate * 100);
  }

  private seedFromFinancial(f: FinancialSettings): void {
    if (f.portfolioBalance) this.initialPortfolio.set(f.portfolioBalance);
    if (f.expectedReturn != null) this.expectedReturnPct.set(f.expectedReturn);
    if (f.expectedInflation != null) this.inflationPct.set(f.expectedInflation);
  }

  private seedAgeFromHousehold(h: HouseholdProfile): void {
    const adults = h.members.filter((m) => m.role === 'primary' || m.role === 'spouse');
    if (!adults.length) return;
    const earliestBirthYear = Math.min(...adults.map((a) => a.birthYear));
    const age = new Date().getFullYear() - earliestBirthYear;
    if (Number.isFinite(age) && age > 0) this.currentAge.set(age);
  }

  strategyLabel(s: ComparisonStrategy): string {
    return STRATEGY_LABELS[s];
  }

  strategyDescription(s: ComparisonStrategy): string {
    const glossaryText = this.glossary.find(STRATEGY_GLOSSARY_KEY[s])?.plain;
    if (glossaryText) return glossaryText;
    return s === 'cape' ? CAPE_FALLBACK_DESC : STRATEGY_LABELS[s];
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, '')
      : '$' + Math.round(amount).toLocaleString();
  }

  /** Withdrawal rates come from the API as decimal fractions (0.04 = 4%). */
  pct(rate: number | null | undefined): string {
    const n = Number(rate);
    if (!isFinite(n)) return '—';
    const whole = n > 1 ? n : n * 100;
    return whole.toFixed(whole >= 10 ? 0 : 1);
  }

  /** Whole-number percent label for a decimal-fraction rate, e.g. `0.04 -> "4%"`. */
  pctLabel(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
  }
}
