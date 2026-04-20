import { Component, inject, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';

@Component({
  selector: 'app-location-detail',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    @if (loc.selectedLocation(); as location) {
      <div class="detail">
        <!-- Back button -->
        <button mat-button (click)="loc.clearSelection()" class="back-btn">
          ← Back to all locations
        </button>

        <!-- Header -->
        <div class="detail-header">
          <div>
            <h2 class="loc-name">{{ location.name }}</h2>
            <div class="loc-meta">{{ location.country }} · {{ location.region }}@if (location.subregion) { · {{ location.subregion }} }</div>
          </div>
          <div class="loc-total"
            [class]="dyscalculia.numberSpacingClass()">
            {{ dyscalculia.isEnabled()
              ? dyscalculia.formatCurrency(location.monthlyCostTotal ?? 0)
              : '$' + (location.monthlyCostTotal ?? 0).toLocaleString() }}<span class="per-mo">/mo</span>
          </div>
        </div>

        @if (dyscalculia.isEnabled() && dyscalculia.settings().showTextSummaries) {
          <div class="text-summary">
            Total estimated monthly cost of living in {{ location.name }},
            covering housing, food, healthcare, transportation, entertainment, utilities, and other expenses.
          </div>
        }

        <!-- Cost breakdown chart -->
        <div class="breakdown-section">
          <h3 class="section-title">Monthly Cost Breakdown</h3>
          <div class="bars">
            @for (item of breakdown(); track item.label) {
              <div class="bar-row">
                <div class="bar-labels">
                  <span class="bar-name">{{ item.label }}</span>
                  <span class="bar-value"
                    [style.color]="item.color"
                    [class]="dyscalculia.numberSpacingClass()">
                    {{ dyscalculia.isEnabled()
                      ? dyscalculia.formatCurrency(item.value)
                      : '$' + item.value.toLocaleString() }}
                  </span>
                </div>
                <div class="bar-track">
                  <div class="bar-fill"
                    [style.width.%]="(item.value / maxCost()) * 100"
                    [style.background]="item.color">
                  </div>
                </div>
                @if (dyscalculia.isEnabled() && dyscalculia.settings().magnitudeAnchors) {
                  <div class="bar-anchor">{{ dyscalculia.getMagnitudeAnchor(item.value) }}</div>
                }
              </div>
            }
          </div>
        </div>

        <!-- Cost ranges -->
        <div class="ranges-section">
          <h3 class="section-title">Cost Ranges (Min – Typical – Max)</h3>
          <div class="range-grid">
            @for (item of rangeData(); track item.label) {
              <div class="range-card">
                <div class="range-label">{{ item.label }}</div>
                <div class="range-values">
                  <span class="range-min">{{ formatCost(item.min) }}</span>
                  <span class="range-arrow">→</span>
                  <span class="range-typical">{{ formatCost(item.typical) }}</span>
                  <span class="range-arrow">→</span>
                  <span class="range-max">{{ formatCost(item.max) }}</span>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .detail { display: flex; flex-direction: column; gap: 16px; }

    .back-btn {
      --mat-button-text-label-text-size: 12px;
      --mat-button-text-label-text-color: var(--dark-blue);
      align-self: flex-start;
    }

    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .loc-name {
      font-size: 22px;
      font-weight: 700;
      color: var(--dark-text);
      margin: 0;
    }
    .loc-meta {
      font-size: 12px;
      color: var(--dark-text-sec);
      margin-top: 4px;
    }
    .loc-total {
      font-size: 28px;
      font-weight: 700;
      color: var(--dark-amber);
      white-space: nowrap;
    }
    .per-mo {
      font-size: 14px;
      color: var(--dark-text-muted);
      font-weight: 400;
    }

    .text-summary {
      padding: 10px 14px;
      background: rgba(42, 123, 123, 0.08);
      border-radius: 8px;
      border: 1px solid rgba(42, 123, 123, 0.15);
      font-size: 12px;
      color: var(--dark-teal);
      line-height: 1.5;
    }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--dark-text-sec);
      margin: 0 0 12px;
    }

    .breakdown-section, .ranges-section {
      background: var(--dark-bg-card);
      border: 1px solid var(--dark-border);
      border-radius: 12px;
      padding: 20px;
    }

    .bars { display: flex; flex-direction: column; gap: 10px; }
    .bar-labels {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }
    .bar-name { font-size: 12px; color: var(--dark-text); }
    .bar-value { font-size: 12px; font-weight: 600; }
    .bar-track {
      height: 20px;
      background: var(--dark-bg-secondary);
      border-radius: 4px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .bar-anchor {
      font-size: 9px;
      color: var(--dark-text-muted);
      margin-top: 2px;
      font-style: italic;
    }

    .range-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
    }
    .range-card {
      padding: 10px;
      background: var(--dark-bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--dark-border);
    }
    .range-label {
      font-size: 11px;
      color: var(--dark-text-sec);
      font-weight: 600;
      margin-bottom: 6px;
    }
    .range-values {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }
    .range-min { color: var(--dark-green); }
    .range-typical { color: var(--dark-amber); font-weight: 700; }
    .range-max { color: var(--dark-red); }
    .range-arrow { color: var(--dark-text-muted); font-size: 10px; }
  `],
})
export class LocationDetailComponent {
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly breakdown = computed(() => {
    const location = this.loc.selectedLocation();
    return location ? this.loc.getCostBreakdown(location) : [];
  });

  readonly maxCost = computed(() => {
    const items = this.breakdown();
    return items.length ? Math.max(...items.map(i => i.value)) : 1;
  });

  readonly rangeData = computed(() => {
    const location = this.loc.selectedLocation();
    if (!location) return [];
    return this.loc.costCategories().map(cat => {
      const range = location.monthlyCosts[cat.key];
      return {
        label: cat.label,
        min: range?.min ?? 0,
        typical: range?.typical ?? 0,
        max: range?.max ?? 0,
      };
    });
  });

  formatCost(amount: number): string {
    if (this.dyscalculia.isEnabled()) {
      return this.dyscalculia.formatCurrency(amount);
    }
    return '$' + amount.toLocaleString();
  }
}
