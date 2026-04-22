import { Component, inject, computed, signal, effect, OnInit } from '@angular/core';
import { CostDetailComponent } from '../cost-detail/cost-detail.component';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { COMMON_US_MEDICATIONS } from '../../../lib/common-medications';

interface PricedMedication {
  generic: string;
  brand?: string;
  use: string;
  baseline: number;
  price: number;
  minPrice: number;
  maxPrice: number;
}

@Component({
  selector: 'app-medicine-screen',
  standalone: true,
  imports: [CostDetailComponent],
  template: `
    <app-cost-detail costKey="medicine" />

    <section class="meds-panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">Common Medications — estimated monthly cost</h3>
          <p class="panel-sub">
            52 most-prescribed US medicines, priced per location by scaling each
            baseline price by that location's medicine-cost ratio.
          </p>
        </div>
        <label class="loc-picker">
          <span>Location</span>
          <select [value]="selectedId()" (change)="onPick($event)">
            @for (l of locOptions(); track l.id) {
              <option [value]="l.id">{{ l.name }}</option>
            }
          </select>
        </label>
      </div>

      @if (!selected()) {
        <div class="status-msg">Loading location data…</div>
      } @else {
        <div class="summary-row">
          <div class="summary-card">
            <div class="summary-label">Full basket (52 meds)</div>
            <div class="summary-value" [class]="dys.numberSpacingClass()">
              {{ fmt(basketTotal()) }}<span class="per-mo">/mo</span>
            </div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Scale vs. avg location</div>
            <div class="summary-value">{{ (scale() * 100).toFixed(0) }}%</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Reported medicine budget</div>
            <div class="summary-value" [class]="dys.numberSpacingClass()">
              {{ fmt(reportedBudget()) }}<span class="per-mo">/mo</span>
            </div>
          </div>
        </div>

        <div class="table-wrap">
          <table class="med-table">
            <thead>
              <tr>
                <th class="col-med">Medication</th>
                <th class="col-use">Use</th>
                <th class="col-num">Baseline</th>
                <th class="col-num">At {{ selected()!.name }}</th>
                <th class="col-num">Range</th>
              </tr>
            </thead>
            <tbody>
              @for (m of priced(); track m.generic) {
                <tr>
                  <td class="col-med">
                    <div class="generic">{{ m.generic }}</div>
                    @if (m.brand) { <div class="brand">{{ m.brand }}</div> }
                  </td>
                  <td class="col-use">{{ m.use }}</td>
                  <td class="col-num base" [class]="dys.numberSpacingClass()">
                    {{ fmt(m.baseline) }}
                  </td>
                  <td class="col-num price" [class]="dys.numberSpacingClass()">
                    {{ fmt(m.price) }}
                  </td>
                  <td class="col-num range" [class]="dys.numberSpacingClass()">
                    {{ fmt(m.minPrice) }} – {{ fmt(m.maxPrice) }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <p class="disclaimer">
          Estimates only. Baseline values are approximate US cash-retail prices;
          per-location prices scale linearly by the location's overall medicine
          budget vs. the dataset average. Actual prices depend on insurance,
          pharmacy, generics availability, and local regulation.
        </p>
      }
    </section>
  `,
  styles: [`
    .meds-panel {
      margin-top: 20px;
      background: var(--dark-bg-card);
      border: 1px solid var(--dark-border);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .panel-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px; flex-wrap: wrap;
    }
    .panel-title { font-size: 15px; font-weight: 600; color: var(--dark-text); margin: 0; }
    .panel-sub { font-size: 12px; color: var(--dark-text-muted); margin: 4px 0 0; max-width: 560px; }

    .loc-picker { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--dark-text-muted); }
    .loc-picker select {
      background: var(--dark-bg-secondary);
      color: var(--dark-text);
      border: 1px solid var(--dark-border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 13px;
      min-width: 220px;
    }

    .summary-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .summary-card {
      flex: 1; min-width: 160px; padding: 12px 14px;
      background: var(--dark-bg-secondary);
      border: 1px solid var(--dark-border);
      border-radius: 8px;
    }
    .summary-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-value { font-size: 18px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; }
    .per-mo { font-size: 11px; color: var(--dark-text-muted); font-weight: 400; }

    .table-wrap { overflow-x: auto; border: 1px solid var(--dark-border); border-radius: 8px; }
    .med-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .med-table thead { background: var(--dark-bg-secondary); position: sticky; top: 0; }
    .med-table th {
      text-align: left; padding: 10px; font-size: 11px;
      color: var(--dark-text-muted); text-transform: uppercase; letter-spacing: 0.5px;
      border-bottom: 1px solid var(--dark-border);
    }
    .med-table td {
      padding: 10px; border-bottom: 1px solid var(--dark-border);
      color: var(--dark-text);
    }
    .med-table tbody tr:hover { background: var(--dark-bg-secondary); }
    .col-num { text-align: right; white-space: nowrap; }
    .generic { font-weight: 600; }
    .brand { font-size: 11px; color: var(--dark-text-muted); margin-top: 2px; }
    .col-use { color: var(--dark-text-sec); font-size: 11px; }
    .base { color: var(--dark-text-muted); }
    .price { color: var(--dark-amber); font-weight: 600; }
    .range { color: var(--dark-text-muted); font-size: 11px; }

    .disclaimer { font-size: 11px; color: var(--dark-text-muted); line-height: 1.5; margin: 0; }
    .status-msg { padding: 24px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class MedicineScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly dys = inject(DyscalculiaService);

  readonly selectedId = signal<string>('');

  readonly locOptions = computed(() =>
    this.loc.fullLocations()
      .filter(l => (l.monthlyCosts.medicine?.typical ?? 0) > 0)
      .map(l => ({ id: l.id, name: l.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly selected = computed(() =>
    this.loc.fullLocations().find(l => l.id === this.selectedId()) ?? null,
  );

  readonly avgMedicineCost = computed(() => {
    const vals = this.loc.fullLocations()
      .map(l => l.monthlyCosts.medicine?.typical ?? 0)
      .filter(v => v > 0);
    if (!vals.length) return 0;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  });

  readonly scale = computed(() => {
    const avg = this.avgMedicineCost();
    const sel = this.selected();
    if (!avg || !sel) return 1;
    return (sel.monthlyCosts.medicine?.typical ?? 0) / avg;
  });

  readonly reportedBudget = computed(() =>
    this.selected()?.monthlyCosts.medicine?.typical ?? 0,
  );

  readonly priced = computed<PricedMedication[]>(() => {
    const sel = this.selected();
    const avg = this.avgMedicineCost();
    if (!sel || !avg) return [];
    const med = sel.monthlyCosts.medicine;
    const s = (med?.typical ?? 0) / avg;
    const sMin = (med?.min ?? med?.typical ?? 0) / avg;
    const sMax = (med?.max ?? med?.typical ?? 0) / avg;
    return COMMON_US_MEDICATIONS.map(m => ({
      generic: m.generic,
      brand: m.brand,
      use: m.use,
      baseline: m.baselineMonthlyUSD,
      price: Math.max(1, Math.round(m.baselineMonthlyUSD * s)),
      minPrice: Math.max(1, Math.round(m.baselineMonthlyUSD * sMin)),
      maxPrice: Math.max(1, Math.round(m.baselineMonthlyUSD * sMax)),
    }));
  });

  readonly basketTotal = computed(() =>
    this.priced().reduce((sum, m) => sum + m.price, 0),
  );

  ngOnInit(): void {
    this.loc.loadFull();
  }

  onPick(ev: Event): void {
    const id = (ev.target as HTMLSelectElement).value;
    this.selectedId.set(id);
  }

  fmt(amount: number): string {
    return this.dys.isEnabled()
      ? this.dys.formatCurrency(amount)
      : '$' + Math.round(amount).toLocaleString();
  }

  constructor() {
    effect(() => {
      const opts = this.locOptions();
      if (!this.selectedId() && opts.length) {
        this.selectedId.set(opts[0].id);
      }
    });
  }
}
