import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { FinancialSettings, RetirementPath } from '@models/api.model';

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
        <div class="status-msg">Loading settings…</div>
      } @else {

        <!-- Portfolio -->
        <div class="card">
          <h3 class="card-title">Portfolio</h3>
          <div class="field-grid">
            <label class="field">
              <span class="field-label">Total Balance</span>
              <div class="input-wrap dollar">
                <span class="input-prefix">$</span>
                <input type="number" class="field-input lg"
                  [ngModel]="form().portfolioBalance"
                  (ngModelChange)="patch('portfolioBalance', $event)"
                  min="0" step="10000" />
              </div>
            </label>
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
          </div>
        </div>

        <!-- Account Balances -->
        <div class="card">
          <h3 class="card-title">Account Balances</h3>
          <div class="field-grid">
            <label class="field">
              <span class="field-label">Traditional IRA / 401k</span>
              <div class="input-wrap dollar">
                <span class="input-prefix">$</span>
                <input type="number" class="field-input"
                  [ngModel]="form().traditionalBalance"
                  (ngModelChange)="patch('traditionalBalance', $event)"
                  min="0" step="1000" />
              </div>
            </label>
            <label class="field">
              <span class="field-label">Roth IRA / Roth 401k</span>
              <div class="input-wrap dollar">
                <span class="input-prefix">$</span>
                <input type="number" class="field-input"
                  [ngModel]="form().rothBalance"
                  (ngModelChange)="patch('rothBalance', $event)"
                  min="0" step="1000" />
              </div>
            </label>
            <label class="field">
              <span class="field-label">Taxable Brokerage</span>
              <div class="input-wrap dollar">
                <span class="input-prefix">$</span>
                <input type="number" class="field-input"
                  [ngModel]="form().taxableBalance"
                  (ngModelChange)="patch('taxableBalance', $event)"
                  min="0" step="1000" />
              </div>
            </label>
            <label class="field">
              <span class="field-label">HSA</span>
              <div class="input-wrap dollar">
                <span class="input-prefix">$</span>
                <input type="number" class="field-input"
                  [ngModel]="form().hsaBalance"
                  (ngModelChange)="patch('hsaBalance', $event)"
                  min="0" step="100" />
              </div>
            </label>
          </div>
        </div>

        <!-- Asset Allocation -->
        <div class="card">
          <h3 class="card-title">Asset Allocation</h3>
          <div class="alloc-bars">
            <div class="alloc-segment" [style.flex]="form().equityPct || 1">
              <div class="alloc-fill equity"></div>
              <span class="alloc-label">Equity {{ form().equityPct }}%</span>
            </div>
            <div class="alloc-segment" [style.flex]="form().bondPct || 1">
              <div class="alloc-fill bond"></div>
              <span class="alloc-label">Bond {{ form().bondPct }}%</span>
            </div>
            <div class="alloc-segment" [style.flex]="form().cashPct || 1">
              <div class="alloc-fill cash"></div>
              <span class="alloc-label">Cash {{ form().cashPct }}%</span>
            </div>
            @if (form().intlPct) {
              <div class="alloc-segment" [style.flex]="form().intlPct || 1">
                <div class="alloc-fill intl"></div>
                <span class="alloc-label">Int'l {{ form().intlPct }}%</span>
              </div>
            }
          </div>
          <div class="field-grid alloc-inputs">
            <label class="field">
              <span class="field-label">Equity %</span>
              <input type="number" class="field-input sm"
                [ngModel]="form().equityPct"
                (ngModelChange)="patch('equityPct', $event)"
                min="0" max="100" step="5" />
            </label>
            <label class="field">
              <span class="field-label">Bond %</span>
              <input type="number" class="field-input sm"
                [ngModel]="form().bondPct"
                (ngModelChange)="patch('bondPct', $event)"
                min="0" max="100" step="5" />
            </label>
            <label class="field">
              <span class="field-label">Cash %</span>
              <input type="number" class="field-input sm"
                [ngModel]="form().cashPct"
                (ngModelChange)="patch('cashPct', $event)"
                min="0" max="100" step="5" />
            </label>
            <label class="field">
              <span class="field-label">Int'l %</span>
              <input type="number" class="field-input sm"
                [ngModel]="form().intlPct"
                (ngModelChange)="patch('intlPct', $event)"
                min="0" max="100" step="5" />
            </label>
          </div>
          @if (allocTotal() !== 100) {
            <div class="alloc-warning">
              Allocation totals {{ allocTotal() }}% — should be 100%
            </div>
          }
        </div>

        <!-- Return & Inflation -->
        <div class="card">
          <h3 class="card-title">Return &amp; Inflation Assumptions</h3>
          <div class="field-grid">
            <label class="field">
              <span class="field-label">Expected Annual Return</span>
              <div class="input-wrap pct">
                <input type="number" class="field-input sm"
                  [ngModel]="form().expectedReturn"
                  (ngModelChange)="patch('expectedReturn', $event)"
                  min="0" max="20" step="0.1" />
                <span class="input-suffix">%</span>
              </div>
            </label>
            <label class="field">
              <span class="field-label">Expected Inflation</span>
              <div class="input-wrap pct">
                <input type="number" class="field-input sm"
                  [ngModel]="form().expectedInflation"
                  (ngModelChange)="patch('expectedInflation', $event)"
                  min="0" max="15" step="0.1" />
                <span class="input-suffix">%</span>
              </div>
            </label>
            <label class="field">
              <span class="field-label">Social Security COLA</span>
              <div class="input-wrap pct">
                <input type="number" class="field-input sm"
                  [ngModel]="form().ssCola"
                  (ngModelChange)="patch('ssCola', $event)"
                  min="0" max="10" step="0.1" />
                <span class="input-suffix">%</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Risk Adjustments -->
        <div class="card">
          <h3 class="card-title">Risk Adjustments</h3>
          <div class="toggle-grid">
            <div class="toggle-row">
              <mat-slide-toggle
                [checked]="form().fxDriftEnabled"
                (change)="patch('fxDriftEnabled', $event.checked)">
                FX Drift
              </mat-slide-toggle>
              @if (form().fxDriftEnabled) {
                <label class="inline-field">
                  <span class="field-label">Rate</span>
                  <div class="input-wrap pct compact">
                    <input type="number" class="field-input sm"
                      [ngModel]="form().fxDriftAnnualRate"
                      (ngModelChange)="patch('fxDriftAnnualRate', $event)"
                      min="0" max="10" step="0.1" />
                    <span class="input-suffix">%/yr</span>
                  </div>
                </label>
              }
            </div>
            <div class="toggle-row">
              <mat-slide-toggle
                [checked]="form().ssCutEnabled"
                (change)="patch('ssCutEnabled', $event.checked)">
                Social Security Cut
              </mat-slide-toggle>
              @if (form().ssCutEnabled) {
                <label class="inline-field">
                  <span class="field-label">Year</span>
                  <input type="number" class="field-input sm"
                    [ngModel]="form().ssCutYear"
                    (ngModelChange)="patch('ssCutYear', $event)"
                    min="2025" max="2060" step="1" />
                </label>
              }
            </div>
          </div>
        </div>

      }
    </div>
  `,
  styles: [`
    .settings-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }
    .save-btn {
      margin-left: auto;
      --mdc-filled-button-container-color: var(--dark-amber);
      --mdc-filled-button-label-text-color: #000;
      --mdc-filled-button-label-text-size: 12px;
    }
    .save-msg { font-size: 11px; color: var(--dark-green); }
    .save-msg.error { color: var(--dark-red); }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
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
    .field-input.sm { font-size: 13px; }
    select.field-input { cursor: pointer; }

    .input-wrap {
      display: flex;
      align-items: center;
      gap: 0;
      position: relative;
    }
    .input-wrap.dollar .input-prefix {
      position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
      font-size: 14px; color: var(--dark-text-muted); pointer-events: none;
    }
    .input-wrap.dollar .field-input { padding-left: 22px; }
    .input-wrap.dollar .field-input.lg { padding-left: 26px; }
    .input-wrap.pct { gap: 4px; }
    .input-wrap.pct .field-input { flex: 1; }
    .input-suffix { font-size: 12px; color: var(--dark-text-muted); white-space: nowrap; }

    .alloc-bars { display: flex; gap: 4px; height: 40px; border-radius: 8px; overflow: hidden; }
    .alloc-segment { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 40px; }
    .alloc-fill { width: 100%; flex: 1; }
    .alloc-fill.equity { background: var(--dark-blue); }
    .alloc-fill.bond { background: var(--dark-green); }
    .alloc-fill.cash { background: var(--dark-amber); }
    .alloc-fill.intl { background: var(--dark-purple); }
    .alloc-label { font-size: 10px; color: var(--dark-text-muted); margin-top: 6px; }
    .alloc-inputs { margin-top: 14px; }
    .alloc-warning {
      margin-top: 8px; font-size: 11px; color: var(--dark-red);
      padding: 6px 10px; background: rgba(229, 115, 115, 0.08);
      border-radius: 6px;
    }

    .toggle-grid { display: flex; flex-direction: column; gap: 14px; }
    .toggle-row {
      display: flex; align-items: center; gap: 16px;
      font-size: 13px; color: var(--dark-text);
    }
    .inline-field {
      display: flex; align-items: center; gap: 6px;
    }
    .inline-field .field-input { width: 80px; }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }

    /* Remove number input spinners for cleaner look */
    input[type=number]::-webkit-outer-spin-button,
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { -moz-appearance: textfield; }
  `],
})
export class SettingsScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly saveMsg = signal('');
  readonly saveError = signal(false);

  /** Editable form state */
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

  allocTotal(): number {
    const f = this.form();
    return (f.equityPct ?? 0) + (f.bondPct ?? 0) + (f.cashPct ?? 0) + (f.intlPct ?? 0);
  }

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
}
