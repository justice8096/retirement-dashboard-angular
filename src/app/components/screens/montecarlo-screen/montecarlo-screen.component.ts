import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import {
  FinancialSettings, WithdrawalStrategy, LocationFull,
  HouseholdProfile, HouseholdMember,
} from '@models/api.model';
import {
  runMonteCarlo,
  weightedInflationFromLocation,
  MonteCarloResult,
} from '@app/lib/monte-carlo';

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
  imports: [FormsModule, MatButtonModule],
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
              <span class="param-hint">{{ selectedLoc()?.currency || '—' }} · monthly cost ≈ {{ fmt(baseCost()) }}</span>
            </label>

            <label class="param">
              <span class="param-label">Portfolio ($)</span>
              <input type="number" class="param-input"
                [ngModel]="portfolio()" (ngModelChange)="portfolio.set($event)" />
            </label>

            <label class="param">
              <span class="param-label">Social Security ($/mo)</span>
              <input type="number" class="param-input"
                [ngModel]="ssMonthly()" (ngModelChange)="ssMonthly.set($event)" />
              <span class="param-hint">Household PIA total</span>
            </label>

            <label class="param">
              <span class="param-label">Other Income ($/mo)</span>
              <input type="number" class="param-input"
                [ngModel]="monthlyIncome()" (ngModelChange)="monthlyIncome.set($event)" />
              <span class="param-hint">Pension, part-time, annuity</span>
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
              <input type="number" class="param-input" min="5" max="50"
                [ngModel]="years()" (ngModelChange)="years.set($event)" />
            </label>

            <label class="param">
              <span class="param-label">Mean Return (%)</span>
              <input type="number" class="param-input" step="0.5"
                [ngModel]="meanReturn()" (ngModelChange)="meanReturn.set($event)" />
            </label>

            <label class="param">
              <span class="param-label">Return Volatility (%)</span>
              <input type="number" class="param-input" step="0.5"
                [ngModel]="volatility()" (ngModelChange)="volatility.set($event)" />
            </label>

            <label class="param">
              <span class="param-label">Mean Inflation (%)</span>
              <input type="number" class="param-input" step="0.5"
                [ngModel]="meanInflation()" (ngModelChange)="meanInflation.set($event)" />
              <span class="param-hint">Weighted avg from location</span>
            </label>

            <label class="param">
              <span class="param-label">Inflation Vol (%)</span>
              <input type="number" class="param-input" step="0.5"
                [ngModel]="inflVol()" (ngModelChange)="inflVol.set($event)" />
            </label>

            <label class="param">
              <span class="param-label">Currency Vol (%)</span>
              <input type="number" class="param-input" step="0.5"
                [ngModel]="currVol()" (ngModelChange)="currVol.set($event)" />
              <span class="param-hint" [class.muted]="!isForeign()">
                {{ isForeign() ? 'Applied to foreign costs' : 'USD location — no effect' }}
              </span>
            </label>

            <label class="param">
              <span class="param-label">FX Drift (%/yr)</span>
              <input type="number" class="param-input" step="0.25"
                [ngModel]="fxDrift()" (ngModelChange)="fxDrift.set($event)" />
              <span class="param-hint" [class.muted]="!isForeign()">
                {{ isForeign() ? 'Positive = USD weakens' : 'USD location — no effect' }}
              </span>
            </label>

            <label class="param">
              <span class="param-label">Income Growth (%)</span>
              <input type="number" class="param-input" step="0.5"
                [ngModel]="incGrowth()" (ngModelChange)="incGrowth.set($event)" />
            </label>

          </div>
          <button mat-flat-button class="run-btn" [disabled]="running()" (click)="runSimulation()">
            {{ running() ? 'Running…' : 'Run Simulation' }}
          </button>
        </div>

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
              <div class="ss-note">⚠ SS cut enabled in settings — benefit reduces after {{ fin()?.ssCutYear }}.</div>
            }
          </div>
        </div>

        <!-- Results -->
        @if (results(); as r) {
          <div class="results-grid">
            <!-- Success rate card (Dyscalculia F-002): calm framing, no danger red.
                 Uses the neutral tone for low scores instead of an alarming color. -->
            <div class="result-card"
                 [class.success]="toneClass(r.successRate) === 'success'"
                 [class.warn]="toneClass(r.successRate) === 'warn'"
                 [class.neutral]="toneClass(r.successRate) === 'neutral'">
              <div class="result-label">Success Rate</div>
              <div class="result-value">{{ (r.successRate * 100).toFixed(0) }}%</div>
              <div class="result-sub">
                {{ dyscalculia.naturalFrequency(r.successRate) }} simulated futures
                left you above $0
              </div>
            </div>
            <div class="result-card">
              <div class="result-label">Median End Balance</div>
              <div class="result-value" [class]="dyscalculia.numberSpacingClass()">{{ fmtK(r.median) }}</div>
              <div class="result-sub">
                50th percentile —
                {{ dyscalculia.getAnchor(r.median, 'percentile', annualSpending()) }}
              </div>
            </div>
            <div class="result-card">
              <div class="result-label">Worst Case (5th)</div>
              <div class="result-value worst" [class]="dyscalculia.numberSpacingClass()">{{ fmtK(r.p5) }}</div>
              <div class="result-sub">
                5th percentile —
                {{ dyscalculia.getAnchor(r.p5, 'percentile', annualSpending()) }}
              </div>
            </div>
            <div class="result-card">
              <div class="result-label">Best Case (95th)</div>
              <div class="result-value best" [class]="dyscalculia.numberSpacingClass()">{{ fmtK(r.p95) }}</div>
              <div class="result-sub">
                95th percentile —
                {{ dyscalculia.getAnchor(r.p95, 'percentile', annualSpending()) }}
              </div>
            </div>
          </div>

          <!-- Plain-language Monte Carlo summary — Dyscalculia F-003 -->
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

          <!-- Paths chart -->
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

          <!-- Histogram -->
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

          <!-- Percentile bars -->
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
    </div>
  `,
  styles: [`
    .mc-screen { display: flex; flex-direction: column; gap: 16px; }
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

    .run-btn {
      margin-top: 14px;
      --mdc-filled-button-container-color: var(--dark-blue);
      --mdc-filled-button-label-text-color: #fff;
    }

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
    .result-value.worst { color: var(--dark-red); }
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
  readonly dyscalculia = inject(DyscalculiaService);

  readonly loading = signal(false);
  readonly running = signal(false);
  readonly fin = signal<FinancialSettings | null>(null);
  readonly wd = signal<WithdrawalStrategy | null>(null);
  readonly household = signal<HouseholdProfile | null>(null);

  /* ─── Inputs (all persist across the session via signals) ──────── */
  readonly selectedLocationId = signal<string>('');
  readonly portfolio = signal(0);
  readonly ssMonthly = signal(0);
  readonly monthlyIncome = signal(0);
  readonly runs = signal(5000);
  readonly years = signal(25);
  readonly meanReturn = signal(7);
  readonly volatility = signal(15);
  readonly meanInflation = signal(3);
  readonly inflVol = signal(1.5);
  readonly currVol = signal(5);
  readonly fxDrift = signal(0);
  readonly incGrowth = signal(2);

  readonly results = signal<MonteCarloResult | null>(null);

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

  readonly baseCost = computed(() => {
    const l = this.selectedLoc();
    if (!l?.monthlyCosts) return 0;
    return Object.values(l.monthlyCosts).reduce((s, c) => s + (c?.typical ?? 0), 0);
  });

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

  ngOnInit(): void {
    this.loading.set(true);

    // Load financial settings, withdrawal strategy, and locations in parallel
    this.loc.loadFull();

    this.api.getFinancial().subscribe({
      next: (f) => {
        this.fin.set(f);
        this.portfolio.set(f.portfolioBalance ?? 0);
        if (typeof f.expectedReturn === 'number') this.meanReturn.set(f.expectedReturn);
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
      error: () => {},
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
      error: () => {},
    });

    // Default the location selector to the first full location when it arrives
    queueMicrotask(() => {
      const sub = setInterval(() => {
        const list = this.loc.fullLocations();
        if (list.length && !this.selectedLocationId()) {
          this.selectedLocationId.set(list[0].id);
          this.syncInflationFromLocation();
        }
        if (list.length) clearInterval(sub);
      }, 100);
    });
  }

  /** Pull weighted-average inflation from the selected location. */
  private syncInflationFromLocation(): void {
    const l = this.selectedLoc();
    if (!l?.monthlyCosts) return;
    const w = weightedInflationFromLocation(
      l.monthlyCosts as unknown as Record<string, { typical?: number; annualInflation?: number }>,
    );
    this.meanInflation.set(+(w * 100).toFixed(2));
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
        });
        this.results.set(result);
      } finally {
        this.running.set(false);
      }
    }, 30);
  }

  fmt(amount: number, unit: '/mo' | '/yr' | '' = '/mo'): string {
    const dollar = String.fromCharCode(36);
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
}
