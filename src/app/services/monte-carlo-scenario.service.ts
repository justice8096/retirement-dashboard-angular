import { Injectable, inject } from '@angular/core';
import { DyscalculiaService } from '@services/dyscalculia.service';
import type { MonteCarloResult } from '@app/lib/monte-carlo';

/**
 * Snapshot of every Monte Carlo input the UI captures at save time. Mirrors
 * the param fields that drive a sim run, so a future load/apply flow can
 * rebuild the screen state from a saved scenario without ambiguity.
 */
export interface MonteCarloScenarioParams {
  location: { id: string; name: string | undefined };
  portfolio: number;
  ssMonthly: number;
  monthlyIncome: number;
  partTimeMonthlyIncome: number;
  partTimeEndYear: number;
  meanReturn: number;
  volatility: number;
  meanInflation: number;
  inflVol: number;
  currVol: number;
  fxDrift: number;
  incGrowth: number;
  returnMode: string;
  historicalStartYear: number;
  apportionStrategy: string;
  magiAnnual: number;
  subsidyRegime: string;
  transitionExtraIncome: number;
  movesEnabled: boolean;
  moves: unknown;
  oneTimeExpensesEnabled: boolean;
  oneTimeExpenses: unknown;
  ltcMode: string;
  ltcProbability: number;
  ltcCostPerYearUSD: number;
  ltcDurationYears: number;
  ltcStartAgeMin: number;
  ltcStartAgeMax: number;
  ltcInsuranceMonthly: number;
  ltcInsuranceStartAge: number;
  fxShockEnabled: boolean;
  fxShockYear: number;
  fxShockPct: number;
  spouseDeathEnabled: boolean;
  spouseDeathYear: number;
  survivorCostRatio: number;
  survivorStepUpTaxableBalance: number;
  survivorStepUpGainRatio: number;
  survivorStepUpLtcgRate: number;
}

/**
 * Builds the canonical `monte_carlo_v1` scenario envelope the backend
 * validates. Owning the envelope shape here (vs the MC component) keeps
 * the version constant + summary-stat layout in one place — useful when
 * we add load/apply later.
 */
@Injectable({ providedIn: 'root' })
export class MonteCarloScenarioService {
  private readonly dyscalculia = inject(DyscalculiaService);

  buildPayload(result: MonteCarloResult, runs: number, years: number, params: MonteCarloScenarioParams) {
    return {
      kind: 'monte_carlo_v1' as const,
      successRate: {
        value: result.successRate,
        naturalFrequency: this.dyscalculia.naturalFrequency(result.successRate),
      },
      percentiles: {
        p5:  { value: result.p5,     currency: 'USD' },
        p25: { value: result.p25,    currency: 'USD' },
        p50: { value: result.median, currency: 'USD' },
        p75: { value: result.p75,    currency: 'USD' },
        p95: { value: result.p95,    currency: 'USD' },
      },
      runs,
      years,
      params,
      savedAt: new Date().toISOString(),
    };
  }
}
