import { Component, inject, signal, computed, effect, untracked, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { HealthcareService } from '@services/healthcare.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import {
  FinancialSettings, WithdrawalStrategy, LocationFull,
  HouseholdProfile, HouseholdMember,
} from '@models/api.model';
import {
  runMonteCarlo,
  weightedInflationFromLocation,
  MonteCarloResult,
  ReturnMode,
  DEFAULT_REGIME,
} from '@app/lib/monte-carlo';
import {
  HISTORICAL_PRESETS, HISTORICAL_RETURNS, statsForRange,
} from '@app/data/historical-returns';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';
import { SS_CUT_SOURCES, RMD_AGE_SOURCES } from '@app/lib/tax-sources';

// Dyscalculia F-002: Removed red `#E57373` for the lowest percentile — now
// uses the same neutral amber gradient as the rest. Anxiety-inducing red is
// reserved for hard errors, not user outcomes.
const PERCENTILE_COLORS: { label: string; key: keyof MonteCarloResult; color: string }[] = [
  { label: '5th Percentile',  key: 'p5',     color: '#B0752A' },
  { label: '25th Percentile', key: 'p25',    color: '#D4943A' },
  { label: '50th (Median)',   key: 'median', color: '#E8B86D' },
  { label: '75th Percentile', key: 'p75',    color: '#3AA0A0' },
  { label: '95th Percentile', key: 'p95',    color: '#4CAF50' },
];

/**
 * Monthly SS benefit adjusted for claim age.
 *
 * ssPia is the Primary Insurance Amount at Full Retirement Age (FRA). Claiming
 * late increases it ~8% per year; claiming early reduces it ~6.67%/yr for the
 * first 3 years and ~5%/yr after. API returns ssPia as a string, so coerce.
 *
 * Must match the logic in ss-screen.component.ts:estimateBenefit so the two
 * screens agree.
 */
/**
 * Portfolio-weighted annual drag % from per-account load + fees. Decision:
 * both load and fees are recurring — treated identically, just separate lines
 * for reporting clarity in the Settings UI.
 */
function weightedAccountDragPct(f: FinancialSettings): number {
  const rows: [number, number, number][] = [
    [Number(f.traditionalBalance) || 0, Number(f.traditionalLoadPct) || 0, Number(f.traditionalFeesPct) || 0],
    [Number(f.rothBalance)        || 0, Number(f.rothLoadPct)        || 0, Number(f.rothFeesPct)        || 0],
    [Number(f.taxableBalance)     || 0, Number(f.taxableLoadPct)     || 0, Number(f.taxableFeesPct)     || 0],
    [Number(f.hsaBalance)         || 0, Number(f.hsaLoadPct)         || 0, Number(f.hsaFeesPct)         || 0],
  ];
  const total = rows.reduce((s, [b]) => s + b, 0);
  if (total <= 0) return 0;
  return rows.reduce((s, [b, l, fe]) => s + (b / total) * (l + fe), 0);
}

function estimateBenefitAtClaim(m: HouseholdMember): number {
  const pia = Number(m.ssPia) || 0;
  if (!pia || !m.ssFra || !m.ssClaimAge) return 0;
  const diff = m.ssClaimAge - m.ssFra;
  if (diff === 0) return pia;
  if (diff > 0) return Math.round(pia * (1 + diff * 0.08));
  const yearsEarly = Math.abs(diff);
  const reduction = yearsEarly <= 3
    ? yearsEarly * 0.0667
    : 3 * 0.0667 + (yearsEarly - 3) * 0.05;
  return Math.round(pia * (1 - reduction));
}

const PATH_CHART_W = 640;
const PATH_CHART_H = 260;
const HIST_CHART_W = 640;
const HIST_CHART_H = 220;
const HIST_BINS = 40;

