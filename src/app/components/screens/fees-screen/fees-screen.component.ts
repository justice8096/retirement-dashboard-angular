import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { BrokerageFees, FxProvider } from '@models/api.model';
import { debounceTime, Subject } from 'rxjs';

@Component({
  selector: 'app-fees-screen',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="fees-screen">
      <div class="screen-header">
        <span class="header-icon">&#x1F4B1;</span>
        <div>
          <h2 class="header-title">Fees &amp; Currency</h2>
          <p class="header-sub">Brokerage fees, transfer costs, and currency conversion for your selected city</p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading fee settings...</div>
      } @else {

        <!-- Currency Context -->
        <div class="card accent">
          <h3 class="card-title">Currency Context</h3>
          <div class="currency-banner">
            <div class="currency-pair">
              <span class="currency-code">USD</span>
              <span class="arrow">&#x2192;</span>
              <span class="currency-code local">{{ localCurrency() }}</span>
            </div>
            <div class="rate-display">
              <span class="rate-label">Exchange Rate</span>
              <span class="rate-value">1 USD = {{ exchangeRate().toFixed(4) }} {{ localCurrency() }}</span>
            </div>
            @if (selectedCityName()) {
              <div class="city-tag">Based on: {{ selectedCityName() }}</div>
            }
          </div>
          <div class="field-row">
            <label class="field">
              <span class="field-label">Local Currency Code</span>
              <input type="text" class="field-input sm"
                [ngModel]="localCurrency()" (ngModelChange)="updateField('localCurrency', $event)" />
            </label>
            <label class="field">
              <span class="field-label">Manual Exchange Rate Override</span>
              <input type="number" class="field-input" step="0.0001" placeholder="Auto from city data"
                [ngModel]="manualExchangeRate()" (ngModelChange)="updateField('manualExchangeRate', $event || null)" />
            </label>
          </div>
        </div>
        <!-- Brokerage Fees -->
        <div class="card">
          <h3 class="card-title">Stock Brokerage Fees</h3>
          <p class="card-desc">Fees charged by your brokerage for managing and trading securities</p>
          <div class="param-grid">
            <label class="param">
              <span class="param-label">Trading Commission (%)</span>
              <input type="number" class="param-input" step="0.01"
                [ngModel]="fees()?.brokerageFeePct" (ngModelChange)="updateField('brokerageFeePct', $event)" />
              <span class="param-hint">Per-trade percentage fee</span>
            </label>
            <label class="param">
              <span class="param-label">Flat Trade Fee ($)</span>
              <input type="number" class="param-input" step="0.01"
                [ngModel]="fees()?.brokerageFeeFlat" (ngModelChange)="updateField('brokerageFeeFlat', $event)" />
              <span class="param-hint">Per-trade flat fee (e.g. $4.95)</span>
            </label>
            <label class="param">
              <span class="param-label">Annual Account Fee ($)</span>
              <input type="number" class="param-input" step="1"
                [ngModel]="fees()?.brokerageAnnualFee" (ngModelChange)="updateField('brokerageAnnualFee', $event)" />
              <span class="param-hint">Yearly custody or maintenance fee</span>
            </label>
            <label class="param">
              <span class="param-label">Fund Expense Ratio (%)</span>
              <input type="number" class="param-input" step="0.01"
                [ngModel]="fees()?.brokerageExpenseRatio" (ngModelChange)="updateField('brokerageExpenseRatio', $event)" />
              <span class="param-hint">Weighted average fund expense ratio</span>
            </label>
          </div>
        </div>

        <!-- Transfer Fees -->
        <div class="card">
          <h3 class="card-title">Money Transfer Fees</h3>
          <p class="card-desc">Costs to move money from your US accounts to local banks abroad</p>
          <div class="param-grid">
            <label class="param">
              <span class="param-label">Outgoing Wire Fee ($)</span>
              <input type="number" class="param-input" step="1"
                [ngModel]="fees()?.wireTransferFeeUsd" (ngModelChange)="updateField('wireTransferFeeUsd', $event)" />
              <span class="param-hint">US bank outgoing wire charge</span>
            </label>
            <label class="param">
              <span class="param-label">Receiving Bank Fee ({{ localCurrency() }})</span>
              <input type="number" class="param-input" step="1"
                [ngModel]="fees()?.wireTransferFeeLocal" (ngModelChange)="updateField('wireTransferFeeLocal', $event)" />
              <span class="param-hint">Local bank incoming wire charge</span>
            </label>
            <label class="param">
              <span class="param-label">ACH/Domestic Transfer ($)</span>
              <input type="number" class="param-input" step="0.01"
                [ngModel]="fees()?.achTransferFee" (ngModelChange)="updateField('achTransferFee', $event)" />
              <span class="param-hint">US domestic ACH transfer fee</span>
            </label>
          </div>
        </div>

        <!-- Currency Exchange -->
        <div class="card">
          <h3 class="card-title">Currency Exchange Fees</h3>
          <p class="card-desc">Spread and fees when converting USD to {{ localCurrency() }}</p>
          <div class="param-grid">
            <label class="param">
              <span class="param-label">FX Spread (%)</span>
              <input type="number" class="param-input" step="0.01"
                [ngModel]="fees()?.fxSpreadPct" (ngModelChange)="updateField('fxSpreadPct', $event)" />
              <span class="param-hint">Bank/broker markup on mid-market rate</span>
            </label>
            <label class="param">
              <span class="param-label">FX Fixed Fee ($)</span>
              <input type="number" class="param-input" step="0.01"
                [ngModel]="fees()?.fxFixedFee" (ngModelChange)="updateField('fxFixedFee', $event)" />
              <span class="param-hint">Flat per-conversion fee</span>
            </label>
            <label class="param">
              <span class="param-label">FX Provider</span>
              <select class="param-input"
                [ngModel]="fees()?.fxProvider" (ngModelChange)="updateField('fxProvider', $event)">
                <option value="bank">Bank Transfer</option>
                <option value="wise">Wise (TransferWise)</option>
                <option value="ofx">OFX</option>
                <option value="xe">XE</option>
                <option value="other">Other</option>
              </select>
              <span class="param-hint">Service used for currency conversion</span>
            </label>
          </div>
        </div>
        <!-- Conversion Calculator -->
        <div class="card">
          <h3 class="card-title">Conversion Calculator</h3>
          <p class="card-desc">See the true cost of moving money to {{ selectedCityName() || 'your destination' }}</p>
          <div class="calc-row">
            <label class="param">
              <span class="param-label">Amount to Transfer (USD)</span>
              <input type="number" class="param-input lg" step="100"
                [ngModel]="calcAmount()" (ngModelChange)="calcAmount.set($event)" />
            </label>
          </div>
          <div class="results">
            <div class="result-card">
              <div class="result-label">Wire Fee</div>
              <div class="result-value" [class]="dyscalculia.numberSpacingClass()">{{ fmtUsd(calcWireFee()) }}</div>
            </div>
            <div class="result-card">
              <div class="result-label">FX Spread Cost</div>
              <div class="result-value" [class]="dyscalculia.numberSpacingClass()">{{ fmtUsd(calcFxSpreadCost()) }}</div>
            </div>
            <div class="result-card">
              <div class="result-label">FX Fixed Fee</div>
              <div class="result-value" [class]="dyscalculia.numberSpacingClass()">{{ fmtUsd(calcFxFixedFee()) }}</div>
            </div>
            <div class="result-card highlight">
              <div class="result-label">Total Fees</div>
              <div class="result-value lg" [class]="dyscalculia.numberSpacingClass()">{{ fmtUsd(calcTotalFees()) }}</div>
              <div class="result-explain">{{ calcTotalFeePct().toFixed(2) }}% of transfer</div>
            </div>
            <div class="result-card accent">
              <div class="result-label">Net Amount ({{ localCurrency() }})</div>
              <div class="result-value lg" [class]="dyscalculia.numberSpacingClass()">{{ fmtLocal(calcNetLocal()) }}</div>
              <div class="result-explain">at effective rate {{ calcEffectiveRate().toFixed(4) }}</div>
            </div>
          </div>
        </div>

        <!-- Annual Impact -->
        <div class="card">
          <h3 class="card-title">Annual Fee Impact</h3>
          <p class="card-desc">Estimated yearly cost assuming monthly transfers of {{ fmtUsd(calcAmount()) }}</p>
          <div class="results">
            <div class="result-card">
              <div class="result-label">Annual Wire Fees</div>
              <div class="result-value" [class]="dyscalculia.numberSpacingClass()">{{ fmtUsd(calcWireFee() * 12) }}</div>
            </div>
            <div class="result-card">
              <div class="result-label">Annual FX Costs</div>
              <div class="result-value" [class]="dyscalculia.numberSpacingClass()">{{ fmtUsd((calcFxSpreadCost() + calcFxFixedFee()) * 12) }}</div>
            </div>
            <div class="result-card">
              <div class="result-label">Annual Brokerage Fees</div>
              <div class="result-value" [class]="dyscalculia.numberSpacingClass()">{{ fmtUsd(calcAnnualBrokerage()) }}</div>
            </div>
            <div class="result-card highlight">
              <div class="result-label">Total Annual Fee Drag</div>
              <div class="result-value lg" [class]="dyscalculia.numberSpacingClass()">{{ fmtUsd(calcAnnualTotal()) }}</div>
            </div>
          </div>
        </div>

        @if (saved()) {
          <div class="save-indicator">Saved</div>
        }
      }
    </div>
  `,  styles: [`
    .fees-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }
    .badge-new { font-size: 10px; font-weight: 700; color: var(--dark-green); padding: 2px 8px; background: rgba(76, 175, 80, 0.12); border-radius: 4px; }
    .card { background: var(--dark-bg-card); border: 1px solid var(--dark-border); border-radius: 12px; padding: 20px; }
    .card.accent { border-color: var(--dark-amber); }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 6px; }
    .card-desc { font-size: 11px; color: var(--dark-text-muted); margin: 0 0 14px; }
    .currency-banner { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding: 12px 16px; margin-bottom: 14px; background: var(--dark-bg-secondary); border-radius: 8px; }
    .currency-pair { display: flex; align-items: center; gap: 8px; }
    .currency-code { font-size: 18px; font-weight: 700; color: var(--dark-text); padding: 4px 10px; background: var(--dark-bg-card); border-radius: 6px; border: 1px solid var(--dark-border); }
    .currency-code.local { color: var(--dark-amber); border-color: var(--dark-amber); }
    .arrow { font-size: 18px; color: var(--dark-text-muted); }
    .rate-display { display: flex; flex-direction: column; gap: 2px; }
    .rate-label { font-size: 10px; color: var(--dark-text-muted); text-transform: uppercase; }
    .rate-value { font-size: 14px; font-weight: 600; color: var(--dark-text); }
    .city-tag { font-size: 10px; color: var(--dark-blue); padding: 3px 8px; background: rgba(92, 156, 230, 0.1); border-radius: 4px; margin-left: auto; }
    .field-row { display: flex; gap: 14px; flex-wrap: wrap; }
    .field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 160px; }
    .field-label { font-size: 11px; color: var(--dark-text-muted); }
    .field-input { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--dark-border); background: var(--dark-bg-secondary); color: var(--dark-text); font-size: 14px; font-family: var(--font-sans); outline: none; }
    .field-input:focus { border-color: var(--dark-blue); }
    .field-input.sm { max-width: 120px; }
    .param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
    .param { display: flex; flex-direction: column; gap: 4px; }
    .param-label { font-size: 11px; color: var(--dark-text-muted); }
    .param-input { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--dark-border); background: var(--dark-bg-secondary); color: var(--dark-text); font-size: 14px; font-family: var(--font-sans); outline: none; }
    .param-input:focus { border-color: var(--dark-blue); }
    .param-input.lg { max-width: 220px; font-size: 18px; font-weight: 600; }
    .param-hint { font-size: 10px; color: var(--dark-text-muted); }
    select.param-input { appearance: auto; cursor: pointer; }
    .calc-row { margin-bottom: 14px; }
    .results { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .result-card { padding: 14px; background: var(--dark-bg-card); border: 1px solid var(--dark-border); border-radius: 10px; }
    .result-card.highlight { border-color: var(--dark-amber); }
    .result-card.accent { border-color: var(--dark-green); background: rgba(76, 175, 80, 0.04); }
    .result-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .result-value { font-size: 15px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; }
    .result-value.lg { font-size: 22px; }
    .result-explain { font-size: 10px; color: var(--dark-text-muted); margin-top: 2px; }
    .save-indicator { position: fixed; bottom: 40px; right: 24px; padding: 6px 14px; font-size: 12px; color: var(--dark-green); background: rgba(76, 175, 80, 0.12); border-radius: 6px; border: 1px solid rgba(76, 175, 80, 0.2); }
    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})export class FeesScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly locService = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly loading = signal(false);
  readonly saved = signal(false);
  readonly fees = signal<BrokerageFees | null>(null);
  readonly calcAmount = signal(3000);

  private readonly save$ = new Subject<Partial<BrokerageFees>>();

  readonly selectedCityName = computed(() => this.locService.selectedLocation()?.name ?? null);

  readonly localCurrency = computed(() => {
    const f = this.fees();
    if (f && f.localCurrency !== 'USD') return f.localCurrency;
    const loc = this.locService.selectedLocation();
    return loc?.currency ?? f?.localCurrency ?? 'USD';
  });

  readonly exchangeRate = computed(() => {
    const f = this.fees();
    if (f?.manualExchangeRate) return f.manualExchangeRate;
    const loc = this.locService.selectedLocation();
    return loc?.exchangeRate ?? 1;
  });

  readonly manualExchangeRate = computed(() => this.fees()?.manualExchangeRate ?? null);

  readonly calcWireFee = computed(() => (this.fees()?.wireTransferFeeUsd ?? 25));

  readonly calcFxSpreadCost = computed(() => {
    const amount = this.calcAmount();
    const spread = (this.fees()?.fxSpreadPct ?? 1) / 100;
    return amount * spread;
  });

  readonly calcFxFixedFee = computed(() => this.fees()?.fxFixedFee ?? 0);

  readonly calcTotalFees = computed(() =>
    this.calcWireFee() + this.calcFxSpreadCost() + this.calcFxFixedFee()
  );

  readonly calcTotalFeePct = computed(() => {
    const amt = this.calcAmount();
    return amt > 0 ? (this.calcTotalFees() / amt) * 100 : 0;
  });

  readonly calcEffectiveRate = computed(() => {
    const amt = this.calcAmount();
    const net = amt - this.calcTotalFees();
    const rate = this.exchangeRate();
    return net > 0 ? (net * rate) / amt : 0;
  });

  readonly calcNetLocal = computed(() => {
    const amt = this.calcAmount();
    const net = amt - this.calcTotalFees();
    return net * this.exchangeRate();
  });

  readonly calcAnnualBrokerage = computed(() => {
    const f = this.fees();
    if (!f) return 0;
    return f.brokerageAnnualFee + (f.brokerageExpenseRatio / 100) * (this.calcAmount() * 12);
  });

  readonly calcAnnualTotal = computed(() =>
    (this.calcWireFee() + this.calcFxSpreadCost() + this.calcFxFixedFee()) * 12 + this.calcAnnualBrokerage()
  );

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getFees().subscribe({
      next: (f) => { this.fees.set(f); this.loading.set(false); },
      error: () => this.loading.set(false),
    });

    this.save$.pipe(debounceTime(1500)).subscribe((patch) => {
      this.api.updateFees(patch).subscribe({
        next: (updated) => {
          this.fees.set(updated);
          this.saved.set(true);
          setTimeout(() => this.saved.set(false), 2000);
        },
      });
    });
  }

  updateField(field: string, value: unknown): void {
    const current = this.fees();
    if (!current) return;
    const updated = { ...current, [field]: value } as BrokerageFees;
    this.fees.set(updated);
    this.save$.next({ [field]: value } as Partial<BrokerageFees>);
  }

  fmtUsd(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  fmtLocal(amount: number): string {
    const cur = this.localCurrency();
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur;
  }
}