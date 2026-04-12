import { Component, inject, signal, OnInit } from '@angular/core';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { WithdrawalStrategy } from '@models/api.model';

@Component({
  selector: 'app-withdrawal-screen',
  standalone: true,
  template: `
    <div class="wd-screen">
      <div class="screen-header">
        <span class="header-icon">💸</span>
        <div>
          <h2 class="header-title">Withdrawal Strategy</h2>
          <p class="header-sub">Configure how you draw down your portfolio in retirement</p>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading withdrawal settings…</div>
      } @else if (!wd()) {
        <div class="status-msg">No withdrawal strategy configured yet.</div>
      } @else {
        <div class="cards">
          <!-- Strategy type -->
          <div class="card">
            <h3 class="card-title">Strategy</h3>
            <div class="kv-grid">
              <div class="kv">
                <span class="k">Type</span>
                <span class="v cap">{{ wd()!.strategyType }}</span>
              </div>
              <div class="kv">
                <span class="k">Withdrawal Rate</span>
                <span class="v">{{ wd()!.withdrawalRate }}%</span>
              </div>
              <div class="kv">
                <span class="k">Spending Model</span>
                <span class="v cap">{{ wd()!.spendingModel }}</span>
              </div>
              @if (wd()!.ceilingRate) {
                <div class="kv">
                  <span class="k">Ceiling Rate</span>
                  <span class="v">{{ wd()!.ceilingRate }}%</span>
                </div>
              }
              @if (wd()!.floorRate) {
                <div class="kv">
                  <span class="k">Floor Rate</span>
                  <span class="v">{{ wd()!.floorRate }}%</span>
                </div>
              }
              @if (wd()!.declineRate) {
                <div class="kv">
                  <span class="k">Decline Rate</span>
                  <span class="v">{{ wd()!.declineRate }}%/yr</span>
                </div>
              }
            </div>
          </div>

          <!-- Bucket strategy details -->
          @if (wd()!.strategyType === 'bucket') {
            <div class="card">
              <h3 class="card-title">Bucket Allocation</h3>
              <div class="kv-grid">
                <div class="kv">
                  <span class="k">Bucket 1 (Cash)</span>
                  <span class="v">{{ wd()!.bucket1Years }} years</span>
                </div>
                <div class="kv">
                  <span class="k">Bucket 2 (Bonds)</span>
                  <span class="v">{{ wd()!.bucket2Years }} years</span>
                </div>
                @if (wd()!.refillThreshold) {
                  <div class="kv">
                    <span class="k">Refill Threshold</span>
                    <span class="v">{{ wd()!.refillThreshold }}%</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Essential vs discretionary -->
          @if (wd()!.essentialSpending) {
            <div class="card">
              <h3 class="card-title">Spending Breakdown</h3>
              <div class="kv-grid">
                <div class="kv">
                  <span class="k">Essential Spending</span>
                  <span class="v" [class]="dyscalculia.numberSpacingClass()">{{ fmt(wd()!.essentialSpending!) }}</span>
                </div>
                @if (wd()!.discretionaryBudget) {
                  <div class="kv">
                    <span class="k">Discretionary Budget</span>
                    <span class="v" [class]="dyscalculia.numberSpacingClass()">{{ fmt(wd()!.discretionaryBudget!) }}</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Roth conversion -->
          @if (wd()!.rothConversionEnabled) {
            <div class="card roth">
              <h3 class="card-title">Roth Conversion</h3>
              <div class="kv-grid">
                <div class="kv">
                  <span class="k">Annual Amount</span>
                  <span class="v" [class]="dyscalculia.numberSpacingClass()">
                    {{ wd()!.rothConversionAmount ? fmt(wd()!.rothConversionAmount!) : '—' }}
                  </span>
                </div>
                @if (wd()!.rothConversionEndAge) {
                  <div class="kv">
                    <span class="k">End Age</span>
                    <span class="v">{{ wd()!.rothConversionEndAge }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .wd-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .cards { display: flex; flex-direction: column; gap: 12px; }
    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card.roth { border-color: var(--dark-purple); }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .kv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .kv { display: flex; flex-direction: column; gap: 4px; }
    .k { font-size: 11px; color: var(--dark-text-muted); }
    .v { font-size: 15px; font-weight: 600; color: var(--dark-amber); }
    .v.cap { text-transform: capitalize; color: var(--dark-text); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class WithdrawalScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loading = signal(false);
  readonly wd = signal<WithdrawalStrategy | null>(null);

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getWithdrawal().subscribe({
      next: (w) => { this.wd.set(w); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
