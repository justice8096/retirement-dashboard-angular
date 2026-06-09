import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { FinancialSettings, RetirementPath } from '@models/api.model';

@Component({
  selector: 'app-settings-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatSlideToggleModule, NumericInputDirective],
  templateUrl: './settings-screen.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./settings-screen.component.scss'],
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
    ssCola: 2.8,  // 2026 SSA COLA (announced 2025-10-24); was 2.5% for 2025
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
    traditionalLoadPct: 0,
    rothLoadPct: 0,
    taxableLoadPct: 0,
    hsaLoadPct: 0,
    traditionalFeesPct: 0,
    rothFeesPct: 0,
    taxableFeesPct: 0,
    hsaFeesPct: 0,
    updatedAt: '',
  });

  readonly accountRows = [
    { key: 'traditional', label: 'Traditional IRA / 401k', balanceKey: 'traditionalBalance' as const, loadKey: 'traditionalLoadPct' as const, feesKey: 'traditionalFeesPct' as const },
    { key: 'roth',        label: 'Roth IRA / Roth 401k',   balanceKey: 'rothBalance' as const,        loadKey: 'rothLoadPct' as const,        feesKey: 'rothFeesPct' as const },
    { key: 'taxable',     label: 'Taxable Brokerage',      balanceKey: 'taxableBalance' as const,     loadKey: 'taxableLoadPct' as const,     feesKey: 'taxableFeesPct' as const },
    { key: 'hsa',         label: 'HSA',                    balanceKey: 'hsaBalance' as const,         loadKey: 'hsaLoadPct' as const,         feesKey: 'hsaFeesPct' as const },
  ];

  /** Portfolio-weighted annual drag % (load + fees, balance-weighted). */
  readonly weightedDragPct = computed(() => {
    const f = this.form();
    const balances = this.accountRows.map(r => Number(f[r.balanceKey]) || 0);
    const totalBal = balances.reduce((a, b) => a + b, 0);
    if (totalBal <= 0) return 0;
    let drag = 0;
    for (let i = 0; i < this.accountRows.length; i++) {
      const r = this.accountRows[i];
      const w = balances[i] / totalBal;
      drag += w * ((Number(f[r.loadKey]) || 0) + (Number(f[r.feesKey]) || 0));
    }
    return drag;
  });

  /** Effective return = expected return - weighted drag. */
  readonly effectiveReturnPct = computed(() => {
    const base = Number(this.form().expectedReturn) || 0;
    return Math.max(0, base - this.weightedDragPct());
  });

  allocTotal(): number {
    const f = this.form();
    return (f.equityPct ?? 0) + (f.bondPct ?? 0) + (f.cashPct ?? 0) + (f.intlPct ?? 0);
  }

  /** Display helper — trims trailing zeros on ≤2-dp rendering so whole
   *  numbers stay clean ("60%") while fractional values show 2 dp
   *  ("60.25%"). Keeps allocation summaries dyscalculia-friendly. */
  fmtPct(value: number | null | undefined): string {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '0';
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  }

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getFinancial().subscribe({
      next: (f) => {
        this.form.set({ ...f });
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const detail = err?.error?.error ?? err?.message ?? err?.statusText ?? 'Unknown error';
        const status = err?.status ? `${err.status}: ` : '';
        this.saveMsg.set(`Load failed — ${status}${detail}`);
        this.saveError.set(true);
        console.error('Financial load error:', err);
      },
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
      error: (err) => {
        this.saving.set(false);
        const detail = err?.error?.error ?? err?.error?.message ?? err?.message ?? err?.statusText ?? 'Unknown error';
        const status = err?.status ? `${err.status}: ` : '';
        this.saveMsg.set(`Failed to save — ${status}${detail}`);
        this.saveError.set(true);
        console.error('Financial save error:', err);
      },
    });
  }
}
