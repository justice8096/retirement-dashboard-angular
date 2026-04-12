import { Component, inject, computed, OnInit } from '@angular/core';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';

@Component({
  selector: 'app-taxes-screen',
  standalone: true,
  template: `
    <div class="taxes-screen">
      <div class="screen-header">
        <span class="header-icon">🏛️</span>
        <div>
          <h2 class="header-title">Taxes by Location</h2>
          <p class="header-sub">Compare tax burden across retirement destinations</p>
        </div>
      </div>

      @if (loc.loading()) {
        <div class="status-msg">Loading location data…</div>
      } @else if (!taxData().length) {
        <div class="status-msg">No tax data available. Load locations first.</div>
      } @else {
        <div class="tax-grid">
          @for (item of taxData(); track item.name) {
            <div class="tax-card" (click)="loc.selectLocation(item.id)">
              <div class="tax-header">
                <span class="tax-name">{{ item.name }}</span>
                <span class="tax-country">{{ item.country }}</span>
              </div>
              <div class="tax-body">
                <div class="tax-row">
                  <span class="tax-label">Monthly Tax Estimate</span>
                  <span class="tax-value" [class]="dyscalculia.numberSpacingClass()">
                    {{ fmt(item.monthlyTax) }}
                  </span>
                </div>
                @if (item.vatRate !== null) {
                  <div class="tax-row">
                    <span class="tax-label">VAT / Sales Tax</span>
                    <span class="tax-value">{{ item.vatRate }}%</span>
                  </div>
                }
                @if (item.socialRate !== null) {
                  <div class="tax-row">
                    <span class="tax-label">Social Charges</span>
                    <span class="tax-value">{{ item.socialRate }}%</span>
                  </div>
                }
                @if (item.notes) {
                  <div class="tax-notes">{{ item.notes }}</div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .taxes-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .tax-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .tax-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 10px; cursor: pointer; transition: border-color 0.15s;
    }
    .tax-card:hover { border-color: var(--dark-blue); }
    .tax-header {
      display: flex; justify-content: space-between; align-items: baseline;
      padding: 14px 16px 0;
    }
    .tax-name { font-size: 14px; font-weight: 700; color: var(--dark-text); }
    .tax-country { font-size: 11px; color: var(--dark-text-muted); }
    .tax-body { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
    .tax-row { display: flex; justify-content: space-between; align-items: baseline; }
    .tax-label { font-size: 11px; color: var(--dark-text-sec); }
    .tax-value { font-size: 13px; font-weight: 600; color: var(--dark-amber); }
    .tax-notes { font-size: 10px; color: var(--dark-text-muted); line-height: 1.4; padding-top: 4px; border-top: 1px solid var(--dark-bg-secondary); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class TaxesScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly taxData = computed(() =>
    this.loc.fullLocations()
      .map(l => ({
        id: l.id,
        name: l.name,
        country: l.country,
        monthlyTax: l.monthlyCosts['taxes']?.typical ?? 0,
        vatRate: l.taxes?.vatRate ?? null,
        socialRate: l.taxes?.socialChargesRate ?? null,
        notes: l.taxes?.notes ?? '',
      }))
      .filter(t => t.monthlyTax > 0)
      .sort((a, b) => a.monthlyTax - b.monthlyTax)
  );

  ngOnInit(): void {
    this.loc.loadFull();
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
