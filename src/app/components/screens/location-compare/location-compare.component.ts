import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { HealthcareService } from '@services/healthcare.service';
import { LocationFull, COST_CATEGORIES } from '@models/api.model';

@Component({
  selector: 'app-location-compare',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="compare-view">

      <!-- Empty state -->
      @if (locations().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <h2>Compare Locations</h2>
          <p>
            Select cities on the
            <button mat-button class="link-btn" (click)="goToOverview()">
              Overview
            </button>
            tab using the checkboxes, then come back here to compare them side-by-side.
          </p>
        </div>
      } @else {

        <!-- Header: selected count + clear -->
        <div class="compare-header">
          <h2>Comparing {{ locations().length }} Locations</h2>
          <button mat-button class="clear-btn" (click)="loc.deselectAll()">
            Clear all
          </button>
        </div>

        <!-- Year-view toggle — shows Year 1 (transition) vs Year 2+ (steady). -->
        @if (healthcare.transitionYearExtraIncome() > 0) {
          <div class="year-toggle">
            <span class="year-toggle-label">View:</span>
            <button class="year-btn" [class.active]="viewYear() === 'steady'"
                    (click)="viewYear.set('steady')">Year 2+ (steady)</button>
            <button class="year-btn" [class.active]="viewYear() === 'transition'"
                    (click)="viewYear.set('transition')">Year 1 (transition)</button>
            <span class="year-toggle-hint">
              Transition year includes
              {{ '$' + healthcare.transitionYearExtraIncome().toLocaleString() }} one-time income
            </span>
          </div>
        }

        <!-- Audit banner: shows the household inputs driving the numbers -->
        <div class="audit-banner">
          <span class="audit-item"><strong>Adults:</strong> {{ auditAdults() }}</span>
          <span class="audit-sep">·</span>
          <span class="audit-item"><strong>Home MAGI:</strong> {{ fmtYear(auditMagi()) }} · {{ auditFplPct().toFixed(0) }}% FPL</span>
          <span class="audit-sep">·</span>
          <span class="audit-item">
            <strong>ACA rules:</strong>
            {{ healthcare.subsidyRegime() === 'cliff' ? 'Cliff (400% FPL)' : 'Enhanced (8.5% cap)' }}
          </span>
          @if (healthcare.apportionStrategy() !== 'manual') {
            <span class="audit-sep">·</span>
            <span class="audit-item audit-mode">
              <strong>Per-location MAGI:</strong> ON (auto-apportion)
            </span>
          }
          <span class="audit-hint">
            @if (healthcare.apportionStrategy() !== 'manual') {
              Each city's MAGI recomputes at its own cost-of-living — cheaper cities may drop below the 400% FPL cliff and qualify for subsidies. Hover a healthcare cell for that city's effective MAGI.
            } @else {
              Manual apportionment — MAGI fixed across all cities. Switch to auto on Setup → Assumptions to see per-location scaling.
            }
          </span>
        </div>

        <!-- Scrollable comparison table -->
        <div class="table-scroll">
          <table class="compare-table" role="grid">

            <!-- City header row -->
            <thead>
              <tr>
                <th class="label-col sticky-col">Location</th>
                @for (city of locations(); track city.id) {
                  <th class="city-col">
                    <div class="city-header">
                      <span class="city-name">{{ city.name }}</span>
                      <span class="city-country">{{ city.country }}</span>
                    </div>
                  </th>
                }
              </tr>
            </thead>

            <tbody>
              <!-- Total monthly cost (incl. computed income tax) -->
              <tr class="total-row">
                <td class="label-col sticky-col row-label">
                  <span class="row-icon">💰</span> Total Monthly
                  <span class="row-sub">as-is — with your current MAGI and the resulting ACA regime</span>
                </td>
                @for (city of locations(); track city.id) {
                  <td class="city-col total-cell"
                    [class]="dyscalculia.numberSpacingClass()"
                    [class.cheapest]="isCheapest(city)"
                    [class.priciest]="isPriciest(city)">
                    {{ fmtCents(totalWithTax(city)) }}
                  </td>
                }
              </tr>

              <!-- Aspirational total — if ACA subsidy fully applied -->
              <tr>
                <td class="label-col sticky-col row-label">
                  <span class="row-icon">✓</span> Total if ACA-subsidized
                  <span class="row-sub">
                    what you'd pay with healthcare capped at 8.5% × MAGI (i.e. under the 400% FPL cliff)
                  </span>
                </td>
                @for (city of locations(); track city.id) {
                  <td class="city-col subsidized-cell"
                    [class]="dyscalculia.numberSpacingClass()">
                    {{ fmtCents(totalIfSubsidized(city)) }}
                  </td>
                }
              </tr>

              <!-- Worst-case total with cliff penalty baked in -->
              <tr>
                <td class="label-col sticky-col row-label">
                  <span class="row-icon">⚠</span> Total w/ Cliff Penalty
                  <span class="row-sub">
                    worst-case monthly: Total Monthly + what you'd pay extra if you drew the full
                    city cost from taxable sources (no Roth). Equals Total Monthly when already under the cliff.
                  </span>
                </td>
                @for (city of locations(); track city.id) {
                  <td class="city-col penalty-cell"
                    [class]="dyscalculia.numberSpacingClass()"
                    [class.penalty-zero]="cliffPenaltyMonthly(city) === 0">
                    {{ fmtCents(totalWithTax(city) + cliffPenaltyMonthly(city)) }}
                  </td>
                }
              </tr>

              <!-- Income tax line -->
              <tr>
                <td class="label-col sticky-col row-label">
                  <span class="row-icon">🏛️</span> Income Tax
                  <span class="row-sub">computed from your {{ fmt(loc.annualIncome()) }}/yr income</span>
                </td>
                @for (city of locations(); track city.id) {
                  <td class="city-col"
                    [class]="dyscalculia.numberSpacingClass()">
                    {{ fmtCents(monthlyTax(city)) }}
                  </td>
                }
              </tr>

              <!-- Healthcare (effective) -->
              <tr>
                <td class="label-col sticky-col row-label">
                  <span class="row-icon">🏥</span> Healthcare
                  <span class="row-sub">
                    @switch (healthcareSource(locations()[0])) {
                      @case ('medicare') { Medicare — all adults 65+ }
                      @case ('aca-subsidized') { ACA subsidized ({{ fmt(loc.annualIncome()) }}/yr MAGI) }
                      @case ('aca-unsubsidized') { ACA full sticker — income above subsidy cutoff }
                      @case ('mixed') { Mixed — one spouse Medicare, one ACA }
                      @default { — }
                    }
                  </span>
                </td>
                @for (city of locations(); track city.id) {
                  <td class="city-col"
                    [class]="dyscalculia.numberSpacingClass()"
                    [title]="healthcareTooltip(city)">
                    {{ fmtCents(healthcareMonthly(city)) }}
                    @if (acaEstimateFor(city); as est) {
                      <span class="aca-badge"
                            [title]="(est.rateArea ? est.rateArea + ' · ' : '') + (est.disclaimer ?? 'estimated')">
                        ~{{ est.level?.charAt(0) ?? '?' }}
                      </span>
                    }
                  </td>
                }
              </tr>

              <!-- Section: Cost breakdown -->
              <tr class="section-header-row">
                <td [attr.colspan]="locations().length + 1" class="section-label">
                  Monthly Costs
                </td>
              </tr>
              @for (cat of costRows(); track cat.key) {
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">{{ cat.icon }}</span> {{ cat.label }}
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col"
                      [class]="dyscalculia.numberSpacingClass()"
                      [class.best-in-row]="isBestInRow(cat.key, city)"
                      [class.worst-in-row]="isWorstInRow(cat.key, city)">
                      {{ fmtCost(city, cat.key) }}
                    </td>
                  }
                </tr>
              }

              <!-- Section: Lifestyle -->
              @if (hasLifestyle()) {
                <tr class="section-header-row">
                  <td [attr.colspan]="locations().length + 1" class="section-label">
                    Lifestyle &amp; Safety
                  </td>
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🛡️</span> Safety
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Safety</span>
                        <div class="bar-row">
                          <div class="bar-track">
                            <div class="bar-fill" [style.width.%]="(city.lifestyle?.safetyRating ?? 0) * 10"></div>
                          </div>
                          <span class="rating-label">{{ city.lifestyle?.safetyRating ?? '–' }}/10</span>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🐾</span> Dog Friendly
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Dog Friendly</span>
                        <div class="bar-row">
                          <div class="bar-track">
                            <div class="bar-fill" [style.width.%]="(city.lifestyle?.dogFriendly ?? 0) * 10"></div>
                          </div>
                          <span class="rating-label">{{ city.lifestyle?.dogFriendly ?? '–' }}/10</span>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🌐</span> Expat Community
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Expat Community</span>
                        <div class="bar-row">
                          <div class="bar-track">
                            <div class="bar-fill" [style.width.%]="(city.lifestyle?.expatCommunity ?? 0) * 10"></div>
                          </div>
                          <span class="rating-label">{{ city.lifestyle?.expatCommunity ?? '–' }}/10</span>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🗣️</span> English Spoken
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">English Spoken</span>
                        <div class="bar-row">
                          <div class="bar-track">
                            <div class="bar-fill" [style.width.%]="(city.lifestyle?.englishPrevalence ?? 0) * 10"></div>
                          </div>
                          <span class="rating-label">{{ city.lifestyle?.englishPrevalence ?? '–' }}/10</span>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">📶</span> Internet
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Internet</span>
                        <span class="metric-text-val">{{ city.lifestyle?.internetSpeed ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
              }

              <!-- Section: Healthcare -->
              @if (hasHealthcare()) {
                <tr class="section-header-row">
                  <td [attr.colspan]="locations().length + 1" class="section-label">
                    Healthcare
                  </td>
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🏥</span> System
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">System</span>
                        <span class="metric-text-val">{{ city.healthcare?.system ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">⭐</span> Quality
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Quality</span>
                        <div class="bar-row">
                          <div class="bar-track">
                            <div class="bar-fill bar-fill--health" [style.width.%]="(city.healthcare?.qualityRating ?? 0) * 10"></div>
                          </div>
                          <span class="rating-label">{{ city.healthcare?.qualityRating ?? '–' }}/10</span>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🦷</span> Dental
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Dental</span>
                        <span class="metric-text-val">{{ city.healthcare?.dentalIncluded ? '✓ Included' : '✗ Extra' }}</span>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">⏱️</span> Wait Times
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Wait Times</span>
                        <span class="metric-text-val">{{ city.healthcare?.waitTimes ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
              }

              <!-- Section: Climate -->
              @if (hasClimate()) {
                <tr class="section-header-row">
                  <td [attr.colspan]="locations().length + 1" class="section-label">
                    Climate
                  </td>
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🌡️</span> Summer High
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Summer High</span>
                        <span class="metric-text-val">{{ climateHigh(city) }}</span>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">❄️</span> Winter Low
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Winter Low</span>
                        <span class="metric-text-val">{{ climateLow(city) }}</span>
                      </div>
                    </td>
                  }
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">☔</span> Rainy Days/Yr
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Rainy Days/Yr</span>
                        <span class="metric-text-val">{{ city.climate?.rainyDaysPerYear ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
              }

              <!-- Section: Visa -->
              @if (hasVisa()) {
                <tr class="section-header-row">
                  <td [attr.colspan]="locations().length + 1" class="section-label">
                    Visa &amp; Residency
                  </td>
                </tr>
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">🛂</span> Visa Type
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Visa Type</span>
                        <span class="metric-text-val">{{ city.visa?.type ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
                @if (anyVisaIncomeReq()) {
                  <tr>
                    <td class="label-col sticky-col row-label">
                      <span class="row-icon">💰</span> Income Req. (mo)
                    </td>
                    @for (city of locations(); track city.id) {
                      <td class="city-col"
                        [class]="dyscalculia.numberSpacingClass()">
                        <div class="metric-cell">
                          <span class="metric-name">Income Req. (mo)</span>
                          <span class="metric-text-val">{{ visaIncomeReq(city) }}</span>
                        </div>
                      </td>
                    }
                  </tr>
                }
                <tr>
                  <td class="label-col sticky-col row-label">
                    <span class="row-icon">📝</span> Notes
                  </td>
                  @for (city of locations(); track city.id) {
                    <td class="city-col">
                      <div class="metric-cell">
                        <span class="metric-name">Notes</span>
                        <span class="metric-text-val metric-notes">{{ city.visa?.notes ?? '–' }}</span>
                      </div>
                    </td>
                  }
                </tr>
                @if (anyVisaCost()) {
                  <tr>
                    <td class="label-col sticky-col row-label">
                      <span class="row-icon">💵</span> Visa Cost
                    </td>
                    @for (city of locations(); track city.id) {
                      <td class="city-col"
                        [class]="dyscalculia.numberSpacingClass()">
                        <div class="metric-cell">
                          <span class="metric-name">Visa Cost</span>
                          <span class="metric-text-val">{{ city.visa?.costUSD ? fmt(city.visa!.costUSD!) : '–' }}</span>
                        </div>
                      </td>
                    }
                  </tr>
                }
              }

              <!-- Section: Pros & Cons -->
              <tr class="section-header-row">
                <td [attr.colspan]="locations().length + 1" class="section-label">
                  Pros &amp; Cons
                </td>
              </tr>
              <tr>
                <td class="label-col sticky-col row-label">
                  <span class="row-icon">👍</span> Pros
                </td>
                @for (city of locations(); track city.id) {
                  <td class="city-col">
                    <div class="metric-cell">
                      <span class="metric-name">Pros</span>
                      <div class="tags-wrap">
                        @if (city.pros?.length) {
                          @for (p of (city.pros ?? []).slice(0, 4); track p) {
                            <span class="pro-tag">{{ p }}</span>
                          }
                        } @else {
                          <span class="metric-text-val">–</span>
                        }
                      </div>
                    </div>
                  </td>
                }
              </tr>
              <tr>
                <td class="label-col sticky-col row-label">
                  <span class="row-icon">👎</span> Cons
                </td>
                @for (city of locations(); track city.id) {
                  <td class="city-col">
                    <div class="metric-cell">
                      <span class="metric-name">Cons</span>
                      <div class="tags-wrap">
                        @if (city.cons?.length) {
                          @for (c of (city.cons ?? []).slice(0, 4); track c) {
                            <span class="con-tag">{{ c }}</span>
                          }
                        } @else {
                          <span class="metric-text-val">–</span>
                        }
                      </div>
                    </div>
                  </td>
                }
              </tr>

            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .compare-view {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* ─── Empty state ─────────────────────── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 60px 24px;
      color: var(--dark-text-muted);
    }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
    .empty-state h2 {
      font-size: 18px;
      font-weight: 700;
      color: var(--dark-text);
      margin: 0 0 8px;
    }
    .empty-state p {
      font-size: 13px;
      max-width: 360px;
      line-height: 1.5;
    }
    .link-btn {
      --mdc-text-button-label-text-color: var(--dark-amber);
      --mdc-text-button-label-text-size: 13px;
      padding: 0 4px;
      min-width: 0;
      vertical-align: baseline;
    }

    /* ─── Header ──────────────────────────── */
    .compare-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .compare-header h2 {
      font-size: 16px;
      font-weight: 700;
      color: var(--dark-text);
      margin: 0;
    }
    .clear-btn {
      --mdc-text-button-label-text-size: 11px;
      --mdc-text-button-label-text-color: var(--dark-blue);
    }

    /* ─── Table scroll wrapper ────────────── */
    .table-scroll {
      overflow-x: auto;
      border: 1px solid var(--dark-border);
      border-radius: 8px;
    }

    /* ─── Table ───────────────────────────── */
    .compare-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      min-width: 500px;
    }
    .compare-table th,
    .compare-table td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--dark-border);
      vertical-align: top;
    }
    .compare-table thead th {
      background: var(--dark-bg-secondary);
      position: sticky;
      top: 0;
      z-index: 2;
    }

    /* Sticky first column */
    .sticky-col {
      position: sticky;
      left: 0;
      z-index: 1;
      background: var(--dark-bg);
    }
    thead .sticky-col { z-index: 3; }

    .label-col {
      width: 160px;
      min-width: 160px;
      white-space: nowrap;
      font-size: 11px;
      color: var(--dark-text-sec);
    }
    .city-col {
      min-width: 150px;
      text-align: center;
      color: var(--dark-text);
    }

    /* ─── City header ─────────────────────── */
    .city-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .city-name {
      font-size: 13px;
      font-weight: 700;
      color: var(--dark-text);
    }
    .city-country {
      font-size: 10px;
      color: var(--dark-text-muted);
    }

    /* ─── Row styles ──────────────────────── */
    .row-label {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .row-icon { font-size: 13px; }
    .row-sub {
      font-size: 9px; color: var(--dark-text-muted); font-weight: 400;
      width: 100%; padding-left: 18px; margin-top: 2px;
    }

    .total-row td {
      font-weight: 700;
      font-size: 14px;
      border-bottom: 2px solid var(--dark-border);
    }
    .total-cell { color: var(--dark-amber); }
    .year-toggle {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      padding: 10px 14px;
      background: rgba(156, 111, 222, 0.08);
      border: 1px solid rgba(156, 111, 222, 0.25);
      border-radius: 6px;
      font-size: 12px;
    }
    .year-toggle-label { font-weight: 600; color: var(--dark-text-sec); }
    .year-btn {
      padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;
      background: transparent; color: var(--dark-text-muted);
      border: 1px solid var(--dark-border); cursor: pointer;
    }
    .year-btn.active {
      background: var(--dark-purple); color: #fff; border-color: var(--dark-purple);
    }
    .year-toggle-hint { font-size: 11px; color: var(--dark-text-muted); flex-basis: 100%; margin-top: 2px; }

    .audit-banner {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px;
      padding: 10px 14px;
      background: var(--dark-bg-secondary);
      border-left: 3px solid var(--dark-blue);
      border-radius: 6px;
      font-size: 12px; color: var(--dark-text-sec);
    }
    .audit-item strong { color: var(--dark-text); font-weight: 600; }
    .audit-mode strong { color: var(--dark-green); }
    .audit-sep { color: var(--dark-text-muted); }
    .audit-hint { flex-basis: 100%; font-size: 10px; color: var(--dark-text-muted); font-style: italic; margin-top: 2px; }
    .aca-badge {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 5px;
      font-size: 9px;
      font-weight: 700;
      background: rgba(212, 148, 58, 0.18);
      color: var(--dark-amber);
      border-radius: 3px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      cursor: help;
    }
    .total-cell.cheapest { color: var(--dark-green); }
    .total-cell.priciest { color: var(--dark-red); }
    .subsidized-cell {
      color: var(--dark-green); font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .penalty-cell {
      color: var(--dark-red); font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .penalty-cell.penalty-zero { color: var(--dark-text-muted); font-weight: 400; }

    .section-header-row td {
      padding: 12px 12px 6px;
    }
    .section-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--dark-text-muted);
      border-bottom: none !important;
    }

    .best-in-row { color: var(--dark-green); font-weight: 600; }
    .worst-in-row { color: var(--dark-red); }

    /* ─── Metric cell (label + value in each column) ─── */
    .metric-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .metric-name {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--dark-text-muted);
    }
    .metric-text-val {
      font-size: 12px;
      color: var(--dark-text);
    }
    .metric-notes {
      font-size: 11px;
      color: var(--dark-text-sec);
      line-height: 1.4;
      white-space: normal;
      word-wrap: break-word;
      max-width: 240px;
      display: block;
    }

    /* ─── Rating bar ──────────────────────── */
    .bar-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bar-track {
      width: 60px;
      height: 8px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .bar-fill {
      height: 100%;
      background: var(--dark-amber, #f59e0b);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .bar-fill--health {
      background: var(--dark-green, #4caf50);
    }
    .rating-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--dark-text-sec);
      min-width: 30px;
      text-align: left;
    }

    /* ─── Pros / Cons tags ────────────────── */
    .tags-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      justify-content: center;
    }
    .pro-tag, .con-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      white-space: nowrap;
    }
    .pro-tag {
      background: rgba(76, 175, 80, 0.12);
      color: var(--dark-green);
    }
    .con-tag {
      background: rgba(229, 115, 115, 0.12);
      color: var(--dark-red);
    }
  `],
})
export class LocationCompareComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly tax = inject(TaxService);
  readonly healthcare = inject(HealthcareService);
  private readonly nav = inject(NavigationService);
  readonly dyscalculia = inject(DyscalculiaService);

  /** Toggle: view Year 1 (transition) or Year 2+ (steady state) healthcare numbers. */
  readonly viewYear = signal<'transition' | 'steady'>('steady');

  /**
   * Per-city (decision, totalWithTax) map, memoized so change-detection
   * passes don't recompute `healthcare.decide()` 4× per city per render.
   * Rebuilds only when `locations()`, `annualIncome`, `viewYear`, or household ages shift.
   */
  readonly cityFinances = computed(() => {
    const map = new Map<string, {
      decision: ReturnType<HealthcareService['decide']>;
      totalWithTax: number;
      monthlyTax: number;
      /** Total assuming fully-subsidized ACA — what you'd pay at this city under the subsidy cap. */
      totalIfSubsidized: number;
      /** Monthly healthcare if fully subsidized (cap × MAGI / 12, capped at unsubsidized sticker). */
      subsidizedHealthcareMonthly: number;
      /** Cost penalty per month for being above the cliff (0 when already subsidized). */
      cliffPenaltyMonthly: number;
    }>();
    for (const city of this.locations()) {
      const decision = this.healthcare.decideForLocation(city, {
        transition: this.viewYear() === 'transition',
      });
      const bundle = this.tax.totalWithIncomeTax(city, { healthcareMonthly: decision.monthlyCost });

      // Compute "if fully subsidized" + "worst-case penalty" under CLIFF
      // regime (2026 reality). Two scenarios side-by-side:
      //   subsidizedMonthly — what you'd pay if you managed MAGI down to
      //                        just under 400% FPL (the aspirational ceiling).
      //   worstCaseMonthly  — what you'd pay if you drew the city's full
      //                        annual cost from taxable/trad/SS (no Roth buffer,
      //                        worst-case MAGI = city annual need). This is
      //                        the "penalty for moving here without tax-efficient
      //                        planning" signal.
      const acaFull = city.monthlyCosts?.['healthcarePreMedicare']?.typical
        ?? city.healthcare?.acaMarketplace?.benchmarkSilverMonthly2Adult
        ?? 0;
      const adults = Math.max(2,
        (this.healthcare.household()?.members ?? []).filter(m => m.role !== 'dependent').length
      );
      const fpl = this.healthcare.fpl(adults);

      // Aspirational: MAGI clamped to just under 400% FPL cliff.
      const cliffCeilingMagi = fpl * 3.99;
      const aspirationalMagi = Math.min(Math.max(decision.magiUsed, 0), cliffCeilingMagi);
      const aspirationalFplPct = (aspirationalMagi / fpl) * 100;
      const applicablePct = this.healthcare.applicablePctForCliff(aspirationalFplPct);
      const subsidizedMonthly = applicablePct != null && aspirationalMagi > 0
        ? Math.min(acaFull, aspirationalMagi * applicablePct / 12)
        : acaFull;
      const bundleIfSubsidized = this.tax.totalWithIncomeTax(city, {
        healthcareMonthly: subsidizedMonthly,
      });

      // Worst case: user needs the full city cost annually, all from sources
      // that hit MAGI (trad + SS + pension, no Roth). This is the cost
      // they'd pay if they moved here without planning tax-efficient draws.
      const cityAnnualCost = Object.values(city.monthlyCosts ?? {})
        .reduce((s, c) => s + (c?.typical ?? 0), 0) * 12;
      const worstCaseMagi = cityAnnualCost; // no Roth → full cost hits MAGI
      const worstCaseFplPct = (worstCaseMagi / fpl) * 100;
      const worstCaseApplicable = this.healthcare.applicablePctForCliff(worstCaseFplPct);
      const perAdultFull = city.healthcare?.acaMarketplace?.benchmarkSilverMonthlySingle
        ?? acaFull / 2;
      const worstCaseHealthcareMonthly = worstCaseApplicable != null
        ? Math.min(perAdultFull * adults, worstCaseMagi * worstCaseApplicable / 12)
        : perAdultFull * adults; // above cliff → full sticker
      const cliffPenaltyMonthly = Math.max(0, worstCaseHealthcareMonthly - subsidizedMonthly);

      map.set(city.id, {
        decision,
        totalWithTax: bundle.total,
        monthlyTax: bundle.monthlyTax,
        totalIfSubsidized: bundleIfSubsidized.total,
        subsidizedHealthcareMonthly: subsidizedMonthly,
        cliffPenaltyMonthly,
      });
    }
    return map;
  });

  /** Full data for each selected location, with computed total if missing */
  readonly locations = computed(() => {
    const ids = this.loc.selectedIds();
    const summaries = this.loc.locations();
    return this.loc.fullLocations()
      .filter(l => ids.has(l.id))
      .map(l => {
        if (l.monthlyCostTotal) return l;
        // monthlyCostTotal lives on the DB row, not inside locationData JSON.
        // Pull it from the summary list, or compute from monthlyCosts.
        const summary = summaries.find(s => s.id === l.id);
        const computed = summary?.monthlyCostTotal
          ?? Object.values(l.monthlyCosts)
              .reduce((sum, cr) => sum + (cr?.typical ?? 0), 0);
        return { ...l, monthlyCostTotal: computed };
      });
  });

  /** Cost rows that have data in at least one selected location */
  /**
   * Monthly-cost rows shown in the table. Excludes keys that the Compare
   * table surfaces via smarter rows at the top:
   *   - `healthcare`            → shown via our effective "Healthcare" row
   *   - `healthcarePreMedicare` → alternate (not in default sums)
   *   - `taxes`                 → shown via our computed "Income Tax" row
   * Excluding them here prevents the user seeing two different numbers for
   * the same concept.
   */
  private readonly hiddenCostKeys = new Set(['healthcare', 'healthcarePreMedicare', 'taxes']);
  readonly costRows = computed(() => {
    const locs = this.locations();
    return COST_CATEGORIES
      .filter(cat => !this.hiddenCostKeys.has(cat.key))
      .filter(cat => locs.some(l => (l.monthlyCosts[cat.key]?.typical ?? 0) > 0));
  });

  readonly hasLifestyle = computed(() =>
    this.locations().some(l => l.lifestyle)
  );
  readonly hasHealthcare = computed(() =>
    this.locations().some(l => l.healthcare)
  );
  readonly hasClimate = computed(() =>
    this.locations().some(l => l.climate)
  );
  readonly hasVisa = computed(() =>
    this.locations().some(l => l.visa)
  );
  readonly anyVisaCost = computed(() =>
    this.locations().some(l => l.visa?.costUSD)
  );
  readonly anyVisaIncomeReq = computed(() =>
    this.locations().some(l => l.visa?.incomeRequirement?.monthly)
  );

  climateHigh(city: LocationFull): string {
    const h = city.climate?.summerHighF ?? city.climate?.avgTemp?.high;
    return h != null ? `${h}°F` : '–';
  }

  climateLow(city: LocationFull): string {
    const l = city.climate?.winterLowF ?? city.climate?.avgTemp?.low;
    return l != null ? `${l}°F` : '–';
  }

  visaIncomeReq(city: LocationFull): string {
    const r = city.visa?.incomeRequirement;
    if (!r?.monthly) return '–';
    return `${r.currency ?? 'USD'} ${r.monthly.toLocaleString()}`;
  }

  ngOnInit(): void {
    // Ensure full location data is loaded for comparison
    this.loc.loadFull();
    this.healthcare.load();
  }

  /* ─── Helpers ─────────────────────────────────── */

  fmt(val: number): string {
    if (this.dyscalculia.isEnabled()) {
      return this.dyscalculia.formatCurrency(val);
    }
    return '$' + val.toLocaleString();
  }

  /** Currency with cents — for the Total Monthly + Income Tax rows. */
  fmtCents(val: number): string {
    return '$' + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Yearly currency — whole dollars + "/yr" suffix. For the audit banner. */
  fmtYear(val: number): string {
    return '$' + Math.round(val).toLocaleString() + '/yr';
  }

  fmtCost(city: LocationFull, key: string): string {
    const val = city.monthlyCosts[key]?.typical ?? 0;
    if (!val) return '–';
    return this.fmt(val);
  }

  /** Monthly cost total including computed income tax + effective healthcare. */
  totalWithTax(city: LocationFull): number {
    return this.cityFinances().get(city.id)?.totalWithTax ?? 0;
  }

  /** "What-if under the cliff" total — assumes ACA subsidy fully applies. */
  totalIfSubsidized(city: LocationFull): number {
    return this.cityFinances().get(city.id)?.totalIfSubsidized ?? 0;
  }

  /** Monthly cost of being above the 400% FPL cliff vs under. 0 if already subsidized. */
  cliffPenaltyMonthly(city: LocationFull): number {
    return this.cityFinances().get(city.id)?.cliffPenaltyMonthly ?? 0;
  }

  monthlyTax(city: LocationFull): number {
    return this.cityFinances().get(city.id)?.monthlyTax ?? 0;
  }

  healthcareMonthly(city: LocationFull): number {
    return this.cityFinances().get(city.id)?.decision.monthlyCost ?? 0;
  }

  healthcareSource(city: LocationFull): string {
    return this.cityFinances().get(city.id)?.decision.source ?? 'none';
  }

  /**
   * Returns the ACA estimate metadata (rateArea, level, disclaimer) for a
   * city when the household's healthcare regime is ACA-based. null for
   * Medicare-only households — no benchmark is in play.
   */
  acaEstimateFor(city: LocationFull) {
    const decision = this.cityFinances().get(city.id)?.decision;
    if (!decision || !decision.source.startsWith('aca')) return null;
    return decision.acaEstimate ?? null;
  }

  /**
   * Build a multi-line tooltip explaining the healthcare cell — surfaces the
   * location-specific MAGI, FPL%, regime (cliff/enhanced), and coverage
   * source so the user can see why a cheaper city produces a different
   * subsidy outcome than a more expensive one.
   */
  healthcareTooltip(city: LocationFull): string {
    const d = this.cityFinances().get(city.id)?.decision;
    if (!d) return '';
    const lines = [
      `Coverage: ${d.source}`,
      `MAGI for this city: $${Math.round(d.magiUsed).toLocaleString()}`,
      `FPL: ${(d.fplPct ?? 0).toFixed(0)}%`,
      `Adults <65 / 65+: ${d.adultsPreMedicare} / ${d.adultsMedicare}`,
    ];
    if (d.aboveFplCliff) lines.push('Above 400% FPL cliff → no subsidy');
    if (d.subsidyEligible) lines.push('Subsidy active');
    return lines.join('\n');
  }

  /* ─── Audit banner helpers — surface the inputs driving the numbers ── */

  auditAdults(): string {
    const adults = (this.healthcare.household()?.members ?? [])
      .filter(m => m.role !== 'dependent');
    if (!adults.length) return 'none set';
    const yr = this.healthcare.household()?.planningStartYear ?? new Date().getFullYear();
    return adults.map(m => `${m.name || 'adult'} (${yr - m.birthYear})`).join(', ');
  }

  auditCashIn(): number { return this.healthcare.magi().cashIn; }
  auditMagi(): number { return this.healthcare.magi().magiForAca; }

  auditFplPct(): number {
    const magi = this.healthcare.magi().magiForAca;
    const adults = Math.max(1,
      (this.healthcare.household()?.members ?? []).filter(m => m.role !== 'dependent').length || 2
    );
    const fpl = 15_060 + 5_380 * (adults - 1);
    return magi > 0 ? (magi / fpl) * 100 : 0;
  }

  isCheapest(city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const min = Math.min(...locs.map(l => this.totalWithTax(l)));
    return this.totalWithTax(city) === min;
  }

  isPriciest(city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const max = Math.max(...locs.map(l => this.totalWithTax(l)));
    return this.totalWithTax(city) === max;
  }

  isBestInRow(key: string, city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const val = city.monthlyCosts[key]?.typical ?? 0;
    if (!val) return false;
    const min = Math.min(...locs.map(l => l.monthlyCosts[key]?.typical ?? Infinity));
    return val === min && val !== Infinity;
  }

  isWorstInRow(key: string, city: LocationFull): boolean {
    const locs = this.locations();
    if (locs.length < 2) return false;
    const val = city.monthlyCosts[key]?.typical ?? 0;
    if (!val) return false;
    const max = Math.max(...locs.filter(l => (l.monthlyCosts[key]?.typical ?? 0) > 0)
      .map(l => l.monthlyCosts[key]?.typical ?? 0));
    return val === max;
  }

  /** Simple block bar for 0–10 ratings */
  ratingBar(val: number | undefined): string {
    if (val == null) return '';
    const filled = Math.round(val);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  goToOverview(): void {
    this.nav.selectScreen('overview');
  }
}
