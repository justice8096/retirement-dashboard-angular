import { Component, inject, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NavigationService } from '@services/navigation.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { CostDetailComponent } from '../cost-detail/cost-detail.component';

/** One row of the "Adjust Rent" editor — a selected location's effective
 *  (possibly overridden) rent plus its catalog default, for the reset
 *  affordance and the "Custom" indicator. */
interface RentRow {
  id: string;
  name: string;
  value: number;
  defaultValue: number;
  isOverridden: boolean;
}

/**
 * Housing screen (A4 parity port #5), replacing the previous 1-line
 * wrapper around the generic `CostDetailComponent` — same precedent as the
 * groceries port. Adds an editable rent override per selected location,
 * on top of the shared cost-comparison chart/stats `CostDetailComponent`
 * still provides.
 *
 * Ports the retired React `HousingTab`'s `setBaseOverride` mechanism:
 * overriding `monthlyCosts.rent.typical` on the canonical location object
 * itself (see `LocationService.fullLocations`) so every existing
 * downstream reader — the comparison chart below, location-compare,
 * report-screen, and `MonteCarloStateService.baseCost` — reflects the
 * override with no extra wiring, exactly as React's single Zustand store
 * did. React presented one active location at a time; this screen (like
 * the rest of the Angular dashboard) presents every checked location, so
 * the editor is one row per selected location instead of one editor for
 * "the" location.
 *
 * Persistence mirrors React's: `LocationService` debounce-saves each edit
 * to `/api/me/locations/overrides` (the same generic endpoint the retired
 * `useApiSync` used for `baseLocationOverrides`), falling back to
 * session-only state for anonymous users or on a failed request.
 */
@Component({
  selector: 'app-housing-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective, CostDetailComponent],
  templateUrl: './housing-screen.component.html',
  styleUrls: ['./housing-screen.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class HousingScreenComponent implements OnInit, OnDestroy {
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly nav = inject(NavigationService);

  readonly rows = computed<RentRow[]>(() => {
    const overrides = this.loc.rentOverrides();
    return this.loc.selectedFullLocations().map(l => ({
      id: l.id,
      name: l.name,
      value: l.monthlyCosts?.rent?.typical ?? 0,
      defaultValue: this.loc.catalogRent(l.id),
      isOverridden: l.id in overrides,
    }));
  });

  ngOnInit(): void {
    this.loc.loadFull();
    this.loc.loadRentOverrides();
  }

  /** Flushes any debounced override saves immediately so navigating away
   *  right after an edit never drops it (mirrors GroceriesService). */
  ngOnDestroy(): void {
    this.loc.flushRentOverrides();
  }

  updateRent(locId: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.loc.setRentOverride(locId, value);
  }

  clearRent(locId: string): void {
    this.loc.clearRentOverride(locId);
  }

  goToOverview(): void {
    this.nav.selectScreen('overview');
    this.nav.selectCategory('locations');
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + Math.round(amount).toLocaleString();
  }
}
