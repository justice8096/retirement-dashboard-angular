import { Component, inject, computed, signal } from '@angular/core';
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

        <!-- FX stress widget (#26) — only for foreign-currency locations.
             USD-denominated locations have no per-trial FX risk against the
             user's portfolio (also USD), so showing the slider there would
             be misleading. -->
        @if (isForeign()) {
          <div class="fx-stress-section">
            <h3 class="section-title">FX Stress Test</h3>
            <p class="fx-stress-blurb">
              Your portfolio is in USD; cost-of-living here is in {{ location.currency }}.
              How would your monthly cost shift if USD weakens or strengthens against
              {{ location.currency }}? This is a one-time price-level shock — for
              ongoing per-year FX volatility, see the Monte Carlo screen.
            </p>
            <div class="fx-stress-controls">
              @for (preset of fxPresets; track preset.value) {
                <button
                  type="button"
                  class="fx-preset"
                  [class.active]="fxShockPct() === preset.value"
                  (click)="fxShockPct.set(preset.value)">
                  {{ preset.label }}
                </button>
              }
            </div>
            <div class="fx-stress-result" [class]="dyscalculia.numberSpacingClass()">
              <div class="fx-result-row">
                <span class="fx-result-label">At {{ fxShockPct() > 0 ? '+' : '' }}{{ fxShockPct() }}% USD shift:</span>
                <span class="fx-result-value">
                  {{ formatCost(stressedMonthlyTotal()) }}<span class="per-mo">/mo</span>
                </span>
              </div>
              @if (fxShockPct() !== 0) {
                <div class="fx-result-delta">
                  {{ fxShockPct() > 0 ? '↑' : '↓' }}
                  {{ formatCost(Math.abs(stressedMonthlyTotal() - (location.monthlyCostTotal ?? 0))) }}
                  vs baseline · annualized:
                  {{ formatCost(Math.abs((stressedMonthlyTotal() - (location.monthlyCostTotal ?? 0)) * 12)) }}/yr
                </div>
              }
            </div>
            <p class="fx-stress-note">
              Convention: positive = USD weakens (your dollar buys less local currency,
              so cost in USD rises). Negative = USD strengthens.
            </p>
          </div>
        }

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
    .range-max { color: var(--dark-neutral); }
    .range-arrow { color: var(--dark-text-muted); font-size: 10px; }

    /* #26 — FX stress widget. Same card visual idiom as the breakdown
     * and ranges sections. Hidden entirely for USD locations (template
     * gates on isForeign()). */
    .fx-stress-section {
      background: var(--dark-bg-card);
      border: 1px solid var(--dark-border);
      border-radius: 12px;
      padding: 20px;
    }
    .fx-stress-blurb {
      font-size: 12px;
      color: var(--dark-text-muted);
      line-height: 1.5;
      margin: 0 0 14px;
    }
    .fx-stress-controls {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .fx-preset {
      padding: 6px 12px;
      background: var(--dark-bg-secondary);
      border: 1px solid var(--dark-border);
      border-radius: 6px;
      color: var(--dark-text);
      font-size: 12px;
      font-family: var(--font-sans);
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .fx-preset:hover {
      border-color: var(--dark-blue);
    }
    .fx-preset.active {
      background: var(--dark-blue);
      border-color: var(--dark-blue);
      color: var(--dark-bg);
      font-weight: 600;
    }
    .fx-stress-result {
      padding: 12px 14px;
      background: var(--dark-bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--dark-border);
      margin-bottom: 10px;
    }
    .fx-result-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }
    .fx-result-label {
      font-size: 12px;
      color: var(--dark-text-sec);
    }
    .fx-result-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--dark-amber);
      font-variant-numeric: tabular-nums;
    }
    .fx-result-delta {
      margin-top: 4px;
      font-size: 11px;
      color: var(--dark-text-muted);
      font-variant-numeric: tabular-nums;
    }
    .fx-stress-note {
      font-size: 10px;
      color: var(--dark-text-muted);
      line-height: 1.4;
      margin: 0;
      font-style: italic;
    }
  `],
})
export class LocationDetailComponent {
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  /** Math is a class field rather than a service since the template
   *  references Math.abs in the FX stress delta. Angular templates can't
   *  call through to globals without a class binding. */
  protected readonly Math = Math;

  /** FX stress preset buttons (#26). Convention: positive = USD weakens
   *  (cost in USD rises), matching the kernel's `fxShockPct` semantics. */
  protected readonly fxPresets: ReadonlyArray<{ value: number; label: string }> = [
    { value: -20, label: '−20%' },
    { value: -10, label: '−10%' },
    { value: 0, label: 'Baseline' },
    { value: +10, label: '+10%' },
    { value: +20, label: '+20%' },
  ];

  /** Currently-selected FX shock magnitude in percent (signed). Defaults
   *  to 0 (no shock = baseline cost). Component-local state — does not
   *  persist across screen changes, doesn't feed the MC sim. The MC has
   *  its own FX-shock controls under "Stress Tests" in the MC screen. */
  protected readonly fxShockPct = signal(0);

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

  /** True when the selected location's currency is non-USD. Drives the
   *  FX stress widget visibility — USD locations have no per-trial FX
   *  risk against a USD portfolio. */
  readonly isForeign = computed(() => {
    const l = this.loc.selectedLocation();
    return !!l && l.currency !== 'USD';
  });

  /** Monthly cost in USD after applying the current FX shock. Linear
   *  scale: shock × current total. Falls back to baseline when no
   *  location is selected. */
  readonly stressedMonthlyTotal = computed(() => {
    const baseline = this.loc.selectedLocation()?.monthlyCostTotal ?? 0;
    const shockMult = 1 + this.fxShockPct() / 100;
    return baseline * shockMult;
  });

  formatCost(amount: number): string {
    if (this.dyscalculia.isEnabled()) {
      return this.dyscalculia.formatCurrency(amount);
    }
    return '$' + Math.round(amount).toLocaleString();
  }
}
