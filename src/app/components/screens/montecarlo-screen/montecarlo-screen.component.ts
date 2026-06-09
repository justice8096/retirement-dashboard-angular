import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { HealthcareService } from '@services/healthcare.service';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { MonteCarloRunnerService } from '@services/monte-carlo-runner.service';
import { FinancialSettings, HouseholdMember } from '@models/api.model';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';
import { McResultsComponent } from './mc-results/mc-results.component';
import { McParametersComponent } from './mc-parameters/mc-parameters.component';
import { McSamplingComponent } from './mc-sampling/mc-sampling.component';
import { McScenariosComponent } from './mc-scenarios/mc-scenarios.component';

/**
 * Portfolio-weighted annual drag % from per-account load + fees. Decision:
 * both load and fees are recurring — treated identically, just separate lines
 * for reporting clarity in the Settings UI.
 */
function weightedAccountDragPct(f: FinancialSettings): number {
  const rows: [number, number, number][] = [
    [Number(f.traditionalBalance) || 0, Number(f.traditionalLoadPct) || 0, Number(f.traditionalFeesPct) || 0],
    [Number(f.rothBalance)        || 0, Number(f.rothLoadPct)        || 0, Number(f.rothFeesPct)        || 0],
    [Number(f.taxableBalance)     || 0, Number(f.taxableLoadPct)     || 0, Number(f.taxableFeesPct)     || 0],
    [Number(f.hsaBalance)         || 0, Number(f.hsaLoadPct)         || 0, Number(f.hsaFeesPct)         || 0],
  ];
  const total = rows.reduce((s, [b]) => s + b, 0);
  if (total <= 0) return 0;
  return rows.reduce((s, [b, l, fe]) => s + (b / total) * (l + fe), 0);
}

/**
 * Monthly SS benefit adjusted for claim age. Mirrors the same helper in
 * ss-screen.component.ts:estimateBenefit so the two screens agree.
 */
function estimateBenefitAtClaim(m: HouseholdMember): number {
  const pia = Number(m.ssPia) || 0;
  if (!pia || !m.ssFra || !m.ssClaimAge) return 0;
  const diff = m.ssClaimAge - m.ssFra;
  if (diff === 0) return pia;
  if (diff > 0) return Math.round(pia * (1 + diff * 0.08));
  const yearsEarly = Math.abs(diff);
  const reduction = yearsEarly <= 3
    ? yearsEarly * 0.0667
    : 3 * 0.0667 + (yearsEarly - 3) * 0.05;
  return Math.round(pia * (1 - reduction));
}

/**
 * Monte Carlo screen — thin orchestrator after Phase 2c.
 *
 * Lifecycle responsibilities only: bootstraps the API loads (financial,
 * withdrawal, household) and seeds the corresponding state signals on
 * MonteCarloStateService. All input UI is delegated to sub-components
 * (mc-parameters / mc-sampling / mc-scenarios), all output UI to
 * mc-results, and the simulation kernel orchestration to
 * MonteCarloRunnerService. Both services are component-scoped so each
 * screen visit starts fresh.
 *
 * Final shape of audit follow-up #1 (god-component split). Phase 0 was
 * a 2,167-LOC class with inline template; this file is now under 100.
 */
@Component({
  selector: 'app-montecarlo-screen',
  standalone: true,
  imports: [MatButtonModule, SourceTooltipComponent, McResultsComponent, McParametersComponent, McSamplingComponent, McScenariosComponent],
  templateUrl: './montecarlo-screen.component.html',
  styleUrls: ['./montecarlo-screen.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [MonteCarloStateService, MonteCarloRunnerService],
})
export class MontecarloScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly loc = inject(LocationService);
  private readonly healthcare = inject(HealthcareService);
  private readonly currency = inject(CurrencyFormatService);
  protected readonly dyscalculia = inject(DyscalculiaService);
  protected readonly state = inject(MonteCarloStateService);
  protected readonly runner = inject(MonteCarloRunnerService);

  /** Toggles the loading / not-configured / ready template branches.
   *  Cleared once the financial settings fetch completes. */
  protected readonly loading = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.healthcare.load();
    this.loc.loadFull();

    this.api.getFinancial().subscribe({
      next: (f) => {
        this.state.fin.set(f);
        this.state.portfolio.set(f.portfolioBalance ?? 0);
        if (typeof f.expectedReturn === 'number') {
          const drag = weightedAccountDragPct(f);
          this.state.meanReturn.set(+(f.expectedReturn - drag).toFixed(2));
        }
        if (typeof f.expectedInflation === 'number') this.state.meanInflation.set(f.expectedInflation);
        if (f.fxDriftEnabled && typeof f.fxDriftAnnualRate === 'number') {
          this.state.fxDrift.set(f.fxDriftAnnualRate);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.api.getWithdrawal().subscribe({
      next: (w) => { this.state.wd.set(w); },
      error: (err) => console.warn('MC: withdrawal strategy fetch failed.', err),
    });

    this.api.getHousehold().subscribe({
      next: (h) => {
        this.state.household.set(h);
        const ssSum = (h.members ?? []).reduce(
          (s, m) => s + estimateBenefitAtClaim(m),
          0,
        );
        if (ssSum > 0) this.state.ssMonthly.set(Math.round(ssSum));
      },
      error: (err) => console.warn('MC: household fetch failed.', err),
    });
  }

  /** Template adapter for currency formatting. Used by the SS summary
   *  card; sub-components inject CurrencyFormatService directly. */
  protected fmt(amount: number, unit: '/mo' | '/yr' | '' = '/mo'): string {
    if (unit === '/yr') return this.currency.currencyYearly(amount);
    if (unit === '/mo') return this.currency.currencyMonthly(amount);
    return this.currency.currency(amount);
  }
}
