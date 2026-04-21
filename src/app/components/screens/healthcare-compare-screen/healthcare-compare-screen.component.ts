import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { LocationFull } from '@models/api.model';

interface Metric {
  loc: LocationFull;
  quality: number;      // 1-10
  monthlyHealth: number;
  annualHealth: number;
  value: number;        // quality per $100/mo
  medCoverageAvail: boolean;
}

/** Representative ACA bronze/silver premium for ages 60-64, US only. Legacy
 *  pinned this to $1,200/mo; kept identical so comparisons line up. */
const ACA_MONTHLY_ESTIMATE = 1200;

@Component({
  selector: 'app-healthcare-compare-screen',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="hc-screen">
      <div class="screen-header">
        <span class="header-icon">🏥</span>
        <div>
          <h2 class="header-title">Healthcare Comparison</h2>
          <p class="header-sub">
            Healthcare quality vs. cost across locations — quality-per-dollar value, with pre-Medicare ACA context for US-bound returns.
          </p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      <!-- Summary -->
      <div class="results">
        @if (stats().bestQuality; as bq) {
          <div class="result-card">
            <div class="result-label">Best Quality</div>
            <div class="result-value">{{ bq.quality.toFixed(1) }}/10</div>
            <div class="result-explain">{{ bq.loc.name }} · {{ fmt(bq.monthlyHealth) }}/mo</div>
          </div>
        }
        @if (stats().cheapest; as ch) {
          <div class="result-card">
            <div class="result-label">Cheapest</div>
            <div class="result-value">{{ fmt(ch.monthlyHealth) }}/mo</div>
            <div class="result-explain">{{ ch.loc.name }} · Q {{ ch.quality.toFixed(1) }}</div>
          </div>
        }
        @if (stats().bestValue; as bv) {
          <div class="result-card highlight">
            <div class="result-label">Best Value</div>
            <div class="result-value">{{ bv.value.toFixed(1) }}</div>
            <div class="result-explain">{{ bv.loc.name }} · quality per $100/mo</div>
          </div>
        }
        <div class="result-card">
          <div class="result-label">Average Cost</div>
          <div class="result-value">{{ fmt(stats().avgCost) }}/mo</div>
          <div class="result-explain">All locations with healthcare data</div>
        </div>
      </div>

      <!-- Full table -->
      <div class="card">
        <h3 class="card-title">Healthcare Systems & Monthly Cost</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Country</th>
                <th>City / Region</th>
                <th class="right">Quality</th>
                <th class="right">Monthly</th>
                <th class="right">Annual</th>
                <th class="center">Medicare</th>
              </tr>
            </thead>
            <tbody>
              @for (m of allMetrics(); track m.loc.id) {
                <tr [class.selected]="selectedId() === m.loc.id" (click)="toggleSelect(m.loc.id)">
                  <td>{{ m.loc.country }}</td>
                  <td>{{ m.loc.name }}</td>
                  <td class="right" [class.q-good]="m.quality >= 6"
                                    [class.q-mid]="m.quality >= 4 && m.quality < 6"
                                    [class.q-low]="m.quality < 4"
                                    [attr.aria-label]="'Quality ' + m.quality.toFixed(1) + ' out of 10 — ' + qualityTierLabel(m.quality)">
                    {{ m.quality.toFixed(1) }}/10<span class="sr-only">&nbsp;— {{ qualityTierLabel(m.quality) }}</span>
                  </td>
                  <td class="right">{{ fmt(m.monthlyHealth) }}</td>
                  <td class="right">{{ fmtYr(m.annualHealth) }}</td>
                  <td class="center">{{ m.medCoverageAvail ? '✓' : '✗' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Scatter (quality vs cost, CSS-positioned dots) -->
      <div class="card">
        <h3 class="card-title">Quality vs. Monthly Cost</h3>
        <div class="scatter" role="img" aria-label="Healthcare quality plotted against monthly cost">
          <div class="scatter-axes">
            <div class="y-axis">
              <span>10</span><span>8</span><span>6</span><span>4</span><span>2</span><span>0</span>
            </div>
            <div class="plot">
              @for (m of allMetrics(); track m.loc.id) {
                <div class="dot"
                  [class.selected]="selectedId() === m.loc.id"
                  [style.left.%]="dotX(m.monthlyHealth)"
                  [style.bottom.%]="dotY(m.quality)"
                  [title]="m.loc.name + ' — Q ' + m.quality.toFixed(1) + ' · ' + fmt(m.monthlyHealth) + '/mo'"
                  (click)="toggleSelect(m.loc.id)">
                </div>
              }
              <div class="plot-grid"></div>
            </div>
          </div>
          <div class="x-axis">
            <span>$0</span>
            <span>{{ fmt(xMax() * 0.25) }}</span>
            <span>{{ fmt(xMax() * 0.5) }}</span>
            <span>{{ fmt(xMax() * 0.75) }}</span>
            <span>{{ fmt(xMax()) }}</span>
          </div>
          <div class="axis-labels">
            <span class="y-label">Quality (1-10) ↑</span>
            <span class="x-label">Monthly cost →</span>
          </div>
        </div>
      </div>

      <!-- Detail card -->
      @if (selected(); as sel) {
        <div class="detail-card">
          <h3 class="card-title">{{ sel.loc.name }} — Healthcare Details</h3>

          <div class="quality-meter">
            <span class="qm-label">Quality</span>
            <div class="qm-track">
              <div class="qm-fill"
                [class.q-good]="sel.quality >= 6"
                [class.q-mid]="sel.quality >= 4 && sel.quality < 6"
                [class.q-low]="sel.quality < 4"
                [style.width.%]="sel.quality * 10"></div>
            </div>
            <span class="qm-val">{{ sel.quality.toFixed(1) }}/10</span>
          </div>

          <div class="detail-grid">
            <div class="detail-cell">
              <div class="detail-label">Monthly Cost</div>
              <div class="detail-val">{{ fmt(sel.monthlyHealth) }}/mo</div>
            </div>
            <div class="detail-cell">
              <div class="detail-label">Annual Cost</div>
              <div class="detail-val">{{ fmtYr(sel.annualHealth) }}</div>
            </div>
            <div class="detail-cell">
              <div class="detail-label">Quality / $100/mo</div>
              <div class="detail-val green">{{ sel.value.toFixed(1) }}</div>
            </div>
            <div class="detail-cell">
              <div class="detail-label">Medicare</div>
              <div class="detail-val" [class.green]="sel.medCoverageAvail" [class.red]="!sel.medCoverageAvail">
                {{ sel.medCoverageAvail ? 'Yes' : 'No' }}
              </div>
            </div>
          </div>

          <div class="aca-note">
            <strong>Pre-Medicare (Ages 60-64):</strong>
            ACA premium estimate ~{{ acaLabel }}/mo.
            Typical bronze/silver plans run \$800 – \$1,500/mo depending on age, state, and subsidy eligibility.
          </div>

          @if (!sel.medCoverageAvail) {
            <div class="warning-block">
              <strong>Medicare doesn't pay abroad.</strong>
              Except for limited cross-border emergency situations, Medicare won't cover care outside the US.
              Plan on local insurance or private international medical coverage.
            </div>
          }
        </div>
      }

      <!-- Best value ranking -->
      <div class="card">
        <h3 class="card-title">Top 10 Healthcare Values (quality per $100/mo)</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Location</th>
                <th class="right">Quality</th>
                <th class="right">Monthly</th>
                <th class="right">Value</th>
              </tr>
            </thead>
            <tbody>
              @for (m of topValues(); track m.loc.id; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td>{{ m.loc.name }}</td>
                  <td class="right">{{ m.quality.toFixed(1) }}</td>
                  <td class="right">{{ fmt(m.monthlyHealth) }}</td>
                  <td class="right strong green">{{ m.value.toFixed(1) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .hc-screen { display: flex; flex-direction: column; gap: 16px; }
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

    .results { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .result-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .result-card.highlight { border-color: var(--dark-green); background: rgba(76, 175, 80, 0.06); }
    .result-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .result-value { font-size: 20px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; font-variant-numeric: tabular-nums; }
    .result-explain { font-size: 11px; color: var(--dark-text-muted); margin-top: 4px; }

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
    .data-table .center { text-align: center; }
    .data-table .strong { font-weight: 700; }
    .data-table tr { cursor: pointer; }
    .data-table tr:hover { background: var(--dark-bg-secondary); }
    .data-table tr.selected { background: rgba(212, 148, 58, 0.08); }

    .q-good { color: var(--dark-green); font-weight: 700; }
    .q-mid  { color: var(--dark-amber); font-weight: 700; }
    .q-low  { color: var(--dark-red); font-weight: 700; }
    .green { color: var(--dark-green); }
    .red   { color: var(--dark-red); }

    .scatter { display: flex; flex-direction: column; }
    .scatter-axes { display: grid; grid-template-columns: 36px 1fr; gap: 4px; height: 320px; }
    .y-axis {
      display: flex; flex-direction: column; justify-content: space-between;
      font-size: 11px; color: var(--dark-text-muted); padding: 2px 4px 2px 0; text-align: right;
    }
    .plot {
      position: relative; background: var(--dark-bg-secondary); border-radius: 8px;
      border: 1px solid var(--dark-border);
    }
    .plot-grid {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(to right, var(--dark-border) 1px, transparent 1px),
        linear-gradient(to top, var(--dark-border) 1px, transparent 1px);
      background-size: 25% 20%;
      opacity: 0.5;
      pointer-events: none;
    }
    .dot {
      position: absolute; width: 10px; height: 10px;
      background: var(--dark-amber); border-radius: 50%;
      transform: translate(-50%, 50%);
      cursor: pointer; transition: transform 0.15s, background 0.15s;
      border: 1px solid var(--dark-bg-secondary);
    }
    .dot:hover { background: var(--dark-text); transform: translate(-50%, 50%) scale(1.4); z-index: 2; }
    .dot.selected { background: var(--dark-green); transform: translate(-50%, 50%) scale(1.6); z-index: 3; }
    .x-axis {
      display: flex; justify-content: space-between; padding: 6px 0 0 40px;
      font-size: 11px; color: var(--dark-text-muted); font-variant-numeric: tabular-nums;
    }
    .axis-labels { display: flex; justify-content: space-between; padding: 6px 0 0 0; font-size: 11px; color: var(--dark-text-sec); }
    .y-label { padding-left: 4px; }
    .x-label { padding-right: 12px; }

    .detail-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-left: 4px solid var(--dark-green);
      border-radius: 12px; padding: 20px;
    }
    .quality-meter { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .qm-label { font-size: 12px; color: var(--dark-text-muted); min-width: 60px; }
    .qm-track { flex: 1; height: 14px; background: var(--dark-bg-secondary); border-radius: 7px; overflow: hidden; }
    .qm-fill { height: 100%; transition: width 0.3s; }
    .qm-fill.q-good { background: var(--dark-green); }
    .qm-fill.q-mid  { background: var(--dark-amber); }
    .qm-fill.q-low  { background: var(--dark-red); }
    .qm-val { font-size: 14px; font-weight: 700; color: var(--dark-text); font-variant-numeric: tabular-nums; min-width: 56px; text-align: right; }

    .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .detail-cell { padding: 12px; background: var(--dark-bg-secondary); border-radius: 8px; }
    .detail-label { font-size: 11px; color: var(--dark-text-muted); margin-bottom: 4px; }
    .detail-val { font-size: 16px; font-weight: 700; color: var(--dark-text); font-variant-numeric: tabular-nums; }
    .detail-val.green { color: var(--dark-green); }
    .detail-val.red { color: var(--dark-red); }

    .aca-note, .warning-block {
      padding: 12px 14px; border-radius: 8px; font-size: 13px;
      color: var(--dark-text-sec); line-height: var(--prose-line-height, 1.5);
      margin-top: 10px;
    }
    .aca-note {
      background: rgba(212, 148, 58, 0.08); border-left: 3px solid var(--dark-amber);
    }
    .aca-note strong { color: var(--dark-amber); }
    .warning-block {
      background: rgba(229, 115, 115, 0.08); border-left: 3px solid var(--dark-red);
    }
    .warning-block strong { color: var(--dark-red); }
  `],
})
export class HealthcareCompareScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly ACA_MONTHLY_ESTIMATE = ACA_MONTHLY_ESTIMATE;
  readonly acaLabel = '$' + ACA_MONTHLY_ESTIMATE.toLocaleString();

  readonly selectedId = signal<string | null>(null);

  readonly allMetrics = computed<Metric[]>(() =>
    this.loc.fullLocations().map(l => this.metricFor(l))
      .sort((a, b) => b.quality - a.quality)
  );

  readonly topValues = computed<Metric[]>(() =>
    this.allMetrics().filter(m => m.monthlyHealth > 0)
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  );

  readonly stats = computed(() => {
    const all = this.allMetrics();
    const withData = all.filter(m => m.monthlyHealth > 0);
    if (!all.length) return { bestQuality: null, cheapest: null, bestValue: null, avgCost: 0 };
    const bestQuality = all.reduce((a, b) => b.quality > a.quality ? b : a, all[0]!);
    const cheapest = withData.reduce((a, b) => b.monthlyHealth < a.monthlyHealth ? b : a, withData[0] ?? all[0]!);
    const bestValue = withData.length ? withData.slice().sort((a, b) => b.value - a.value)[0]! : null;
    const avgCost = withData.length ? withData.reduce((s, m) => s + m.monthlyHealth, 0) / withData.length : 0;
    return { bestQuality, cheapest, bestValue, avgCost };
  });

  /** X-axis upper bound for the scatter — round up the observed max so the
   *  plot uses the whole width. */
  readonly xMax = computed(() => {
    const max = this.allMetrics().reduce((m, p) => Math.max(m, p.monthlyHealth), 0);
    return Math.max(400, Math.ceil(max / 200) * 200);
  });

  readonly selected = computed<Metric | null>(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.allMetrics().find(m => m.loc.id === id) ?? null;
  });

  ngOnInit(): void {
    this.loc.loadFull();
  }

  toggleSelect(id: string): void {
    this.selectedId.update(cur => cur === id ? null : id);
  }

  dotX(monthly: number): number {
    return Math.min(100, (monthly / this.xMax()) * 100);
  }

  dotY(quality: number): number {
    return Math.min(100, (quality / 10) * 100);
  }

  /** Non-color text tier for the quality column — lets AT users read the
   *  same "good / mid / low" signal the color conveys. (DFA-2026-04-21-002) */
  qualityTierLabel(quality: number): 'strong' | 'moderate' | 'weak' {
    if (quality >= 6) return 'strong';
    if (quality >= 4) return 'moderate';
    return 'weak';
  }

  private metricFor(loc: LocationFull): Metric {
    const quality = loc.healthcare?.qualityRating ?? 5;
    const monthlyHealth = loc.monthlyCosts?.healthcare?.typical ?? 0;
    const annualHealth = monthlyHealth * 12;
    // Quality per $100/mo — higher is better value. Matches legacy formula.
    const value = monthlyHealth > 0 ? quality / (monthlyHealth / 100) : 0;
    return {
      loc,
      quality,
      monthlyHealth,
      annualHealth,
      value,
      medCoverageAvail: loc.country === 'United States',
    };
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(Math.round(amount), '')
      : '$' + Math.round(amount).toLocaleString();
  }

  fmtYr(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(Math.round(amount), '/yr')
      : '$' + Math.round(amount).toLocaleString() + '/yr';
  }
}
