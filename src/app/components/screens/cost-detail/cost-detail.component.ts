import { Component, inject, input, computed, OnInit } from '@angular/core';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { ItemsService } from '@services/items.service';
import { COST_CATEGORIES } from '@models/api.model';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';

@Component({
  selector: 'app-cost-detail',
  standalone: true,
  imports: [SourceTooltipComponent],
  template: `
    <div class="cost-screen">
      <div class="screen-header">
        <span class="header-icon">{{ meta().icon }}</span>
        <div>
          <h2 class="header-title">
            {{ meta().label }}
            <app-source-tooltip [sources]="categorySources()"
                                 [label]="meta().label + ' data sources'" />
          </h2>
          <p class="header-sub">
            Compare {{ meta().label.toLowerCase() }} costs across
            {{ ranked().length }} locations
          </p>
        </div>
      </div>

      @if (!loc.selectedIds().size) {
        <div class="filter-banner">
          Showing all locations — pick some on the <strong>Locations → Overview</strong> tab to narrow this view.
        </div>
      }

      @if (loc.loading()) {
        <div class="status-msg">Loading data…</div>
      } @else if (!ranked().length) {
        <div class="status-msg">No cost data available for this category.</div>
      } @else {

        <!-- Summary stats -->
        <div class="stats-row">
          <div class="stat-card cheapest">
            <div class="stat-label">Lowest</div>
            <div class="stat-value" [class]="dyscalculia.numberSpacingClass()">
              {{ fmt(ranked()[0].typical) }}<span class="per-mo">/mo</span>
            </div>
            <div class="stat-loc">{{ ranked()[0].name }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Average</div>
            <div class="stat-value" [class]="dyscalculia.numberSpacingClass()">
              {{ fmt(avgCost()) }}<span class="per-mo">/mo</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Highest</div>
            <div class="stat-value" [class]="dyscalculia.numberSpacingClass()">
              {{ fmt(ranked()[ranked().length - 1].typical) }}<span class="per-mo">/mo</span>
            </div>
            <div class="stat-loc">{{ ranked()[ranked().length - 1].name }}</div>
          </div>
        </div>

        <!-- Bar chart -->
        <div class="comparison-section">
          <h3 class="section-title">Cost by Location</h3>
          <div class="bars">
            @for (item of ranked(); track item.id) {
              <div class="bar-row" (click)="loc.selectLocation(item.id)" role="button" tabindex="0">
                <div class="bar-labels">
                  <span class="bar-name">{{ item.name }}</span>
                  <span class="bar-value" [class]="dyscalculia.numberSpacingClass()">
                    {{ fmt(item.typical) }}
                  </span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill"
                    [style.width.%]="(item.typical / barMax()) * 100"
                    [style.background]="meta().color">
                  </div>
                </div>
                @if (item.min > 0 && item.max > 0) {
                  <div class="range-line">
                    <span class="range-min">{{ fmt(item.min) }}</span>
                    <span class="range-sep">–</span>
                    <span class="range-max">{{ fmt(item.max) }}</span>
                  </div>
                }
                @if (item.areaAvg != null && item.areaName) {
                  <div class="area-line">
                    <span class="area-label">Avg in {{ item.areaName }}:</span>
                    <span class="area-value">{{ fmt(item.areaAvg) }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cost-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .stats-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .stat-card {
      flex: 1; min-width: 140px; padding: 14px;
      background: var(--dark-bg-card); border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .stat-card.cheapest { border-color: var(--dark-green); }
    .stat-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value { font-size: 22px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; }
    .per-mo { font-size: 12px; color: var(--dark-text-muted); font-weight: 400; }
    .stat-loc { font-size: 11px; color: var(--dark-text-sec); margin-top: 2px; }

    .comparison-section {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .section-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .bars { display: flex; flex-direction: column; gap: 10px; }
    .bar-row { cursor: pointer; padding: 4px 0; }
    .bar-row:hover .bar-name { color: var(--dark-blue); }
    .bar-labels { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
    .bar-name { font-size: 12px; color: var(--dark-text); transition: color 0.15s; }
    .bar-value { font-size: 12px; font-weight: 600; color: var(--dark-amber); }
    .bar-track { height: 16px; background: var(--dark-bg-secondary); border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
    .range-line { display: flex; gap: 4px; font-size: 10px; color: var(--dark-text-muted); margin-top: 2px; }
    .range-min { color: var(--dark-green); }
    .range-max { color: var(--dark-red); }
    .area-line { display: flex; gap: 6px; font-size: 10px; color: var(--dark-purple); margin-top: 2px; font-style: italic; }
    .area-value { font-weight: 600; }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
    .filter-banner {
      padding: 10px 14px; background: var(--dark-bg-secondary); border: 1px solid var(--dark-border);
      border-left: 3px solid var(--dark-amber); border-radius: 6px;
      font-size: 12px; color: var(--dark-text-sec);
    }
    .filter-banner strong { color: var(--dark-text); }
  `],
})
export class CostDetailComponent implements OnInit {
  readonly costKey = input.required<string>();
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly items = inject(ItemsService);

  readonly meta = computed(() => {
    const cat = COST_CATEGORIES.find(c => c.key === this.costKey());
    return cat ?? { key: this.costKey(), label: this.costKey(), icon: '💰', color: '#D4943A' };
  });

  readonly ranked = computed(() => {
    const key = this.costKey();
    const scale = this.items.scaleByCostKey()[key] ?? 1;
    const isRent = key === 'rent';
    return this.loc.selectedFullLocations()
      .map(l => {
        const hood = isRent ? this.loc.recommendedNeighborhood(l.id) : null;
        const areaRent = hood?.housing?.avgRentOneBedroomEUR ?? null;
        return {
          id: l.id,
          name: l.name,
          typical: (l.monthlyCosts[key]?.typical ?? 0) * scale,
          min: (l.monthlyCosts[key]?.min ?? 0) * scale,
          max: (l.monthlyCosts[key]?.max ?? 0) * scale,
          areaName: hood?.name ?? null,
          areaAvg: areaRent,
        };
      })
      .filter(l => l.typical > 0)
      .sort((a, b) => a.typical - b.typical);
  });

  readonly avgCost = computed(() => {
    const items = this.ranked();
    if (!items.length) return 0;
    return Math.round(items.reduce((s, i) => s + i.typical, 0) / items.length);
  });

  readonly barMax = computed(() => {
    const items = this.ranked();
    return items.length ? items[items.length - 1].typical : 1;
  });

  /** Category-level sources — same across locations since they come from
   *  the shared backend map. Pick from the first location that has them. */
  readonly categorySources = computed(() => {
    const key = this.costKey();
    for (const l of this.loc.selectedFullLocations()) {
      const s = l.monthlyCosts?.[key]?.sources;
      if (s?.length) return s;
    }
    return undefined;
  });

  ngOnInit(): void {
    this.loc.loadFull();
    this.items.load();
    if (this.costKey() === 'rent') {
      queueMicrotask(() => this.loc.preloadNeighborhoodsForSelected());
    }
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
