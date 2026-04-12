import { Component, inject, input, computed } from '@angular/core';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { Category, Screen } from '@models/navigation.model';
import { ChartDataPoint } from '@models/stat.model';

@Component({
  selector: 'app-chart-placeholder',
  standalone: true,
  template: `
    @if (!dyscalculia.isEnabled()) {
      <div class="placeholder">
        <div class="placeholder-icon">{{ cat()?.icon }}</div>
        <div class="placeholder-title">{{ screen()?.label || 'Select a screen' }}</div>
        <div class="placeholder-hint">Chart / data content fills this area</div>
      </div>
    } @else {
      <div class="chart-area">
        <!-- Header -->
        <div class="chart-header">
          <div>
            <div class="chart-title">
              {{ screen()?.label || 'Select a screen' }} — Monthly Breakdown
            </div>
            <div class="chart-subtitle">{{ cat()?.icon }} {{ cat()?.label }}</div>
          </div>
          @if (dyscalculia.settings().chartStyle === 'bar-labeled') {
            <div class="chart-badge">Values shown on bars</div>
          }
        </div>

        <!-- Horizontal bar chart -->
        <div class="bars">
          @for (d of sampleData; track d.label) {
            <div class="bar-row">
              <div class="bar-labels">
                <span class="bar-name">{{ d.label }}</span>
                @if (showLabeled()) {
                  <span class="bar-value"
                    [class]="dyscalculia.numberSpacingClass()"
                    [style.color]="d.color">
                    {{ dyscalculia.formatCurrency(d.value) }}
                  </span>
                }
              </div>
              <div class="bar-track">
                <div class="bar-fill"
                  [style.width.%]="(d.value / maxVal) * 100"
                  [style.background]="d.color"
                  [class.no-transition]="dyscalculia.settings().reduceAnimations">
                  @if (!showLabeled()) {
                    <span class="bar-inline-value">
                      {{ '$' + d.value.toLocaleString() }}
                    </span>
                  }
                </div>
              </div>
              @if (dyscalculia.settings().magnitudeAnchors && d.anchor) {
                <div class="bar-anchor">{{ d.anchor }}</div>
              }
            </div>
          }
        </div>

        <!-- Text summary -->
        @if (dyscalculia.settings().showTextSummaries) {
          <div class="text-summary">
            <div class="summary-title">What this chart shows</div>
            <p class="summary-text">
              Housing is the biggest expense, making up roughly half the total.
              Food is the second largest cost. Medical and transportation together
              are about as much as food alone. The total across these four categories
              is {{ dyscalculia.formatCurrency(totalValue) }}.
            </p>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    /* Placeholder */
    .placeholder {
      text-align: center;
      color: var(--dark-text-muted);
    }
    .placeholder-icon { font-size: 40px; margin-bottom: 8px; }
    .placeholder-title {
      font-size: 16px;
      color: var(--dark-text);
      font-weight: 600;
    }
    .placeholder-hint { font-size: 12px; margin-top: 4px; }

    /* Chart */
    .chart-area { width: 100%; }
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 16px;
    }
    .chart-title {
      font-size: 14px;
      color: var(--dark-text);
      font-weight: 600;
    }
    .chart-subtitle {
      font-size: 11px;
      color: var(--dark-text-sec);
      margin-top: 2px;
    }
    .chart-badge {
      font-size: 9px;
      color: var(--dark-teal);
      padding: 2px 8px;
      background: rgba(42, 123, 123, 0.1);
      border-radius: 4px;
    }

    /* Bars */
    .bars {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .bar-labels {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      align-items: baseline;
    }
    .bar-name { font-size: 12px; color: var(--dark-text); }
    .bar-value { font-size: 12px; font-weight: 600; }
    .bar-track {
      height: 24px;
      background: var(--dark-bg-secondary);
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }
    .bar-fill {
      height: 100%;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 8px;
      transition: all 0.5s;
      &.no-transition { transition: none; }
    }
    .bar-inline-value {
      font-size: 10px;
      color: #fff;
      font-weight: 600;
    }
    .bar-anchor {
      font-size: 9px;
      color: var(--dark-text-muted);
      margin-top: 2px;
      font-style: italic;
    }

    /* Text summary */
    .text-summary {
      margin-top: 16px;
      padding: 12px;
      background: rgba(42, 123, 123, 0.08);
      border-radius: 8px;
      border: 1px solid rgba(42, 123, 123, 0.15);
    }
    .summary-title {
      font-size: 11px;
      color: var(--dark-teal);
      font-weight: 600;
      margin-bottom: 4px;
    }
    .summary-text {
      font-size: 11px;
      color: var(--dark-text-sec);
      line-height: 1.5;
    }
  `],
})
export class ChartPlaceholderComponent {
  readonly dyscalculia = inject(DyscalculiaService);

  readonly cat = input<Category | null>(null);
  readonly screen = input<Screen | undefined>(undefined);

  readonly sampleData: ChartDataPoint[] = [
    { label: 'Housing', value: 1200, color: '#D4943A', anchor: 'About the cost of a modest apartment' },
    { label: 'Food', value: 650, color: '#5C9CE6', anchor: 'Roughly two weeks of groceries' },
    { label: 'Medical', value: 400, color: '#4CAF50', anchor: 'About one specialist visit with meds' },
    { label: 'Transport', value: 300, color: '#9C6FDE', anchor: 'A few tanks of gas plus insurance' },
  ];

  readonly maxVal = Math.max(...this.sampleData.map(d => d.value));
  readonly totalValue = this.sampleData.reduce((s, d) => s + d.value, 0);

  readonly showLabeled = computed(() =>
    this.dyscalculia.settings().chartStyle === 'bar-labeled'
  );
}
