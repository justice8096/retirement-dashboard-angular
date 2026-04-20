import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { FinancialSettings } from '@models/api.model';

@Component({
  selector: 'app-roth-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective],
  template: `
    <div class="roth-screen">
      <div class="screen-header">
        <span class="header-icon">🔄</span>
        <div>
          <h2 class="header-title">Roth Conversion Planner</h2>
          <p class="header-sub">Estimate tax savings from systematic Roth conversions</p>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading financial data…</div>
      } @else if (!fin()) {
        <div class="status-msg">Configure your financial settings first in Setup → Settings.</div>
      } @else {

        <!-- Account balances -->
        <div class="balance-row">
          <div class="bal-card">
            <div class="bal-label">Traditional IRA/401k</div>
            <div class="bal-value" [class]="dyscalculia.numberSpacingClass()">
              {{ fmt(fin()!.traditionalBalance ?? 0) }}
            </div>
          </div>
          <div class="bal-card roth">
            <div class="bal-label">Roth IRA/401k</div>
            <div class="bal-value" [class]="dyscalculia.numberSpacingClass()">
              {{ fmt(fin()!.rothBalance ?? 0) }}
            </div>
          </div>
          <div class="bal-card">
            <div class="bal-label">Taxable</div>
            <div class="bal-value" [class]="dyscalculia.numberSpacingClass()">
              {{ fmt(fin()!.taxableBalance ?? 0) }}
            </div>
          </div>
          @if (fin()!.hsaBalance) {
            <div class="bal-card">
              <div class="bal-label">HSA</div>
              <div class="bal-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(fin()!.hsaBalance!) }}
              </div>
            </div>
          }
        </div>

        <!-- Conversion planner -->
        <div class="planner-card">
          <h3 class="card-title">Conversion Parameters</h3>
          <div class="param-grid">
            <label class="param">
              <span class="param-label">Annual Conversion Amount</span>
              <input appNumeric="currency" class="param-input" [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="conversionAmount()"
                (ngModelChange)="conversionAmount.set($event)" />
              <span class="param-hint" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(conversionAmount()) }} · {{ dyscalculia.getAnchor(conversionAmount(), 'withdrawal-year') }}
              </span>
            </label>
            <label class="param">
              <span class="param-label">Years to Convert</span>
              <input appNumeric="age" class="param-input" min="1" max="50"
                [ngModel]="yearsToConvert()"
                (ngModelChange)="yearsToConvert.set($event)" />
            </label>
            <label class="param">
              <span class="param-label">Marginal Tax Rate (%)</span>
              <input appNumeric="percent" class="param-input" step="0.5"
                [ngModel]="taxRate()"
                (ngModelChange)="taxRate.set($event)" />
            </label>
          </div>
        </div>

        <!-- Results -->
        <div class="results-card">
          <h3 class="card-title">Conversion Summary</h3>
          <div class="result-grid">
            <div class="result">
              <span class="result-label">Total Converted</span>
              <span class="result-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(totalConverted()) }}
              </span>
            </div>
            <div class="result">
              <span class="result-label">Taxes Paid</span>
              <span class="result-value tax" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(taxesPaid()) }}
              </span>
            </div>
            <div class="result">
              <span class="result-label">New Roth Balance</span>
              <span class="result-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt((fin()!.rothBalance ?? 0) + totalConverted()) }}
              </span>
            </div>
            <div class="result">
              <span class="result-label">Remaining Traditional</span>
              <span class="result-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(Math.max(0, (fin()!.traditionalBalance ?? 0) - totalConverted())) }}
              </span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .roth-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .balance-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .bal-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .bal-card.roth { border-color: var(--dark-purple); }
    .bal-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .bal-value { font-size: 18px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; }

    .planner-card, .results-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
    .param { display: flex; flex-direction: column; gap: 4px; }
    .param-label { font-size: 11px; color: var(--dark-text-muted); }
    .param-hint { font-size: 10px; color: var(--dark-text-muted); font-style: italic; margin-top: 2px; line-height: 1.4; }
    .param-input {
      padding: 8px 12px; border-radius: 8px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text); font-size: 14px;
      font-family: var(--font-sans); outline: none;
    }
    .param-input:focus { border-color: var(--dark-blue); }

    .result-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
    .result { display: flex; flex-direction: column; gap: 4px; }
    .result-label { font-size: 11px; color: var(--dark-text-muted); }
    .result-value { font-size: 18px; font-weight: 700; color: var(--dark-amber); }
    .result-value.tax { color: var(--dark-amber); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class RothScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly Math = Math;
  readonly loading = signal(false);
  readonly fin = signal<FinancialSettings | null>(null);

  readonly conversionAmount = signal(50000);
  readonly yearsToConvert = signal(5);
  readonly taxRate = signal(22);

  readonly totalConverted = computed(() => this.conversionAmount() * this.yearsToConvert());
  readonly taxesPaid = computed(() => Math.round(this.totalConverted() * (this.taxRate() / 100)));

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
