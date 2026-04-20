import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { FinancialSettings } from '@models/api.model';

@Component({
  selector: 'app-projections-screen',
  standalone: true,
  template: `
    <div class="proj-screen">
      <div class="screen-header">
        <span class="header-icon">📈</span>
        <div>
          <h2 class="header-title">Portfolio Projections</h2>
          <p class="header-sub">Estimated portfolio growth over your planning horizon</p>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading financial settings…</div>
      } @else if (!fin()) {
        <div class="status-msg">Configure your financial settings in Setup → Settings first.</div>
      } @else {

        <!-- Current portfolio summary -->
        <div class="summary-row">
          <div class="sum-card">
            <div class="sum-label">Portfolio Balance</div>
            <div class="sum-value" [class]="dyscalculia.numberSpacingClass()">{{ fmt(fin()!.portfolioBalance) }}</div>
          </div>
          <div class="sum-card">
            <div class="sum-label">Expected Return</div>
            <div class="sum-value">{{ fmtPct(fin()!.expectedReturn) }}%</div>
          </div>
          <div class="sum-card">
            <div class="sum-label">Expected Inflation</div>
            <div class="sum-value">{{ fmtPct(fin()!.expectedInflation) }}%</div>
          </div>
          <div class="sum-card">
            <div class="sum-label">Allocation</div>
            <div class="sum-value alloc">
              {{ fmtPct(fin()!.equityPct) }}% Equity · {{ fmtPct(fin()!.bondPct) }}% Bond · {{ fmtPct(fin()!.cashPct) }}% Cash
            </div>
          </div>
        </div>

        <!-- Year-by-year projection table -->
        <div class="table-section">
          <h3 class="section-title">Year-by-Year Projection</h3>
          <div class="table-wrap">
            <table class="proj-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Age</th>
                  <th>Nominal</th>
                  <th>Real (inflation adj.)</th>
                  <th>Annual Growth</th>
                </tr>
              </thead>
              <tbody>
                @for (row of projRows(); track row.year) {
                  <tr [class.highlight]="row.year % 5 === 0">
                    <td>{{ row.year }}</td>
                    <td>{{ row.age }}</td>
                    <td [class]="dyscalculia.numberSpacingClass()">{{ fmt(row.nominal) }}</td>
                    <td [class]="dyscalculia.numberSpacingClass()">{{ fmt(row.real) }}</td>
                    <td [class]="dyscalculia.numberSpacingClass()">{{ fmt(row.growth) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .proj-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .summary-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .sum-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .sum-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .sum-value { font-size: 20px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; }
    .sum-value.alloc { font-size: 12px; color: var(--dark-text-sec); font-weight: 600; }

    .table-section {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .section-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }
    .table-wrap { overflow-x: auto; }
    .proj-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .proj-table th {
      text-align: left; padding: 8px 12px; color: var(--dark-text-muted);
      border-bottom: 1px solid var(--dark-border); font-weight: 600;
    }
    .proj-table td { padding: 8px 12px; color: var(--dark-text); border-bottom: 1px solid var(--dark-bg-secondary); }
    .proj-table tr.highlight td { background: rgba(92, 156, 230, 0.04); }
    .proj-table tr:hover td { background: rgba(92, 156, 230, 0.08); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class ProjectionsScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly loading = signal(false);
  readonly fin = signal<FinancialSettings | null>(null);

  readonly projRows = computed(() => {
    const f = this.fin();
    if (!f) return [];
    const rows: { year: number; age: number; nominal: number; real: number; growth: number }[] = [];
    let nominal = f.portfolioBalance;
    let real = f.portfolioBalance;
    const r = f.expectedReturn / 100;
    const inf = f.expectedInflation / 100;
    const startYear = new Date().getFullYear();
    for (let i = 0; i <= 30; i++) {
      const growth = i === 0 ? 0 : nominal * r;
      if (i > 0) {
        nominal = nominal * (1 + r);
        real = real * (1 + r - inf);
      }
      rows.push({
        year: startYear + i,
        age: 65 + i, // placeholder; would use household birthYear
        nominal: Math.round(nominal),
        real: Math.round(real),
        growth: Math.round(growth),
      });
    }
    return rows;
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

  /** Rounds to 2 dp, trimming trailing zeros — so "60" stays "60" and
   *  "60.256" renders as "60.26". Keeps the allocation / return /
   *  inflation summary clean (FU-009). Shared with settings-screen's
   *  fmtPct helper; factor out if a third caller appears. */
  fmtPct(value: number | null | undefined): string {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '0';
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  }
}
