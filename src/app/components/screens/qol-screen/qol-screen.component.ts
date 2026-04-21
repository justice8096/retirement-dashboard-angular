import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { LocationFull } from '@models/api.model';

type Dim = 'costOfLiving' | 'safety' | 'healthcare' | 'climate' | 'internet' | 'expatCommunity';
type PresetName = 'balanced' | 'budgetFocus' | 'safetyFirst' | 'digitalNomad';

const PRESETS: Record<PresetName, Record<Dim, number>> = {
  balanced:     { costOfLiving:  5, safety:  5, healthcare: 5, climate: 5, internet:  5, expatCommunity: 5 },
  budgetFocus:  { costOfLiving: 10, safety:  4, healthcare: 4, climate: 4, internet:  3, expatCommunity: 2 },
  safetyFirst:  { costOfLiving:  3, safety: 10, healthcare: 8, climate: 4, internet:  4, expatCommunity: 3 },
  digitalNomad: { costOfLiving:  4, safety:  7, healthcare: 5, climate: 6, internet: 10, expatCommunity: 8 },
};

const DIM_LABELS: Record<Dim, string> = {
  costOfLiving:   'Cost of Living',
  safety:         'Safety',
  healthcare:     'Healthcare',
  climate:        'Climate',
  internet:       'Internet',
  expatCommunity: 'Expat Community',
};

interface Scored {
  loc: LocationFull;
  dims: Record<Dim, number>;
  composite: number;
}

