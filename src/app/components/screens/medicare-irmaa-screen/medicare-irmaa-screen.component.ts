import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { HouseholdProfile } from '@models/api.model';

/* 2026 IRMAA brackets (income lookback = 2 years prior).
 * Base Part B premium paid on top of the surcharge.
 * Source: CMS Medicare Part B premium and IRMAA, 2026 release. */
interface IRMAABracket {
  min: number;
  max: number;
  partBSurcharge: number;  // monthly $ added to base
  partDSurcharge: number;  // monthly $ added to the Part D plan premium
}

const IRMAA_BRACKETS: Record<'single' | 'married', IRMAABracket[]> = {
  single: [
    { min: 0,       max: 106000,   partBSurcharge: 0,     partDSurcharge: 0 },
    { min: 106000,  max: 133000,   partBSurcharge: 74.0,  partDSurcharge: 13.7 },
    { min: 133000,  max: 167000,   partBSurcharge: 185.0, partDSurcharge: 35.5 },
    { min: 167000,  max: 200000,   partBSurcharge: 295.9, partDSurcharge: 57.3 },
    { min: 200000,  max: 500000,   partBSurcharge: 406.9, partDSurcharge: 79.0 },
    { min: 500000,  max: Infinity, partBSurcharge: 444.0, partDSurcharge: 85.8 },
  ],
  married: [
    { min: 0,       max: 212000,   partBSurcharge: 0,     partDSurcharge: 0 },
    { min: 212000,  max: 266000,   partBSurcharge: 74.0,  partDSurcharge: 13.7 },
    { min: 266000,  max: 334000,   partBSurcharge: 185.0, partDSurcharge: 35.5 },
    { min: 334000,  max: 400000,   partBSurcharge: 295.9, partDSurcharge: 57.3 },
    { min: 400000,  max: 750000,   partBSurcharge: 406.9, partDSurcharge: 79.0 },
    { min: 750000,  max: Infinity, partBSurcharge: 444.0, partDSurcharge: 85.8 },
  ],
};

const BASE_PART_B_PREMIUM = 185;  // monthly $
const MEDICARE_START_AGE = 65;
const MAGI_GROWTH = 0.03;         // 3% annual assumed income growth
const PROJECTION_TO_AGE = 100;

interface ProjectionRow {
  age: number;
  year: number;
  projectedMAGI: number;
  tierLabel: string;
  tierIndex: number;
  partBAnnual: number;
  partDAnnual: number;
  totalAnnual: number;
}

