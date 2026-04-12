import { Component, inject, computed, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';

@Component({
  selector: 'app-brochure-screen',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="brochure-screen">
      <div class="screen-header">
        <span class="header-icon">📄</span>
        <div>
          <h2 class="header-title">Brochures</h2>
          <p class="header-sub">Generate printable location summaries</p>
        </div>
      </div>

      @if (loc.loading()) {
        <div class="status-msg">Loading locations…</div>
      } @else if (!loc.fullLocations().length) {
        <div class="status-msg">Load locations first to generate brochures.</div>
      } @else {
        <div class="brochure-grid">
          @for (item of brochureData(); track item.id) {
            <div class="brochure-card">
              <div class="b-header">
                <h3 class="b-name">{{ item.name }}</h3>
                <span class="b-country">{{ item.country }} · {{ item.region }}</span>
              </div>
              <div class="b-cost">
                <span class="b-cost-label">Monthly Cost</span>
                <span class="b-cost-value" [class]="dyscalculia.numberSpacingClass()">
                  {{ fmt(item.total) }}
                </span>
              </div>
              <div class="b-highlights">
                @if (item.climate) {
                  <span class="b-tag">{{ item.climate }}</span>
                }
                @if (item.visa) {
                  <span class="b-tag">{{ item.visa }}</span>
                }
                <span class="b-tag">{{ item.currency }}</span>
              </div>
              @if (item.pros.length) {
                <div class="b-pros">
                  @for (p of item.pros.slice(0, 3); track p) {
                    <span class="b-pro">✓ {{ p }}</span>
                  }
                </div>
              }
              <button mat-stroked-button class="b-print-btn" (click)="printBrochure(item.id)">
                🖨️ Print
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .brochure-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .brochure-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .brochure-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px;
    }
    .b-header {}
    .b-name { font-size: 16px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .b-country { font-size: 11px; color: var(--dark-text-muted); }
    .b-cost { display: flex; justify-content: space-between; align-items: baseline; }
    .b-cost-label { font-size: 11px; color: var(--dark-text-sec); }
    .b-cost-value { font-size: 18px; font-weight: 700; color: var(--dark-amber); }
    .b-highlights { display: flex; flex-wrap: wrap; gap: 6px; }
    .b-tag {
      font-size: 10px; padding: 3px 8px; border-radius: 4px;
      background: var(--dark-bg-secondary); color: var(--dark-text-sec);
    }
    .b-pros { display: flex; flex-direction: column; gap: 3px; }
    .b-pro { font-size: 11px; color: var(--dark-green); }
    .b-print-btn {
      align-self: flex-start; margin-top: auto;
      --mdc-outlined-button-container-height: 32px;
      --mdc-outlined-button-label-text-size: 11px;
      --mdc-outlined-button-outline-color: var(--dark-border);
    }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class BrochureScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly brochureData = computed(() =>
    this.loc.fullLocations().map(l => ({
      id: l.id,
      name: l.name,
      country: l.country,
      region: l.region,
      currency: l.currency,
      total: l.monthlyCostTotal ?? 0,
      climate: l.climate?.type ?? null,
      visa: l.visa?.type ?? null,
      pros: l.pros ?? [],
    }))
  );

  ngOnInit(): void {
    this.loc.loadFull();
  }

  printBrochure(id: string): void {
    // TODO: Generate printable PDF brochure
    window.print();
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