@Component({
  selector: 'app-qol-screen',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="qol-screen">
      <div class="screen-header">
        <span class="header-icon">⭐</span>
        <div>
          <h2 class="header-title">Quality of Life Index</h2>
          <p class="header-sub">
            Weighted composite score across cost, safety, healthcare, climate, internet, and expat community.
          </p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      <!-- Top 3 medals -->
      <div class="podium">
        @for (item of topThree(); track item.loc.id; let i = $index) {
          <div class="podium-card" [class.rank-1]="i === 0" [class.rank-2]="i === 1" [class.rank-3]="i === 2">
            <div class="medal">{{ ['🥇', '🥈', '🥉'][i] }}</div>
            <div class="podium-name">{{ item.loc.name }}</div>
            <div class="podium-score">{{ item.composite.toFixed(1) }}/10</div>
            <div class="podium-country">{{ item.loc.country }}</div>
          </div>
        }
      </div>

      <!-- Weight controls -->
      <div class="card">
        <h3 class="card-title">Weights</h3>
        <div class="presets">
          @for (p of presetNames; track p) {
            <button class="preset-btn" [class.active]="activePreset() === p" (click)="applyPreset(p)">
              {{ presetLabel(p) }}
            </button>
          }
        </div>
        <div class="sliders">
          @for (d of dims; track d) {
            <label class="slider-row">
              <div class="slider-head">
                <span>{{ dimLabels[d] }}</span>
                <span class="slider-val">{{ weights()[d] }}</span>
              </div>
              <input type="range" min="0" max="10"
                [ngModel]="weights()[d]" (ngModelChange)="setWeight(d, $event)" />
            </label>
          }
        </div>
      </div>

      <!-- Top 15 bar chart (CSS bars) -->
      <div class="card">
        <h3 class="card-title">Top 15 by Composite Score</h3>
        <div class="bar-list">
          @for (item of topFifteen(); track item.loc.id) {
            <div class="bar-row">
              <div class="bar-name">{{ item.loc.name }}</div>
              <div class="bar-track">
                <div class="bar-fill" [style.width.%]="item.composite * 10"></div>
                <span class="bar-score">{{ item.composite.toFixed(1) }}</span>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Full ranked table -->
      <div class="card">
        <h3 class="card-title">All Locations Ranked</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Location</th>
                <th class="right">Score</th>
                @for (d of dims; track d) {
                  <th class="right">{{ dimShort[d] }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (item of scores(); track item.loc.id; let idx = $index) {
                <tr [class.top-row]="idx < 3">
                  <td>{{ idx + 1 }}</td>
                  <td>{{ item.loc.name }}</td>
                  <td class="right strong">{{ item.composite.toFixed(1) }}</td>
                  @for (d of dims; track d) {
                    <td class="right">{{ item.dims[d].toFixed(1) }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .qol-screen { display: flex; flex-direction: column; gap: 16px; }
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

    .podium { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .podium-card {
      padding: 16px; text-align: center; border-radius: 12px;
      background: var(--dark-bg-card); border: 1px solid var(--dark-border); border-top-width: 3px;
    }
    .podium-card.rank-1 { border-top-color: var(--dark-green); background: rgba(76, 175, 80, 0.06); }
    .podium-card.rank-2 { border-top-color: var(--dark-blue); background: rgba(92, 156, 230, 0.06); }
    .podium-card.rank-3 { border-top-color: var(--dark-amber); background: rgba(212, 148, 58, 0.06); }
    .medal { font-size: 28px; }
    .podium-name { font-weight: 700; color: var(--dark-text); margin-top: 4px; }
    .podium-score { font-size: 20px; font-weight: 700; color: var(--dark-amber); margin-top: 2px; }
    .podium-country { font-size: 11px; color: var(--dark-text-muted); margin-top: 2px; }

    .presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .preset-btn {
      padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
      background: var(--dark-bg-secondary); border: 1px solid var(--dark-border);
      color: var(--dark-text-sec); cursor: pointer;
    }
    .preset-btn.active { background: var(--dark-amber); color: #000; border-color: var(--dark-amber); }
    .preset-btn:hover:not(.active) { border-color: var(--dark-amber); color: var(--dark-text); }

    .sliders { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
    .slider-row { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--dark-text-sec); }
    .slider-head { display: flex; justify-content: space-between; }
    .slider-val { color: var(--dark-amber); font-weight: 700; font-variant-numeric: tabular-nums; }

    .bar-list { display: flex; flex-direction: column; gap: 6px; }
    .bar-row { display: grid; grid-template-columns: 200px 1fr; gap: 10px; align-items: center; }
    .bar-name { font-size: 12px; color: var(--dark-text); }
    .bar-track {
      position: relative; height: 20px;
      background: var(--dark-bg-secondary); border-radius: 10px; overflow: hidden;
    }
    .bar-fill {
      height: 100%; background: linear-gradient(90deg, var(--dark-blue), var(--dark-amber));
      transition: width 0.3s;
    }
    .bar-score {
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      font-size: 11px; font-weight: 700; color: var(--dark-text);
      font-variant-numeric: tabular-nums;
    }

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
    .data-table tr.top-row { background: rgba(212, 148, 58, 0.05); }
  `],
})
export class QolScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly dims: Dim[] = ['costOfLiving', 'safety', 'healthcare', 'climate', 'internet', 'expatCommunity'];
  readonly dimLabels = DIM_LABELS;
  readonly dimShort: Record<Dim, string> = {
    costOfLiving: 'Cost', safety: 'Safety', healthcare: 'Health',
    climate: 'Climate', internet: 'Net', expatCommunity: 'Expat',
  };
  readonly presetNames: PresetName[] = ['balanced', 'budgetFocus', 'safetyFirst', 'digitalNomad'];

  readonly weights = signal<Record<Dim, number>>({ ...PRESETS.balanced });

  readonly activePreset = computed<PresetName | null>(() => {
    const w = this.weights();
    for (const [name, preset] of Object.entries(PRESETS)) {
      if (this.dims.every(d => preset[d as Dim] === w[d as Dim])) return name as PresetName;
    }
    return null;
  });

  readonly scores = computed<Scored[]>(() => {
    const w = this.weights();
    const weightSum = this.dims.reduce((s, d) => s + w[d], 0) || 1;
    return this.loc.fullLocations()
      .map(loc => {
        const dims = this.calcDimensions(loc);
        const scoreSum = this.dims.reduce((s, d) => s + dims[d] * w[d], 0);
        return { loc, dims, composite: scoreSum / weightSum };
      })
      .sort((a, b) => b.composite - a.composite);
  });

  readonly topThree = computed(() => this.scores().slice(0, 3));
  readonly topFifteen = computed(() => this.scores().slice(0, 15));

  ngOnInit(): void {
    this.loc.loadFull();
  }

  applyPreset(name: PresetName): void {
    this.weights.set({ ...PRESETS[name] });
  }

  setWeight(d: Dim, val: number): void {
    this.weights.update(w => ({ ...w, [d]: val }));
  }

  presetLabel(name: PresetName): string {
    return name.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
  }

  /** Map each location property onto a 0-10 dimension.
   *  `safetyRating`, `qualityRating`, and `expatCommunity` are already on a
   *  0-10 scale in the API (unlike the legacy 0-5 shape the original tab
   *  assumed), so we pass them through without the legacy `× 2` boost. */
  private calcDimensions(loc: LocationFull): Record<Dim, number> {
    const rent = loc.monthlyCosts?.rent?.typical ?? 1000;
    const costScore = clamp01to10(10 - rent / 500);

    const safetyScore = clamp01to10(loc.lifestyle?.safetyRating ?? 5);
    const healthcareScore = clamp01to10(loc.healthcare?.qualityRating ?? 5);

    const summer = loc.climate?.summerHighF ?? 75;
    const winter = loc.climate?.winterLowF ?? 60;
    const rainy = loc.climate?.rainyDaysPerYear ?? 100;
    const avgTemp = (summer + winter) / 2;
    const tempScore = clamp01to10(10 - Math.abs(avgTemp - 75) / 10);
    const rainScore = clamp01to10(10 - rainy / 50);
    const climateScore = (tempScore + rainScore) / 2;

    const speedMbps = parseSpeedToMbps(loc.lifestyle?.internetSpeed);
    // 50 Mbps → 5, 100 Mbps → 10, 1 Gbps → 10 (clamped). Matches the
    // "is this fast enough for remote work" threshold most expats care about.
    const internetScore = clamp01to10(speedMbps / 10);

    const expatScore = clamp01to10(loc.lifestyle?.expatCommunity ?? 5);

    return {
      costOfLiving: costScore,
      safety: safetyScore,
      healthcare: healthcareScore,
      climate: climateScore,
      internet: internetScore,
      expatCommunity: expatScore,
    };
  }
}

function clamp01to10(n: number): number {
  return Math.max(0, Math.min(10, n));
}

/** Pull a Mbps number out of free-form strings like "1Gbps available",
 *  "100Mbps+", "500 Mbps fiber". Returns 10 as a conservative default when
 *  the string has no parseable number. */
function parseSpeedToMbps(raw: string | undefined | null): number {
  if (!raw) return 10;
  const s = String(raw);
  const match = s.match(/(\d+(?:\.\d+)?)\s*(G|M)?/i);
  if (!match) return 10;
  const n = parseFloat(match[1]!);
  const unit = (match[2] ?? 'M').toUpperCase();
  return unit === 'G' ? n * 1000 : n;
}
