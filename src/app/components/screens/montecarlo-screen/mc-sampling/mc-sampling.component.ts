import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { HISTORICAL_PRESETS, statsForRange } from '@app/data/historical-returns';

/**
 * Monte Carlo "Historical & Cycles" sub-component. Owns the sampling-mode
 * card: returnMode toggle (normal / bootstrap / regime / historical-sequence),
 * historical-preset selector, regime parameters (bull/bear means + vols +
 * Markov transition probabilities), and the historical-start-year selector
 * for the deterministic backtest mode.
 *
 * applyPreset moved here from the parent — it mutates 4 state signals
 * (meanReturn, volatility, meanInflation, inflVol) but the integration
 * point IS the state service, so this is a sub-component reaching into
 * the shared state, not into another component.
 *
 * Phase 2b of the god-component split (audit follow-up #1).
 */
@Component({
  selector: 'app-mc-sampling',
  standalone: true,
  imports: [FormsModule, NumericInputDirective],
  templateUrl: './mc-sampling.component.html',
  styleUrls: ['./mc-sampling.component.scss'],
})
export class McSamplingComponent {
  protected readonly state = inject(MonteCarloStateService);

  /** Snap mean/vol params to a named historical period. */
  protected applyPreset(presetId: string): void {
    this.state.selectedPresetId.set(presetId);
    const preset = HISTORICAL_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    const s = statsForRange(preset.startYear, preset.endYear);
    this.state.meanReturn.set(+(s.meanReturn * 100).toFixed(2));
    this.state.volatility.set(+(s.volReturn * 100).toFixed(2));
    this.state.meanInflation.set(+(s.meanInflation * 100).toFixed(2));
    this.state.inflVol.set(+(s.volInflation * 100).toFixed(2));
  }
}
