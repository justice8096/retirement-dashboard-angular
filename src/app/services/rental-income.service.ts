import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, tap, catchError } from 'rxjs';
import { ApiService } from '@services/api.service';
import {
  RentalProperty,
  RentalAggregate,
  aggregateRentalIncome,
  defaultRentalProperty,
} from '@app/lib/rental-income';

/**
 * Persistent state for the rental-property portfolio (Todos #29 + #36).
 *
 * Mirrors the pattern of `HealthcareService.income` — root-provided
 * singleton, signals for state — but ALSO round-trips through the
 * retirement-api `user_financial_settings.rental_properties` JSONB
 * column (added in api PR #92).
 *
 * Aggregates are exposed as computeds so the Assumptions screen can show
 * live cash flow / Schedule E taxable net at the user's reference year.
 */
@Injectable({ providedIn: 'root' })
export class RentalIncomeService {
  private readonly api = inject(ApiService);

  /** Portfolio of rental properties owned by the household. */
  readonly properties = signal<RentalProperty[]>([]);

  /** True after `load()` has settled (success or failure). Prevents
   *  redundant fetches across multiple screen visits. */
  readonly loaded = signal(false);

  /** Marks the portfolio as having unsaved edits. Cleared after save(). */
  readonly dirty = signal(false);

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
    this.dirty.set(true);
    return row.id;
  }

  /** Patch a single field (or several) on a property by id. */
  patch(id: string, partial: Partial<RentalProperty>): void {
    this.properties.update(list =>
      list.map(p => (p.id === id ? { ...p, ...partial } : p)),
    );
    this.dirty.set(true);
  }

  /** Remove a property by id. */
  remove(id: string): void {
    this.properties.update(list => list.filter(p => p.id !== id));
    this.dirty.set(true);
  }

  /** Clear all properties (useful for tests / scenario resets). */
  clear(): void {
    this.properties.set([]);
    this.dirty.set(true);
  }

  /**
   * One-shot fetch from the retirement-api financial endpoint. Hydrates
   * `properties` from `FinancialSettings.rentalProperties` (added in api
   * PR #92). Idempotent — subsequent calls are no-ops once `loaded()` is
   * true. Failures (network, 401) leave the service with an empty
   * portfolio and a console warning; downstream surfaces continue to
   * work in session-only mode.
   *
   * Call from screen `ngOnInit` (mirrors the `HealthcareService.load()`
   * lazy-fetch pattern).
   */
  load(): void {
    if (this.loaded()) return;
    this.api.getFinancial()
      .pipe(
        tap(f => {
          // Defensive: api should always return an array, but guard
          // against a deployment-skew window where the column doesn't
          // exist yet (pre-#92 deploy).
          const props = Array.isArray(f.rentalProperties) ? f.rentalProperties : [];
          this.properties.set(props);
          this.loaded.set(true);
          this.dirty.set(false);
        }),
        catchError(err => {
          console.warn('RentalIncomeService: load failed; portfolio reset to empty.', err);
          this.loaded.set(true);
          return of(null);
        }),
      )
      .subscribe();
  }

  /**
   * Persist the current portfolio via `PUT /me/financial`. Returns an
   * observable so callers can chain (e.g. forkJoin with a household save
   * on the Assumptions screen Save button). On success, clears `dirty`.
   */
  save(): Observable<unknown> {
    const payload = { rentalProperties: this.properties() };
    return this.api.updateFinancial(payload).pipe(
      tap(() => this.dirty.set(false)),
    );
  }
}
