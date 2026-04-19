import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { HealthcareService } from '@services/healthcare.service';
import { LocationService } from '@services/location.service';
import {
  HouseholdProfile, HouseholdMember, HouseholdPet,
  MemberRole, DependentType, PetType,
} from '@models/api.model';

type MemberDraft = Partial<HouseholdMember> & { birthYear: number; role: MemberRole };
type PetDraft = Partial<HouseholdPet> & { birthYear: number; type: PetType };

@Component({
  selector: 'app-assumptions-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule],
  template: `
    <div class="assumptions-screen">
      <div class="screen-header">
        <span class="header-icon">🎯</span>
        <div>
          <h2 class="header-title">Assumptions</h2>
          <p class="header-sub">Define your household and planning parameters</p>
        </div>
        <div class="save-bar">
          @if (saveMsg()) { <span class="save-msg" [class.err]="saveErr()">{{ saveMsg() }}</span> }
          <button mat-flat-button color="primary" [disabled]="saving() || !dirty()" (click)="save()">
            {{ saving() ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading household data…</div>
      } @else if (!draft()) {
        <div class="status-msg">No household profile found. Create one to get started.</div>
      } @else {
        <!-- Planning parameters -->
        <div class="card">
          <h3 class="card-title">Planning Parameters</h3>
          <div class="field-grid">
            <label class="field">
              <span class="field-label">Target Annual Income ($)</span>
              <input type="number" class="field-input" min="0" step="1000"
                [class]="dyscalculia.numberSpacingClass()"
                [ngModel]="draft()!.targetAnnualIncome"
                (ngModelChange)="patch({ targetAnnualIncome: +$event })" />
            </label>
            <label class="field">
              <span class="field-label">Planning Start Year</span>
              <input type="number" class="field-input" min="2024" max="2050"
                [ngModel]="draft()!.planningStartYear"
                (ngModelChange)="patch({ planningStartYear: +$event })" />
            </label>
            <label class="field">
              <span class="field-label">Planning Horizon (years)</span>
              <input type="number" class="field-input" min="1" max="70"
                [ngModel]="draft()!.planningYears"
                (ngModelChange)="patch({ planningYears: +$event })" />
            </label>
            <label class="field">
              <span class="field-label">Adults in Household</span>
              <input type="number" class="field-input" min="1" max="10"
                [ngModel]="draft()!.adultsCount"
                (ngModelChange)="patch({ adultsCount: +$event })" />
            </label>
          </div>
        </div>

        <!-- Members -->
        <div class="card">
          <div class="card-head">
            <h3 class="card-title">Household Members</h3>
            <button mat-stroked-button class="add-btn" (click)="addMember()">+ Add Member</button>
          </div>
          @for (member of draft()!.members; track $index; let i = $index) {
            <div class="editor-row">
              <div class="row-fields">
                <label class="field compact">
                  <span class="field-label">Name</span>
                  <input type="text" class="field-input"
                    [ngModel]="member.name" (ngModelChange)="patchMember(i, { name: $event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">Role</span>
                  <select class="field-input"
                    [ngModel]="member.role" (ngModelChange)="onMemberRoleChange(i, $event)">
                    <option value="primary">Primary</option>
                    <option value="spouse">Spouse</option>
                    <option value="dependent">Dependent</option>
                  </select>
                </label>
                @if (member.role === 'dependent') {
                  <label class="field compact">
                    <span class="field-label">Dependent Type</span>
                    <select class="field-input"
                      [ngModel]="member.dependentType ?? 'child'"
                      (ngModelChange)="patchMember(i, { dependentType: $event })">
                      <option value="child">Child</option>
                      <option value="adult">Adult</option>
                    </select>
                  </label>
                }
                <label class="field compact">
                  <span class="field-label">Birth Year</span>
                  <input type="number" class="field-input" min="1920" max="2030"
                    [ngModel]="member.birthYear"
                    (ngModelChange)="patchMember(i, { birthYear: +$event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">SS PIA ($/mo)</span>
                  <input type="number" class="field-input" min="0" max="50000" step="50"
                    [class]="dyscalculia.numberSpacingClass()"
                    [ngModel]="member.ssPia ?? 0"
                    (ngModelChange)="patchMember(i, { ssPia: +$event || null })" />
                </label>
                <label class="field compact">
                  <span class="field-label">SS FRA</span>
                  <input type="number" class="field-input" min="62" max="70"
                    [ngModel]="member.ssFra ?? 67"
                    (ngModelChange)="patchMember(i, { ssFra: +$event || null })" />
                </label>
                <label class="field compact">
                  <span class="field-label">
                    SS Claim Age: <strong>{{ member.ssClaimAge ?? 67 }}</strong>
                  </span>
                  <input type="range" class="field-range" min="62" max="70" step="1"
                    [ngModel]="member.ssClaimAge ?? 67"
                    (ngModelChange)="patchMember(i, { ssClaimAge: +$event })" />
                </label>
              </div>
              <button class="remove-btn" (click)="removeMember(i)" aria-label="Remove">×</button>
            </div>
          } @empty {
            <div class="empty-hint">No members yet — click “Add Member” to create one.</div>
          }
          <div class="derived-row">
            Dependents: <strong>{{ dependentCount() }}</strong>
            · Adults: <strong>{{ adultCount() }}</strong>
          </div>
        </div>

        <!-- Pets -->
        <div class="card">
          <div class="card-head">
            <h3 class="card-title">Pets</h3>
            <button mat-stroked-button class="add-btn" (click)="addPet()">+ Add Pet</button>
          </div>
          @for (pet of draft()!.pets; track $index; let i = $index) {
            <div class="editor-row">
              <div class="row-fields">
                <label class="field compact">
                  <span class="field-label">Name</span>
                  <input type="text" class="field-input"
                    [ngModel]="pet.name" (ngModelChange)="patchPet(i, { name: $event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">Type</span>
                  <select class="field-input"
                    [ngModel]="pet.type" (ngModelChange)="patchPet(i, { type: $event })">
                    <option value="dog">Dog</option>
                    <option value="cat">Cat</option>
                    <option value="bird">Bird</option>
                    <option value="rabbit">Rabbit</option>
                    <option value="fish">Fish</option>
                    <option value="horse">Horse</option>
                    <option value="reptile">Reptile</option>
                  </select>
                </label>
                <label class="field compact">
                  <span class="field-label">Breed</span>
                  <input type="text" class="field-input"
                    [ngModel]="pet.breed" (ngModelChange)="patchPet(i, { breed: $event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">Weight (lb)</span>
                  <input type="number" class="field-input" min="1" max="2500"
                    [ngModel]="pet.weight"
                    (ngModelChange)="patchPet(i, { weight: +$event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">Birth Year</span>
                  <input type="number" class="field-input" min="2000" max="2030"
                    [ngModel]="pet.birthYear"
                    (ngModelChange)="patchPet(i, { birthYear: +$event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">Expected Lifespan</span>
                  <input type="number" class="field-input" min="1" max="50"
                    [ngModel]="pet.expectedLifespan"
                    (ngModelChange)="patchPet(i, { expectedLifespan: +$event })" />
                </label>
              </div>
              <button class="remove-btn" (click)="removePet(i)" aria-label="Remove">×</button>
            </div>
          } @empty {
            <div class="empty-hint">No pets — click “Add Pet” to add one.</div>
          }
        </div>

        <!-- Healthcare regime + MAGI composition -->
        @if (healthcareDecision(); as hc) {
          <div class="card hc-card">
            <h3 class="card-title">Healthcare (derived from ages + MAGI)</h3>

            <!-- Quick fill: derive portfolio buckets from total cash need -->
            <div class="hc-subsection">
              <h4 class="hc-subtitle">Quick Fill (optional)</h4>
              <p class="hc-help">
                Enter your total annual cash need; we'll split the portfolio draw across
                Traditional / Roth / Taxable based on your account balances.
              </p>
              <div class="hc-income-grid">
                <label class="field compact">
                  <span class="field-label">Total Annual Need ($)</span>
                  <input type="number" class="field-input" min="0" step="1000"
                    [ngModel]="healthcare.totalAnnualNeed()"
                    (ngModelChange)="healthcare.totalAnnualNeed.set(+$event)" />
                </label>
                <label class="field compact">
                  <span class="field-label">Apportion Strategy</span>
                  <select class="field-input"
                    [ngModel]="healthcare.apportionStrategy()"
                    (ngModelChange)="healthcare.apportionStrategy.set($event)">
                    <option value="manual">Manual — I'll enter buckets below</option>
                    <option value="proportional">Proportional to balances</option>
                    <option value="tax-efficient">Tax-efficient (taxable → trad → Roth)</option>
                  </select>
                </label>
                <div class="field compact hc-apply-wrap">
                  <button mat-stroked-button class="hc-apply-btn"
                    [disabled]="healthcare.apportionStrategy() === 'manual'"
                    (click)="healthcare.applyApportionment()">
                    Fill buckets below
                  </button>
                </div>
              </div>
            </div>

            <!-- Income composition: drives the MAGI calc below -->
            <div class="hc-subsection">
              <h4 class="hc-subtitle">Annual Income Composition</h4>
              <div class="hc-income-grid">
                <label class="field compact">
                  <span class="field-label">Traditional 401k / IRA ($)</span>
                  <input type="number" class="field-input" min="0" step="1000"
                    [ngModel]="healthcare.income().traditionalAnnual"
                    (ngModelChange)="healthcare.patchIncome({ traditionalAnnual: +$event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">Roth 401k / IRA ($)</span>
                  <input type="number" class="field-input" min="0" step="1000"
                    [ngModel]="healthcare.income().rothAnnual"
                    (ngModelChange)="healthcare.patchIncome({ rothAnnual: +$event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">Taxable brokerage ($)</span>
                  <input type="number" class="field-input" min="0" step="1000"
                    [ngModel]="healthcare.income().taxableBrokerageAnnual"
                    (ngModelChange)="healthcare.patchIncome({ taxableBrokerageAnnual: +$event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">Social Security ($/yr)</span>
                  <input type="number" class="field-input" min="0" step="500"
                    [ngModel]="healthcare.income().ssAnnual"
                    (ngModelChange)="healthcare.patchIncome({ ssAnnual: +$event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">Pension / other taxable ($)</span>
                  <input type="number" class="field-input" min="0" step="500"
                    [ngModel]="healthcare.income().pensionAnnual"
                    (ngModelChange)="healthcare.patchIncome({ pensionAnnual: +$event })" />
                </label>
                <label class="field compact">
                  <span class="field-label">Filing status</span>
                  <select class="field-input"
                    [ngModel]="healthcare.income().filingStatus"
                    (ngModelChange)="healthcare.patchIncome({ filingStatus: $event })">
                    <option value="joint">Married filing jointly</option>
                    <option value="single">Single</option>
                  </select>
                </label>
              </div>
            </div>

            <!-- Derived: Cash in / AGI / MAGI -->
            <div class="hc-grid">
              <div class="hc-stat">
                <span class="hc-label">Cash In (all sources)</span>
                <span class="hc-value" [class]="dyscalculia.numberSpacingClass()">
                  {{ '$' + healthcare.magi().cashIn.toFixed(0) }}
                </span>
              </div>
              <div class="hc-stat">
                <span class="hc-label">Federal AGI</span>
                <span class="hc-value" [class]="dyscalculia.numberSpacingClass()">
                  {{ '$' + healthcare.magi().agi.toFixed(0) }}
                </span>
                <span class="hc-sub">Taxable SS: {{ '$' + healthcare.magi().taxableSS.toFixed(0) }}</span>
              </div>
              <div class="hc-stat">
                <span class="hc-label">MAGI (for ACA)</span>
                <span class="hc-value hc-cost" [class]="dyscalculia.numberSpacingClass()">
                  {{ '$' + healthcare.magi().magiForAca.toFixed(0) }}
                </span>
                <span class="hc-sub">AGI + non-taxable SS</span>
              </div>
            </div>

            <!-- Derived — what your household actually qualifies for under current ages + MAGI + law -->
            <div class="hc-grid">
              <div class="hc-stat">
                <span class="hc-label">Coverage (derived)</span>
                <span class="hc-value hc-src-{{ hc.decision.source }}">
                  {{ healthcareSourceLabel(hc.decision.source) }}
                </span>
                <span class="hc-sub">from ages + MAGI + law setting</span>
              </div>
              <div class="hc-stat">
                <span class="hc-label">Monthly Cost (ref: {{ hc.location.name }})</span>
                <span class="hc-value hc-cost" [class]="dyscalculia.numberSpacingClass()">
                  {{ '$' + hc.decision.monthlyCost.toFixed(0) }}/mo
                </span>
              </div>
              <div class="hc-stat">
                <span class="hc-label">Adults &lt; 65 / 65+</span>
                <span class="hc-value">
                  {{ hc.decision.adultsPreMedicare }} / {{ hc.decision.adultsMedicare }}
                </span>
              </div>
              @if (hc.decision.allEligibleYear) {
                <div class="hc-stat">
                  <span class="hc-label">All Medicare-eligible by</span>
                  <span class="hc-value">{{ hc.decision.allEligibleYear }}</span>
                </div>
              }
            </div>

            @if (hc.decision.usedFallback) {
              <div class="hc-warn">
                ⚠ {{ hc.decision.fallbackReason }}
              </div>
            }

            <!-- Transition year: one-time income spike in sim year 0 -->
            <div class="hc-subsection">
              <h4 class="hc-subtitle">Transition Year (one-time)</h4>
              <p class="hc-help">
                One-time income in your first year of retirement — W-2 wages earned Jan→retirement,
                severance, unused PTO payout, final-year bonus, year-of RMDs. Applied to MAGI in
                <strong>sim year 0 only</strong>; year 1+ uses your steady-state composition.
              </p>
              <label class="field compact">
                <span class="field-label">Extra income in Year 1 ($)</span>
                <input type="number" class="field-input" min="0" step="1000"
                  [class]="dyscalculia.numberSpacingClass()"
                  [ngModel]="healthcare.transitionYearExtraIncome()"
                  (ngModelChange)="healthcare.transitionYearExtraIncome.set(+$event)" />
              </label>
              @if (healthcare.transitionYearExtraIncome() > 0) {
                <div class="hc-hint">
                  Year 1 MAGI: <strong>{{ '$' + healthcare.transitionMagi().toFixed(0) }}</strong>
                  (steady {{ '$' + healthcare.magi().magiForAca.toFixed(0) }}
                  + extra {{ '$' + healthcare.transitionYearExtraIncome().toFixed(0) }})
                </div>
              }
            </div>

            @if (hc.decision.source.startsWith('aca')) {
              <!-- Input: which subsidy-law framework to apply -->
              <div class="hc-subsection">
                <h4 class="hc-subtitle">ACA Subsidy Rules (law setting)</h4>
                <label class="field compact">
                  <select class="field-input"
                    [ngModel]="healthcare.subsidyRegime()"
                    (ngModelChange)="healthcare.subsidyRegime.set($event)">
                    <option value="cliff">Cliff (pre-ARPA — in effect for 2026)</option>
                    <option value="enhanced">Enhanced (8.5% cap — if Senate extends)</option>
                  </select>
                </label>
                <div class="hc-help">
                  The ARPA/IRA enhanced subsidies expired Dec 31 2025. Until Congress extends,
                  2026 coverage follows pre-ARPA rules: sliding applicable-pct by FPL bucket with a
                  <strong>hard cliff at 400% FPL</strong> (~$81,760 for 2 adults).
                  <strong>This dropdown is the law setting</strong> — the "Coverage" badge below
                  is derived from your ages + MAGI under that law.
                </div>
              </div>

              @if (hc.decision.aboveFplCliff) {
                <div class="hc-warn">
                  ⚠ <strong>Above the 400% FPL cliff.</strong>
                  MAGI {{ '$' + healthcare.magi().magiForAca.toFixed(0) }} =
                  {{ (hc.decision.fplPct ?? 0).toFixed(0) }}% of FPL —
                  no subsidy under cliff rules. Full sticker pricing applies.
                </div>
              }

              <div class="hc-hint">
                @if (hc.decision.regime === 'cliff') {
                  Cliff regime: sliding applicable-pct on MAGI (2.07%–9.83%), zero subsidy above 400% FPL.
                } @else {
                  Enhanced regime: flat 8.5% of <strong>MAGI</strong> cap, no cliff.
                }
                Roth withdrawals don't count toward MAGI; Social Security counts at 100% for ACA even
                though only {{ (magiSsTaxabilityPct() * 100).toFixed(0) }}% is federally taxed.
                Current: <strong>{{ (hc.decision.fplPct ?? 0).toFixed(0) }}% of FPL</strong>.
              </div>
              @if (hc.decision.acaEstimate?.disclaimer) {
                <div class="hc-disclaimer">
                  <span class="hc-badge-level">{{ hc.decision.acaEstimate?.level ?? '—' }}-level</span>
                  Benchmark for <strong>{{ hc.decision.acaEstimate?.rateArea ?? 'this location' }}</strong>.
                  {{ hc.decision.acaEstimate?.disclaimer }}
                  <a href="https://www.healthcare.gov/see-plans/" target="_blank" rel="noopener">
                    Get a real quote →
                  </a>
                </div>
              }
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .assumptions-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .screen-header > div:nth-child(2) { flex: 1; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }
    .save-bar { display: flex; align-items: center; gap: 10px; }
    .save-msg { font-size: 12px; color: var(--dark-green); }
    .save-msg.err { color: var(--dark-red); }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0; }
    .add-btn { --mdc-outlined-button-container-height: 30px; --mdc-outlined-button-label-text-size: 11px; }

    .field-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field.compact { min-width: 130px; }
    .field-label { font-size: 11px; color: var(--dark-text-muted); }
    .field-input {
      font-size: 13px; color: var(--dark-text);
      background: var(--dark-bg-secondary); border: 1px solid var(--dark-border);
      border-radius: 6px; padding: 6px 8px; outline: none;
    }
    .field-input:focus { border-color: var(--dark-amber); }
    .field-range { width: 100%; accent-color: var(--dark-amber); }

    .editor-row {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 12px 0; border-bottom: 1px solid var(--dark-bg-secondary);
    }
    .editor-row:last-child { border-bottom: none; }
    .row-fields { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .remove-btn {
      width: 28px; height: 28px; border-radius: 4px; border: 1px solid var(--dark-border);
      background: transparent; color: var(--dark-text-muted); cursor: pointer; font-size: 16px;
      align-self: flex-start; margin-top: 18px;
    }
    .remove-btn:hover { color: var(--dark-red); border-color: var(--dark-red); }

    .hc-card { display: flex; flex-direction: column; gap: 14px; }
    .hc-subsection { padding-bottom: 10px; border-bottom: 1px solid var(--dark-bg-secondary); }
    .hc-subtitle { font-size: 11px; font-weight: 600; color: var(--dark-text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 10px; }
    .hc-help { font-size: 11px; color: var(--dark-text-muted); margin: -4px 0 10px; line-height: 1.5; }
    .hc-apply-wrap { justify-content: flex-end; }
    .hc-apply-btn {
      --mdc-outlined-button-container-height: 34px;
      --mdc-outlined-button-label-text-size: 12px;
      margin-top: 14px;
    }
    .hc-income-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .hc-sub { font-size: 10px; color: var(--dark-text-muted); margin-top: 2px; }
    .hc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
    .hc-stat { display: flex; flex-direction: column; gap: 3px; }
    .hc-label { font-size: 10px; color: var(--dark-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .hc-value { font-size: 14px; font-weight: 600; color: var(--dark-text); font-variant-numeric: tabular-nums; }
    .hc-cost { color: var(--dark-amber); }
    .hc-src-medicare         { color: var(--dark-green); }
    .hc-src-aca-subsidized   { color: var(--dark-blue); }
    .hc-src-aca-unsubsidized { color: var(--dark-red); }
    .hc-src-mixed            { color: var(--dark-purple); }
    .hc-hint {
      margin-top: 12px; padding: 8px 10px;
      background: var(--dark-bg-secondary); border-radius: 6px;
      font-size: 11px; color: var(--dark-text-muted); line-height: 1.5;
    }
    .hc-warn {
      margin-top: 6px; padding: 10px 12px;
      background: rgba(229, 115, 115, 0.08);
      border: 1px solid rgba(229, 115, 115, 0.35);
      border-left: 3px solid var(--dark-red);
      border-radius: 6px;
      font-size: 12px; color: var(--dark-text); line-height: 1.55;
    }
    .hc-disclaimer {
      margin-top: 6px; padding: 8px 10px;
      background: rgba(212, 148, 58, 0.08);
      border: 1px solid rgba(212, 148, 58, 0.25);
      border-radius: 6px;
      font-size: 11px; color: var(--dark-text-muted); line-height: 1.55;
    }
    .hc-disclaimer strong { color: var(--dark-text); }
    .hc-disclaimer a { color: var(--dark-amber); text-decoration: none; font-weight: 600; }
    .hc-disclaimer a:hover { text-decoration: underline; }
    .hc-badge-level {
      display: inline-block; font-size: 9px; font-weight: 700;
      padding: 1px 6px; margin-right: 6px; border-radius: 3px;
      background: rgba(76, 175, 80, 0.15); color: var(--dark-green);
      text-transform: uppercase; letter-spacing: 0.5px;
    }

    .derived-row { margin-top: 10px; font-size: 12px; color: var(--dark-text-sec); }
    .derived-row strong { color: var(--dark-text); }
    .empty-hint { font-size: 12px; color: var(--dark-text-muted); padding: 8px 0; }
    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class AssumptionsScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly healthcare = inject(HealthcareService);
  readonly loc = inject(LocationService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly saveMsg = signal<string | null>(null);
  readonly saveErr = signal(false);
  readonly draft = signal<HouseholdProfile | null>(null);
  readonly dirty = signal(false);

  readonly dependentCount = computed(() =>
    this.draft()?.members.filter(m => m.role === 'dependent').length ?? 0
  );
  readonly adultCount = computed(() =>
    this.draft()?.members.filter(m => m.role !== 'dependent').length ?? 0
  );

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getHousehold().subscribe({
      next: (h) => { this.draft.set(h); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.loc.loadFull();
    this.healthcare.load();
  }

  /** Healthcare decision against the first selected location (or first full location). */
  healthcareDecision() {
    const pool = this.loc.selectedFullLocations();
    const ref = pool[0] ?? this.loc.fullLocations()[0];
    if (!ref) return null;
    return { location: ref, decision: this.healthcare.decide(ref) };
  }

  healthcareSourceLabel(src: string): string {
    switch (src) {
      case 'medicare':         return 'Medicare';
      case 'aca-subsidized':   return 'ACA (subsidized)';
      case 'aca-unsubsidized': return 'ACA (unsubsidized)';
      case 'mixed':            return 'Mixed (Medicare + ACA)';
      default:                 return '—';
    }
  }

  /** Fraction of SS that's federally taxable right now — shown in the ACA hint. */
  magiSsTaxabilityPct(): number {
    const m = this.healthcare.magi();
    const ss = this.healthcare.income().ssAnnual;
    return ss > 0 ? m.taxableSS / ss : 0;
  }

  patch(partial: Partial<HouseholdProfile>): void {
    this.draft.update(d => d ? { ...d, ...partial } : d);
    this.dirty.set(true);
  }

  patchMember(idx: number, partial: Partial<HouseholdMember>): void {
    this.draft.update(d => {
      if (!d) return d;
      const members = d.members.map((m, i) => i === idx ? { ...m, ...partial } : m);
      return { ...d, members };
    });
    this.dirty.set(true);
  }

  onMemberRoleChange(idx: number, role: MemberRole): void {
    this.patchMember(idx, {
      role,
      dependentType: role === 'dependent' ? 'child' : null,
    });
  }

  addMember(): void {
    const newMember: HouseholdMember = {
      id: crypto.randomUUID(),
      role: 'primary',
      dependentType: null,
      name: 'New Member',
      birthYear: 1970,
      ssPia: null,
      ssFra: 67,
      ssClaimAge: 67,
      sortOrder: this.draft()?.members.length ?? 0,
    };
    this.draft.update(d => d ? { ...d, members: [...d.members, newMember] } : d);
    this.dirty.set(true);
  }

  removeMember(idx: number): void {
    this.draft.update(d => d ? { ...d, members: d.members.filter((_, i) => i !== idx) } : d);
    this.dirty.set(true);
  }

  patchPet(idx: number, partial: Partial<HouseholdPet>): void {
    this.draft.update(d => {
      if (!d) return d;
      const pets = d.pets.map((p, i) => i === idx ? { ...p, ...partial } : p);
      return { ...d, pets };
    });
    this.dirty.set(true);
  }

  addPet(): void {
    const newPet: HouseholdPet = {
      id: crypto.randomUUID(),
      name: 'New Pet',
      type: 'dog',
      breed: null,
      size: null,
      weight: 30,
      weightTier: 'medium',
      feedingMode: 'commercial',
      birthYear: new Date().getFullYear() - 3,
      expectedLifespan: 12,
      sortOrder: this.draft()?.pets.length ?? 0,
    };
    this.draft.update(d => d ? { ...d, pets: [...d.pets, newPet] } : d);
    this.dirty.set(true);
  }

  removePet(idx: number): void {
    this.draft.update(d => d ? { ...d, pets: d.pets.filter((_, i) => i !== idx) } : d);
    this.dirty.set(true);
  }

  save(): void {
    const d = this.draft();
    if (!d) return;
    this.saving.set(true);
    this.saveMsg.set(null);
    this.saveErr.set(false);
    const payload: Partial<HouseholdProfile> = {
      adultsCount: d.adultsCount,
      targetAnnualIncome: d.targetAnnualIncome,
      planningStartYear: d.planningStartYear,
      planningYears: d.planningYears,
      requirements: d.requirements,
      members: d.members,
      pets: d.pets,
    };
    this.api.updateHousehold(payload).subscribe({
      next: (h) => {
        this.draft.set(h);
        this.dirty.set(false);
        this.saving.set(false);
        this.saveMsg.set('Saved.');
        setTimeout(() => this.saveMsg.set(null), 3000);
      },
      error: (err) => {
        this.saving.set(false);
        this.saveErr.set(true);
        const detail = err?.error?.details?.[0]?.message ?? err?.error?.error ?? err?.message ?? 'Save failed.';
        this.saveMsg.set(detail);
      },
    });
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
