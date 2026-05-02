import { Injectable, computed, signal } from '@angular/core';
import {
  RentalProperty,
  RentalAggregate,
  aggregateRentalIncome,
  defaultRentalProperty,
} from '@app/lib/rental-income';

/**
 * Session-only state for the rental-property portfolio (Todo #29 Stage 2).
 *
 * Mirrors the pattern of `HealthcareService.income` — root-provided
 * singleton, signals only, no backend persistence in v1. Extending the
 * Stage 6 backend payload (a new `FinancialSettings.rentalProperties`
 * field plus Prisma migration) would make this durable across reloads.
 *
 * Aggregates are exposed as computeds so the Assumptions screen can show
 * live cash flow / Schedule E taxable net at the user's reference year.
 */
@Injectable({ providedIn: 'root' })
export class RentalIncomeService {
  /** Portfolio of rental properties owned by the household. */
  readonly properties = signal<RentalProperty[]>([]);

  /**
   * Reference sim-year used by the live aggregate computed below. Default
   * 0 = retirement-start year (i.e., year-1 ownership). Sankey + Stage 4b
   * kernel will compute their own per-year aggregates and ignore this.
   */
  readonly referenceYear = signal(0);

  /** Live aggregate for the reference year — drives the Assumptions UI panel. */
  readonly referenceAggregate = computed<RentalAggregate>(() =>
    aggregateRentalIncome(this.properties(), this.referenceYear()),
  );

  /** Add a new property row with sensible defaults. Returns the new id. */
  add(): string {
    const row = defaultRentalProperty();
    this.properties.update(list => [...list, row]);
    return row.id;
  }

  /** Patch a single field (or several) on a property by id. */
  patch(id: string, partial: Partial<RentalProperty>): void {
    this.properties.update(list =>
      list.map(p => (p.id === id ? { ...p, ...partial } : p)),
    );
  }

  /** Remove a property by id. */
  remove(id: string): void {
    this.properties.update(list => list.filter(p => p.id !== id));
  }

  /** Clear all properties (useful for tests / scenario resets). */
  clear(): void {
    this.properties.set([]);
  }
}
