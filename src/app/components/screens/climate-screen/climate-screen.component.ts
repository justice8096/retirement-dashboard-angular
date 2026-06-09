import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocationService } from '@services/location.service';
import { LocationFull } from '@models/api.model';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_SELECTED = 4;

interface ClimateRow {
  loc: LocationFull;
  high: number[];
  low: number[];
  monthlyComfort: number[];
  annualComfort: number;
  rainyDays: number;
  hottest: number;
  coldest: number;
  hottestMonth: string;
  coldestMonth: string;
  mostComfortable: string;
}

/** Sine-wave interpolation of summer-high / winter-low across 12 months.
 *  Peak (July) matches summerHighF, trough (January) matches winterLowF.
 *  Low temps are modeled as `high - 15` — a rough daily-diurnal offset
 *  that matches the legacy tab. Not meteorologically accurate everywhere
 *  but good enough for relative comparison. */
function interpolateTemps(winterLow: number, summerHigh: number): { high: number[]; low: number[] } {
  const avg = (summerHigh + winterLow) / 2;
  const amplitude = (summerHigh - winterLow) / 2;
  const high = MONTHS.map((_, i) => {
    // i=0 (Jan) → sin(-π/2) = -1 → avg - amplitude = winterLow
    // i=6 (Jul) → sin(π/2)  = +1 → avg + amplitude = summerHigh
    const radians = ((i + 1 - 4) * Math.PI) / 6;
    return avg + amplitude * Math.sin(radians);
  });
  const low = high.map(h => h - 15);
  return { high, low };
}

/** Comfort score for a given high-temperature in °F. Peaks in the 70-80
 *  range (perfect 10), drops linearly with distance from 75°F. */
function comfortScore(tempF: number): number {
  if (tempF >= 70 && tempF <= 80) return 10;
  const distance = Math.abs(tempF - 75);
  return Math.max(0, 10 - distance / 10);
}

