import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { LocationFull } from '@models/api.model';

type SortBy = 'income' | 'country' | 'type';

@Component({
  selector: 'app-visa-screen',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="visa-screen">
      <div class="screen-header">
        <span class="header-icon">🛂</span>
        <div>
          <h2 class="header-title">Visa & Residency</h2>
          <p class="header-sub">
            Retirement-visa income thresholds and application notes, filtered by country.
          </p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      <!-- Summary cards -->
      <div class="results">
        <div class="result-card">
          <div class="result-label">Avg. Monthly Income</div>
          <div class="result-value">{{ stats().avgIncome > 0 ? fmt(stats().avgIncome) : '—' }}</div>
          <div class="result-explain">Across countries with a published requirement</div>
        </div>
        <div class="result-card">
          <div class="result-label">Countries with a Retirement Visa</div>
          <div class="result-value">{{ stats().countriesWithVisa }}</div>
        </div>
        @if (stats().lowestReq) {
          <div class="result-card highlight">
            <div class="result-label">Lowest Requirement</div>
            <div class="result-value">{{ fmt(stats().lowestReqAmount) }}</div>
            <div class="result-explain">{{ stats().lowestReq?.name }}</div>
          </div>
        }
      </div>

      <!-- Controls -->
      <div class="card controls">
        <label class="ctrl">
          <span class="ctrl-label">Sort by</span>
          <select class="ctrl-input" [ngModel]="sortBy()" (ngModelChange)="sortBy.set($event)">
            <option value="income">Income requirement (low → high)</option>
            <option value="country">Country</option>
            <option value="type">Visa type</option>
          </select>
        </label>
        <label class="ctrl">
          <span class="ctrl-label">Country</span>
          <select class="ctrl-input" [ngModel]="filterCountry()" (ngModelChange)="filterCountry.set($event)">
            <option value="">All</option>
            @for (c of countries(); track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select>
        </label>
        <button class="ctrl-clear" (click)="clearSelection()">Clear Selection</button>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Country</th>
                <th>Region</th>
                <th>Visa Type</th>
                <th class="right">Monthly Income Req.</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              @for (loc of filtered(); track loc.id) {
                <tr [class.selected]="selectedId() === loc.id"
                    (click)="toggleSelect(loc.id)">
                  <td>{{ loc.country || '—' }}</td>
                  <td>{{ loc.region || '—' }}</td>
                  <td>
                    @if (loc.visa?.type) {
                      {{ loc.visa?.type }}
                    } @else {
                      <span class="muted">Not available</span>
                    }
                  </td>
                  <td class="right" [class.green]="incomeBand(loc) === 'low'"
                       [class.amber]="incomeBand(loc) === 'mid'"
                       [class.red]="incomeBand(loc) === 'high'">
                    @if (loc.visa?.incomeRequirement?.monthly) {
                      {{ (loc.visa?.incomeRequirement?.currency || loc.currency) }}
                      {{ $safeNavigationMigration(loc.visa?.incomeRequirement?.monthly) | number:'1.0-0' }}
                    } @else {
                      <span class="muted">—</span>
                    }
                  </td>
                  <td class="notes">{{ loc.visa?.notes || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Detail card -->
      @if (selected(); as sel) {
        <div class="detail-card">
          <h3 class="card-title">{{ sel.name }} — Visa & Residency Details</h3>
          <div class="detail-grid">
            <div class="detail-cell">
              <div class="detail-label">Visa Type</div>
              <div class="detail-val">{{ sel.visa?.type || 'Not available' }}</div>
            </div>
            <div class="detail-cell">
              <div class="detail-label">Monthly Income Requirement</div>
              <div class="detail-val"
                [class.green]="incomeBand(sel) === 'low'"
                [class.amber]="incomeBand(sel) === 'mid'"
                [class.red]="incomeBand(sel) === 'high'">
                @if (sel.visa?.incomeRequirement?.monthly) {
                  {{ (sel.visa?.incomeRequirement?.currency || sel.currency) }}
                  {{ $safeNavigationMigration(sel.visa?.incomeRequirement?.monthly) | number:'1.0-0' }}
                } @else { Not available }
              </div>
            </div>
            <div class="detail-cell">
              <div class="detail-label">Medicare Coverage</div>
              <div class="detail-val" [class.green]="sel.country === 'United States'" [class.red]="sel.country !== 'United States'">
                {{ sel.country === 'United States' ? 'Yes' : 'No' }}
              </div>
            </div>
            <div class="detail-cell">
              <div class="detail-label">Currency</div>
              <div class="detail-val">
                {{ sel.currency }}
                @if (sel.exchangeRate) { <span class="muted">(1 USD = {{ sel.exchangeRate.toFixed(2) }})</span> }
              </div>
            </div>
          </div>
          @if (sel.visa?.notes) {
            <div class="notes-block">
              <div class="notes-label">Application Notes</div>
              <div>{{ sel.visa?.notes }}</div>
            </div>
          }
          @if (sel.country !== 'United States') {
            <div class="warning-block">
              <strong>Medicare doesn't cover healthcare abroad.</strong>
              You'll need local insurance, private coverage, or plan to return to the US for major medical needs.
            </div>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .visa-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: calc(32px * var(--font-scale, 1)); }
    .header-title { font-size: calc(20px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: calc(12px * var(--font-scale, 1)); color: var(--dark-text-muted); margin: 2px 0 0; line-height: var(--prose-line-height, 1.5); }
    .badge-new {
      font-size: calc(10px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-green);
      padding: 2px 8px; background: rgba(76, 175, 80, 0.12); border-radius: 4px;
    }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-title { font-size: calc(14px * var(--font-scale, 1)); font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .results { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .result-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .result-card.highlight { border-color: var(--dark-green); background: rgba(76, 175, 80, 0.06); }
    .result-label { font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-muted); text-transform: uppercase; }
    .result-value { font-size: calc(22px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-amber); margin-top: 4px; font-variant-numeric: tabular-nums; }
    .result-explain { font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-muted); margin-top: 4px; }

    .controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
    .ctrl { display: flex; flex-direction: column; gap: 4px; flex: 1 1 180px; }
    .ctrl-label { font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-muted); }
    .ctrl-input {
      padding: 7px 10px; border-radius: 6px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text);
      font-size: calc(13px * var(--font-scale, 1)); font-family: var(--font-sans); outline: none;
    }
    .ctrl-clear {
      padding: 7px 14px; border-radius: 6px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text-sec);
      font-size: calc(12px * var(--font-scale, 1)); cursor: pointer;
    }
    .ctrl-clear:hover { color: var(--dark-text); border-color: var(--dark-amber); }

    .table-wrap { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; font-size: calc(13px * var(--font-scale, 1)); }
    .data-table th, .data-table td {
      padding: 8px 10px; border-bottom: 1px solid var(--dark-border); text-align: left;
      vertical-align: top;
    }
    .data-table th {
      font-weight: 600; font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-muted);
      text-transform: uppercase; letter-spacing: 0.4px;
    }
    .data-table td { color: var(--dark-text); }
    .data-table .right { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    .data-table tr { cursor: pointer; }
    .data-table tr:hover { background: var(--dark-bg-secondary); }
    .data-table tr.selected { background: rgba(212, 148, 58, 0.08); }
    .data-table .notes { font-size: calc(12px * var(--font-scale, 1)); color: var(--dark-text-sec); max-width: 360px; }

    .green { color: var(--dark-green); }
    .amber { color: var(--dark-amber); }
    .red   { color: var(--dark-neutral); }
    .muted { color: var(--dark-text-muted); font-weight: 400; }

    .detail-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-left: 4px solid var(--dark-amber);
      border-radius: 12px; padding: 20px;
    }
    .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .detail-cell {
      padding: 12px; border-radius: 8px; background: var(--dark-bg-secondary);
    }
    .detail-label { font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-muted); margin-bottom: 4px; }
    .detail-val { font-size: calc(16px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-text); font-variant-numeric: tabular-nums; }
    .notes-block {
      padding: 12px; border-radius: 8px; background: var(--dark-bg-secondary);
      border-left: 3px solid var(--dark-text-sec); margin-bottom: 10px;
    }
    .notes-label { font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-muted); margin-bottom: 6px; }
    .notes-block div { font-size: calc(13px * var(--font-scale, 1)); color: var(--dark-text-sec); line-height: var(--prose-line-height, 1.5); }
    .warning-block {
      padding: 12px 14px; border-radius: 8px;
      background: rgba(229, 115, 115, 0.08); border-left: 3px solid var(--dark-red);
      font-size: calc(13px * var(--font-scale, 1)); color: var(--dark-text-sec); line-height: var(--prose-line-height, 1.5);
    }
    .warning-block strong { color: var(--dark-red); }
  `],
})
export class VisaScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly sortBy = signal<SortBy>('income');
  readonly filterCountry = signal<string>('');
  readonly selectedId = signal<string | null>(null);

  readonly countries = computed(() =>
    [...new Set(this.loc.fullLocations().map(l => l.country).filter(Boolean))].sort()
  );

  readonly filtered = computed(() => {
    const all = this.loc.fullLocations();
    const country = this.filterCountry();
    const filtered = country ? all.filter(l => l.country === country) : [...all];
    const sort = this.sortBy();
    if (sort === 'income') {
      filtered.sort((a, b) => {
        const av = a.visa?.incomeRequirement?.monthly ?? Infinity;
        const bv = b.visa?.incomeRequirement?.monthly ?? Infinity;
        return av - bv;
      });
    } else if (sort === 'country') {
      filtered.sort((a, b) => (a.country ?? '').localeCompare(b.country ?? ''));
    } else {
      filtered.sort((a, b) => (a.visa?.type ?? '~').localeCompare(b.visa?.type ?? '~'));
    }
    return filtered;
  });

  readonly stats = computed(() => {
    const withVisa = this.loc.fullLocations().filter(l => l.visa?.incomeRequirement?.monthly);
    const avgIncome = withVisa.length
      ? withVisa.reduce((s, l) => s + (l.visa?.incomeRequirement?.monthly ?? 0), 0) / withVisa.length
      : 0;
    const countriesWithVisa = new Set(withVisa.map(l => l.country)).size;
    const lowestReq = withVisa.reduce<LocationFull | null>((min, l) => {
      if (!min) return l;
      const mv = min.visa?.incomeRequirement?.monthly ?? Infinity;
      const lv = l.visa?.incomeRequirement?.monthly ?? Infinity;
      return lv < mv ? l : min;
    }, null);
    return {
      avgIncome,
      countriesWithVisa,
      lowestReq,
      lowestReqAmount: lowestReq?.visa?.incomeRequirement?.monthly ?? 0,
    };
  });

  readonly selected = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.loc.fullLocations().find(l => l.id === id) ?? null;
  });

  ngOnInit(): void {
    this.loc.loadFull();
  }

  toggleSelect(id: string): void {
    this.selectedId.update(cur => cur === id ? null : id);
  }

  clearSelection(): void {
    this.selectedId.set(null);
    this.filterCountry.set('');
  }

  /** Color band for monthly requirement, in USD-equivalent terms via
   *  `exchangeRate`. <$1500 is accessible, $1500–$2500 moderate, above
   *  that is typical of golden-visa programs. */
  incomeBand(l: LocationFull): 'low' | 'mid' | 'high' | null {
    const m = l.visa?.incomeRequirement?.monthly;
    if (!m) return null;
    const usd = l.exchangeRate ? m / l.exchangeRate : m;
    if (usd < 1500) return 'low';
    if (usd <= 2500) return 'mid';
    return 'high';
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(Math.round(amount), '/mo')
      : '$' + Math.round(amount).toLocaleString() + '/mo';
  }
}
