import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { BrokerageFees, FxProvider } from '@models/api.model';
import { debounceTime, Subject } from 'rxjs';

@Component({
  selector: 'app-fees-screen',
  standalone: true,
  imports: [FormsModule, NumericInputDirective],
  templateUrl: './fees-screen.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./fees-screen.component.scss'],
})
export class FeesScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly locService = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly currency = inject(CurrencyFormatService);

  readonly loading = signal(false);
  readonly saved = signal(false);
  readonly fees = signal<BrokerageFees | null>(null);
  readonly calcAmount = signal(3000);

  private readonly save$ = new Subject<Partial<BrokerageFees>>();

  readonly selectedCityName = computed(() => this.locService.selectedLocation()?.name ?? null);

  readonly localCurrency = computed(() => {
    const f = this.fees();
    if (f && f.localCurrency !== 'USD') return f.localCurrency;
    const loc = this.locService.selectedLocation();
    return loc?.currency ?? f?.localCurrency ?? 'USD';
  });

  readonly exchangeRate = computed(() => this.rateResolution().rate);

  /** Source of the currently-displayed exchange rate. Used by the UI to
   *  distinguish a genuine looked-up rate from the 1.0 fallback. */
  readonly rateSource = computed(() => this.rateResolution().source);

  /** Resolves `exchangeRate` + where it came from. Priority:
   *   1. Manual override set on the user's fees record.
   *   2. The actively-selected location's rate, if its currency matches
   *      the local-currency code shown on this screen.
   *   3. Any checked location carrying that currency (fall back across the
   *      selection when the user typed a code without clicking a city).
   *   4. The selected location's rate, as a last-ditch match on detail.
   *   5. 1.0 — flagged as `'default'` so the UI can warn the user. */
  private readonly rateResolution = computed<{ rate: number; source: 'manual' | 'selected' | 'selection-match' | 'selected-raw' | 'default' }>(() => {
    const f = this.fees();
    if (f?.manualExchangeRate) return { rate: f.manualExchangeRate, source: 'manual' };

    const cur = this.localCurrency();
    const activeLoc = this.locService.selectedLocation();
    if (activeLoc?.currency === cur && activeLoc.exchangeRate) {
      return { rate: activeLoc.exchangeRate, source: 'selected' };
    }

    // Cross-reference the user's multi-selected full locations. If any of
    // them has the currency the user typed, use that rate.
    for (const l of this.locService.selectedFullLocations()) {
      if (l.currency === cur && l.exchangeRate) {
        return { rate: l.exchangeRate, source: 'selection-match' };
      }
    }

    // Last resort: fall back to the active location's rate even if its
    // currency doesn't match the typed code. Better than 1.0 for the "I
    // just arrived at this screen" case.
    if (activeLoc?.exchangeRate) {
      return { rate: activeLoc.exchangeRate, source: 'selected-raw' };
    }
    return { rate: 1, source: 'default' };
  });

  /** Every distinct non-USD currency across the user's selected locations.
   *  Drives the "Other currencies you'd cross into" chips so a user with
   *  Portugal + Mexico selected sees both EUR and MXN, not just the
   *  primary-location currency. Sorted alphabetically for stable output. */
  readonly selectedCurrencies = computed(() => {
    const rows = new Map<string, number>();
    for (const loc of this.locService.selectedFullLocations()) {
      const code = loc.currency ?? 'USD';
      if (code === 'USD') continue;
      const rate = loc.exchangeRate ?? 1;
      if (!rows.has(code)) rows.set(code, rate);
    }
    return [...rows.entries()]
      .map(([code, rate]) => ({ code, rate }))
      .sort((a, b) => a.code.localeCompare(b.code));
  });

  readonly manualExchangeRate = computed(() => this.fees()?.manualExchangeRate ?? null);

  readonly calcWireFee = computed(() => (this.fees()?.wireTransferFeeUsd ?? 25));

  readonly calcFxSpreadCost = computed(() => {
    const amount = this.calcAmount();
    const spread = (this.fees()?.fxSpreadPct ?? 1) / 100;
    return amount * spread;
  });

  readonly calcFxFixedFee = computed(() => this.fees()?.fxFixedFee ?? 0);

  readonly calcTotalFees = computed(() =>
    this.calcWireFee() + this.calcFxSpreadCost() + this.calcFxFixedFee()
  );

  readonly calcTotalFeePct = computed(() => {
    const amt = this.calcAmount();
    return amt > 0 ? (this.calcTotalFees() / amt) * 100 : 0;
  });

  readonly calcEffectiveRate = computed(() => {
    const amt = this.calcAmount();
    const net = amt - this.calcTotalFees();
    const rate = this.exchangeRate();
    return net > 0 ? (net * rate) / amt : 0;
  });

  readonly calcNetLocal = computed(() => {
    const amt = this.calcAmount();
    const net = amt - this.calcTotalFees();
    return net * this.exchangeRate();
  });

  readonly calcAnnualBrokerage = computed(() => {
    const f = this.fees();
    if (!f) return 0;
    return f.brokerageAnnualFee + (f.brokerageExpenseRatio / 100) * (this.calcAmount() * 12);
  });

  readonly calcAnnualTotal = computed(() =>
    (this.calcWireFee() + this.calcFxSpreadCost() + this.calcFxFixedFee()) * 12 + this.calcAnnualBrokerage()
  );

  ngOnInit(): void {
    // Fees screen cross-references selectedFullLocations for its exchange-rate
    // resolution (matches typed currency code against selected-location rates),
    // so ensure the full locations are loaded even if the user hasn't visited
    // a screen that loads them yet.
    this.locService.loadFull();

    this.loading.set(true);
    this.api.getFees().subscribe({
      next: (f) => { this.fees.set(f); this.loading.set(false); },
      error: () => this.loading.set(false),
    });

    this.save$.pipe(debounceTime(1500)).subscribe((patch) => {
      this.api.updateFees(patch).subscribe({
        next: (updated) => {
          this.fees.set(updated);
          this.saved.set(true);
          setTimeout(() => this.saved.set(false), 2000);
        },
      });
    });
  }

  updateField(field: string, value: unknown): void {
    const current = this.fees();
    if (!current) return;
    const updated = { ...current, [field]: value } as BrokerageFees;
    this.fees.set(updated);
    this.save$.next({ [field]: value } as Partial<BrokerageFees>);
  }

  fmtUsd(amount: number): string { return this.currency.currencyPrecise(amount); }

  fmtLocal(amount: number): string {
    const cur = this.localCurrency();
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur;
  }
}