@Component({
  selector: 'app-climate-screen',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="climate-screen">
      <div class="screen-header">
        <span class="header-icon">🌤️</span>
        <div>
          <h2 class="header-title">Climate Comparison</h2>
          <p class="header-sub">
            Annual comfort index, monthly temperatures, and rainy-day estimates — select up to 4 locations to compare.
          </p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      <!-- Top 3 cards -->
      <div class="podium">
        @for (item of topThree(); track item.loc.id) {
          <div class="podium-card">
            <div class="podium-name">{{ item.loc.name }}</div>
            <div class="podium-score">{{ item.annualComfort.toFixed(1) }}/10</div>
            <div class="podium-country">
              {{ item.coldest.toFixed(0) }}°F – {{ item.hottest.toFixed(0) }}°F
            </div>
          </div>
        }
      </div>

      <!-- Selector -->
      <div class="card">
        <h3 class="card-title">Pick locations to compare ({{ selectedIds().length }}/{{ MAX_SELECTED }})</h3>
        <div class="picker">
          @for (item of climateData(); track item.loc.id) {
            <button class="pick-btn" [class.selected]="isSelected(item.loc.id)" (click)="toggleSelect(item.loc.id)">
              {{ item.loc.name }}
            </button>
          }
        </div>
      </div>

      <!-- Comparison line chart (CSS) -->
      @if (selectedData().length > 0) {
        <div class="card">
          <h3 class="card-title">Monthly High Temperatures</h3>
          <div class="line-chart">
            <div class="y-axis">
              <span>100°</span><span>80°</span><span>60°</span><span>40°</span><span>20°</span><span>0°</span>
            </div>
            <div class="plot">
              @for (s of selectedData(); track s.loc.id; let i = $index) {
                @for (h of s.high; track $index; let mi = $index) {
                  <div class="series-dot" [class]="'s-' + i"
                    [style.left.%]="(mi / 11) * 100"
                    [style.bottom.%]="tempY(h)"
                    [title]="s.loc.name + ' · ' + months[mi] + ' · ' + h.toFixed(0) + '°F'">
                  </div>
                }
              }
            </div>
          </div>
          <div class="x-axis">
            @for (m of months; track m) { <span>{{ m }}</span> }
          </div>
          <div class="chart-legend">
            @for (s of selectedData(); track s.loc.id; let i = $index) {
              <span><span class="swatch" [class]="'s-' + i"></span>{{ s.loc.name }}</span>
            }
          </div>
        </div>
      }

      <!-- Per-selection detail cards -->
      @for (s of selectedData(); track s.loc.id) {
        <div class="detail-card">
          <h3 class="card-title">{{ s.loc.name }}</h3>
          <div class="stats-grid">
            <div class="stat-cell">
              <div class="stat-label">Annual Comfort</div>
              <div class="stat-val green">{{ s.annualComfort.toFixed(1) }}/10</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">Hottest Month</div>
              <div class="stat-val">{{ s.hottestMonth }}</div>
              <div class="stat-sub">{{ s.hottest.toFixed(0) }}°F</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">Coldest Month</div>
              <div class="stat-val">{{ s.coldestMonth }}</div>
              <div class="stat-sub">{{ s.coldest.toFixed(0) }}°F</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">Most Comfortable</div>
              <div class="stat-val amber">{{ s.mostComfortable }}</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">Rainy Days / Year</div>
              <div class="stat-val">{{ s.rainyDays }}</div>
            </div>
          </div>

          <div class="table-wrap">
            <table class="data-table compact">
              <thead>
                <tr>
                  <th></th>
                  @for (m of months; track m) { <th class="center">{{ m }}</th> }
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>High (°F)</td>
                  @for (h of s.high; track $index) {
                    <td class="center" [class.hot]="h > 85" [class.cold]="h < 50"
                      [attr.aria-label]="h.toFixed(0) + '°F' + (h > 85 ? ' (hot)' : h < 50 ? ' (cold)' : '')">
                      {{ h.toFixed(0) }}<span class="sr-only">{{ h > 85 ? ' hot' : h < 50 ? ' cold' : '' }}</span>
                    </td>
                  }
                </tr>
                <tr>
                  <td>Low (°F)</td>
                  @for (l of s.low; track $index) {
                    <td class="center" [class.cold]="l < 40"
                      [attr.aria-label]="l.toFixed(0) + '°F' + (l < 40 ? ' (cold)' : '')">
                      {{ l.toFixed(0) }}<span class="sr-only">{{ l < 40 ? ' cold' : '' }}</span>
                    </td>
                  }
                </tr>
                <tr>
                  <td>Comfort</td>
                  @for (c of s.monthlyComfort; track $index) {
                    <td class="center" [class.good]="c >= 9" [class.ok]="c >= 7 && c < 9">{{ c.toFixed(1) }}</td>
                  }
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Full ranked table -->
      <div class="card">
        <h3 class="card-title">All Locations Ranked by Comfort</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Location</th>
                <th class="right">Comfort</th>
                <th class="right">Hottest</th>
                <th class="right">Coldest</th>
                <th class="right">Rainy Days</th>
              </tr>
            </thead>
            <tbody>
              @for (item of climateData(); track item.loc.id; let idx = $index) {
                <tr [class.selected]="isSelected(item.loc.id)" (click)="toggleSelect(item.loc.id)">
                  <td>{{ idx + 1 }}</td>
                  <td>{{ item.loc.name }}</td>
                  <td class="right strong">{{ item.annualComfort.toFixed(1) }}/10</td>
                  <td class="right">{{ item.hottest.toFixed(0) }}°F</td>
                  <td class="right">{{ item.coldest.toFixed(0) }}°F</td>
                  <td class="right">{{ item.rainyDays }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .climate-screen { display: flex; flex-direction: column; gap: 16px; }
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

    .podium { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .podium-card {
      padding: 16px; border-radius: 12px;
      background: var(--dark-bg-card); border: 1px solid var(--dark-border); border-top: 3px solid var(--dark-amber);
    }
    .podium-name { font-weight: 700; color: var(--dark-text); font-size: 14px; }
    .podium-score { font-size: 20px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; font-variant-numeric: tabular-nums; }
    .podium-country { font-size: 11px; color: var(--dark-text-muted); margin-top: 4px; font-variant-numeric: tabular-nums; }

    .picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
    .pick-btn {
      padding: 8px 10px; border-radius: 6px; text-align: left; font-size: 12px;
      background: var(--dark-bg-secondary); border: 1px solid var(--dark-border);
      color: var(--dark-text-sec); cursor: pointer;
    }
    .pick-btn.selected { background: var(--dark-amber); color: #000; border-color: var(--dark-amber); font-weight: 700; }
    .pick-btn:hover:not(.selected) { border-color: var(--dark-amber); color: var(--dark-text); }

    .line-chart { display: grid; grid-template-columns: 40px 1fr; height: 260px; gap: 4px; }
    .y-axis {
      display: flex; flex-direction: column; justify-content: space-between;
      font-size: 11px; color: var(--dark-text-muted); text-align: right; padding: 2px 4px 2px 0;
    }
    .plot {
      position: relative; background: var(--dark-bg-secondary); border: 1px solid var(--dark-border);
      border-radius: 6px;
      background-image:
        linear-gradient(to right, var(--dark-border) 1px, transparent 1px),
        linear-gradient(to top, var(--dark-border) 1px, transparent 1px);
      background-size: calc(100% / 11) 20%;
    }
    .series-dot {
      position: absolute; width: 8px; height: 8px; border-radius: 50%;
      transform: translate(-50%, 50%);
    }
    .series-dot.s-0 { background: #FF6B6B; }
    .series-dot.s-1 { background: #4ECDC4; }
    .series-dot.s-2 { background: #45B7D1; }
    .series-dot.s-3 { background: #FFA07A; }
    .x-axis {
      display: flex; justify-content: space-between; padding: 6px 0 0 44px;
      font-size: 11px; color: var(--dark-text-muted);
    }
    .chart-legend {
      display: flex; flex-wrap: wrap; gap: 14px; padding-top: 10px;
      font-size: 12px; color: var(--dark-text-sec);
    }
    .swatch {
      display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px;
      vertical-align: middle;
    }
    .swatch.s-0 { background: #FF6B6B; }
    .swatch.s-1 { background: #4ECDC4; }
    .swatch.s-2 { background: #45B7D1; }
    .swatch.s-3 { background: #FFA07A; }

    .detail-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-left: 4px solid var(--dark-amber);
      border-radius: 12px; padding: 20px;
    }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .stat-cell { padding: 12px; background: var(--dark-bg-secondary); border-radius: 8px; }
    .stat-label { font-size: 11px; color: var(--dark-text-muted); margin-bottom: 4px; }
    .stat-val { font-size: 16px; font-weight: 700; color: var(--dark-text); font-variant-numeric: tabular-nums; }
    .stat-val.green { color: var(--dark-green); }
    .stat-val.amber { color: var(--dark-amber); }
    .stat-sub { font-size: 12px; color: var(--dark-text-muted); margin-top: 2px; font-variant-numeric: tabular-nums; }

    .table-wrap { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table th, .data-table td {
      padding: 8px 10px; border-bottom: 1px solid var(--dark-border); text-align: left;
    }
    .data-table.compact th, .data-table.compact td {
      padding: 6px 4px; font-size: 11px;
    }
    .data-table th {
      font-weight: 600; font-size: 11px; color: var(--dark-text-muted);
      text-transform: uppercase; letter-spacing: 0.4px;
    }
    .data-table td { color: var(--dark-text); }
    .data-table .right { text-align: right; font-variant-numeric: tabular-nums; }
    .data-table .center { text-align: center; font-variant-numeric: tabular-nums; }
    .data-table .strong { font-weight: 700; color: var(--dark-amber); }
    .data-table tr { cursor: pointer; }
    .data-table tr:hover { background: var(--dark-bg-secondary); }
    .data-table tr.selected { background: rgba(212, 148, 58, 0.08); }

    /* Dyscalculia 2026-04-21: hot temps use amber, not red. Red is
     * reserved for errors/alerts; a 90°F day is data, not a failure.
     * Cold stays blue (no anxiety connotation on cold in this app). */
    .hot  { color: var(--dark-amber); font-weight: 600; }
    .cold { color: var(--dark-blue); font-weight: 600; }
    .good { color: var(--dark-green); font-weight: 700; }
    .ok   { color: var(--dark-amber); font-weight: 600; }
  `],
})
export class ClimateScreenComponent implements OnInit {
  readonly loc = inject(LocationService);

  readonly MAX_SELECTED = MAX_SELECTED;
  readonly months = MONTHS;

  readonly selectedIds = signal<string[]>([]);

  readonly climateData = computed<ClimateRow[]>(() =>
    this.loc.fullLocations()
      .map(loc => this.rowFor(loc))
      .sort((a, b) => b.annualComfort - a.annualComfort)
  );

  readonly topThree = computed(() => this.climateData().slice(0, 3));

  readonly selectedData = computed<ClimateRow[]>(() => {
    const ids = this.selectedIds();
    return this.climateData().filter(r => ids.includes(r.loc.id));
  });

  ngOnInit(): void {
    this.loc.loadFull();
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggleSelect(id: string): void {
    this.selectedIds.update(cur => {
      if (cur.includes(id)) return cur.filter(x => x !== id);
      if (cur.length >= MAX_SELECTED) return cur;
      return [...cur, id];
    });
  }

  /** Map a 0°F – 100°F temperature to a 0–100% vertical position for the CSS chart. */
  tempY(temp: number): number {
    return Math.max(0, Math.min(100, temp));
  }

  private rowFor(loc: LocationFull): ClimateRow {
    const summer = loc.climate?.summerHighF ?? 75;
    const winter = loc.climate?.winterLowF ?? 55;
    const rainy = loc.climate?.rainyDaysPerYear ?? 100;
    const { high, low } = interpolateTemps(winter, summer);
    const monthlyComfort = high.map(comfortScore);
    const annualComfort = monthlyComfort.reduce((s, c) => s + c, 0) / 12;
    const hottest = Math.max(...high);
    const coldest = Math.min(...low);
    const hottestMonth = MONTHS[high.indexOf(hottest)] ?? MONTHS[0]!;
    const coldestMonth = MONTHS[low.indexOf(coldest)] ?? MONTHS[0]!;
    const mostComfortable = MONTHS[monthlyComfort.indexOf(Math.max(...monthlyComfort))] ?? MONTHS[0]!;
    return {
      loc, high, low, monthlyComfort, annualComfort, rainyDays: rainy,
      hottest, coldest, hottestMonth, coldestMonth, mostComfortable,
    };
  }
}