@Component({
  selector: 'app-medicare-irmaa-screen',
  standalone: true,
  imports: [FormsModule, NumericInputDirective],
  template: `
    <div class="irmaa-screen">
      <div class="screen-header">
        <span class="header-icon">⚕️</span>
        <div>
          <h2 class="header-title">Medicare IRMAA</h2>
          <p class="header-sub">
            Income-Related Monthly Adjustment Amounts — how your income bumps Part B and Part D premiums.
          </p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      <div class="card">
        <h3 class="card-title">Your Inputs</h3>
        <div class="param-grid">
          <label class="param">
            <span class="param-label">Filing Status</span>
            <select class="param-input"
              [ngModel]="filingStatus()" (ngModelChange)="filingStatus.set($event)">
              <option value="single">Single</option>
              <option value="married">Married Filing Jointly</option>
            </select>
          </label>
          <label class="param">
            <span class="param-label">Projected MAGI (baseline year)</span>
            <input appNumeric="currency" class="param-input"
              [class]="dyscalculia.numberSpacingClass()"
              [ngModel]="projectedMAGI()" (ngModelChange)="projectedMAGI.set($event)" />
            <span class="param-hint">
              MAGI lookback is 2 years — your 2026 premium is set by 2024 income.
            </span>
            @if (dyscalculia.isEnabled() && projectedMAGI() > 0) {
              <span class="param-hint">— {{ magiAnchor() }}</span>
            }
          </label>
        </div>
      </div>

      <div class="results">
        <div class="result-card highlight">
          <div class="result-label">Lifetime Cost</div>
          <div class="result-value lg" [class]="dyscalculia.numberSpacingClass()">
            {{ plainDollars(summary().totalCost) }}
          </div>
          <div class="result-explain">Ages 65 – {{ PROJECTION_TO_AGE }}</div>
        </div>
        <div class="result-card">
          <div class="result-label">Avg / Year</div>
          <div class="result-value lg">{{ fmt(summary().averageAnnual) }}</div>
        </div>
        <div class="result-card">
          <div class="result-label">Peak Year</div>
          <div class="result-value lg">{{ fmt(summary().peakYear) }}</div>
        </div>
        <div class="result-card">
          <div class="result-label">Years at Base (No Surcharge)</div>
          <div class="result-value lg">{{ summary().yearsAtBase }}</div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">IRMAA Brackets — 2026 ({{ filingStatus() === 'single' ? 'Single' : 'Married Filing Jointly' }})</h3>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>MAGI Range</th>
                <th class="right">Part B Surcharge / mo</th>
                <th class="right">Part D Surcharge / mo</th>
              </tr>
            </thead>
            <tbody>
              @for (b of brackets(); track $index) {
                <tr [class.row-current]="currentTierIndex() === $index">
                  <td>{{ rangeLabel(b) }}</td>
                  <td class="right">{{ b.partBSurcharge > 0 ? fmtSurcharge(b.partBSurcharge) : '—' }}</td>
                  <td class="right">{{ b.partDSurcharge > 0 ? fmtSurcharge(b.partDSurcharge) : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="param-hint">
          Base Part B premium: {{ fmtSurcharge(BASE_PART_B_PREMIUM) }}. Surcharges stack on top.
        </p>
      </div>

      <div class="card">
        <h3 class="card-title">Year-by-Year Projection</h3>
        @if (!projections().length) {
          <p class="param-hint">
            No years to project — set household birth years on the Assumptions screen.
          </p>
        } @else {
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Year</th>
                  <th class="right">Projected MAGI</th>
                  <th>Tier</th>
                  <th class="right">Part B / yr</th>
                  <th class="right">Part D / yr</th>
                  <th class="right">Total / yr</th>
                </tr>
              </thead>
              <tbody>
                @for (r of projections(); track r.year) {
                  <tr>
                    <td>{{ r.age }}</td>
                    <td>{{ r.year }}</td>
                    <td class="right">{{ plainDollars(r.projectedMAGI) }}</td>
                    <td>
                      <span class="tier-pill" [class.tier-base]="r.tierIndex === 0" [class.tier-surcharged]="r.tierIndex > 0">
                        {{ r.tierLabel }}
                      </span>
                    </td>
                    <td class="right">{{ fmt(r.partBAnnual) }}</td>
                    <td class="right">{{ fmt(r.partDAnnual) }}</td>
                    <td class="right strong">{{ fmt(r.totalAnnual) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <div class="insights">
        <h3 class="card-title">Planning Notes</h3>
        <ul>
          <li>IRMAA uses MAGI from <strong>2 years prior</strong> — 2026 premiums key off 2024 income.</li>
          <li>Roth conversions raise MAGI and can trigger a surcharge. Model the conversion year carefully.</li>
          <li>Qualified Charitable Distributions (QCDs) from an IRA don't count toward MAGI.</li>
          <li>Tier boundaries are cliffs — $1 over a threshold triggers the full surcharge for that year.</li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .irmaa-screen { display: flex; flex-direction: column; gap: 16px; }
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

    .results { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .result-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .result-card.highlight { border-color: var(--dark-amber); }
    .result-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .result-value { font-size: 15px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; }
    .result-value.lg { font-size: 22px; line-height: 1.2; word-break: break-word; }
    .result-explain { font-size: 11px; color: var(--dark-text-muted); margin-top: 4px; }

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
    .data-table .strong { font-weight: 700; color: var(--dark-amber); }
    .data-table tr.row-current { background: rgba(212, 148, 58, 0.08); }

    .tier-pill {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 600;
    }
    .tier-pill.tier-base {
      background: rgba(76, 175, 80, 0.15); color: var(--dark-green);
    }
    .tier-pill.tier-surcharged {
      background: rgba(229, 115, 115, 0.15); color: var(--dark-red);
    }

    .insights {
      background: rgba(212, 148, 58, 0.08); border-left: 4px solid var(--dark-amber);
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
export class MedicareIrmaaScreenComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly BASE_PART_B_PREMIUM = BASE_PART_B_PREMIUM;
  readonly PROJECTION_TO_AGE = PROJECTION_TO_AGE;

  readonly filingStatus = signal<'single' | 'married'>('married');
  readonly projectedMAGI = signal(85000);
  readonly household = signal<HouseholdProfile | null>(null);

  readonly brackets = computed(() => IRMAA_BRACKETS[this.filingStatus()]);

  /** Plain-language magnitude anchor for MAGI. Uses `withdrawal-year` since
   *  MAGI is an annual-income quantity; the service already has ranges
   *  calibrated for that context. */
  readonly magiAnchor = computed(() =>
    this.dyscalculia.getAnchor(this.projectedMAGI(), 'withdrawal-year')
  );

  readonly currentTierIndex = computed(() => {
    const magi = this.projectedMAGI();
    const bs = this.brackets();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]!;
      if (magi >= b.min && magi < b.max) return i;
    }
    return bs.length - 1;
  });

  /** Earliest adult birth year in the household — Medicare coverage starts
   *  at 65 and this drives the start of the projection window. */
  readonly earliestBirthYear = computed<number | null>(() => {
    const h = this.household();
    if (!h) return null;
    const adults = h.members.filter(m => m.role === 'primary' || m.role === 'spouse');
    if (!adults.length) return null;
    return Math.min(...adults.map(a => a.birthYear));
  });

  readonly projections = computed<ProjectionRow[]>(() => {
    const earliest = this.earliestBirthYear();
    if (earliest === null) return [];
    const h = this.household();
    const startYear = h?.planningStartYear ?? new Date().getFullYear();
    const bs = this.brackets();
    const rows: ProjectionRow[] = [];
    let magi = this.projectedMAGI();

    for (let y = 0; y <= PROJECTION_TO_AGE - MEDICARE_START_AGE; y++) {
      const year = startYear + y;
      const age = year - earliest;
      if (age >= MEDICARE_START_AGE && age <= PROJECTION_TO_AGE) {
        const tierIdx = this.findBracketIndex(magi, bs);
        const bracket = bs[tierIdx]!;
        const partBAnnual = Math.round((BASE_PART_B_PREMIUM + bracket.partBSurcharge) * 12);
        const partDAnnual = Math.round(bracket.partDSurcharge * 12);
        rows.push({
          age, year,
          projectedMAGI: Math.round(magi),
          tierLabel: tierIdx === 0 ? 'No surcharge' : `Tier ${tierIdx}`,
          tierIndex: tierIdx,
          partBAnnual, partDAnnual,
          totalAnnual: partBAnnual + partDAnnual,
        });
      }
      magi *= 1 + MAGI_GROWTH;
    }
    return rows;
  });

  readonly summary = computed(() => {
    const rows = this.projections();
    if (!rows.length) return { totalCost: 0, averageAnnual: 0, peakYear: 0, yearsAtBase: 0 };
    const totalCost = rows.reduce((s, r) => s + r.totalAnnual, 0);
    const baseAnnual = BASE_PART_B_PREMIUM * 12;
    return {
      totalCost,
      averageAnnual: Math.round(totalCost / rows.length),
      peakYear: Math.max(...rows.map(r => r.totalAnnual)),
      yearsAtBase: rows.filter(r => r.totalAnnual === baseAnnual).length,
    };
  });

  ngOnInit(): void {
    this.api.getHousehold().subscribe({
      next: (h) => this.household.set(h),
      error: (err) => console.warn('MedicareIrmaa: household fetch failed.', err),
    });
  }

  rangeLabel(b: IRMAABracket): string {
    if (b.min === 0) return `$0 – ${this.plainDollars(b.max)}`;
    if (b.max === Infinity) return `${this.plainDollars(b.min)}+`;
    return `${this.plainDollars(b.min)} – ${this.plainDollars(b.max)}`;
  }

  private findBracketIndex(magi: number, bs: IRMAABracket[]): number {
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]!;
      if (magi >= b.min && magi < b.max) return i;
    }
    return bs.length - 1;
  }

  /** Annual-dollar amount with the dyscalculia `/yr` unit so totals read
   *  correctly in calm / spaced-number / words mode. */
  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, '/yr')
      : '$' + Math.round(amount).toLocaleString() + '/yr';
  }

  /** Lump-sum dollar figure with no time-unit suffix — for income ranges and
   *  MAGI projections. */
  plainDollars(amount: number): string {
    if (amount === Infinity) return '∞';
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, '')
      : '$' + Math.round(amount).toLocaleString();
  }

  /** Small monthly surcharge amount for the bracket table — routes through
   *  DyscalculiaService so a user with spaced/words `numberFormat` mode gets
   *  consistent rendering across every dollar on the screen (F-016). */
  fmtSurcharge(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, '/mo')
      : '$' + amount.toFixed(2) + '/mo';
  }
}