@Component({
  selector: 'app-montecarlo-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective, SourceTooltipComponent],
  template: `
    <div class="mc-screen">
      <div class="screen-header">
        <span class="header-icon">🎲</span>
        <div>
          <h2 class="header-title">Monte Carlo Simulation</h2>
          <p class="header-sub">Run probabilistic retirement scenarios</p>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading financial settings…</div>
      } @else if (!fin()) {
        <div class="status-msg">Configure financial settings in Setup first.</div>
      } @else {

        <!-- Parameters -->
        <div class="card">
          <h3 class="card-title">Simulation Parameters</h3>
          <div class="param-grid">

            <label class="param">
              <span class="param-label">Location</span>
              <select class="param-input"
                [ngModel]="selectedLocationId()"
                (ngModelChange)="selectedLocationId.set($event)">
                @for (l of loc.fullLocations(); track l.id) {
                  <option [value]="l.id">{{ l.name }}</option>
                }
              </select>
              <span class="param-hint" [class]="dyscalculia.numberSpacingClass()">{{ selectedLoc()?.currency || '—' }} · monthly cost ≈ {{ fmt(baseCost()) }}</span>
            </label>

            <label class="param">
              <span class="param-label">Portfolio ($)</span>
              <input appNumeric="currency" class="param-input" [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="portfolio()" (ngModelChange)="portfolio.set($event)" />
              <span class="param-hint" [class]="dyscalculia.numberSpacingClass()">{{ fmt(portfolio(), '') }} · {{ dyscalculia.getAnchor(portfolio(), 'portfolio') }}</span>
            </label>

            <label class="param">
              <span class="param-label">Social Security ($/mo)</span>
              <input appNumeric="currency" class="param-input" [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="ssMonthly()" (ngModelChange)="ssMonthly.set($event)" />
              <span class="param-hint" [class]="dyscalculia.numberSpacingClass()">Household PIA total · {{ fmt(ssMonthly() * 12, '/yr') }}</span>
            </label>

            <label class="param">
              <span class="param-label">Other Income ($/mo)</span>
              <input appNumeric="currency" class="param-input" [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="monthlyIncome()" (ngModelChange)="monthlyIncome.set($event)" />
              <span class="param-hint" [class]="dyscalculia.numberSpacingClass()">Pension, part-time, annuity · {{ fmt(monthlyIncome() * 12, '/yr') }}</span>
            </label>

            <label class="param">
              <span class="param-label">Simulations</span>
              <select class="param-input"
                [ngModel]="runs()" (ngModelChange)="runs.set(+$event)">
                <option [value]="1000">1,000</option>
                <option [value]="5000">5,000</option>
                <option [value]="10000">10,000</option>
              </select>
            </label>

            <label class="param">
              <span class="param-label">Years</span>
              <input appNumeric="age" class="param-input" min="5" max="50"
                [ngModel]="years()" (ngModelChange)="years.set($event)" />
            </label>

            <label class="param">
              <span class="param-label">Mean Return (%)</span>
              <input appNumeric="percent" class="param-input" step="0.5"
                [ngModel]="meanReturn()" (ngModelChange)="meanReturn.set($event)" />
            </label>

            <label class="param">
              <span class="param-label">Return Volatility (%)</span>
              <input appNumeric="percent" class="param-input" step="0.5"
                [ngModel]="volatility()" (ngModelChange)="volatility.set($event)" />
            </label>

            <label class="param">
              <span class="param-label">Mean Inflation (%)</span>
              <input appNumeric="percent" class="param-input" step="0.5"
                [ngModel]="meanInflation()" (ngModelChange)="meanInflation.set($event)" />
              <span class="param-hint">Weighted avg from location</span>
            </label>

            <label class="param">
              <span class="param-label">Inflation Vol (%)</span>
              <input appNumeric="percent" class="param-input" step="0.5"
                [ngModel]="inflVol()" (ngModelChange)="inflVol.set($event)" />
            </label>

            <label class="param">
              <span class="param-label">Currency Vol (%)</span>
              <input appNumeric="percent" class="param-input" step="0.5"
                [ngModel]="currVol()" (ngModelChange)="currVol.set($event)" />
              <span class="param-hint" [class.muted]="!isForeign()">
                {{ isForeign() ? 'Applied to foreign costs' : 'USD location — no effect' }}
              </span>
            </label>

            <label class="param">
              <span class="param-label">FX Drift (%/yr)</span>
              <input appNumeric="percent" class="param-input" step="0.25"
                [ngModel]="fxDrift()" (ngModelChange)="fxDrift.set($event)" />
              <span class="param-hint" [class.muted]="!isForeign()">
                {{ isForeign() ? 'Positive = USD weakens' : 'USD location — no effect' }}
              </span>
            </label>

            <label class="param">
              <span class="param-label">Income Growth (%)</span>
              <input appNumeric="percent" class="param-input" step="0.5"
                [ngModel]="incGrowth()" (ngModelChange)="incGrowth.set($event)" />
            </label>

          </div>
          @if (results() && simDirty() && !running()) {
            <div class="stale-banner">
              <span class="stale-icon">⟳</span>
              <span class="stale-text">
                Inputs changed — the results below are from the previous run.
                Click <strong>Run Simulation</strong> to refresh.
              </span>
            </div>
          }
          <button mat-flat-button class="run-btn"
            [class.stale]="results() && simDirty() && !running()"
            [disabled]="running()" (click)="runSimulation()">
            {{ running() ? 'Running…' : 'Run Simulation' }}
          </button>
        </div>

        <!-- Historical / Cycle settings -->
        <div class="card hist-card">
          <h3 class="card-title">Historical &amp; Cycles</h3>

          <div class="hist-row">
            <label class="param">
              <span class="param-label">Sampling Mode</span>
              <select class="param-input"
                [ngModel]="returnMode()"
                (ngModelChange)="returnMode.set($event)">
                <option value="normal">Normal (Gaussian draws)</option>
                <option value="bootstrap">Bootstrap (resample history)</option>
                <option value="regime">Bull/Bear regimes</option>
                <option value="historical-sequence">Historical sequence (backtest)</option>
              </select>
              <span class="param-hint">
                @switch (returnMode()) {
                  @case ('normal') { Draws return/inflation from a normal distribution (classic MC). }
                  @case ('bootstrap') { Each year picks a random historical year — realistic tails + return/inflation correlation. }
                  @case ('regime') { Alternates bull &amp; bear regimes via a 2-state Markov chain. Deterministic mean per state, runs still vary. }
                  @case ('historical-sequence') { Replays actual {{ historicalStartYear() }}+ sequence forward. Deterministic — 1 path. }
                }
              </span>
            </label>

            <label class="param">
              <span class="param-label">Historical Preset</span>
              <select class="param-input"
                [ngModel]="selectedPresetId()"
                (ngModelChange)="applyPreset($event)">
                <option value="">— custom —</option>
                @for (p of historicalPresets; track p.id) {
                  <option [value]="p.id">{{ p.label }}</option>
                }
              </select>
              <span class="param-hint">
                Snaps mean &amp; vol to the averages of a named period.
              </span>
            </label>
          </div>

          @if (returnMode() === 'historical-sequence') {
            <div class="hist-row">
              <label class="param">
                <span class="param-label">Start Year</span>
                <select class="param-input"
                  [ngModel]="historicalStartYear()"
                  (ngModelChange)="historicalStartYear.set(+$event)">
                  @for (y of historicalYears; track y) {
                    <option [value]="y">{{ y }}</option>
                  }
                </select>
                <span class="param-hint">
                  "If you retired in {{ historicalStartYear() }} with this plan…" — uses real annual returns forward.
                </span>
              </label>
            </div>
          }

          @if (returnMode() === 'regime') {
            <div class="regime-grid">
              <div class="regime-col bull">
                <h4 class="regime-title">🐂 Bull regime</h4>
                <label class="param">
                  <span class="param-label">Mean Return (%)</span>
                  <input appNumeric="percent" class="param-input" step="0.5"
                    [ngModel]="regimeBullMean()" (ngModelChange)="regimeBullMean.set(+$event)" />
                </label>
                <label class="param">
                  <span class="param-label">Volatility (%)</span>
                  <input appNumeric="percent" class="param-input" step="0.5"
                    [ngModel]="regimeBullVol()" (ngModelChange)="regimeBullVol.set(+$event)" />
                </label>
                <label class="param">
                  <span class="param-label">Annual P(switch to bear) %</span>
                  <input appNumeric="percent" class="param-input" step="1"
                    [ngModel]="regimeBullToBear()" (ngModelChange)="regimeBullToBear.set(+$event)" />
                </label>
              </div>
              <div class="regime-col bear">
                <h4 class="regime-title">🐻 Bear regime</h4>
                <label class="param">
                  <span class="param-label">Mean Return (%)</span>
                  <input appNumeric="percent" class="param-input" step="0.5"
                    [ngModel]="regimeBearMean()" (ngModelChange)="regimeBearMean.set(+$event)" />
                </label>
                <label class="param">
                  <span class="param-label">Volatility (%)</span>
                  <input appNumeric="percent" class="param-input" step="0.5"
                    [ngModel]="regimeBearVol()" (ngModelChange)="regimeBearVol.set(+$event)" />
                </label>
                <label class="param">
                  <span class="param-label">Annual P(switch to bull) %</span>
                  <input appNumeric="percent" class="param-input" step="1"
                    [ngModel]="regimeBearToBull()" (ngModelChange)="regimeBearToBull.set(+$event)" />
                </label>
              </div>
            </div>
          }
        </div>

        <!-- Multi-location schedule -->
        <div class="card moves-card">
          <h3 class="card-title">Location Schedule</h3>
          <p class="card-sub">
            Model multiple moves over the retirement horizon. Year 0 is your primary location
            (selected above); add additional moves at later years. FX baseline resets at each
            move; inflation accumulates across segments so "$X in today's dollars" stays consistent.
          </p>

          <div class="timeline-row primary-row">
            <span class="tl-year">Year 0</span>
            <span class="tl-loc">{{ selectedLoc()?.name || '—' }}</span>
            <div class="tl-cost-col">
              <span class="tl-cost" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(baseCost(), '/mo') }}
              </span>
              <span class="tl-cost-proj">today's $</span>
            </div>
            <span class="tl-cost"></span>
            <span class="tl-spacer"></span>
          </div>

          @for (move of moves(); track $index; let i = $index) {
            <div class="timeline-row">
              <label class="tl-field">
                <span class="tl-small-label">Year</span>
                <input appNumeric="age" class="tl-input" min="1" [max]="years() - 1"
                  [ngModel]="move.fromYear"
                  (ngModelChange)="patchMove(i, { fromYear: +$event })" />
              </label>
              <label class="tl-field tl-field-loc">
                <span class="tl-small-label">Move to</span>
                <select class="tl-input"
                  [ngModel]="move.locationId"
                  (ngModelChange)="patchMove(i, { locationId: $event })">
                  @for (l of loc.fullLocations(); track l.id) {
                    <option [value]="l.id">{{ l.name }}</option>
                  }
                </select>
              </label>
              <div class="tl-cost-col">
                <span class="tl-cost" [class]="dyscalculia.numberSpacingClass()">
                  {{ fmt(locMonthlyCost(move.locationId), '/mo') }}
                </span>
                <span class="tl-cost-proj" [class]="dyscalculia.numberSpacingClass()"
                      title="Projected using this location's weighted per-category inflation ({{ (locInflationRate(move.locationId) * 100).toFixed(1) }}%)">
                  {{ fmt(locMonthlyCostAtYear(move.locationId, move.fromYear), '/mo') }} &#64; y{{ move.fromYear }}
                  ({{ (locInflationRate(move.locationId) * 100).toFixed(1) }}%)
                </span>
              </div>
              <label class="tl-field">
                <span class="tl-small-label">Move cost ($)</span>
                <input appNumeric="currency" class="tl-input" step="500"
                  [class]="dyscalculia.numberSpacingClass()"
                  [ngModel]="move.moveCostUSD"
                  (ngModelChange)="patchMove(i, { moveCostUSD: +$event })" />
              </label>
              <button class="tl-remove" (click)="removeMove(i)" aria-label="Remove move">✕</button>
            </div>
          }

          <button mat-stroked-button class="add-move-btn" (click)="addMove()">
            + Add Move
          </button>

          @if (moves().length > 0) {
            <label class="moves-toggle">
              <input type="checkbox"
                [checked]="movesEnabled()"
                (change)="movesEnabled.set(!movesEnabled())" />
              <span>Apply schedule to next simulation run</span>
            </label>
          }
        </div>

        <!-- Spouse-death scenario (deterministic) -->
        @if (adults().length >= 1) {
          <div class="card death-card">
            <h3 class="card-title">Spouse-Death Scenario</h3>
            <p class="card-sub">
              One deterministic toggle: pick a year in the sim horizon at which one adult dies.
              Income steps down to the survivor benefit; expenses multiply by the survivor ratio
              (fixed costs don't halve). Probabilistic mortality is a future extension.
            </p>

            <label class="param death-toggle">
              <input type="checkbox"
                [checked]="spouseDeathEnabled()"
                (change)="spouseDeathEnabled.set(!spouseDeathEnabled())" />
              <span>Enable spouse-death scenario</span>
            </label>

            @if (spouseDeathEnabled()) {
              <div class="death-grid">
                <label class="param">
                  <span class="param-label">Year of Death (from sim start)</span>
                  <input type="range" class="param-range" min="1" [max]="years() - 1" step="1"
                    [ngModel]="spouseDeathYear()" (ngModelChange)="spouseDeathYear.set(+$event)" />
                  <span class="param-hint">
                    Year {{ spouseDeathYear() }} of {{ years() }} ·
                    calendar year {{ (household()?.planningStartYear ?? todayYear()) + spouseDeathYear() }}
                  </span>
                </label>

                <label class="param">
                  <span class="param-label">Who dies</span>
                  <select class="param-input"
                    [ngModel]="deceasedMemberIndex()"
                    (ngModelChange)="deceasedMemberIndex.set(+$event)">
                    @for (m of adults(); track m.id; let i = $index) {
                      <option [value]="i">{{ m.name || 'Adult ' + (i + 1) }} ({{ m.role }})</option>
                    }
                  </select>
                  <span class="param-hint">
                    Survivor keeps the higher SS benefit of the two adults.
                  </span>
                </label>

                <label class="param">
                  <span class="param-label">Survivor Cost Ratio (%)</span>
                  <input appNumeric="percent" class="param-input" min="40" max="100" step="1"
                    [ngModel]="survivorCostRatio()" (ngModelChange)="survivorCostRatio.set(+$event)" />
                  <span class="param-hint">
                    Typical 70–80%. Fixed costs (rent, utilities) don't halve; variable (food, healthcare) do.
                  </span>
                </label>
              </div>

              <div class="death-preview">
                <div>
                  <span class="dp-label">Survivor SS</span>
                  <span class="dp-value" [class]="dyscalculia.numberSpacingClass()">
                    {{ fmt(survivorMonthlySs(), '/mo') }}
                  </span>
                </div>
                <div>
                  <span class="dp-label">Survivor Income (incl. other)</span>
                  <span class="dp-value" [class]="dyscalculia.numberSpacingClass()">
                    {{ fmt(survivorMonthlyIncome(), '/mo') }}
                  </span>
                </div>
                <div>
                  <span class="dp-label">Post-Death Monthly</span>
                  <span class="dp-value" [class]="dyscalculia.numberSpacingClass()">
                    {{ fmt(baseCost() * survivorCostRatio() / 100, '/mo') }}
                  </span>
                </div>
              </div>
            }
          </div>
        }

        <!-- Social Security summary card -->
        <div class="ss-card">
          <span class="ss-icon" aria-hidden="true">🏛️</span>
          <div class="ss-body">
            <div class="ss-label">Social Security included</div>
            <div class="ss-row">
              <div>
                <div class="ss-num" [class]="dyscalculia.numberSpacingClass()">{{ fmt(ssMonthly(), '/mo') }}</div>
                <div class="ss-sub">monthly benefit</div>
              </div>
              <div>
                <div class="ss-num" [class]="dyscalculia.numberSpacingClass()">{{ fmt(ssMonthly() * 12, '/yr') }}</div>
                <div class="ss-sub">annual (nominal)</div>
              </div>
              <div>
                <div class="ss-num" [class]="dyscalculia.numberSpacingClass()">{{ fmt(ssLifetime(), '') }}</div>
                <div class="ss-sub">over {{ years() }} yrs, with {{ incGrowth() }}% COLA</div>
              </div>
            </div>
            @if (fin()?.ssCutEnabled) {
              <div class="ss-note">
                ⚠ SS cut enabled in settings — benefit reduces after {{ fin()?.ssCutYear }}.
                <app-source-tooltip [sources]="ssCutSources" label="SS trust fund projection" />
              </div>
            }
          </div>
        </div>

        <!-- Results -->
        @if (results(); as r) {
          <!-- Save this scenario for side-by-side compare on Scenarios screen -->
          <div class="save-scenario-bar">
            <button mat-stroked-button class="save-scenario-btn"
                    [disabled]="savingScenario()"
                    (click)="saveCurrentScenario()">
              {{ savingScenario() ? 'Saving…' : '💾 Save this scenario' }}
            </button>
            <button mat-stroked-button class="save-scenario-btn"
                    (click)="saveChartsPng()">
              🖼️ Save PNG
            </button>
            <button mat-stroked-button class="save-scenario-btn"
                    (click)="printCharts()">
              🖨️ Print
            </button>
            @if (saveMsg()) {
              <span class="save-msg" [class.err]="saveErr()">{{ saveMsg() }}</span>
            }
            <span class="save-hint">
              captures location, MAGI, apportionment, moves, and results to Simulate → Scenarios
            </span>
          </div>

          <div class="results-grid">
            <!-- Success rate card (Dyscalculia F-002): calm framing, no danger red.
                 Uses the neutral tone for low scores instead of an alarming color. -->
            @if (showStep(1)) {
              <div class="result-card"
                   [class.success]="toneClass(r.successRate) === 'success'"
                   [class.warn]="toneClass(r.successRate) === 'warn'"
                   [class.neutral]="toneClass(r.successRate) === 'neutral'">
                <div class="result-label">Success Rate</div>
                <div class="result-value">{{ (r.successRate * 100).toFixed(0) }}%</div>
                <div class="success-bar"
                     role="meter"
                     [attr.aria-label]="'Success rate ' + (r.successRate * 100).toFixed(0) + ' percent'"
                     [attr.aria-valuenow]="(r.successRate * 100).toFixed(0)"
                     aria-valuemin="0"
                     aria-valuemax="100">
                  <div class="success-bar-fill"
                       [style.width.%]="r.successRate * 100"></div>
                  <span class="success-bar-tick tick-25"></span>
                  <span class="success-bar-tick tick-50"></span>
                  <span class="success-bar-tick tick-75"></span>
                </div>
                <div class="result-sub">
                  {{ dyscalculia.naturalFrequency(r.successRate) }} simulated futures
                  left you above $0
                </div>
              </div>
            }
            @if (showStep(2)) {
              <div class="result-card">
                <div class="result-label">Median End Balance</div>
                <div class="result-value" [class]="dyscalculia.numberSpacingClass()">{{ fmtK(r.median) }}</div>
                <div class="result-sub">
                  50th percentile —
                  {{ dyscalculia.getAnchor(r.median, 'percentile', annualSpending()) }}
                </div>
              </div>
            }
            @if (showStep(3)) {
              <div class="result-card">
                <div class="result-label">Worst Case (5th)</div>
                <div class="result-value worst" [class]="dyscalculia.numberSpacingClass()">{{ fmtK(r.p5) }}</div>
                <div class="result-sub">
                  5th percentile —
                  {{ dyscalculia.getAnchor(r.p5, 'percentile', annualSpending()) }}
                </div>
              </div>
            }
            @if (showStep(4)) {
              <div class="result-card">
                <div class="result-label">Best Case (95th)</div>
                <div class="result-value best" [class]="dyscalculia.numberSpacingClass()">{{ fmtK(r.p95) }}</div>
                <div class="result-sub">
                  95th percentile —
                  {{ dyscalculia.getAnchor(r.p95, 'percentile', annualSpending()) }}
                </div>
              </div>
            }
          </div>

          <!-- Calm-mode pacer: step through the results one at a time (F-006). -->
          @if (dyscalculia.isCalmMc() && calmStep() < calmMax) {
            <div class="calm-pacer" role="group" aria-label="Result pacer">
              <button mat-stroked-button class="calm-next-btn" (click)="revealNext()">
                Show next →
              </button>
              <button mat-button class="calm-skip-btn" (click)="revealAll()">
                Skip to full results
              </button>
              <span class="calm-progress">
                Step {{ calmStep() }} of {{ calmMax }}
              </span>
            </div>
          }

          <!-- Plain-language Monte Carlo summary — Dyscalculia F-003 -->
          @if (showStep(5)) {
            <div class="card calm-summary">
              <h3 class="card-title">What this means</h3>
              <p class="summary-text">
                In
                <strong>{{ dyscalculia.naturalFrequency(r.successRate) }}</strong>
                simulated futures your portfolio lasted through retirement.
                If you'd like to see a different outcome, try adjusting spending,
                savings, or starting age and re-run the simulation.
              </p>
            </div>
          }

          <!-- Paths chart -->
          @if (showStep(6)) {
          <div class="card">
            <h3 class="card-title">Portfolio Paths (up to 50 simulations)</h3>
            <svg [attr.viewBox]="'0 0 ' + pathW + ' ' + pathH" class="chart-svg">
              <!-- Zero line -->
              <line [attr.x1]="0" [attr.x2]="pathW"
                    [attr.y1]="pathZeroY()" [attr.y2]="pathZeroY()"
                    stroke="var(--dark-text-muted)" stroke-dasharray="3,3" stroke-width="1" />
              <!-- Path lines -->
              @for (pd of pathData(); track $index) {
                <polyline [attr.points]="pd.points" [attr.stroke]="pd.color"
                          stroke-width="1" fill="none" opacity="0.6" />
              }
              <!-- Axis labels -->
              <text [attr.x]="4" [attr.y]="12" class="axis-text">{{ fmt(pathYMax(), '') }}</text>
              <text [attr.x]="4" [attr.y]="pathZeroY() - 4" class="axis-text">$0</text>
              <text [attr.x]="4" [attr.y]="pathH - 4" class="axis-text">{{ fmt(pathYMin(), '') }}</text>
              <text [attr.x]="pathW - 4" [attr.y]="pathH - 4" text-anchor="end" class="axis-text">Year {{ years() }}</text>
            </svg>
          </div>
          }

          <!-- Histogram -->
          @if (showStep(7)) {
          <div class="card">
            <h3 class="card-title">End Balance Distribution</h3>
            <svg [attr.viewBox]="'0 0 ' + histW + ' ' + histH" class="chart-svg">
              @for (bar of histBars(); track $index) {
                <rect [attr.x]="bar.x" [attr.y]="bar.y"
                      [attr.width]="bar.w" [attr.height]="bar.h"
                      [attr.fill]="bar.color" />
              }
              <!-- Median marker -->
              <line [attr.x1]="medianX()" [attr.x2]="medianX()"
                    [attr.y1]="0" [attr.y2]="histH - 18"
                    stroke="var(--dark-amber)" stroke-width="2" />
              <text [attr.x]="medianX()" [attr.y]="12" text-anchor="middle" class="axis-text">Median</text>
              <text [attr.x]="4" [attr.y]="histH - 4" class="axis-text">{{ fmt(histMin(), '') }}</text>
              <text [attr.x]="histW - 4" [attr.y]="histH - 4" text-anchor="end" class="axis-text">{{ fmt(histMax(), '') }}</text>
            </svg>
          </div>
          }

          <!-- Percentile bars -->
          @if (showStep(8)) {
          <div class="card">
            <h3 class="card-title">Percentile Breakdown</h3>
            <div class="pct-list">
              @for (p of percentileBars(); track p.label) {
                <div class="pct-row">
                  <span class="pct-label">{{ p.label }}</span>
                  <div class="pct-track">
                    <div class="pct-fill"
                         [style.width.%]="p.width"
                         [style.background]="p.color">
                      <span class="pct-val" [class]="dyscalculia.numberSpacingClass()">{{ fmt(p.value, '') }}</span>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
          }
        }
      }
    </div>
  `,
  styles: [`
    .mc-screen { display: flex; flex-direction: column; gap: 16px; }
    .calm-pacer {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 12px 16px;
      background: rgba(92, 156, 230, 0.08);
      border: 1px solid rgba(92, 156, 230, 0.25);
      border-radius: 8px;
    }
    .calm-next-btn { --mat-button-outlined-container-height: 36px; }
    .calm-progress { font-size: 11px; color: var(--dark-text-muted); margin-left: auto; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .param-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 14px;
    }
    .param { display: flex; flex-direction: column; gap: 4px; }
    .param-label { font-size: 11px; color: var(--dark-text-muted); font-weight: 500; }
    .param-hint { font-size: 10px; color: var(--dark-text-muted); }
    .param-hint.muted { opacity: 0.4; }
    .param-input {
      padding: 8px 12px; border-radius: 8px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text);
      font-size: 14px; font-family: var(--font-sans); outline: none;
    }
    .param-input:focus { border-color: var(--dark-blue); }
    select.param-input { appearance: auto; }

    .save-scenario-bar {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 10px 14px;
      background: rgba(92, 156, 230, 0.08);
      border: 1px solid rgba(92, 156, 230, 0.25);
      border-radius: 8px;
    }
    .save-scenario-btn {
      --mat-button-outlined-container-height: 32px;
      --mat-button-outlined-label-text-size: 12px;
    }
    .save-msg { font-size: 11px; color: var(--dark-green); font-weight: 600; }
    .save-msg.err { color: var(--dark-red); }
    .save-hint { font-size: 10px; color: var(--dark-text-muted); font-style: italic; flex-basis: 100%; }

    .run-btn {
      margin-top: 14px;
      --mat-button-filled-container-color: var(--dark-blue);
      --mat-button-filled-label-text-color: #fff;
    }
    /* FU-012 — pulsing glow when results are stale so the user notices the
       action they need to take after editing inputs. */
    .run-btn.stale {
      animation: run-btn-pulse 1.6s ease-in-out infinite;
    }
    @keyframes run-btn-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(92, 156, 230, 0.45); }
      50% { box-shadow: 0 0 0 6px rgba(92, 156, 230, 0); }
    }
    .stale-banner {
      display: flex; align-items: center; gap: 10px;
      margin-top: 14px; padding: 10px 12px; border-radius: 8px;
      background: rgba(232, 184, 109, 0.12);
      border: 1px solid var(--dark-amber);
      color: var(--dark-text);
      font-size: 12px;
    }
    .stale-icon {
      font-size: 16px; color: var(--dark-amber); font-weight: 700;
      line-height: 1;
    }
    .stale-text { flex: 1; line-height: 1.5; }

    .hist-card { display: flex; flex-direction: column; gap: 14px; }
    .hist-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
    .regime-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
      margin-top: 4px;
    }
    .regime-col {
      padding: 12px; border-radius: 8px; border: 1px solid var(--dark-border);
      display: flex; flex-direction: column; gap: 10px;
    }
    .regime-col.bull { border-left: 3px solid var(--dark-green); }
    .regime-col.bear { border-left: 3px solid var(--dark-neutral); }
    .regime-title { font-size: 12px; margin: 0; color: var(--dark-text); font-weight: 600; }

    .moves-card { display: flex; flex-direction: column; gap: 10px; }
    .moves-card .card-sub {
      font-size: 11px; color: var(--dark-text-muted);
      margin: -6px 0 8px; line-height: 1.55; max-width: 680px;
    }
    .timeline-row {
      display: grid;
      grid-template-columns: 80px 1fr 100px 140px 36px;
      gap: 10px; align-items: center;
      padding: 8px 10px;
      background: var(--dark-bg-secondary); border-radius: 6px;
    }
    .primary-row { background: rgba(212, 148, 58, 0.08); border: 1px solid rgba(212, 148, 58, 0.25); }
    .tl-year { font-size: 12px; font-weight: 600; color: var(--dark-text); }
    .tl-loc  { font-size: 13px; color: var(--dark-text); }
    .tl-cost { font-size: 12px; color: var(--dark-amber); font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
    .tl-cost-col { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
    .tl-cost-proj {
      font-size: 9px; color: var(--dark-text-muted); font-style: italic;
      font-variant-numeric: tabular-nums;
    }
    .tl-spacer { }
    .tl-field { display: flex; flex-direction: column; gap: 2px; }
    .tl-field-loc { min-width: 0; } /* allow select to shrink in grid cell */
    .tl-small-label { font-size: 9px; color: var(--dark-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .tl-input {
      padding: 5px 8px; border-radius: 4px;
      border: 1px solid var(--dark-border); background: var(--dark-bg);
      color: var(--dark-text); font-size: 12px; outline: none;
    }
    .tl-input:focus { border-color: var(--dark-amber); }
    .tl-remove {
      width: 28px; height: 28px; border-radius: 4px;
      border: 1px solid var(--dark-border); background: transparent;
      color: var(--dark-text-muted); cursor: pointer; font-size: 12px;
    }
    .tl-remove:hover { color: var(--dark-red); border-color: var(--dark-red); }
    .add-move-btn { align-self: flex-start; }
    .moves-toggle {
      display: flex; align-items: center; gap: 8px; margin-top: 6px;
      font-size: 12px; color: var(--dark-text);
    }
    .moves-toggle input { accent-color: var(--dark-amber); }

    .death-card { display: flex; flex-direction: column; gap: 12px; }
    .death-card .card-sub {
      font-size: 11px; color: var(--dark-text-muted);
      margin: -6px 0 4px; line-height: 1.55; max-width: 640px;
    }
    .death-toggle {
      display: flex; flex-direction: row; align-items: center; gap: 8px;
      font-size: 13px; color: var(--dark-text);
    }
    .death-toggle input { accent-color: var(--dark-amber); }
    .death-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
    .param-range { width: 100%; accent-color: var(--dark-amber); }
    .death-preview {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px; padding: 10px 12px;
      background: var(--dark-bg-secondary); border-radius: 6px;
    }
    .dp-label { display: block; font-size: 10px; color: var(--dark-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .dp-value { display: block; font-size: 14px; font-weight: 600; color: var(--dark-amber); margin-top: 2px; }

    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }
    .result-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .result-card.success { border-color: var(--dark-green); }
    .result-card.warn    { border-color: var(--dark-amber); }
    .result-card.neutral { border-color: var(--dark-neutral); background: rgba(139, 157, 195, 0.08); }

    /* Success bar — 0 to 100 proportional fill, Dyscalculia F-004:
       relieves the burden of mapping a percentage to a mental quantity. */
    .success-bar {
      position: relative;
      height: 10px;
      background: var(--dark-bg-secondary);
      border-radius: 5px;
      overflow: hidden;
      margin: 8px 0 6px;
    }
    .success-bar-fill {
      height: 100%;
      background: var(--dark-neutral);
      border-radius: 5px;
      transition: width 0.4s ease;
    }
    .result-card.success .success-bar-fill { background: var(--dark-green); }
    .result-card.warn    .success-bar-fill { background: var(--dark-amber); }
    .result-card.neutral .success-bar-fill { background: var(--dark-neutral); }
    /* Quarter-point ticks for quick eyeballing — 25 / 50 / 75. */
    .success-bar-tick {
      position: absolute;
      top: 0;
      width: 1px;
      height: 100%;
      background: rgba(255, 255, 255, 0.12);
      pointer-events: none;
    }
    .success-bar-tick.tick-25 { left: 25%; }
    .success-bar-tick.tick-50 { left: 50%; background: rgba(255, 255, 255, 0.25); }
    .success-bar-tick.tick-75 { left: 75%; }

    .calm-summary {
      background: rgba(92, 156, 230, 0.06);
      border-color: rgba(92, 156, 230, 0.25);
    }
    .summary-text {
      font-size: 14px;
      color: var(--dark-text);
      line-height: var(--prose-line-height, 1.5);
      letter-spacing: var(--prose-letter-spacing, 0);
      word-spacing: var(--prose-word-spacing, 0);
    }
    .summary-text strong { color: var(--dark-amber); }
    .result-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .result-value { font-size: 22px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; line-height: 1.1; word-break: break-word; }
    .result-value.worst { color: var(--dark-neutral); }
    .result-value.best { color: var(--dark-green); }
    .result-sub { font-size: 10px; color: var(--dark-text-muted); margin-top: 2px; }

    .chart-svg { width: 100%; height: auto; display: block; }
    .axis-text { font-size: 10px; fill: var(--dark-text-muted); font-family: var(--font-sans); }

    .pct-list { display: flex; flex-direction: column; gap: 8px; }
    .pct-row { display: flex; align-items: center; gap: 12px; }
    .pct-label { width: 140px; font-size: 12px; color: var(--dark-text-sec); flex-shrink: 0; }
    .pct-track {
      flex: 1; background: var(--dark-bg-secondary);
      border-radius: 4px; height: 24px; overflow: hidden;
    }
    .pct-fill {
      height: 100%; border-radius: 4px;
      display: flex; align-items: center; justify-content: flex-end;
      padding-right: 8px; min-width: 60px;
    }
    .pct-val { font-size: 12px; font-weight: 600; color: #fff; }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }

    .ss-card {
      display: flex; gap: 14px; align-items: flex-start;
      background: linear-gradient(135deg, rgba(76, 175, 80, 0.08), rgba(42, 123, 123, 0.08));
      border: 1px solid rgba(76, 175, 80, 0.35);
      border-radius: 12px; padding: 16px 20px;
    }
    .ss-icon { font-size: 28px; line-height: 1; }
    .ss-body { flex: 1; }
    .ss-label {
      font-size: 11px; color: var(--dark-text-muted);
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;
    }
    .ss-row {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 16px;
    }
    .ss-num { font-size: 20px; font-weight: 700; color: var(--dark-green); line-height: 1.1; }
    .ss-unit { font-size: 11px; color: var(--dark-text-muted); font-weight: 400; margin-left: 2px; }
    .ss-sub { font-size: 10px; color: var(--dark-text-muted); margin-top: 2px; }
    .ss-note { font-size: 11px; color: var(--dark-amber); margin-top: 8px; }
  `],
})
export class MontecarloScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly loc = inject(LocationService);
  readonly taxSvc = inject(TaxService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly loading = signal(false);
  readonly running = signal(false);

  /** Calm-mode reveal step (Dashboard Dyscalculia F-006). 0=none shown,
   *  1=success, 2=+median, 3=+worst, 4=+best, 5=+summary, 6=+paths chart,
   *  7=+histogram, 8=+percentile bars. Reset on every new run. Only consulted
   *  when `dyscalculia.isCalmMc()` is true. */
  readonly calmStep = signal(1);
  readonly calmMax = 8;
  readonly fin = signal<FinancialSettings | null>(null);
  readonly wd = signal<WithdrawalStrategy | null>(null);
  readonly household = signal<HouseholdProfile | null>(null);

  /* ─── Inputs (all persist across the session via signals) ──────── */
  readonly selectedLocationId = signal<string>('');
  readonly portfolio = signal(0);
  readonly ssMonthly = signal(0);
  readonly monthlyIncome = signal(0);
  readonly runs = signal(5000);
  readonly ssCutSources = SS_CUT_SOURCES;
  readonly rmdSources = RMD_AGE_SOURCES;

  readonly years = signal(25);
  readonly meanReturn = signal(7);
  readonly volatility = signal(15);
  readonly meanInflation = signal(3);
  readonly inflVol = signal(1.5);
  readonly currVol = signal(5);
  readonly fxDrift = signal(0);
  readonly incGrowth = signal(2);

  /* ─── Historical / sampling-mode inputs ────────────────────────── */
  readonly returnMode = signal<ReturnMode>('normal');
  readonly selectedPresetId = signal<string>('');
  /** Start year for historical-sequence backtest. Defaults to earliest data. */
  readonly historicalStartYear = signal<number>(HISTORICAL_RETURNS[0].year);

  /** Regime parameters (bull/bear Markov switching). */
  readonly regimeBullMean = signal(DEFAULT_REGIME.bullMean * 100);
  readonly regimeBullVol = signal(DEFAULT_REGIME.bullVol * 100);
  readonly regimeBearMean = signal(DEFAULT_REGIME.bearMean * 100);
  readonly regimeBearVol = signal(DEFAULT_REGIME.bearVol * 100);
  readonly regimeBullToBear = signal(DEFAULT_REGIME.pBullToBear * 100);
  readonly regimeBearToBull = signal(DEFAULT_REGIME.pBearToBull * 100);

  readonly historicalPresets = HISTORICAL_PRESETS;
  readonly historicalYears = HISTORICAL_RETURNS.map(r => r.year);

  /* ─── Multi-location schedule (deterministic) ───────────────────
   * Each entry is `{ fromYear, locationId, moveCostUSD }`. fromYear must be
   * strictly increasing. First entry is always year 0. Primary location
   * selector at the top of the screen stays in sync with moves[0].locationId.
   */
  readonly moves = signal<{ fromYear: number; locationId: string; moveCostUSD: number }[]>([]);
  readonly movesEnabled = signal(false);

  /* ─── Spouse-death scenario (deterministic) ────────────────────── */
  readonly spouseDeathEnabled = signal(false);
  readonly spouseDeathYear = signal(10);
  readonly survivorCostRatio = signal(75); // whole-percent on the wire
  /** Which member is assumed to die. Index into adults[]. */
  readonly deceasedMemberIndex = signal(0);

  readonly results = signal<MonteCarloResult | null>(null);
  readonly savingScenario = signal(false);
  readonly saveMsg = signal<string | null>(null);
  readonly saveErr = signal(false);

  /** True when a sim input changed since the last completed run. Surfaces a
   *  stale-results banner + button glow (FU-012) so users know they need to
   *  rerun to refresh the chart / percentiles. Cleared on successful run. */
  readonly simDirty = signal(false);

  /* ─── Chart dimensions ─────────────────────────────────────────── */
  readonly pathW = PATH_CHART_W;
  readonly pathH = PATH_CHART_H;
  readonly histW = HIST_CHART_W;
  readonly histH = HIST_CHART_H;

  /* ─── Derived from selected location ───────────────────────────── */
  readonly selectedLoc = computed<LocationFull | null>(() => {
    const id = this.selectedLocationId();
    return this.loc.fullLocations().find((l) => l.id === id) ?? null;
  });

  readonly isForeign = computed(() => {
    const l = this.selectedLoc();
    return !!l && l.currency !== 'USD';
  });

  readonly healthcare = inject(HealthcareService);

  readonly baseCost = computed(() => {
    const l = this.selectedLoc();
    if (!l?.monthlyCosts) return 0;
    return this.loc.nonHealthcareBaseMonthly(l) + this.healthcare.decide(l).monthlyCost;
  });

  /** Non-dependent adults in the household, in sort order. Used for spouse-death UI. */
  readonly adults = computed(() =>
    (this.household()?.members ?? []).filter(m => m.role !== 'dependent')
  );

  /**
   * Monthly SS after one spouse dies = max of the two spouses' claim-age-
   * adjusted benefits (the survivor keeps the higher benefit). If only one
   * adult, survivor benefit = that person's own (survivor lives alone).
   */
  readonly survivorMonthlySs = computed(() => {
    const adults = this.adults();
    if (adults.length === 0) return 0;
    const benefits = adults.map(m => estimateBenefitAtClaim(m));
    return Math.max(...benefits);
  });

  /** Survivor monthly income = survivor SS + other income (pension etc. kept intact). */
  readonly survivorMonthlyIncome = computed(() =>
    this.survivorMonthlySs() + this.monthlyIncome()
  );

  /** Nominal lifetime SS with compound COLA growth. */
  readonly ssLifetime = computed(() => {
    const monthly = this.ssMonthly();
    const g = this.incGrowth() / 100;
    const yrs = this.years();
    if (monthly <= 0 || yrs <= 0) return 0;
    if (g === 0) return monthly * 12 * yrs;
    return monthly * 12 * (Math.pow(1 + g, yrs) - 1) / g;
  });

  /* ─── Path chart data ──────────────────────────────────────────── */
  readonly pathYMax = computed(() => {
    const r = this.results();
    if (!r) return 1;
    let mx = 0;
    for (const p of r.paths) for (const v of p) if (v > mx) mx = v;
    return Math.max(mx, this.portfolio() * 2);
  });

  readonly pathYMin = computed(() => {
    const r = this.results();
    if (!r) return 0;
    let mn = 0;
    for (const p of r.paths) for (const v of p) if (v < mn) mn = v;
    return Math.min(mn, 0);
  });

  readonly pathZeroY = computed(() => {
    const mx = this.pathYMax();
    const mn = this.pathYMin();
    const range = mx - mn || 1;
    return this.pathH - ((0 - mn) / range) * this.pathH;
  });

  readonly pathData = computed(() => {
    const r = this.results();
    if (!r) return [];
    const mx = this.pathYMax();
    const mn = this.pathYMin();
    const range = mx - mn || 1;
    const yrs = this.years();
    return r.paths.map((path) => {
      const points = path
        .map((v, i) => {
          const x = (i / yrs) * this.pathW;
          const y = this.pathH - ((v - mn) / range) * this.pathH;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
      const endedPositive = path[path.length - 1] > 0;
      return {
        points,
        color: endedPositive ? 'rgba(42,123,123,0.6)' : 'rgba(229,115,115,0.6)',
      };
    });
  });

  /* ─── Histogram data ───────────────────────────────────────────── */
  readonly histMin = computed(() => {
    const r = this.results();
    return r ? r.results[0] ?? 0 : 0;
  });

  readonly histMax = computed(() => {
    const r = this.results();
    return r ? r.results[r.results.length - 1] ?? 0 : 0;
  });

  readonly histBars = computed(() => {
    const r = this.results();
    if (!r || !r.results.length) return [];
    const min = this.histMin();
    const max = this.histMax();
    const range = max - min || 1;
    const binWidth = range / HIST_BINS;
    const counts = new Array<number>(HIST_BINS).fill(0);
    for (const v of r.results) {
      let idx = Math.floor((v - min) / binWidth);
      if (idx >= HIST_BINS) idx = HIST_BINS - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    }
    const maxCount = Math.max(...counts) || 1;
    const barW = this.histW / HIST_BINS;
    const chartH = this.histH - 20; // reserve for axis text
    return counts.map((c, i) => {
      const h = (c / maxCount) * chartH;
      const binStart = min + i * binWidth;
      const color = binStart < 0 ? 'rgba(229,115,115,0.7)' : 'rgba(74,144,226,0.7)';
      return {
        x: i * barW,
        y: chartH - h,
        w: Math.max(barW - 1, 1),
        h,
        color,
      };
    });
  });

  readonly medianX = computed(() => {
    const r = this.results();
    if (!r) return 0;
    const min = this.histMin();
    const max = this.histMax();
    const range = max - min || 1;
    return ((r.median - min) / range) * this.histW;
  });

  /* ─── Percentile bars (numeric list) ───────────────────────────── */
  readonly percentileBars = computed(() => {
    const r = this.results();
    if (!r) return [];
    const maxP = Math.max(r.p95, this.portfolio() * 2);
    const minP = Math.min(0, r.p5);
    const range = maxP - minP || 1;
    return PERCENTILE_COLORS.map(({ label, key, color }) => {
      const value = r[key] as number;
      const width = Math.max(2, Math.min(100, ((value - minP) / range) * 100));
      return { label, value, color, width };
    });
  });

  /* ─── Lifecycle ────────────────────────────────────────────────── */

  constructor() {
    // FU-012 — mark results stale as soon as any sim input signal changes,
    // so the template can surface a "Rerun simulation" banner. Cleared at
    // the end of a successful run in runSimulation().
    effect(() => {
      // Dependency-read each input. Order doesn't matter; Angular tracks
      // any signal read inside this effect body.
      this.portfolio(); this.ssMonthly(); this.monthlyIncome();
      this.runs(); this.years();
      this.meanReturn(); this.volatility();
      this.meanInflation(); this.inflVol(); this.currVol(); this.fxDrift();
      this.incGrowth();
      this.returnMode(); this.selectedLocationId(); this.historicalStartYear();
      this.regimeBullMean(); this.regimeBullVol();
      this.regimeBearMean(); this.regimeBearVol();
      this.regimeBullToBear(); this.regimeBearToBull();
      this.moves(); this.movesEnabled();
      this.spouseDeathEnabled(); this.spouseDeathYear();
      this.survivorCostRatio(); this.deceasedMemberIndex();
      // Only mark stale when there's actually a prior result to be stale.
      // This keeps the banner dormant on the initial page load. Read via
      // untracked() so that runSimulation's results.set() doesn't retrigger
      // this effect and immediately re-set simDirty back to true.
      if (untracked(this.results)) this.simDirty.set(true);
    });
  }

  ngOnInit(): void {
    this.loading.set(true);
    this.healthcare.load();

    // Load financial settings, withdrawal strategy, and locations in parallel
    this.loc.loadFull();

    this.api.getFinancial().subscribe({
      next: (f) => {
        this.fin.set(f);
        this.portfolio.set(f.portfolioBalance ?? 0);
        if (typeof f.expectedReturn === 'number') {
          const drag = weightedAccountDragPct(f);
          this.meanReturn.set(+(f.expectedReturn - drag).toFixed(2));
        }
        if (typeof f.expectedInflation === 'number') this.meanInflation.set(f.expectedInflation);
        if (f.fxDriftEnabled && typeof f.fxDriftAnnualRate === 'number') {
          this.fxDrift.set(f.fxDriftAnnualRate);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.api.getWithdrawal().subscribe({
      next: (w) => { this.wd.set(w); },
      error: (err) => console.warn('MC: withdrawal strategy fetch failed.', err),
    });

    this.api.getHousehold().subscribe({
      next: (h) => {
        this.household.set(h);
        const ssSum = (h.members ?? []).reduce(
          (s, m) => s + estimateBenefitAtClaim(m),
          0,
        );
        if (ssSum > 0) this.ssMonthly.set(Math.round(ssSum));
      },
      error: (err) => console.warn('MC: household fetch failed.', err),
    });

    // Default the location selector to the first full location when it arrives.
    // Handled by `defaultLocationEffect` (field initializer below) — auto-cleans
    // up on component destroy, unlike the previous setInterval polling.
  }

  /**
   * Seeds `selectedLocationId` with the first full location as soon as one is
   * available. `effect()` reruns whenever `loc.fullLocations()` changes and
   * is torn down automatically when the component is destroyed — fixes the
   * previous setInterval leak that survived navigation.
   */
  private defaultLocationEffect = effect(() => {
    const list = this.loc.fullLocations();
    if (list.length && !this.selectedLocationId()) {
      this.selectedLocationId.set(list[0].id);
      this.syncInflationFromLocation();
    }
  });

  /** Pull weighted-average inflation from the selected location. */
  private syncInflationFromLocation(): void {
    const l = this.selectedLoc();
    if (!l?.monthlyCosts) return;
    const w = weightedInflationFromLocation(
      l.monthlyCosts as unknown as Record<string, { typical?: number; annualInflation?: number }>,
    );
    this.meanInflation.set(+(w * 100).toFixed(2));
  }

  /** Add a move to the schedule — defaults to halfway through the horizon at the cheapest location. */
  addMove(): void {
    const locs = this.loc.fullLocations();
    if (!locs.length) return;
    const defaultLoc = [...locs].sort((a, b) =>
      (a.monthlyCostTotal ?? 0) - (b.monthlyCostTotal ?? 0)
    )[0];
    const current = this.moves();
    const lastYear = current.length ? current[current.length - 1].fromYear : 0;
    const newYear = Math.min(this.years() - 1, Math.max(lastYear + 5, Math.floor(this.years() / 2)));
    this.moves.set([
      ...current,
      { fromYear: newYear, locationId: defaultLoc.id, moveCostUSD: 5000 },
    ]);
    this.movesEnabled.set(true);
  }

  removeMove(idx: number): void {
    this.moves.update(list => list.filter((_, i) => i !== idx));
  }

  patchMove(idx: number, partial: Partial<{ fromYear: number; locationId: string; moveCostUSD: number }>): void {
    this.moves.update(list => list.map((m, i) => i === idx ? { ...m, ...partial } : m));
  }

  /**
   * Build one kernel-ready segment for a given location. Includes the richer
   * healthcare/tax breakdown so the sim can swap ACA → Medicare per year.
   */
  private buildSegmentForLocation(loc: LocationFull, fromYear: number, moveCostUSD?: number) {
    const monthlyCosts = loc.monthlyCosts ?? {};
    const nonHealthcareBase = this.loc.nonHealthcareBaseMonthly(loc);
    const isUS = loc.country === 'United States';
    const medicareMonthly = monthlyCosts['healthcare']?.typical ?? 0;
    const acaUnsubsidizedMonthly = monthlyCosts['healthcarePreMedicare']?.typical
      ?? loc.healthcare?.acaMarketplace?.benchmarkSilverMonthly2Adult ?? 0;
    const foreignHealthcareMonthly = monthlyCosts['healthcare']?.typical ?? 0;
    const acaSubsidyCapPct = loc.healthcare?.acaMarketplace?.premiumCapPctOfIncome ?? 0.085;
    // Income tax: bracket-based using shared annualIncome — this matches the
    // Compare/Taxes screens so all views stay consistent.
    const tax = this.taxSvc.computeIncomeTax(loc, this.loc.annualIncome());
    const monthlyIncomeTax = tax.monthlyTax;
    return {
      fromYear,
      baseCost: nonHealthcareBase + monthlyIncomeTax + medicareMonthly, // legacy fallback
      isForeign: loc.currency !== 'USD',
      moveCostUSD,
      label: loc.name,
      nonHealthcareBase,
      monthlyIncomeTax,
      medicareMonthly,
      acaUnsubsidizedMonthly,
      acaSubsidyCapPct,
      foreignHealthcareMonthly,
      isUS,
    };
  }

  /** Build the kernel schedule from the UI state — year 0 + any enabled moves. */
  buildSchedule() {
    const primary = this.selectedLoc();
    if (!primary) return undefined;
    const all = this.loc.fullLocations();
    const entries: ReturnType<typeof this.buildSegmentForLocation>[] = [
      this.buildSegmentForLocation(primary, 0),
    ];
    if (this.movesEnabled()) {
      for (const m of this.moves()) {
        const loc = all.find(l => l.id === m.locationId);
        if (!loc) continue;
        entries.push(this.buildSegmentForLocation(loc, m.fromYear, m.moveCostUSD));
      }
    }
    entries.sort((a, b) => a.fromYear - b.fromYear);
    // Always return at least the year-0 segment so the kernel uses the
    // rich breakdown (Medicare transition, income tax) even without moves.
    return entries;
  }

  /** Baseline monthly cost of a catalog location in today's USD (sum of monthlyCosts). */
  locMonthlyCost(locId: string): number {
    const l = this.loc.fullLocations().find(x => x.id === locId);
    if (!l) return 0;
    return Object.values(l.monthlyCosts ?? {}).reduce((s, c) => s + (c?.typical ?? 0), 0);
  }

  /** Weighted per-category inflation for a location (decimal, e.g. 0.025). */
  locInflationRate(locId: string): number {
    const l = this.loc.fullLocations().find(x => x.id === locId);
    if (!l?.monthlyCosts) return 0.025;
    return weightedInflationFromLocation(
      l.monthlyCosts as unknown as Record<string, { typical?: number; annualInflation?: number }>,
    );
  }

  /**
   * Projected monthly cost at a given simulation year — compounds today's
   * baseline by the target location's own weighted inflation rate (not the
   * primary's). Deterministic preview; actual MC runs sample per year.
   */
  locMonthlyCostAtYear(locId: string, year: number): number {
    const today = this.locMonthlyCost(locId);
    const rate = this.locInflationRate(locId);
    const factor = Math.pow(1 + rate, Math.max(0, year));
    return today * factor;
  }

  /** Snap mean/vol params to a named historical period. */
  applyPreset(presetId: string): void {
    this.selectedPresetId.set(presetId);
    const preset = HISTORICAL_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const s = statsForRange(preset.startYear, preset.endYear);
    this.meanReturn.set(+(s.meanReturn * 100).toFixed(2));
    this.volatility.set(+(s.volReturn * 100).toFixed(2));
    this.meanInflation.set(+(s.meanInflation * 100).toFixed(2));
    this.inflVol.set(+(s.volInflation * 100).toFixed(2));
  }

  /**
   * Save the current MC inputs + results as a named scenario. Captures the
   * full parameter snapshot so we can reconstruct / re-run later, plus the
   * key summary stats for at-a-glance comparison on the Scenarios screen.
   */
  saveCurrentScenario(): void {
    const r = this.results();
    if (!r) return;
    const name = window.prompt('Name this scenario:',
      `${this.selectedLoc()?.name ?? 'Scenario'} — ${new Date().toLocaleDateString()}`);
    if (!name) return;

    this.savingScenario.set(true);
    this.saveMsg.set(null);
    this.saveErr.set(false);

    // Use the canonical monte_carlo_v1 envelope the backend validates.
    // Params + extras ride along via passthrough.
    const scenarioData = {
      kind: 'monte_carlo_v1' as const,
      successRate: {
        value: r.successRate,
        naturalFrequency: this.dyscalculia.naturalFrequency(r.successRate),
      },
      percentiles: {
        p5:  { value: r.p5,     currency: 'USD' },
        p25: { value: r.p25,    currency: 'USD' },
        p50: { value: r.median, currency: 'USD' },
        p75: { value: r.p75,    currency: 'USD' },
        p95: { value: r.p95,    currency: 'USD' },
      },
      runs: this.runs(),
      years: this.years(),
      // passthrough — full param snapshot so we can rebuild later
      params: {
        location: { id: this.selectedLocationId(), name: this.selectedLoc()?.name },
        portfolio: this.portfolio(),
        ssMonthly: this.ssMonthly(),
        monthlyIncome: this.monthlyIncome(),
        meanReturn: this.meanReturn(),
        volatility: this.volatility(),
        meanInflation: this.meanInflation(),
        inflVol: this.inflVol(),
        currVol: this.currVol(),
        fxDrift: this.fxDrift(),
        incGrowth: this.incGrowth(),
        returnMode: this.returnMode(),
        historicalStartYear: this.historicalStartYear(),
        apportionStrategy: this.healthcare.apportionStrategy(),
        magiAnnual: this.healthcare.magi().magiForAca,
        subsidyRegime: this.healthcare.subsidyRegime(),
        transitionExtraIncome: this.healthcare.transitionYearExtraIncome(),
        movesEnabled: this.movesEnabled(),
        moves: this.moves(),
        spouseDeathEnabled: this.spouseDeathEnabled(),
        spouseDeathYear: this.spouseDeathYear(),
        survivorCostRatio: this.survivorCostRatio(),
      },
      savedAt: new Date().toISOString(),
    };

    this.api.createScenario({
      name,
      scenarioData,
    }).subscribe({
      next: () => {
        this.savingScenario.set(false);
        this.saveMsg.set('✓ Saved. View on Simulate → Scenarios.');
        setTimeout(() => this.saveMsg.set(null), 4000);
      },
      error: (err) => {
        this.savingScenario.set(false);
        this.saveErr.set(true);
        this.saveMsg.set('Save failed: ' + (err?.error?.error ?? err?.message ?? 'unknown'));
      },
    });
  }

  runSimulation(): void {
    const f = this.fin();
    const l = this.selectedLoc();
    if (!f || !l) return;

    // Refresh inflation from location data each run (matches original behavior)
    this.syncInflationFromLocation();

    this.running.set(true);
    // Defer to next tick so the "Running..." label renders before the CPU loop
    setTimeout(() => {
      try {
        const result = runMonteCarlo({
          portfolio: this.portfolio(),
          monthlyIncome: this.ssMonthly() + this.monthlyIncome(),
          baseCost: this.baseCost(),
          isForeign: this.isForeign(),
          fxDrift: this.fxDrift() / 100,
          runs: this.runs(),
          years: this.years(),
          meanReturn: this.meanReturn() / 100,
          volReturn: this.volatility() / 100,
          meanInflation: this.meanInflation() / 100,
          volInflation: this.inflVol() / 100,
          currVol: this.currVol() / 100,
          incGrowth: this.incGrowth() / 100,
          returnMode: this.returnMode(),
          historicalStartYear: this.historicalStartYear(),
          moveSchedule: this.buildSchedule(),
          adultBirthYears: this.adults().map(m => m.birthYear),
          simStartYear: this.household()?.planningStartYear ?? new Date().getFullYear(),
          magiAnnual: this.healthcare.magi().magiForAca,
          transitionMagiAnnual: this.healthcare.transitionYearExtraIncome() > 0
            ? this.healthcare.transitionMagi()
            : undefined,
          subsidyRegime: this.healthcare.subsidyRegime(),
          spouseDeathYear: this.spouseDeathEnabled() ? this.spouseDeathYear() : undefined,
          survivorMonthlyIncome: this.spouseDeathEnabled() ? this.survivorMonthlyIncome() : undefined,
          survivorCostRatio: this.spouseDeathEnabled() ? this.survivorCostRatio() / 100 : undefined,
          regime: {
            bullMean: this.regimeBullMean() / 100,
            bullVol: this.regimeBullVol() / 100,
            bearMean: this.regimeBearMean() / 100,
            bearVol: this.regimeBearVol() / 100,
            pBullToBear: this.regimeBullToBear() / 100,
            pBearToBull: this.regimeBearToBull() / 100,
          },
        });
        this.results.set(result);
        this.simDirty.set(false);
        // Calm mode (Dashboard Dyscalculia F-006): reset reveal to the first
        // card so the user steps through the results one at a time.
        this.calmStep.set(1);
      } finally {
        this.running.set(false);
      }
    }, 30);
  }

  /** Reveal the next calm-mode card. Capped at `calmMax`. */
  revealNext(): void {
    this.calmStep.update(n => Math.min(n + 1, this.calmMax));
  }
  /** Reveal everything at once — "Skip to full results". */
  revealAll(): void {
    this.calmStep.set(this.calmMax);
  }
  /** Predicate used by the template: true when the card at `step` should render. */
  showStep(step: number): boolean {
    return !this.dyscalculia.isCalmMc() || this.calmStep() >= step;
  }

  /** Calendar year "right now" — fallback when household.planningStartYear isn't set. */
  todayYear(): number { return new Date().getFullYear(); }

  fmt(amount: number, unit: '/mo' | '/yr' | '' = '/mo'): string {
    const dollar = '$';
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, unit)
      : dollar + Math.round(amount).toLocaleString() + unit;
  }

  /**
   * Abbreviated currency for compact displays (always a lump-sum total —
   * end balances, lifetime totals — so no time-unit suffix).
   *
   * Dyscalculia F-003 anti-pattern fix: when the user has dyscalculia mode on,
   * we fall back to full `toLocaleString()` because K/M/B abbreviations force
   * magnitude decoding that is exactly what dyscalculic users struggle with.
   */
  fmtK(amount: number): string {
    if (this.dyscalculia.isEnabled()) {
      return this.fmt(amount, '');
    }
    const dollar = String.fromCharCode(36);
    const neg = amount < 0;
    const n = Math.abs(amount);
    let out: string;
    if (n >= 1_000_000_000) out = (n / 1_000_000_000).toFixed(2) + 'B';
    else if (n >= 1_000_000) out = (n / 1_000_000).toFixed(2) + 'M';
    else if (n >= 10_000)    out = (n / 1_000).toFixed(0) + 'K';
    else if (n >= 1_000)     out = (n / 1_000).toFixed(1) + 'K';
    else                     out = Math.round(n).toString();
    return (neg ? '-' + dollar : dollar) + out;
  }

  /** Tone class for the success-rate card. Delegates to the service. */
  toneClass(fraction: number): 'success' | 'warn' | 'neutral' {
    return this.dyscalculia.toneForSuccessRate(fraction);
  }

  /** Annual spending reference for the percentile anchors. */
  annualSpending(): number {
    return (this.baseCost() - this.ssMonthly() - this.monthlyIncome()) * 12;
  }

  /** Download a PNG snapshot of the paths + histogram + percentile summary.
   *  Rebuilds the charts into a single self-contained SVG (no external CSS
   *  dependency), rasterizes via a data-URL Image → canvas pipeline, then
   *  triggers a browser download. No new deps. */
  saveChartsPng(): void {
    const r = this.results();
    if (!r) return;
    const svgStr = this.buildStandaloneSvg();
    svgToPngBlob(svgStr, 2).then(blob => {
      const name = `monte-carlo-${new Date().toISOString().slice(0, 10)}-${Math.round(r.successRate * 100)}pct.png`;
      downloadBlob(name, blob);
    }).catch(err => {
      console.warn('Save PNG failed:', err);
      this.saveMsg.set('Save PNG failed: ' + (err?.message ?? 'unknown'));
      this.saveErr.set(true);
    });
  }

  /** Open a new window navigated to a Blob URL containing print-styled HTML
   *  with the charts + summary, then trigger the print dialog. The window
   *  owns its own stylesheet so the dashboard's dark theme doesn't bleed in. */
  printCharts(): void {
    const r = this.results();
    if (!r) return;
    const svgStr = this.buildStandaloneSvg();
    const html = buildPrintHtml(svgStr);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    // `noopener` severs `window.opener` in the new window, blocking tab-nabbing
    // and any future regression that might pass API data into the SVG builder
    // unescaped. Some browsers return null for win under noopener — the
    // null-check below handles that path the same as a popup-block.
    const win = window.open(url, '_blank', 'width=820,height=1000,noopener,noreferrer');
    if (!win) {
      URL.revokeObjectURL(url);
      this.saveMsg.set('Popup blocked — allow popups for this site to print.');
      this.saveErr.set(true);
      return;
    }
    // With noopener we can't listen for the child's load event, so use a
    // timeout fallback long enough for the new window to fetch the blob URL.
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  /** Build a standalone SVG document string containing: title, success rate,
   *  paths chart, histogram, and percentile list. Self-contained — no
   *  external CSS needed to render correctly. */
  private buildStandaloneSvg(): string {
    const r = this.results()!;
    const locName = this.selectedLoc()?.name ?? 'No location';
    const headerH = 90;
    const gap = 24;
    const pctH = 120;
    const totalW = PATH_CHART_W;
    const totalH = headerH + PATH_CHART_H + gap + HIST_CHART_H + gap + pctH + 30;

    const paths = this.pathData();
    const pathZeroY = this.pathZeroY();
    const pathYMax = this.pathYMax();
    const pathYMin = this.pathYMin();
    const histBars = this.histBars();
    const histMinStr = this.fmt(this.histMin(), '');
    const histMaxStr = this.fmt(this.histMax(), '');
    const medianX = this.medianX();
    const pctBars = this.percentileBars();

    const esc = (s: string) => String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
    );

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`;
    svg += `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#ffffff"/>`;
    svg += `<text x="16" y="28" font-family="system-ui" font-size="18" font-weight="700" fill="#111">Monte Carlo — ${esc(locName)}</text>`;
    svg += `<text x="16" y="50" font-family="system-ui" font-size="13" fill="#333">`
         + `Success rate: ${(r.successRate * 100).toFixed(0)}% · `
         + `${this.runs().toLocaleString()} simulated futures over ${this.years()} years`
         + `</text>`;
    svg += `<text x="16" y="70" font-family="system-ui" font-size="12" fill="#666">`
         + `Median ${this.fmt(r.median, '')} · 5th ${this.fmt(r.p5, '')} · 95th ${this.fmt(r.p95, '')}`
         + `</text>`;

    const pY = headerH;
    svg += `<g transform="translate(0,${pY})">`;
    svg += `<text x="16" y="16" font-family="system-ui" font-size="12" font-weight="600" fill="#333">Portfolio Paths</text>`;
    svg += `<g transform="translate(0,24)">`;
    svg += `<line x1="0" x2="${PATH_CHART_W}" y1="${pathZeroY}" y2="${pathZeroY}" stroke="#999" stroke-dasharray="3,3" stroke-width="1"/>`;
    for (const pd of paths) {
      svg += `<polyline points="${esc(pd.points)}" stroke="${pd.color}" stroke-width="1" fill="none" opacity="0.6"/>`;
    }
    svg += `<text x="4" y="12" font-family="system-ui" font-size="10" fill="#666">${esc(this.fmt(pathYMax, ''))}</text>`;
    svg += `<text x="4" y="${pathZeroY - 4}" font-family="system-ui" font-size="10" fill="#666">$0</text>`;
    svg += `<text x="4" y="${PATH_CHART_H - 4}" font-family="system-ui" font-size="10" fill="#666">${esc(this.fmt(pathYMin, ''))}</text>`;
    svg += `<text x="${PATH_CHART_W - 4}" y="${PATH_CHART_H - 4}" text-anchor="end" font-family="system-ui" font-size="10" fill="#666">Year ${this.years()}</text>`;
    svg += `</g></g>`;

    const hY = headerH + PATH_CHART_H + 24 + gap;
    svg += `<g transform="translate(0,${hY})">`;
    svg += `<text x="16" y="16" font-family="system-ui" font-size="12" font-weight="600" fill="#333">End Balance Distribution</text>`;
    svg += `<g transform="translate(0,24)">`;
    for (const bar of histBars) {
      svg += `<rect x="${bar.x}" y="${bar.y}" width="${bar.w}" height="${bar.h}" fill="${bar.color}"/>`;
    }
    svg += `<line x1="${medianX}" x2="${medianX}" y1="0" y2="${HIST_CHART_H - 18}" stroke="#D4943A" stroke-width="2"/>`;
    svg += `<text x="${medianX}" y="12" text-anchor="middle" font-family="system-ui" font-size="10" fill="#333">Median</text>`;
    svg += `<text x="4" y="${HIST_CHART_H - 4}" font-family="system-ui" font-size="10" fill="#666">${esc(histMinStr)}</text>`;
    svg += `<text x="${HIST_CHART_W - 4}" y="${HIST_CHART_H - 4}" text-anchor="end" font-family="system-ui" font-size="10" fill="#666">${esc(histMaxStr)}</text>`;
    svg += `</g></g>`;

    const bY = headerH + PATH_CHART_H + 24 + gap + HIST_CHART_H + 24 + gap;
    svg += `<g transform="translate(0,${bY})">`;
    svg += `<text x="16" y="16" font-family="system-ui" font-size="12" font-weight="600" fill="#333">Percentile Breakdown</text>`;
    const rowH = 16;
    const labelW = 80;
    const barW = totalW - labelW - 40;
    pctBars.forEach((p, i) => {
      const y = 24 + i * rowH;
      const fillW = Math.max(2, (p.width / 100) * barW);
      svg += `<text x="16" y="${y + 11}" font-family="system-ui" font-size="11" fill="#333">${esc(p.label)}</text>`;
      svg += `<rect x="${labelW + 16}" y="${y}" width="${barW}" height="12" fill="#eee" rx="2"/>`;
      svg += `<rect x="${labelW + 16}" y="${y}" width="${fillW}" height="12" fill="${p.color}" rx="2"/>`;
      svg += `<text x="${labelW + 16 + fillW + 4}" y="${y + 10}" font-family="system-ui" font-size="10" fill="#333">${esc(this.fmt(p.value, ''))}</text>`;
    });
    svg += `</g>`;

    svg += `</svg>`;
    return svg;
  }
}

/** Build a print-ready HTML document wrapping the SVG with print CSS and an
 *  autoprint trigger. All interpolated values (the SVG string) are already
 *  escaped during SVG assembly. */
function buildPrintHtml(svgStr: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Monte Carlo Results</title>
<style>
  @page { size: letter; margin: 0.5in; }
  body { font-family: system-ui, sans-serif; color: #111; margin: 0; padding: 24px; background: #fff; }
  svg { display: block; max-width: 100%; height: auto; }
  .noprint { margin-bottom: 16px; color: #666; font-size: 12px; }
  .noprint button {
    padding: 6px 12px; border-radius: 4px; border: 1px solid #999;
    background: #eee; cursor: pointer; margin-right: 8px;
  }
  @media print { .noprint { display: none; } }
</style></head>
<body onload="setTimeout(function(){window.print()},250)">
  <div class="noprint">
    <button onclick="window.print()">Print</button>
    <button onclick="window.close()">Close</button>
  </div>
  ${svgStr}
</body></html>`;
}

/** Convert an SVG string to a PNG Blob via an off-screen canvas. Scales by
 *  `pixelRatio` so the export looks crisp on retina displays. */
function svgToPngBlob(svgStr: string, pixelRatio = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const widthMatch = svgStr.match(/width="(\d+)"/);
    const heightMatch = svgStr.match(/height="(\d+)"/);
    const w = widthMatch ? parseInt(widthMatch[1]!, 10) : 800;
    const h = heightMatch ? parseInt(heightMatch[1]!, 10) : 600;
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * pixelRatio;
      canvas.height = h * pixelRatio;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no 2d context')); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(pixelRatio, pixelRatio);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error('image load failed: ' + e)); };
    img.src = url;
  });
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
