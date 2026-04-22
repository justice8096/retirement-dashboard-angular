import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { ConcreteTilesComponent } from '@components/concrete-tiles/concrete-tiles.component';
import { NumericInputDirective } from '@directives/numeric-input.directive';

@Component({
  selector: 'app-fire-calc-screen',
  standalone: true,
  imports: [FormsModule, ConcreteTilesComponent, NumericInputDirective],
  template: `
    <div class="calc-screen">
      <div class="screen-header">
        <span class="header-icon">🧮</span>
        <div>
          <h2 class="header-title">FIRE Calculator</h2>
          <p class="header-sub">Calculate your path to financial independence</p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      <div class="card">
        <h3 class="card-title">Your Numbers</h3>
        <div class="param-grid">
          <label class="param">
            <span class="param-label">Current Savings</span>
            <input appNumeric="currency" class="param-input"
              [class]="dyscalculia.numberSpacingClass()"
              [ngModel]="currentSavings()" (ngModelChange)="currentSavings.set($event)" />
          </label>
          <label class="param">
            <span class="param-label">Annual Savings</span>
            <input appNumeric="currency" class="param-input"
              [class]="dyscalculia.numberSpacingClass()"
              [ngModel]="annualSavings()" (ngModelChange)="annualSavings.set($event)" />
          </label>
          <label class="param">
            <span class="param-label">Annual Expenses</span>
            <input appNumeric="currency" class="param-input"
              [class]="dyscalculia.numberSpacingClass()"
              [ngModel]="annualExpenses()" (ngModelChange)="annualExpenses.set($event)" />
          </label>
          <label class="param">
            <span class="param-label">Expected Return (%)</span>
            <input appNumeric="percent" class="param-input" step="0.1"
              [ngModel]="expectedReturn()" (ngModelChange)="expectedReturn.set($event)" />
          </label>
          <label class="param">
            <span class="param-label">Withdrawal Rate (%)</span>
            <input appNumeric="percent" class="param-input" step="0.1" min="1" max="20"
              [ngModel]="withdrawalRate()" (ngModelChange)="withdrawalRate.set($event)" />
            <!-- Inline definition (Dyscalculia F-010). -->
            <span class="param-hint">
              The share of your savings you plan to spend each year. 4% is a common starting point (Trinity study).
            </span>
          </label>
          <label class="param">
            <span class="param-label">Current Age</span>
            <input appNumeric="age" class="param-input"
              [ngModel]="currentAge()" (ngModelChange)="currentAge.set($event)" />
          </label>
        </div>
      </div>

      <!-- Results -->
      <div class="results">
        <div class="result-card highlight fire-number-card">
          <div class="result-label">FIRE Number</div>
          <div class="result-value lg fire-number-value" [class]="dyscalculia.numberSpacingClass()">
            {{ fmt(fireNumber()) }}
          </div>
          <!-- Step-ladder explanation (Dyscalculia F-001): plain-language
               walkthrough of FIRE = expenses × (100 / withdrawal rate). -->
          <ol class="result-explain-steps" aria-label="How the FIRE Number is calculated">
            <li>
              You spend about
              <strong>{{ fmt(annualExpenses()) }}</strong> per year.
            </li>
            <li>
              At a <strong>{{ withdrawalRate() }}%</strong> withdrawal rate,
              you need <strong>{{ multiplier() }}×</strong> your yearly spending.
            </li>
            <li>
              That's
              <strong>{{ fmt(annualExpenses()) }} × {{ multiplier() }} = {{ fmt(fireNumber()) }}</strong>.
            </li>
          </ol>

          <!-- Dashboard Dyscalculia F-004 — concrete tile visual, opt-in via
               the dyscalculia-settings "Concrete tiles" chart style. -->
          @if (dyscalculia.isEnabled() && dyscalculia.chartStyle() === 'concrete') {
            <app-concrete-tiles
              class="result-tiles"
              [amount]="fireNumber()"
              [unitValue]="10000"
              label="FIRE Number" />
          }
        </div>
        <div class="result-card">
          <div class="result-label">Years to FIRE</div>
          <div class="result-value lg">{{ yearsToFire() }}</div>
        </div>
        <div class="result-card">
          <div class="result-label">FIRE Age</div>
          <div class="result-value lg">{{ currentAge() + yearsToFire() }}</div>
        </div>
        <div class="result-card">
          <div class="result-label">Savings Rate</div>
          <div class="result-value lg">{{ savingsRate() }}%</div>
        </div>
      </div>

      <!-- Progress -->
      <div class="card">
        <h3 class="card-title">Progress to FIRE</h3>
        <div class="progress-bar">
          <div class="progress-fill" [style.width.%]="progressPct()"></div>
        </div>
        <div class="progress-label">
          {{ progressPct() }}% complete — {{ fmt(currentSavings()) }} of {{ fmt(fireNumber()) }}
        </div>
      </div>
    </div>
  `,
  styles: [`
    .calc-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }
    .badge-new {
      font-size: 10px; font-weight: 700; color: var(--dark-green);
      padding: 2px 8px; background: rgba(76, 175, 80, 0.12); border-radius: 4px;
    }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .param-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; }
    .param { display: flex; flex-direction: column; gap: 4px; }
    .param-label { font-size: 11px; color: var(--dark-text-muted); }
    .param-input {
      padding: 8px 12px; border-radius: 8px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text);
      font-size: 14px; font-family: var(--font-sans); outline: none;
    }
    .param-input:focus { border-color: var(--dark-blue); }

    .results { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .result-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .result-card.highlight { border-color: var(--dark-amber); }
    .result-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .result-value { font-size: 15px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; }
    .result-value.lg { font-size: 24px; line-height: 1.15; word-break: break-word; }

    /* FIRE Number spans 2 columns so the full formatted value fits. */
    .fire-number-card { grid-column: span 2; }
    .fire-number-value { font-size: 28px; letter-spacing: 0.5px; }
    @media (max-width: 520px) {
      .fire-number-card { grid-column: span 1; }
      .fire-number-value { font-size: 22px; }
    }
    .result-explain { font-size: 12px; color: var(--dark-text-muted); margin-top: 2px; }
    .result-explain-steps {
      list-style: decimal inside;
      margin-top: 10px;
      padding: 10px 12px;
      background: rgba(92, 156, 230, 0.06);
      border-radius: 6px;
      border: 1px solid rgba(92, 156, 230, 0.15);
      font-size: 13px;
      color: var(--dark-text-sec);
      line-height: var(--prose-line-height, 1.5);
      letter-spacing: var(--prose-letter-spacing, 0);
    }
    .result-explain-steps li { margin: 2px 0; }
    .result-explain-steps strong { color: var(--dark-text); font-weight: 700; }

    .param-hint {
      font-size: 12px;
      color: var(--dark-text-muted);
      line-height: var(--prose-line-height, 1.5);
      margin-top: 2px;
    }

    .progress-bar { height: 14px; background: var(--dark-bg-secondary); border-radius: 7px; overflow: hidden; }
    .progress-fill { height: 100%; background: var(--dark-green); border-radius: 7px; transition: width 0.3s; }
    .progress-label { font-size: 11px; color: var(--dark-text-sec); margin-top: 8px; }
  `],
})
export class FireCalcScreenComponent {
  readonly dyscalculia = inject(DyscalculiaService);
  readonly Math = Math;

