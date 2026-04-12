import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { FinancialSettings } from '@models/api.model';

@Component({
  selector: 'app-fire-setup-screen',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="fire-screen">
      <div class="screen-header">
        <span class="header-icon">🔥</span>
        <div>
          <h2 class="header-title">FIRE Setup</h2>
          <p class="header-sub">Financial Independence, Retire Early configuration</p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading…</div>
      } @else if (!fin()) {
        <div class="status-msg">Configure financial settings first.</div>
      } @else {

        <!-- FIRE parameters -->
        <div class="card">
          <h3 class="card-title">FIRE Parameters</h3>
          <div class="field-grid">
            <div class="field">
              <span class="field-label">Retirement Path</span>
              <div class="field-value cap">{{ fin()!.retirementPath }}</div>
            </div>
            <div class="field">
              <span class="field-label">FIRE Target Age</span>
              <div class="field-value">{{ fin()!.fireTargetAge ?? '—' }}</div>
            </div>
            <div class="field">
              <span class="field-label">Annual Savings</span>
              <div class="field-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fin()!.annualSavings ? fmt(fin()!.annualSavings!) : '—' }}
              </div>
            </div>
            <div class="field">
              <span class="field-label">Savings Rate</span>
              <div class="field-value">{{ fin()!.savingsRate ? fin()!.savingsRate + '%' : '—' }}</div>
            </div>
          </div>
        </div>

        <!-- FIRE number -->
        <div class="card highlight">
          <h3 class="card-title">Your FIRE Number</h3>
          <div class="fire-number" [class]="dyscalculia.numberSpacingClass()">
            {{ fmt(fireNumber()) }}
          </div>
          <div class="fire-explain">
            Based on 4% withdrawal rate
            (25× annual expenses)
          </div>
          <div class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill"
                [style.width.%]="progressPct()">
              </div>
            </div>
            <div class="progress-label">
              {{ progressPct() }}% — {{ fmt(fin()!.portfolioBalance) }} of {{ fmt(fireNumber()) }}
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
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .fire-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }
    .badge-new {
      font-size: 10px; font-weight: 700; color: var(--dark-green);
      padding: 2px 8px; background: rgba(76, 175, 80, 0.12);
      border-radius: 4px; text-transform: uppercase;
    }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card.highlight { border-color: var(--dark-amber); }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .field-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field-label { font-size: 11px; color: var(--dark-text-muted); }
    .field-value { font-size: 15px; font-weight: 600; color: var(--dark-text); }
    .field-value.cap { text-transform: capitalize; }

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

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class FireSetupScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loading = signal(false);
  readonly fin = signal<FinancialSettings | null>(null);

  readonly fireNumber = computed(() => {
    const f = this.fin();
    if (!f) return 0;
    // 25× annual expenses (inverse of 4% rule)
    const annualExpenses = f.portfolioBalance * (f.expectedReturn / 100) > 0
      ? f.portfolioBalance / 25
      : 40000;
    return Math.round(annualExpenses * 25);
  });

  readonly progressPct = computed(() => {
    const target = this.fireNumber();
    const current = this.fin()?.portfolioBalance ?? 0;
    if (target <= 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  });

  readonly yearsToFire = computed(() => {
    const f = this.fin();
    if (!f || !f.annualSavings || f.annualSavings <= 0) return 0;
    const target = this.fireNumber();
    const current = f.portfolioBalance;
    const r = f.expectedReturn / 100;
    if (current >= target) return 0;
    // Simplified: years = ln((target * r + savings) / (current * r + savings)) / ln(1 + r)
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
