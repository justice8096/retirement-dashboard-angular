import { Component, inject, computed, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { GroceriesService } from '@services/groceries.service';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { GroceryWorkingItem } from '@models/api.model';

/**
 * Per-item grocery overrides + saved shopping lists (A4 parity port #3),
 * replacing the previous 11-line read-only wrapper around the generic
 * `CostDetailComponent`. Ports the retired React `GroceriesTab` behavior:
 * enable/disable an item, override its cost and quantity, save/load named
 * shopping lists — backed by `/api/me/groceries` via `GroceriesService`.
 *
 * Follows the `NeighborhoodsScreenComponent` pattern for browsing
 * per-location supplement data: a row of tabs built from the user's
 * checked locations (Overview screen), one active at a time. Unlike
 * neighborhoods, the override *data* is not location-scoped (matches both
 * the retired React app and the API's flat `overrides` column) — only the
 * item *catalog* (names/baseline prices) changes when you switch tabs.
 */
@Component({
  selector: 'app-groceries-screen',
  standalone: true,
  imports: [FormsModule, DatePipe, MatButtonModule, NumericInputDirective],
  templateUrl: './groceries-screen.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./groceries-screen.component.scss'],
})
export class GroceriesScreenComponent implements OnInit, OnDestroy {
  readonly loc = inject(LocationService);
  readonly groceries = inject(GroceriesService);
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly nav = inject(NavigationService);

  readonly selectedCities = computed(() => {
    const ids = this.loc.selectedIds();
    return this.loc.fullLocations().filter(l => ids.has(l.id));
  });

  readonly activeLoc = computed(() =>
    this.loc.fullLocations().find(l => l.id === this.groceries.activeLocationId()) ?? null,
  );

  ngOnInit(): void {
    this.loc.loadFull();
    this.groceries.load();
    const cities = this.selectedCities();
    if (cities.length && !this.groceries.activeLocationId()) {
      this.groceries.setActiveLocation(cities[0].id);
    }
  }

  /** Flushes any debounced save immediately so navigating away right after
   *  an edit never drops it — the service otherwise waits up to 3s. */
  ngOnDestroy(): void {
    this.groceries.flush();
  }

  selectCity(id: string): void {
    this.groceries.setActiveLocation(id);
  }

  goToOverview(): void {
    this.nav.selectScreen('overview');
    this.nav.selectCategory('locations');
  }

  toggleItem(item: GroceryWorkingItem): void {
    this.groceries.toggleItem(item.key);
  }

  updateQuantity(item: GroceryWorkingItem, value: number): void {
    this.groceries.updateQuantity(item.key, Number.isFinite(value) ? value : 0);
  }

  updateCost(item: GroceryWorkingItem, value: number): void {
    this.groceries.updateCost(item.key, Number.isFinite(value) ? value : 0);
  }

  saveCurrentList(): void {
    const suggested = `List ${new Date().toLocaleDateString()}`;
    const name = window.prompt('Name this shopping list:', suggested);
    if (!name?.trim()) return;
    this.groceries.saveCurrentAsList(name.trim());
  }

  renameList(id: string, currentName: string): void {
    const name = window.prompt('Rename this shopping list:', currentName);
    if (!name?.trim() || name.trim() === currentName) return;
    this.groceries.renameList(id, name.trim());
  }

  loadList(id: string): void {
    this.groceries.applyList(id);
  }

  deleteList(id: string): void {
    this.groceries.deleteList(id);
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + Math.round(amount).toLocaleString();
  }
}