  readonly currentSavings = signal(500000);
  readonly annualSavings = signal(50000);
  readonly annualExpenses = signal(40000);
  readonly expectedReturn = signal(7);
  readonly withdrawalRate = signal(4);
  readonly currentAge = signal(40);

  readonly fireNumber = computed(() =>
    Math.round(this.annualExpenses() / (this.withdrawalRate() / 100))
  );

  /** Integer multiplier (100 / withdrawalRate) used in the step-ladder. */
  readonly multiplier = computed(() => {
    const rate = this.withdrawalRate();
    return rate > 0 ? Math.round(100 / rate) : 0;
  });

  readonly yearsToFire = computed(() => {
    const target = this.fireNumber();
    const current = this.currentSavings();
    const savings = this.annualSavings();
    const r = this.expectedReturn() / 100;
    if (current >= target) return 0;
    if (savings <= 0 && r <= 0) return 99;
    let bal = current;
    let years = 0;
    while (bal < target && years < 99) {
      bal = bal * (1 + r) + savings;
      years++;
    }
    return years;
  });

  readonly savingsRate = computed(() => {
    const income = this.annualSavings() + this.annualExpenses();
    return income > 0 ? Math.round((this.annualSavings() / income) * 100) : 0;
  });

  readonly progressPct = computed(() => {
    const target = this.fireNumber();
    return target > 0 ? Math.min(100, Math.round((this.currentSavings() / target) * 100)) : 0;
  });

  /** All values rendered via `fmt` on this screen are either lump sums
   *  (FIRE Number, current savings) or annual figures whose "/yr" meaning
   *  is already carried by surrounding text ("per year", "× multiplier ="
   *  etc.). Pass `''` so dyscalculia.formatCurrency doesn't append `/mo`. */
  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, '')
      : '$' + Math.round(amount).toLocaleString();
  }
}
