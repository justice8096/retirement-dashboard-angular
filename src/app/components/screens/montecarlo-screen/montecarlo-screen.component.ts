import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { FinancialSettings } from '@models/api.model';

@Component({
  selector: 'app-montecarlo-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule],
  template: `
    <div class="mc-screen">
      <div class="screen-header">
        <span class="header-icon">🎲</span>
        <div>
          <h2 class="header-title">Monte Carlo Simulation</h2>
          <p class="header-sub">Run probabilistic retirement scenarios</p>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading financial settings…</div>
      } @else if (!fin()) {
        <div class="status-msg">Configure financial settings in Setup first.</div>
      } @else {

        <!-- Parameters -->
        <div class="card">
          <h3 class="card-title">Simulation Parameters</h3>
          <div class="param-grid">
            <label class="param">
              <span class="param-label">Number of Runs</span>
              <input type="number" class="param-input"
                [ngModel]="runs()" (ngModelChange)="runs.set($event)" />
            </label>
            <label class="param">
              <span class="param-label">Years to Simulate</span>
              <input type="number" class="param-input"
                [ngModel]="years()" (ngModelChange)="years.set($event)" />
            </label>
            <label class="param">
              <span class="param-label">Withdrawal Rate (%)</span>
              <input type="number" class="param-input" step="0.1"
                [ngModel]="withdrawalRate()" (ngModelChange)="withdrawalRate.set($event)" />
            </label>
          </div>
          <button mat-flat-button class="run-btn" (click)="runSimulation()">
            Run Simulation
          </button>
        </div>

        <!-- Results -->
        @if (hasResults()) {
          <div class="results-grid">
            <div class="result-card success">
              <div class="result-label">Success Rate</div>
              <div class="result-value">{{ successRate() }}%</div>
            </div>
            <div class="result-card">
              <div class="result-label">Median End Balance</div>
              <div class="result-value" [class]="dyscalculia.numberSpacingClass()">{{ fmt(medianBalance()) }}</div>
            </div>
            <div class="result-card">
              <div class="result-label">10th Percentile</div>
              <div class="result-value worst" [class]="dyscalculia.numberSpacingClass()">{{ fmt(p10Balance()) }}</div>
            </div>
            <div class="result-card">
              <div class="result-label">90th Percentile</div>
              <div class="result-value best" [class]="dyscalculia.numberSpacingClass()">{{ fmt(p90Balance()) }}</div>
            </div>
          </div>

          <!-- Year-by-year percentiles -->
          <div class="card">
            <h3 class="card-title">Portfolio Balance Over Time</h3>
            <div class="chart-bars">
              @for (yr of yearlyData(); track yr.year) {
                <div class="yr-row">
                  <span class="yr-label">{{ yr.year }}</span>
                  <div class="yr-bar-wrap">
                    <div class="yr-bar-range"
                      [style.left.%]="(yr.p10 / maxBalance()) * 100"
                      [style.width.%]="((yr.p90 - yr.p10) / maxBalance()) * 100">
                    </div>
                    <div class="yr-bar-median"
                      [style.left.%]="(yr.median / maxBalance()) * 100">
                    </div>
                  </div>
                  <span class="yr-val" [class]="dyscalculia.numberSpacingClass()">{{ fmt(yr.median) }}</span>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .mc-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

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

    .run-btn {
      margin-top: 14px;
      --mdc-filled-button-container-color: var(--dark-blue);
      --mdc-filled-button-label-text-color: #fff;
    }

    .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .result-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .result-card.success { border-color: var(--dark-green); }
    .result-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .result-value { font-size: 20px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; }
    .result-value.worst { color: var(--dark-red); }
    .result-value.best { color: var(--dark-green); }

    .chart-bars { display: flex; flex-direction: column; gap: 6px; }
    .yr-row { display: flex; align-items: center; gap: 8px; }
    .yr-label { font-size: 11px; color: var(--dark-text-muted); width: 40px; text-align: right; }
    .yr-bar-wrap { flex: 1; height: 12px; background: var(--dark-bg-secondary); border-radius: 4px; position: relative; }
    .yr-bar-range { position: absolute; top: 0; height: 100%; background: rgba(92, 156, 230, 0.2); border-radius: 4px; }
    .yr-bar-median { position: absolute; top: 0; width: 3px; height: 100%; background: var(--dark-amber); border-radius: 2px; }
    .yr-val { font-size: 10px; color: var(--dark-text-sec); width: 70px; text-align: right; }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class MontecarloScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loading = signal(false);
  readonly fin = signal<FinancialSettings | null>(null);

  readonly runs = signal(1000);
  readonly years = signal(30);
  readonly withdrawalRate = signal(4.0);

  readonly hasResults = signal(false);
  readonly successRate = signal(0);
  readonly medianBalance = signal(0);
  readonly p10Balance = signal(0);
  readonly p90Balance = signal(0);
  readonly yearlyData = signal<{ year: number; p10: number; median: number; p90: number }[]>([]);
  readonly maxBalance = computed(() => {
    const data = this.yearlyData();
    return data.length ? Math.max(...data.map(d => d.p90)) : 1;
  });

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getFinancial().subscribe({
      next: (f) => { this.fin.set(f); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  runSimulation(): void {
    const f = this.fin();
    if (!f) return;
    const balance = f.portfolioBalance;
    const r = f.expectedReturn / 100;
    const std = 0.12; // assumed std dev
    const wd = this.withdrawalRate() / 100;
    const numRuns = this.runs();
    const numYears = this.years();

    const allResults: number[][] = [];
    let successes = 0;

    for (let run = 0; run < numRuns; run++) {
      const trail: number[] = [balance];
      let bal = balance;
      let survived = true;
      for (let y = 1; y <= numYears; y++) {
        const ret = r + std * this.boxMuller();
        bal = bal * (1 + ret) - bal * wd;
        if (bal < 0) { bal = 0; survived = false; }
        trail.push(Math.round(bal));
      }
      allResults.push(trail);
      if (survived && bal > 0) successes++;
    }

    this.successRate.set(Math.round((successes / numRuns) * 100));

    // Compute percentiles per year
    const yearly: { year: number; p10: number; median: number; p90: number }[] = [];
    for (let y = 0; y <= numYears; y += Math.max(1, Math.floor(numYears / 15))) {
      const vals = allResults.map(r => r[y]).sort((a, b) => a - b);
      yearly.push({
        year: new Date().getFullYear() + y,
        p10: vals[Math.floor(vals.length * 0.1)],
        median: vals[Math.floor(vals.length * 0.5)],
        p90: vals[Math.floor(vals.length * 0.9)],
      });
    }
    this.yearlyData.set(yearly);
    this.medianBalance.set(yearly[yearly.length - 1]?.median ?? 0);
    this.p10Balance.set(yearly[yearly.length - 1]?.p10 ?? 0);
    this.p90Balance.set(yearly[yearly.length - 1]?.p90 ?? 0);
    this.hasResults.set(true);
  }

  private boxMuller(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
