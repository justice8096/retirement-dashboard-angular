import { Component, inject, computed, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { LocationFull, COST_CATEGORIES } from '@models/api.model';

@Component({
  selector: 'app-location-compare',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="compare-view">

      <!-- Empty state -->
      @if (locations().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <h2>Compare Locations</h2>
          <p>
            Select cities on the
            <button mat-button class="link-btn" (click)="goToOverview()">
              Overview
            </button>
            tab using the checkboxes, then come back here to compare them side-by-side.
          </p>
        </div>
      } @else {

        <!-- Header: selected count + clear -->
        <div class="compare-header">
          <h2>Comparing {{ locations().length }} Locations</h2>
          <button mat-button class="clear-btn" (click)="loc.deselectAll()">
            Clear all
          </button>
        </div>

        <!-- Scrollable comparison table -->
        <div class="table-scroll">
          <table class="compare-table" role="grid">

            <!-- City header row -->
            <thead>
              <tr>
                <th class="label-col sticky-col">Location</th>
                @for (city of locations(); track city.id) {
                  <th class="city-col">
                    <div class="city-header">
                      <span class="city-name">{{ city.name }}</span>
                      <span class="city-country">{{ city.country }}</span>
                    </div>
                  </th>
                }
              </tr>
            </thead>

            <tbody>
              <!-- Total monthly cost -->
              <tr class="total-row">
                <td class="label-col sticky-col row-label">
                  <span class="row-icon">💰</span> Total Monthly
                </td>
                @for (city of locations(); track city.id) {
                  <td class="city-col total-cell"
                    [class]="dyscalculia.numberSpacingClass()"
                    [class.cheapest]="isCheapest(city)"
                    [class.priciest]="isPriciest(city)">
                    {{ fmt(city.monthlyCostTotal ?? 0) }}
                  </td>
                }
              </tr>

              <!-- Section: Cost breakdown -->
              <tr class="section-header-row">
                <td [attr.colspan]="locations().length + 1" class="section-label">
                  Monthly Costs
                </td>
              </tr>
              @for (cat of costRows(); track cat.key) {
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">{{ cat.icon }}</span> {{ cat.label }}
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col"
                      [class]="dyscalculia.numberSpacingClass()"
                      [class.best-in-row]="isBestInRow(cat.key, city)"
                      [class.worst-in-row]="isWorstInRow(cat.key, city)">
                      {{ fmtCost(city, cat.key) }}
                    </td>
                  }
                </tr>
              }

              <!-- Section: Lifestyle -->
              @if (hasLifestyle()) {
                <tr class="section-header-row">
                  <td [attr.colspan]="locations().length + 1" class="section-label">
                    Lifestyle &amp; Safety
                  </td>
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🛡️</span> Safety
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Safety</span>
                        <div class="bar-row">
                          <div class="bar-track">
                            <div class="bar-fill" [style.width.%]="(city.lifestyle?.safetyRating ?? 0) * 10"></div>
                          </div>
                          <span class="rating-label">{{ city.lifestyle?.safetyRating ?? '–' }}/10</span>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🐾</span> Dog Friendly
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Dog Friendly</span>
                        <div class="bar-row">
                          <div class="bar-track">
                            <div class="bar-fill" [style.width.%]="(city.lifestyle?.dogFriendly ?? 0) * 10"></div>
                          </div>
                          <span class="rating-label">{{ city.lifestyle?.dogFriendly ?? '–' }}/10</span>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🌐</span> Expat Community
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Expat Community</span>
                        <div class="bar-row">
                          <div class="bar-track">
                            <div class="bar-fill" [style.width.%]="(city.lifestyle?.expatCommunity ?? 0) * 10"></div>
                          </div>
                          <span class="rating-label">{{ city.lifestyle?.expatCommunity ?? '–' }}/10</span>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🗣️</span> English Spoken
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">English Spoken</span>
                        <div class="bar-row">
                          <div class="bar-track">
                            <div class="bar-fill" [style.width.%]="(city.lifestyle?.englishPrevalence ?? 0) * 10"></div>
                          </div>
                          <span class="rating-label">{{ city.lifestyle?.englishPrevalence ?? '–' }}/10</span>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">📶</span> Internet
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Internet</span>
                        <span class="metric-text-val">{{ city.lifestyle?.internetSpeed ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
              }

              <!-- Section: Healthcare -->
              @if (hasHealthcare()) {
                <tr class="section-header-row">
                  <td [attr.colspan]="locations().length + 1" class="section-label">
                    Healthcare
                  </td>
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🏥</span> System
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">System</span>
                        <span class="metric-text-val">{{ city.healthcare?.system ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">⭐</span> Quality
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Quality</span>
                        <div class="bar-row">
                          <div class="bar-track">
                            <div class="bar-fill bar-fill--health" [style.width.%]="(city.healthcare?.qualityRating ?? 0) * 10"></div>
                          </div>
                          <span class="rating-label">{{ city.healthcare?.qualityRating ?? '–' }}/10</span>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🦷</span> Dental
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Dental</span>
                        <span class="metric-text-val">{{ city.healthcare?.dentalIncluded ? '✓ Included' : '✗ Extra' }}</span>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">⏱️</span> Wait Times
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Wait Times</span>
                        <span class="metric-text-val">{{ city.healthcare?.waitTimes ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
              }

              <!-- Section: Climate -->
              @if (hasClimate()) {
                <tr class="section-header-row">
                  <td [attr.colspan]="locations().length + 1" class="section-label">
                    Climate
                  </td>
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🌤️</span> Type
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Type</span>
                        <span class="metric-text-val">{{ city.climate?.type ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🌡️</span> Avg High
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Avg High</span>
                        <span class="metric-text-val">{{ city.climate?.avgTemp?.high != null ? city.climate!.avgTemp!.high + '°F' : '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">❄️</span> Avg Low
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Avg Low</span>
                        <span class="metric-text-val">{{ city.climate?.avgTemp?.low != null ? city.climate!.avgTemp!.low + '°F' : '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
              }

              <!-- Section: Visa -->
              @if (hasVisa()) {
                <tr class="section-header-row">
                  <td [attr.colspan]="locations().length + 1" class="section-label">
                    Visa &amp; Residency
                  </td>
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🛂</span> Visa Type
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Visa Type</span>
                        <span class="metric-text-val">{{ city.visa?.type ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">📅</span> Duration
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Duration</span>
                        <span class="metric-text-val">{{ city.visa?.duration ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
                @if (anyVisaCost()) {
                  <tr>
                    <td class="label-col sticky-col row-label">
                      <span class="row-icon">💵</span> Visa Cost
                    </td>
                    @for (city of locations(); track city.id) {
                      <td class="city-col"
                        [class]="dyscalculia.numberSpacingClass()">
                        <div class="metric-cell">
                          <span class="metric-name">Visa Cost</span>
                          <span class="metric-text-val">{{ city.visa?.costUSD ? fmt(city.visa!.costUSD!) : '–' }}</span>
                        </div>
                      </td>
                    }
                  </tr>
                }
              }

              <!-- Section: Pros & Cons -->
              <tr class="section-header-row">
                <td [attr.colspan]="locations().length + 1" class="section-label">
                  Pros &amp; Cons
                </td>
              </tr>
              <tr>
                <td class="label-col sticky-col row-label">
                  <span class="row-icon">👍</span> Pros
                </td>
                @for (city of locations(); track city.id) {
                  <td class="city-col">
                    <div class="metric-cell">
                      <span class="metric-name">Pros</span>
                      <div class="tags-wrap">
                        @if (city.pros?.length) {
                          @for (p of (city.pros ?? []).slice(0, 4); track p) {
                            <span class="pro-tag">{{ p }}</span>
                          }
                        } @else {
                          <span class="metric-text-val">–</span>
                        }
                      </div>
                    </div>
                  </td>
                }
              </tr>
              <tr>
                <td class="label-col sticky-col row-label">
                  <span class="row-icon">👎</span> Cons
                </td>
                @for (city of locations(); track city.id) {
                  <td class="city-col">
                    <div class="metric-cell">
                      <span class="metric-name">Cons</span>
                      <div class="tags-wrap">
                        @if (city.cons?.length) {
                          @for (c of (city.cons ?? []).slice(0, 4); track c) {
                            <span class="con-tag">{{ c }}</span>
                          }
                        } @else {
                          <span class="metric-text-val">–</span>
                        }
                      </div>
                    </div>
                  </td>
                }
              </tr>

            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .compare-view {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* ─── Empty state ─────────────────────── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 60px 24px;
      color: var(--dark-text-muted);
    }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
    .empty-state h2 {
      font-size: 18px;
      font-weight: 700;
      color: var(--dark-text);
      margin: 0 0 8px;
    }
    .empty-state p {
      font-size: 13px;
      max-width: 360px;
      line-height: 1.5;
    }
    .link-btn {
      --mdc-text-button-label-text-color: var(--dark-amber);
      --mdc-text-button-label-text-size: 13px;
      padding: 0 4px;
      min-width: 0;
      vertical-align: baseline;
    }

    /* ─── Header ──────────────────────────── */
    .compare-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .compare-header h2 {
      font-size: 16px;
      font-weight: 700;
      color: var(--dark-text);
      margin: 0;
    }
    .clear-btn {
      --mdc-text-button-label-text-size: 11px;
      --mdc-text-button-label-text-color: var(--dark-blue);
    }

    /* ─── Table scroll wrapper ────────────── */
    .table-scroll {
      overflow-x: auto;
      border: 1px solid var(--dark-border);
      border-radius: 8px;
    }

    /* ─── Table ───────────────────────────── */
    .compare-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      min-width: 500px;
    }
    .compare-table th,
    .compare-table td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--dark-border);
      vertical-align: top;
    }
    .compare-table thead th {
      background: var(--dark-bg-secondary);
      position: sticky;
      top: 0;
      z-index: 2;
    }

    /* Sticky first column */
    .sticky-col {
      position: sticky;
      left: 0;
      z-index: 1;
      background: var(--dark-bg);
    }
    thead .sticky-col { z-index: 3; }

    .label-col {
      width: 160px;
      min-width: 160px;
      white-space: nowrap;
      font-size: 11px;
      color: var(--dark-text-sec);
    }
    .city-col {
      min-width: 150px;
      text-align: center;
      color: var(--dark-text);
    }

    /* ─── City header ─────────────────────── */
    .city-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .city-name {
      font-size: 13px;
      font-weight: 700;
      color: var(--dark-text);
    }
    .city-country {
      font-size: 10px;
      color: var(--dark-text-muted);
    }

    /* ─── Row styles ──────────────────────── */
    .row-label {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .row-icon { font-size: 13px; }

    .total-row td {
      font-weight: 700;
      font-size: 14px;
      border-bottom: 2px solid var(--dark-border);
    }
    .total-cell { color: var(--dark-amber); }
    .total-cell.cheapest { color: var(--dark-green); }
    .total-cell.priciest { color: var(--dark-red); }

    .section-header-row td {
      padding: 12px 12px 6px;
    }
    .section-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--dark-text-muted);
      border-bottom: none !important;
    }

    .best-in-row { color: var(--dark-green); font-weight: 600; }
    .worst-in-row { color: var(--dark-red); }

    /* ─── Metric cell (label + value in each column) ─── */
    .metric-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .metric-name {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--dark-text-muted);
    }
    .metric-text-val {
      font-size: 12px;
      color: var(--dark-text);
    }

    /* ─── Rating bar ──────────────────────── */
    .bar-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bar-track {
      width: 60px;
      height: 8px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .bar-fill {
      height: 100%;
      background: var(--dark-amber, #f59e0b);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .bar-fill--health {
      background: var(--dark-green, #4caf50);
    }
    .rating-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--dark-text-sec);
      min-width: 30px;
      text-align: left;
    }

    /* ─── Pros / Cons tags ────────────────── */
    .tags-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      justify-content: center;
    }
    .pro-tag, .con-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      white-space: nowrap;
    }
    .pro-tag {
      background: rgba(76, 175, 80, 0.12);
      color: var(--dark-green);
    }
    .con-tag {
      background: rgba(229, 115, 115, 0.12);
      color: var(--dark-red);
    }
  `],
})
export class LocationCompareComponent implements OnInit {
  readonly loc = inject(LocationService);
  private readonly nav = inject(NavigationService);
  readonly dyscalculia = inject(DyscalculiaService);

  /** Full data for each selected location, with computed total if missing */
  readonly locations = computed(() => {
    const ids = this.loc.selectedIds();
    const summaries = this.loc.locations();
    return this.loc.fullLocations()
      .filter(l => ids.has(l.id))
      .map(l => {
        if (l.monthlyCostTotal) return l;
        // monthlyCostTotal lives on the DB row, not inside locationData JSON.
        // Pull it from the summary list, or compute from monthlyCosts.
        const summary = summaries.find(s => s.id === l.id);
        const computed = summary?.monthlyCostTotal
          ?? Object.values(l.monthlyCosts)
              .reduce((sum, cr) => sum + ((cr as any)?.typical ?? 0), 0);
        return { ...l, monthlyCostTotal: computed };
      });
  });

  /** Cost rows that have data in at least one selected location */
  readonly costRows = computed(() => {
    const locs = this.locations();
    return COST_CATEGORIES.filter(cat =>
      locs.some(l => (l.monthlyCosts[cat.key]?.typical ?? 0) > 0)
    );
  });

  readonly hasLifestyle = computed(() =>
    this.locations().some(l => l.lifestyle)
  );
  readonly hasHealthcare = computed(() =>
    this.locations().some(l => l.healthcare)
  );
  readonly hasClimate = computed(() =>
    this.locations().some(l => l.climate)
  );
  readonly hasVisa = computed(() =>
    this.locations().some(l => l.visa)
  );
  readonly anyVisaCost = computed(() =>
    this.locations().some(l => l.visa?.costUSD)
  );

  ngOnInit(): void {
    // Ensure full location data is loaded for comparison
    this.loc.loadFull();
  }

  /* ─── Helpers ─────────────────────────────────── */

  fmt(val: number): string {
    if (this.dyscalculia.isEnabled()) {
      return this.dyscalculia.formatCurrency(val);
    }
    return '$' + val.toLocaleString();
  }

  fmtCost(city: LocationFull, key: string): string {
    const val = city.monthlyCosts[key]?.typical ?? 0;
    if (!val) return '–';
    return this.fmt(val);
  }

  isCheapest(city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const min = Math.min(...locs.map(l => l.monthlyCostTotal ?? Infinity));
    return (city.monthlyCostTotal ?? Infinity) === min;
  }

  isPriciest(city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const max = Math.max(...locs.map(l => l.monthlyCostTotal ?? 0));
    return (city.monthlyCostTotal ?? 0) === max;
  }

  isBestInRow(key: string, city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const val = city.monthlyCosts[key]?.typical ?? 0;
    if (!val) return false;
    const min = Math.min(...locs.map(l => l.monthlyCosts[key]?.typical ?? Infinity));
    return val === min && val !== Infinity;
  }

  isWorstInRow(key: string, city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const val = city.monthlyCosts[key]?.typical ?? 0;
    if (!val) return false;
    const max = Math.max(...locs.filter(l => (l.monthlyCosts[key]?.typical ?? 0) > 0)
      .map(l => l.monthlyCosts[key]?.typical ?? 0));
    return val === max;
  }

  /** Simple block bar for 0–10 ratings */
  ratingBar(val: number | undefined): string {
    if (val == null) return '';
    const filled = Math.round(val);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  goToOverview(): void {
    this.nav.selectScreen('overview');
  }
}
