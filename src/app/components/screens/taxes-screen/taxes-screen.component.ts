import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { ApiService } from '@services/api.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { HouseholdProfile } from '@models/api.model';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';
import { FED_BRACKETS_2026_SOURCES, FED_STD_DEDUCTION_2026_SOURCES } from '../../../lib/tax-sources';

@Component({
  selector: 'app-taxes-screen',
  standalone: true,
  imports: [FormsModule, NumericInputDirective, SourceTooltipComponent],
  template: `
    <div class="taxes-screen">
      <div class="screen-header">
        <span class="header-icon">🏛️</span>
        <div>
          <h2 class="header-title">Taxes by Location</h2>
          <p class="header-sub">Compare tax burden across retirement destinations</p>
        </div>
      </div>

      <!-- Annual income input drives income-tax computation -->
      <div class="income-bar">
        <label class="income-field">
          <span class="income-label">Annual Income (for tax calc)</span>
          <input appNumeric="currency" class="income-input" step="1000"
            [class]="dyscalculia.numberSpacingClass()"
            [ngModel]="annualIncome()" (ngModelChange)="annualIncome.set(+$event)" />
          @if (dyscalculia.isEnabled()) {
            <span class="income-magnitude" [class]="dyscalculia.numberSpacingClass()">
              {{ dyscalculia.formatCurrency(annualIncome(), '/yr') }}
              · {{ dyscalculia.formatCurrency(annualIncome() / 12, '/mo') }}
              · {{ dyscalculia.getAnchor(annualIncome(), 'withdrawal-year') }}
            </span>
          }
        </label>
        <span class="income-hint">
          Defaults from household target; edit to test scenarios. Income tax uses
          federal + state brackets where available.
        </span>
      </div>

      @if (!loc.selectedIds().size) {
        <div class="filter-banner">
          Showing all locations — pick some on the <strong>Locations → Overview</strong> tab to narrow this view.
        </div>
      }

      @if (loc.loading()) {
        <div class="status-msg">Loading location data…</div>
      } @else if (!taxData().length) {
        <div class="status-msg">No locations match. Load or select locations first.</div>
      } @else {
        <div class="tax-grid">
          @for (item of taxData(); track item.name) {
            <div class="tax-card" (click)="loc.selectLocation(item.id)">
              <div class="tax-header">
                <span class="tax-name">{{ item.name }}</span>
                <span class="tax-country">
                  {{ item.country }}
                  <app-source-tooltip [sources]="item.taxSources"
                                       [label]="item.country + ' tax sources'" />
                </span>
              </div>
              <div class="tax-body">
                <div class="tax-row">
                  <span class="tax-label">
                    Monthly Tax Estimate
                    <span class="src-badge" [class]="'src-' + item.source"
                          [title]="sourceTitle(item.source)">
                      {{ sourceLabel(item.source) }}
                    </span>
                  </span>
                  <span class="tax-value" [class]="dyscalculia.numberSpacingClass()">
                    {{ fmt(item.monthlyTax) }}
                  </span>
                </div>
                @if (item.source === 'brackets') {
                  @if (item.federalAnnual > 0) {
                    <div class="tax-row tax-sub">
                      <span class="tax-label">
                        ↳ Federal (annual)
                        <app-source-tooltip [sources]="fedBracketSources" label="2026 federal brackets" />
                      </span>
                      <span class="tax-value">{{ fmt(item.federalAnnual) }}</span>
                    </div>
                  }
                  @if (item.stateAnnual > 0) {
                    <div class="tax-row tax-sub">
                      <span class="tax-label">↳ State (annual)</span>
                      <span class="tax-value">{{ fmt(item.stateAnnual) }}</span>
                    </div>
                  }
                }
                @if (item.salesRate !== null) {
                  <div class="tax-row">
                    <span class="tax-label">Sales Tax</span>
                    <span class="tax-value">{{ pct(item.salesRate) }}%</span>
                  </div>
                } @else if (item.vatRate !== null) {
                  <div class="tax-row">
                    <span class="tax-label">VAT</span>
                    <span class="tax-value">{{ pct(item.vatRate) }}%</span>
                  </div>
                }
                @if (item.socialRate !== null && item.socialRate > 0) {
                  <div class="tax-row">
                    <span class="tax-label">Social Charges</span>
                    <span class="tax-value">{{ pct(item.socialRate) }}%</span>
                  </div>
                }
                @if (item.notes) {
                  <div class="tax-notes">{{ item.notes }}</div>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .taxes-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .tax-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .tax-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 10px; cursor: pointer; transition: border-color 0.15s;
    }
    .tax-card:hover { border-color: var(--dark-blue); }
    .tax-header {
      display: flex; justify-content: space-between; align-items: baseline;
      padding: 14px 16px 0;
    }
    .tax-name { font-size: 14px; font-weight: 700; color: var(--dark-text); }
    .tax-country { font-size: 11px; color: var(--dark-text-muted); }
    .tax-body { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
    .tax-row { display: flex; justify-content: space-between; align-items: baseline; }
    .tax-label { font-size: 11px; color: var(--dark-text-sec); }
    .tax-value { font-size: 13px; font-weight: 600; color: var(--dark-amber); }
    .tax-notes { font-size: 10px; color: var(--dark-text-muted); line-height: 1.4; padding-top: 4px; border-top: 1px solid var(--dark-bg-secondary); }
    .src-badge {
      font-size: 9px; padding: 1px 5px; margin-left: 6px; border-radius: 3px;
      font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .src-brackets      { background: rgba(76, 175, 80, 0.15); color: var(--dark-green); }
    .src-stored        { background: rgba(92, 156, 230, 0.15); color: var(--dark-blue); }
    .src-vat-converged { background: rgba(156, 111, 222, 0.15); color: var(--dark-purple); }
    .src-none          { background: var(--dark-bg-secondary); color: var(--dark-text-muted); }

    .tax-sub .tax-label { padding-left: 12px; color: var(--dark-text-muted); font-size: 10px; }
    .tax-sub .tax-value { font-size: 11px; color: var(--dark-text-sec); font-weight: 500; }

    .income-bar {
      padding: 14px 16px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
      display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
    }
    .income-field { display: flex; flex-direction: column; gap: 4px; min-width: 180px; }
    .income-label { font-size: 11px; color: var(--dark-text-muted); }
    .income-input {
      padding: 7px 10px; border-radius: 6px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text);
      font-size: 15px; font-weight: 600; outline: none;
    }
    .income-input:focus { border-color: var(--dark-amber); }
    .income-hint { font-size: 11px; color: var(--dark-text-muted); max-width: 400px; line-height: 1.5; }
    .income-magnitude {
      display: block;
      font-size: 11px; color: var(--dark-text-sec); font-style: italic;
      margin-top: 4px; line-height: 1.45;
    }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
    .filter-banner {
      padding: 10px 14px; background: var(--dark-bg-secondary); border: 1px solid var(--dark-border);
      border-left: 3px solid var(--dark-amber); border-radius: 6px;
      font-size: 12px; color: var(--dark-text-sec);
    }
    .filter-banner strong { color: var(--dark-text); }
  `],
})
export class TaxesScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly tax = inject(TaxService);
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly api = inject(ApiService);

  readonly fedBracketSources = FED_BRACKETS_2026_SOURCES;
  readonly fedStdDeductionSources = FED_STD_DEDUCTION_2026_SOURCES;

  /** Proxy onto the shared LocationService signal so edits fan out to Compare, Overview, etc. */
  readonly annualIncome = this.loc.annualIncome;

  readonly taxData = computed(() => {
    const income = this.annualIncome();
    return this.loc.selectedFullLocations()
      .map(l => {
        const result = this.tax.computeIncomeTax(l, income);
        return {
          id: l.id,
          name: l.name,
          country: l.country,
          monthlyTax: result.monthlyTax,
          federalAnnual: result.federalAnnual,
          stateAnnual: result.stateAnnual,
          source: result.source,
          vatRate: l.taxes?.vatRate ?? null,
          socialRate: l.taxes?.socialChargesRate ?? null,
          salesRate: l.taxes?.salesTax?.rate ?? null,
          notes: l.taxes?.notes ?? '',
          // Country-level citations injected by retirement-api from its
          // shared/country-tax-sources map (Todos #11).
          taxSources: l.taxes?.sources,
        };
      })
      .sort((a, b) => a.monthlyTax - b.monthlyTax);
  });

  ngOnInit(): void {
    this.loc.loadFull();
    // Seed annual income from the household target — shared across Taxes,
    // Compare, and Overview via LocationService.annualIncome.
    this.api.getHousehold().subscribe({
      next: (h: HouseholdProfile) => {
        if (h.targetAnnualIncome && h.targetAnnualIncome > 0) {
          this.annualIncome.set(h.targetAnnualIncome);
        }
      },
      error: (err) => console.warn('TaxesScreen: household seed fetch failed.', err),
    });
  }

  sourceLabel(s: string): string {
    switch (s) {
      case 'brackets':      return 'computed';
      case 'stored':        return 'data';
      case 'vat-converged': return 'vat est.';
      default:              return '—';
    }
  }

  sourceTitle(s: string): string {
    switch (s) {
      case 'brackets':      return 'Computed from federal + state income tax brackets';
      case 'stored':        return 'Value stored in location data';
      case 'vat-converged': return 'Estimated from VAT × taxable spending base';
      default:              return 'No tax data available';
    }
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : this.fmtCents(amount);
  }

  /** Currency with cents precision — taxes display to-the-penny.
   *  Threads through DyscalculiaService so spaced / words formats are honored
   *  (Dashboard Dyscalculia F-013). */
  fmtCents(amount: number): string {
    return this.dyscalculia.formatCurrencyPrecise(amount, { fractionDigits: 2 });
  }

  /** Normalize rate (decimal 0.22 or whole 22 → "22"). */
  pct(rate: number): string {
    const n = Number(rate) || 0;
    const whole = n > 1 ? n : n * 100;
    return whole.toFixed(whole >= 10 ? 0 : 1);
  }
}
