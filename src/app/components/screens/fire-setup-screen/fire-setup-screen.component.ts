import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { FinancialSettings, RetirementPath } from '@models/api.model';

@Component({
  selector: 'app-fire-setup-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective],
  template: `
    <div class="fire-screen">
      <div class="screen-header">
        <span class="header-icon">🔥</span>
        <div>
          <h2 class="header-title">FIRE Setup</h2>
          <p class="header-sub">Financial Independence, Retire Early configuration</p>
        </div>
        @if (dirty()) {
          <button mat-flat-button class="save-btn" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Saving…' : 'Save Changes' }}
          </button>
        }
        @if (saveMsg()) {
          <span class="save-msg" [class.error]="saveError()">{{ saveMsg() }}</span>
        }
      </div>

      @if (loading()) {
        <div class="status-msg">Loading…</div>
      } @else {

        <!-- FIRE inputs -->
        <div class="card">
          <h3 class="card-title">FIRE Parameters</h3>
          <div class="field-grid">
            <label class="field">
              <span class="field-label">Retirement Path</span>
              <select class="field-input"
                [ngModel]="form().retirementPath"
                (ngModelChange)="patch('retirementPath', $event)">
                <option value="traditional">Traditional</option>
                <option value="fire">FIRE</option>
                <option value="semi-retire">Semi-Retire</option>
                <option value="coast-fire">Coast FIRE</option>
                <option value="barista-fire">Barista FIRE</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">FIRE Target Age</span>
              <input appNumeric="age" class="field-input"
                [ngModel]="form().fireTargetAge"
                (ngModelChange)="patch('fireTargetAge', $event)"
                min="30" max="100"
                placeholder="e.g. 55" />
            </label>
            <label class="field">
              <span class="field-label">Annual Savings</span>
              <div class="input-wrap dollar">
                <span class="input-prefix">$</span>
                <input appNumeric="currency" class="field-input"
                  [class]="dyscalculia.numberSpacingClass()"
                  [ngModel]="form().annualSavings"
                  (ngModelChange)="patch('annualSavings', $event)"
                  step="1000"
                  placeholder="e.g. 50000" />
              </div>
            </label>
            <label class="field">
              <span class="field-label">Savings Rate</span>
              <div class="input-wrap pct">
                <input appNumeric="percent" class="field-input"
                  [ngModel]="form().savingsRate"
                  (ngModelChange)="patch('savingsRate', $event)"
                  step="1"
                  placeholder="e.g. 50" />
                <span class="input-suffix">%</span>
              </div>
            </label>
            <label class="field">
              <span class="field-label">Portfolio Balance</span>
              <div class="input-wrap dollar">
                <span class="input-prefix">$</span>
                <input appNumeric="currency" class="field-input lg"
                  [class]="dyscalculia.numberSpacingClass()"
                  [ngModel]="form().portfolioBalance"
                  (ngModelChange)="patch('portfolioBalance', $event)"
                  step="10000" />
              </div>
            </label>
            <label class="field">
              <span class="field-label">Annual Expenses</span>
              <div class="input-wrap dollar">
                <span class="input-prefix">$</span>
                <input appNumeric="currency" class="field-input"
                  [class]="dyscalculia.numberSpacingClass()"
                  [ngModel]="annualExpenses()"
                  (ngModelChange)="annualExpensesOverride.set($event)"
                  step="1000"
                  placeholder="e.g. 60000" />
              </div>
            </label>
            <label class="field">
              <span class="field-label">Expected Return</span>
              <div class="input-wrap pct">
                <input appNumeric="percent" class="field-input"
                  [ngModel]="form().expectedReturn"
                  (ngModelChange)="patch('expectedReturn', $event)"
                  max="20" step="0.5" />
                <span class="input-suffix">%</span>
              </div>
            </label>
            <label class="field">
              <span class="field-label">Withdrawal Rate</span>
              <div class="input-wrap pct">
                <input appNumeric="percent" class="field-input"
                  [ngModel]="withdrawalRate()"
                  (ngModelChange)="withdrawalRate.set($event)"
                  min="1" max="10" step="0.25" />
                <span class="input-suffix">%</span>
              </div>
            </label>
          </div>
        </div>

        <!-- FIRE number -->
        <div class="card highlight">
          <h3 class="card-title">Your FIRE Number</h3>
          <div class="fire-number" [class]="dyscalculia.numberSpacingClass()">
            {{ fmt(fireNumber()) }}
          </div>
          <div class="fire-explain">
            Based on {{ withdrawalRate() }}% withdrawal rate
            ({{ multiplier().toFixed(1) }}× annual expenses of {{ fmt(annualExpenses()) }})
          </div>
          <div class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" [style.width.%]="progressPct()"></div>
            </div>
            <div class="progress-label">
              {{ progressPct() }}% — {{ fmt(form().portfolioBalance) }} of {{ fmt(fireNumber()) }}
            </div>
          </div>
        </div>

        <!-- Time to FIRE -->
        @if (yearsToFire() > 0) {
          <div class="card">
            <h3 class="card-title">Estimated Time to FIRE</h3>
            <div class="years-display">
              <span class="years-value">~{{ yearsToFire() }}</span>
              <span class="years-label">years</span>
            </div>
            <div class="years-detail">
              Assumes {{ fmt(form().annualSavings ?? 0) }}/yr savings
              at {{ form().expectedReturn }}% return
            </div>
          </div>
        }

      }
    </div>
  `,
  styles: [`
    .fire-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }
    .save-btn {
      margin-left: auto;
      --mat-button-filled-container-color: var(--dark-amber);
      --mat-button-filled-label-text-color: #000;
      --mat-button-filled-label-text-size: 12px;
    }
    .save-msg { font-size: 11px; color: var(--dark-green); }
    .save-msg.error { color: var(--dark-red); }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card.highlight { border-color: var(--dark-amber); }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .field-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field-label { font-size: 11px; color: var(--dark-text-muted); }

    .field-input {
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary);
      color: var(--dark-text);
      font-size: 14px;
      font-weight: 600;
      font-family: var(--font-sans);
      outline: none;
      width: 100%;
      box-sizing: border-box;
      &:focus { border-color: var(--dark-amber); }
    }
    .field-input.lg { font-size: 18px; color: var(--dark-amber); }
    select.field-input { cursor: pointer; }

    .input-wrap {
      display: flex; align-items: center; gap: 0; position: relative;
    }
    .input-wrap.dollar .input-prefix {
      position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
      font-size: 14px; color: var(--dark-text-muted); pointer-events: none;
    }
    .input-wrap.dollar .field-input { padding-left: 22px; }
    .input-wrap.pct { gap: 4px; }
    .input-wrap.pct .field-input { flex: 1; }
    .input-suffix { font-size: 12px; color: var(--dark-text-muted); white-space: nowrap; }

    .fire-number { font-size: 32px; font-weight: 800; color: var(--dark-amber); }
    .fire-explain { font-size: 11px; color: var(--dark-text-muted); margin-top: 4px; }

    .progress-section { margin-top: 16px; }
    .progress-bar {
      height: 12px; background: var(--dark-bg-secondary);
      border-radius: 6px; overflow: hidden;
    }
    .progress-fill {
      height: 100%; background: var(--dark-green);
      border-radius: 6px; transition: width 0.5s ease;
    }
    .progress-label { font-size: 11px; color: var(--dark-text-sec); margin-top: 6px; }

    .years-display { display: flex; align-items: baseline; gap: 8px; }
    .years-value { font-size: 48px; font-weight: 800; color: var(--dark-blue); }
    .years-label { font-size: 16px; color: var(--dark-text-sec); }
    .years-detail { font-size: 11px; color: var(--dark-text-muted); margin-top: 8px; }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }

    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { -moz-appearance: textfield; }
  `],
})
export class FireSetupScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly saveMsg = signal('');
  readonly saveError = signal(false);

  readonly withdrawalRate = signal(4);
  readonly annualExpensesOverride = signal<number | null>(null);

  readonly form = signal<FinancialSettings>({
    portfolioBalance: 0,
    fxDriftEnabled: false,
    fxDriftAnnualRate: 1,
    ssCutEnabled: false,
    ssCutYear: 2034,
    ssCola: 2.5,
    equityPct: 60,
    bondPct: 30,
    cashPct: 10,
    intlPct: 0,
    expectedReturn: 7,
    expectedInflation: 3,
    retirementPath: 'traditional' as RetirementPath,
    fireTargetAge: null,
    annualSavings: null,
    savingsRate: null,
    traditionalBalance: null,
    rothBalance: null,
    taxableBalance: null,
    hsaBalance: null,
    updatedAt: '',
  });

  readonly annualExpenses = computed(() => {
    if (this.annualExpensesOverride()) return this.annualExpensesOverride()!;
    // Default: estimate from portfolio or use 60k
    const f = this.form();
    return f.portfolioBalance > 0
      ? Math.round(f.portfolioBalance * (this.withdrawalRate() / 100))
      : 60000;
  });

  readonly multiplier = computed(() => 100 / this.withdrawalRate());

  readonly fireNumber = computed(() =>
    Math.round(this.annualExpenses() * this.multiplier())
  );

  readonly progressPct = computed(() => {
    const target = this.fireNumber();
    const current = this.form().portfolioBalance;
    if (target <= 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  });

  readonly yearsToFire = computed(() => {
    const f = this.form();
    if (!f.annualSavings || f.annualSavings <= 0) return 0;
    const target = this.fireNumber();
    const current = f.portfolioBalance;
    if (current >= target) return 0;
    const r = f.expectedReturn / 100;
    if (r <= 0) return Math.ceil((target - current) / f.annualSavings);
    let balance = current;
    let years = 0;
    while (balance < target && years < 100) {
      balance = balance * (1 + r) + f.annualSavings;
      years++;
    }
    return years;
  });

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getFinancial().subscribe({
      next: (f) => {
        this.form.set({ ...f });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  patch(key: string, value: unknown): void {
    this.form.update(f => ({ ...f, [key]: value }));
    this.dirty.set(true);
    this.saveMsg.set('');
  }

  save(): void {
    this.saving.set(true);
    this.saveMsg.set('');
    const { updatedAt, ...data } = this.form();
    this.api.updateFinancial(data).subscribe({
      next: (f) => {
        this.form.set({ ...f });
        this.dirty.set(false);
        this.saving.set(false);
        this.saveMsg.set('✓ Saved');
        this.saveError.set(false);
        setTimeout(() => this.saveMsg.set(''), 3000);
      },
      error: () => {
        this.saving.set(false);
        this.saveMsg.set('Failed to save');
        this.saveError.set(true);
      },
    });
  }

  /** FIRE Number is a lifetime lump sum; annual-savings and annual-expenses
   *  already carry time dimension in the surrounding text. Pass `''` so
   *  dyscalculia.formatCurrency doesn't append a stray `/mo`. */
  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, '')
      : '$' + amount.toLocaleString();
  }
}
