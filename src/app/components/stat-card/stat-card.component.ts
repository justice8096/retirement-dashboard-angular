import { Component, inject, input, computed } from '@angular/core';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { StatUnit } from '@models/stat.model';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  template: `
    <div class="card">
      <div class="value"
        [class]="dyscalculia.numberSpacingClass()">
        {{ displayValue() }}
      </div>
      <div class="label">{{ label() }}</div>

      @if (unit() !== 'count') {
        <div class="sub">{{ sub() }}</div>
      }

      @if (dyscalculia.isEnabled() && dyscalculia.settings().showTextSummaries && unit() === 'currency') {
        <div class="text-summary">{{ textSummary() }}</div>
      }

      @if (dyscalculia.isEnabled() && dyscalculia.settings().magnitudeAnchors && unit() === 'currency') {
        <div class="anchor">{{ dyscalculia.getMagnitudeAnchor(rawNumber()) }}</div>
      }
    </div>
  `,
  styles: [`
    .card {
      background: var(--dark-bg-card);
      border-radius: 12px;
      padding: 16px;
      border: 1px solid var(--dark-border);
      text-align: center;
    }
    .value {
      font-size: 24px;
      font-weight: 700;
      color: var(--dark-amber);
      font-variant-numeric: tabular-nums;
      word-break: break-word;
    }
    .label {
      font-size: 12px;
      color: var(--dark-text-sec);
      margin-top: 4px;
    }
    .sub {
      font-size: 10px;
      color: var(--dark-text-muted);
      margin-top: 2px;
    }
    .text-summary {
      font-size: 10px;
      color: var(--dark-teal);
      margin-top: 6px;
      padding: 4px 8px;
      background: rgba(42, 123, 123, 0.1);
      border-radius: 4px;
      line-height: 1.4;
    }
    .anchor {
      font-size: 9px;
      color: var(--dark-purple);
      margin-top: 4px;
      font-style: italic;
    }
  `],
})
export class StatCardComponent {
  readonly dyscalculia = inject(DyscalculiaService);

  readonly label = input.required<string>();
  readonly rawValue = input.required<string>();
  readonly rawNumber = input.required<number>();
  readonly sub = input.required<string>();
  readonly unit = input.required<StatUnit>();

  readonly displayValue = computed(() => {
    if (!this.dyscalculia.isEnabled()) return this.rawValue();

    if (this.unit() === 'currency') {
      return this.dyscalculia.formatCurrency(this.rawNumber());
    }
    if (this.unit() === 'count') {
      return this.dyscalculia.formatCount(this.rawNumber(), this.sub());
    }
    return this.rawValue();
  });

  readonly textSummary = computed(() => {
    const lbl = this.label();
    if (lbl === 'Lowest Cost') return 'This is the cheapest monthly cost across all locations';
    if (lbl === 'Highest Cost') return 'This is the most expensive monthly cost found';
    if (lbl === 'Average Cost') return 'This is the typical cost across all locations';
    return 'Summary not available';
  });
}
