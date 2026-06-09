import { Component, inject, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';

@Component({
  selector: 'app-location-detail',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './location-detail.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./location-detail.component.scss'],
})
export class LocationDetailComponent {
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  /** Math is a class field rather than a service since the template
   *  references Math.abs in the FX stress delta. Angular templates can't
   *  call through to globals without a class binding. */
  protected readonly Math = Math;

  /** FX stress preset buttons (#26). Convention: positive = USD weakens
   *  (cost in USD rises), matching the kernel's `fxShockPct` semantics. */
  protected readonly fxPresets: ReadonlyArray<{ value: number; label: string }> = [
    { value: -20, label: '−20%' },
    { value: -10, label: '−10%' },
    { value: 0, label: 'Baseline' },
    { value: +10, label: '+10%' },
    { value: +20, label: '+20%' },
  ];

  /** Currently-selected FX shock magnitude in percent (signed). Defaults
   *  to 0 (no shock = baseline cost). Component-local state — does not
   *  persist across screen changes, doesn't feed the MC sim. The MC has
   *  its own FX-shock controls under "Stress Tests" in the MC screen. */
  protected readonly fxShockPct = signal(0);

  readonly breakdown = computed(() => {
    const location = this.loc.selectedLocation();
    return location ? this.loc.getCostBreakdown(location) : [];
  });

  readonly maxCost = computed(() => {
    const items = this.breakdown();
    return items.length ? Math.max(...items.map(i => i.value)) : 1;
  });

  readonly rangeData = computed(() => {
    const location = this.loc.selectedLocation();
    if (!location) return [];
    return this.loc.costCategories().map(cat => {
      const range = location.monthlyCosts[cat.key];
      return {
        label: cat.label,
        min: range?.min ?? 0,
        typical: range?.typical ?? 0,
        max: range?.max ?? 0,
      };
    });
  });

  /** True when the selected location's currency is non-USD. Drives the
   *  FX stress widget visibility — USD locations have no per-trial FX
   *  risk against a USD portfolio. */
  readonly isForeign = computed(() => {
    const l = this.loc.selectedLocation();
    return !!l && l.currency !== 'USD';
  });

  /** Monthly cost in USD after applying the current FX shock. Linear
   *  scale: shock × current total. Falls back to baseline when no
   *  location is selected. */
  readonly stressedMonthlyTotal = computed(() => {
    const baseline = this.loc.selectedLocation()?.monthlyCostTotal ?? 0;
    const shockMult = 1 + this.fxShockPct() / 100;
    return baseline * shockMult;
  });

  formatCost(amount: number): string {
    if (this.dyscalculia.isEnabled()) {
      return this.dyscalculia.formatCurrency(amount);
    }
    return '$' + Math.round(amount).toLocaleString();
  }
}
