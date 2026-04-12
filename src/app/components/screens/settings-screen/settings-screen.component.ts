import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { FinancialSettings } from '@models/api.model';

@Component({
  selector: 'app-settings-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatSlideToggleModule],
  template: `
    <div class="settings-screen">
      <div class="screen-header">
        <span class="header-icon">⚙️</span>
        <div>
          <h2 class="header-title">Financial Settings</h2>
          <p class="header-sub">Portfolio allocation, return assumptions, and risk parameters</p>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading settings…</div>
      } @else if (!fin()) {
        <div class="status-msg">No financial settings found.</div>
      } @else {

        <!-- Portfolio -->
        <div class="card">
          <h3 class="card-title">Portfolio</h3>
          <div class="field-grid">
            <div class="field">
              <span class="field-label">Total Balance</span>
              <div class="field-value lg" [class]="dyscalculia.numberSpacingClass()">{{ fmt(fin()!.portfolioBalance) }}</div>
            </div>
            <div class="field">
              <span class="field-label">Retirement Path</span>
              <div class="field-value cap">{{ fin()!.retirementPath }}</div>
            </div>
          </div>
        </div>

        <!-- Allocation -->
        <div class="card">
          <h3 class="card-title">Asset Allocation</h3>
          <div class="alloc-bars">
            <div class="alloc-segment" [style.flex]="fin()!.equityPct">
              <div class="alloc-fill equity"></div>
              <span class="alloc-label">Equity {{ fin()!.equityPct }}%</span>
            </div>
            <div class="alloc-segment" [style.flex]="fin()!.bondPct">
              <div class="alloc-fill bond"></div>
              <span class="alloc-label">Bond {{ fin()!.bondPct }}%</span>
            </div>
            <div class="alloc-segment" [style.flex]="fin()!.cashPct">
              <div class="alloc-fill cash"></div>
              <span class="alloc-label">Cash {{ fin()!.cashPct }}%</span>
            </div>
            @if (fin()!.intlPct) {
              <div class="alloc-segment" [style.flex]="fin()!.intlPct">
                <div class="alloc-fill intl"></div>
                <span class="alloc-label">Int'l {{ fin()!.intlPct }}%</span>
              </div>
            }
          </div>
        </div>

        <!-- Assumptions -->
        <div class="card">
          <h3 class="card-title">Return & Inflation</h3>
          <div class="field-grid">
            <div class="field">
              <span class="field-label">Expected Return</span>
              <div class="field-value">{{ fin()!.expectedReturn }}%</div>
            </div>
            <div class="field">
              <span class="field-label">Expected Inflation</span>
              <div class="field-value">{{ fin()!.expectedInflation }}%</div>
            </div>
            <div class="field">
              <span class="field-label">SS COLA</span>
              <div class="field-value">{{ fin()!.ssCola }}%</div>
            </div>
          </div>
        </div>

        <!-- Toggles -->
        <div class="card">
          <h3 class="card-title">Risk Adjustments</h3>
          <div class="toggle-grid">
            <div class="toggle-row">
              <mat-slide-toggle [checked]="fin()!.fxDriftEnabled" disabled>
                FX Drift ({{ fin()!.fxDriftAnnualRate }}%/yr)
              </mat-slide-toggle>
            </div>
            <div class="toggle-row">
              <mat-slide-toggle [checked]="fin()!.ssCutEnabled" disabled>
                SS Cut in {{ fin()!.ssCutYear }}
              </mat-slide-toggle>
            </div>
          </div>
        </div>

        <!-- Account balances -->
        <div class="card">
          <h3 class="card-title">Account Balances</h3>
          <div class="field-grid">
            <div class="field">
              <span class="field-label">Traditional</span>
              <div class="field-value" [class]="dyscalculia.numberSpacingClass()">{{ fmt(fin()!.traditionalBalance ?? 0) }}</div>
            </div>
            <div class="field">
              <span class="field-label">Roth</span>
              <div class="field-value" [class]="dyscalculia.numberSpacingClass()">{{ fmt(fin()!.rothBalance ?? 0) }}</div>
            </div>
            <div class="field">
              <span class="field-label">Taxable</span>
              <div class="field-value" [class]="dyscalculia.numberSpacingClass()">{{ fmt(fin()!.taxableBalance ?? 0) }}</div>
            </div>
            <div class="field">
              <span class="field-label">HSA</span>
              <div class="field-value" [class]="dyscalculia.numberSpacingClass()">{{ fmt(fin()!.hsaBalance ?? 0) }}</div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .settings-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .field-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field-label { font-size: 11px; color: var(--dark-text-muted); }
    .field-value { font-size: 15px; font-weight: 600; color: var(--dark-text); }
    .field-value.lg { font-size: 22px; color: var(--dark-amber); }
    .field-value.cap { text-transform: capitalize; }

    .alloc-bars { display: flex; gap: 4px; height: 40px; border-radius: 8px; overflow: hidden; }
    .alloc-segment { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 40px; }
    .alloc-fill { width: 100%; flex: 1; }
    .alloc-fill.equity { background: var(--dark-blue); }
    .alloc-fill.bond { background: var(--dark-green); }
    .alloc-fill.cash { background: var(--dark-amber); }
    .alloc-fill.intl { background: var(--dark-purple); }
    .alloc-label { font-size: 10px; color: var(--dark-text-muted); margin-top: 6px; }

    .toggle-grid { display: flex; flex-direction: column; gap: 12px; }
    .toggle-row { font-size: 13px; color: var(--dark-text); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class SettingsScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loading = signal(false);
  readonly fin = signal<FinancialSettings | null>(null);

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getFinancial().subscribe({
      next: (f) => { this.fin.set(f); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
