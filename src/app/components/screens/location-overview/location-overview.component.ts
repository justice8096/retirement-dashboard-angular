import { Component, inject, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { DyscalculiaService } from '@services/dyscalculia.service';

@Component({
  selector: 'app-location-overview',
  standalone: true,
  imports: [FormsModule, MatButtonModule],
  templateUrl: './location-overview.component.html',
  styleUrls: ['./location-overview.component.scss'],
})
export class LocationOverviewComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly tax = inject(TaxService);
  readonly dyscalculia = inject(DyscalculiaService);

  /** Region-filter options. Breaks US macros (US Southeast, US Midwest,
   *  etc.) into their states via the locationService.displayRegion helper
   *  so the dropdown is browseable at state granularity for US users while
   *  non-US locations stay on their macro region. Applied after the
   *  country filter so picking country=United States gives a state list,
   *  country=Italy gives just "Southern Europe". */
  readonly filteredRegions = computed(() => {
    const country = this.loc.countryFilter();
    const locs = country
      ? this.loc.locations().filter(l => l.country === country)
      : this.loc.locations();
    return [...new Set(locs.map(l => this.loc.displayRegion(l)))].sort();
  });

  readonly allVisibleSelected = computed(() => {
    const visible = this.loc.filteredLocations();
    if (!visible.length) return false;
    const ids = this.loc.selectedIds();
    return visible.every(l => ids.has(l.id));
  });

  readonly someVisibleSelected = computed(() => {
    const visible = this.loc.filteredLocations();
    const ids = this.loc.selectedIds();
    return visible.some(l => ids.has(l.id));
  });

  ngOnInit(): void {
    if (!this.loc.locations().length) {
      this.loc.loadAll();
      this.loc.loadCountries();
      this.loc.loadRegions();
    }
  }

  toggleSelectAll(): void {
    if (this.allVisibleSelected()) {
      // Deselect only visible
      const visibleIds = new Set(this.loc.filteredLocations().map(l => l.id));
      this.loc.selectedIds.update(ids => {
        const next = new Set(ids);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      this.loc.selectAllVisible();
    }
  }

  viewDetail(event: Event, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.loc.selectLocation(id);
  }

  clearAll(): void {
    this.loc.clearFilters();
    this.loc.regionFilter.set(null);
  }

  fmtCost(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + Math.round(amount).toLocaleString() + '/mo';
  }

  /** Tax values show to cents precision in the convergence summary. */
  fmtTaxCents(amount: number): string {
    return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '/mo';
  }
}
