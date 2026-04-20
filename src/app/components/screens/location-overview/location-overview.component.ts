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
  template: `
    <div class="overview">

      <!-- Filter bar with dropdowns -->
      <div class="filter-bar">
        <select class="filter-select"
          [value]="loc.countryFilter() ?? ''"
          (change)="loc.countryFilter.set($any($event.target).value || null)"
          aria-label="Filter by country">
          <option value="">All Countries</option>
          @for (c of loc.countries(); track c) {
            <option [value]="c">{{ c }}</option>
          }
        </select>

        <select class="filter-select"
          [value]="loc.regionFilter() ?? ''"
          (change)="loc.regionFilter.set($any($event.target).value || null)"
          aria-label="Filter by region">
          <option value="">All Regions</option>
          @for (r of filteredRegions(); track r) {
            <option [value]="r">{{ r }}</option>
          }
        </select>

        <select class="filter-select"
          [value]="loc.sortBy()"
          (change)="loc.sortBy.set($any($event.target).value)"
          aria-label="Sort by">
          <option value="monthlyCostTotal">Sort by Cost</option>
          <option value="name">Sort by Name</option>
          <option value="country">Sort by Country</option>
        </select>

        <button mat-stroked-button
          (click)="loc.sortDir.set(loc.sortDir() === 'asc' ? 'desc' : 'asc')"
          class="sort-btn"
          [attr.aria-label]="'Sort ' + (loc.sortDir() === 'asc' ? 'descending' : 'ascending')">
          {{ loc.sortDir() === 'asc' ? '↑ Low–High' : '↓ High–Low' }}
        </button>

        <input type="text"
          class="search-input"
          placeholder="Search..."
          [value]="loc.searchTerm()"
          (input)="loc.searchTerm.set($any($event.target).value)"
          aria-label="Search locations" />

        @if (loc.searchTerm() || loc.countryFilter() || loc.regionFilter()) {
          <button mat-button (click)="clearAll()" class="clear-btn">
            Clear
          </button>
        }
      </div>

      <!-- Selection controls + summary -->
      <div class="selection-bar">
        <div class="selection-controls">
          <label class="select-all-label">
            <input type="checkbox"
              [checked]="allVisibleSelected()"
              [indeterminate]="someVisibleSelected() && !allVisibleSelected()"
              (change)="toggleSelectAll()"
              aria-label="Select all visible locations" />
            <span>Select All</span>
          </label>
          @if (loc.selectedIds().size > 0) {
            <span class="selection-count">
              {{ loc.selectedIds().size }} selected
            </span>
            <button mat-button class="clear-btn" (click)="loc.deselectAll()">
              Clear selection
            </button>
          }
        </div>

        <div class="stats-row">
          <span class="stat-pill">
            {{ loc.locationCount() }}
            <span class="stat-label">
              {{ loc.locationCount() === loc.totalCount() ? 'locations' : 'of ' + loc.totalCount() }}
            </span>
          </span>
          @if (loc.cheapest(); as cheap) {
            <span class="stat-pill cheapest">
              {{ dyscalculia.isEnabled()
                ? dyscalculia.formatCurrency(cheap.monthlyCostTotal)
                : '$' + cheap.monthlyCostTotal.toLocaleString() + '/mo' }}
              <span class="stat-label">cheapest</span>
            </span>
          }
        </div>
      </div>

      <!-- Loading / Error -->
      @if (loc.loading()) {
        <div class="status-msg">Loading locations...</div>
      }
      @if (loc.error(); as err) {
        <div class="status-msg error">{{ err }}</div>
      }

      <!-- Location list with checkboxes -->
      <div class="location-list" role="list">
        @for (location of loc.filteredLocations(); track location.id) {
          <label class="location-row" role="listitem"
            [class.checked]="loc.selectedIds().has(location.id)">
            <input type="checkbox"
              [checked]="loc.selectedIds().has(location.id)"
              (change)="loc.toggleLocation(location.id)"
              [attr.aria-label]="'Select ' + location.name" />
            <span class="row-name">{{ location.name }}</span>
            <span class="row-meta">{{ location.country }} · {{ location.region }}@if (location.subregion) { · {{ location.subregion }} }</span>
            <span class="row-cost"
              [class]="dyscalculia.numberSpacingClass()">
              {{ dyscalculia.isEnabled()
                ? dyscalculia.formatCurrency(location.monthlyCostTotal)
                : '$' + location.monthlyCostTotal.toLocaleString() + '/mo' }}
            </span>
            <button class="row-detail-btn" mat-button
              (click)="viewDetail($event, location.id)"
              aria-label="View details">
              →
            </button>
          </label>
        } @empty {
          @if (!loc.loading()) {
            <div class="empty-state">
              No locations match your filters.
              <button mat-button (click)="clearAll()">Clear filters</button>
            </div>
          }
        }
      </div>

      @if (dyscalculia.isEnabled() && dyscalculia.settings().magnitudeAnchors && loc.cheapest(); as cheap) {
        <div class="anchor-note">
          {{ dyscalculia.getMagnitudeAnchor(cheap.monthlyCostTotal) }}
        </div>
      }

      <!-- Converged totals (VAT on taxable categories + bracket-based income tax) -->
      @if (tax.convergedTotals().length) {
        <div class="converged-card">
          <div class="converged-head">
            <h3 class="converged-title">💰 Converged Monthly Totals (tax-adjusted)</h3>
            <span class="converged-sub">
              VAT + social charges on taxable categories; federal + state income tax when brackets available.
            </span>
          </div>
          <div class="converged-rows">
            @for (r of tax.convergedTotals(); track r.id) {
              <div class="converged-row">
                <span class="cr-name">{{ r.name }}</span>
                <span class="cr-country">{{ r.country }}</span>
                <span class="cr-total" [class]="dyscalculia.numberSpacingClass()">
                  {{ fmtCost(r.total) }}
                </span>
                <span class="cr-tax" [class]="dyscalculia.numberSpacingClass()"
                      [title]="'Tax source: ' + r.incomeTaxSource">
                  tax {{ fmtTaxCents(r.tax) }}
                </span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .overview { display: flex; flex-direction: column; gap: 12px; }

    /* ─── Filter bar ───────────────────────────── */
    .filter-bar {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .filter-select {
      padding: 7px 10px;
      border-radius: 6px;
      border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary);
      color: var(--dark-text);
      font-size: 12px;
      font-family: var(--font-sans);
      cursor: pointer;
      min-width: 130px;
      &:focus { border-color: var(--dark-blue); outline: none; }
    }
    .search-input {
      flex: 1;
      min-width: 120px;
      padding: 7px 10px;
      border-radius: 6px;
      border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary);
      color: var(--dark-text);
      font-size: 12px;
      font-family: var(--font-sans);
      outline: none;
      &:focus { border-color: var(--dark-blue); }
    }
    .sort-btn {
      --mat-button-outlined-container-height: 32px;
      --mat-button-outlined-label-text-size: 11px;
      --mat-button-outlined-outline-color: var(--dark-border);
      --mat-button-outlined-label-text-color: var(--dark-text-sec);
    }
    .clear-btn {
      --mat-button-text-label-text-size: 11px;
      --mat-button-text-label-text-color: var(--dark-blue);
    }

    /* ─── Selection bar ────────────────────────── */
    .selection-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid var(--dark-border);
    }
    .selection-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .select-all-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--dark-text-sec);
      cursor: pointer;
      input[type="checkbox"] {
        width: 15px;
        height: 15px;
        accent-color: var(--dark-amber);
        cursor: pointer;
      }
    }
    .selection-count {
      font-size: 11px;
      color: var(--dark-amber);
      font-weight: 600;
    }
    .stats-row {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .stat-pill {
      font-size: 13px;
      font-weight: 700;
      color: var(--dark-amber);
      display: flex;
      align-items: baseline;
      gap: 4px;
    }
    .stat-pill.cheapest { color: var(--dark-green); }
    .stat-label {
      font-size: 10px;
      font-weight: 400;
      color: var(--dark-text-muted);
    }

    /* ─── Location list ────────────────────────── */
    .location-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .location-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: var(--dark-bg-card);
      border: 1px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.12s ease;
      font-family: var(--font-sans);
      &:hover {
        border-color: var(--dark-border);
        background: var(--dark-bg-secondary);
      }
      &.checked {
        border-color: var(--dark-amber);
        background: rgba(212, 148, 58, 0.06);
      }
      input[type="checkbox"] {
        width: 15px;
        height: 15px;
        accent-color: var(--dark-amber);
        cursor: pointer;
        flex-shrink: 0;
      }
    }
    .row-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--dark-text);
      min-width: 140px;
    }
    .row-meta {
      font-size: 11px;
      color: var(--dark-text-muted);
      flex: 1;
    }
    .row-cost {
      font-size: 13px;
      font-weight: 700;
      color: var(--dark-amber);
      white-space: nowrap;
      min-width: 90px;
      text-align: right;
    }
    .row-detail-btn {
      --mat-button-text-label-text-size: 14px;
      --mat-button-text-label-text-color: var(--dark-text-muted);
      min-width: 32px;
      padding: 0;
    }

    .status-msg {
      padding: 20px;
      text-align: center;
      color: var(--dark-text-sec);
      font-size: 13px;
      &.error { color: var(--dark-red); }
    }
    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--dark-text-muted);
      font-size: 13px;
    }
    .anchor-note {
      font-size: 9px;
      color: var(--dark-purple);
      font-style: italic;
      text-align: center;
      padding: 8px 0;
    }
    .converged-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px;
    }
    .converged-head { display: flex; flex-direction: column; gap: 2px; }
    .converged-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--dark-text); }
    .converged-sub { font-size: 10px; color: var(--dark-text-muted); }
    .converged-rows { display: flex; flex-direction: column; gap: 4px; }
    .converged-row {
      display: grid; grid-template-columns: 1.8fr 1fr 1fr 1fr; gap: 10px; align-items: baseline;
      padding: 6px 8px; border-radius: 6px; background: var(--dark-bg-secondary);
    }
    .cr-name { font-size: 13px; color: var(--dark-text); font-weight: 500; }
    .cr-country { font-size: 11px; color: var(--dark-text-muted); }
    .cr-total { font-size: 14px; font-weight: 700; color: var(--dark-amber); text-align: right; font-variant-numeric: tabular-nums; }
    .cr-tax { font-size: 11px; color: var(--dark-text-sec); text-align: right; font-variant-numeric: tabular-nums; }
  `],
})
export class LocationOverviewComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly tax = inject(TaxService);
  readonly dyscalculia = inject(DyscalculiaService);

  /** Regions filtered by selected country */
  readonly filteredRegions = computed(() => {
    const country = this.loc.countryFilter();
    if (!country) return this.loc.regions();
    const locs = this.loc.locations().filter(l => l.country === country);
    return [...new Set(locs.map(l => l.region))].sort();
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
