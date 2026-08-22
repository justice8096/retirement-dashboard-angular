import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { forkJoin, of } from 'rxjs';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { HealthcareService } from '@services/healthcare.service';
import { LocationService } from '@services/location.service';
import { RentalIncomeService } from '@services/rental-income.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import {
  HouseholdProfile, HouseholdMember, HouseholdPet,
  MemberRole, DependentType, PetType,
} from '@models/api.model';
import type { RentalProperty } from '@app/lib/rental-income';
import { spousalTopUps } from '@app/lib/ss-benefits';

type MemberDraft = Partial<HouseholdMember> & { birthYear: number; role: MemberRole };
type PetDraft = Partial<HouseholdPet> & { birthYear: number; type: PetType };

@Component({
  selector: 'app-assumptions-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective],
  templateUrl: './assumptions-screen.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./assumptions-screen.component.scss'],
})
export class AssumptionsScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly currency = inject(CurrencyFormatService);
  readonly healthcare = inject(HealthcareService);
  readonly loc = inject(LocationService);
  readonly rental = inject(RentalIncomeService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly saveMsg = signal<string | null>(null);
  readonly saveErr = signal(false);
  readonly draft = signal<HouseholdProfile | null>(null);
  readonly dirty = signal(false);

  // Primary-residence mortgage (Todo #28). Two scalars on FinancialSettings;
  // local signals here so the Save button can detect dirty edits and the
  // forkJoin can fire a paired PUT alongside household + rental.
  readonly mortgageMonthlyPayment = signal(0);
  readonly mortgageEndYear = signal(0);
  // Single dirty flag for any FinancialSettings-bound field on this screen
  // (mortgage + transitionYearExtraIncome). One PUT covers all of them.
  readonly financialDirty = signal(false);

  /** Years remaining on the mortgage from sim-year 0. Live preview. */
  readonly mortgageYearsRemaining = computed(() =>
    Math.max(0, this.mortgageEndYear()),
  );
  /** Total nominal P+I dollars from sim-year 0 to payoff. Live preview. */
  readonly mortgageTotalRemaining = computed(() =>
    this.mortgageMonthlyPayment() * 12 * this.mortgageYearsRemaining(),
  );

  readonly dependentCount = computed(() =>
    this.draft()?.members.filter(m => m.role === 'dependent').length ?? 0
  );
  readonly adultCount = computed(() =>
    this.draft()?.members.filter(m => m.role !== 'dependent').length ?? 0
  );

  /** Monthly spousal top-up per member, index-aligned with draft().members.
   *  Live preview: excess of half the other spouse's PIA over the member's
   *  own PIA, reduced for early claiming. Zero unless a primary + spouse
   *  pair both have a PIA entered. */
  readonly memberSpousalTopUps = computed(() =>
    spousalTopUps(this.draft()?.members ?? []),
  );

  /** True when we're in the new-user creation path (no profile existed
   *  on the server). Drives the welcome banner and the save-button label. */
  readonly isNew = signal(false);

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getHousehold().subscribe({
      next: (h) => { this.draft.set(h); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        // 404 = first-time user. Populate a default draft so the form
        // renders and Save creates the profile on the server.
        // Anything else (500, network) leaves draft null and surfaces the
        // generic loading-failed state.
        if (err.status === 404) {
          this.draft.set(this.emptyProfile());
          this.isNew.set(true);
          this.dirty.set(true);
        }
        this.loading.set(false);
      },
    });
    this.loc.loadFull();
    this.healthcare.load();
    this.rental.load();
    // Mortgage + transition-year fields piggyback on the financial endpoint
    // (Todos #28, #38). No dedicated service — three scalars don't justify
    // one. Failures are benign (fields stay at 0 defaults).
    this.api.getFinancial().subscribe({
      next: (f) => {
        this.mortgageMonthlyPayment.set(Number(f.mortgageMonthlyPayment) || 0);
        this.mortgageEndYear.set(Number(f.mortgageEndYear) || 0);
        this.healthcare.transitionYearExtraIncome.set(Number(f.transitionYearExtraIncome) || 0);
        this.financialDirty.set(false);
      },
      error: () => { /* leave at 0 defaults; Settings screen will surface load errors */ },
    });
  }

  /** Patch one or both mortgage fields. Flips dirty so the Save button enables. */
  patchMortgage(partial: { mortgageMonthlyPayment?: number; mortgageEndYear?: number }): void {
    if (partial.mortgageMonthlyPayment !== undefined) {
      this.mortgageMonthlyPayment.set(partial.mortgageMonthlyPayment);
    }
    if (partial.mortgageEndYear !== undefined) {
      this.mortgageEndYear.set(partial.mortgageEndYear);
    }
    this.financialDirty.set(true);
  }

  /** Patch the transition-year ACA spike. Flips dirty so the Save button enables. */
  patchTransitionYearExtraIncome(value: number): void {
    this.healthcare.transitionYearExtraIncome.set(Number.isFinite(value) ? value : 0);
    this.financialDirty.set(true);
  }

  /** Mark the income composition / ACA-assumptions block dirty so Save enables.
   *  The template appends this to each income/strategy/regime/need binding. */
  markIncomeDirty(): void {
    this.financialDirty.set(true);
  }

  private emptyProfile(): HouseholdProfile {
    return {
      id: '',
      adultsCount: 1,
      targetAnnualIncome: 0,
      planningStartYear: new Date().getFullYear(),
      planningYears: 30,
      requirements: [],
      members: [],
      pets: [],
      createdAt: '',
      updatedAt: '',
    };
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
  /** Whole-number version (0–100) for rendering through dyscalculia.formatCount. */
  magiSsTaxabilityWhole(): number {
    return Math.round(this.magiSsTaxabilityPct() * 100);
  }

  /** Currency formatters that honor the user's dyscalculia number-format preference. */
  fmtYearly(v: number): string { return this.currency.currencyYearly(v); }
  fmtMonthly(v: number): string { return this.currency.currencyMonthly(v); }
  fmtFplPct(pct: number): string { return this.dyscalculia.formatCount(Math.round(pct), '% of the poverty line'); }

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

  // ─── Rental properties (session-only, see RentalIncomeService) ───────
  // No `dirty` flag: rental state isn't persisted to the household
  // endpoint in v1. The Save button stays disabled-or-saved purely from
  // household-profile changes.

  addRental(): void { this.rental.add(); }
  removeRental(id: string): void { this.rental.remove(id); }
  patchRental(id: string, partial: Partial<RentalProperty>): void {
    this.rental.patch(id, partial);
  }
  /** Convert empty-string / NaN to undefined for the optional ownedThroughYear input. */
  setOwnedThrough(id: string, raw: number | string): void {
    const n = typeof raw === 'number' ? raw : Number(raw);
    this.rental.patch(id, { ownedThroughYear: Number.isFinite(n) && n > 0 ? n : undefined });
  }

  save(): void {
    const d = this.draft();
    if (!d) return;
    this.saving.set(true);
    this.saveMsg.set(null);
    this.saveErr.set(false);
    // API-side Zod expects numbers on all numeric fields, but Prisma Decimal
    // columns round-trip as strings over JSON. Coerce every numeric field
    // before PUT or the server rejects with "expects number, sent string".
    const num = (v: unknown): number => Number(v) || 0;
    const payload: Partial<HouseholdProfile> = {
      adultsCount: num(d.adultsCount),
      targetAnnualIncome: num(d.targetAnnualIncome),
      planningStartYear: num(d.planningStartYear),
      planningYears: num(d.planningYears),
      requirements: d.requirements,
      members: d.members.map(m => ({
        ...m,
        birthYear: num(m.birthYear),
        ssPia: m.ssPia == null ? null : num(m.ssPia),
        ssFra: m.ssFra == null ? null : num(m.ssFra),
        ssClaimAge: m.ssClaimAge == null ? null : num(m.ssClaimAge),
      })),
      pets: d.pets.map(p => ({
        ...p,
        weight: num(p.weight),
        birthYear: num(p.birthYear),
        expectedLifespan: num(p.expectedLifespan),
        // FU-021 — API rejects `feedingMode` on any non-dog/non-cat pet
        // ("feedingMode is only supported for dogs and cats"). Strip it
        // on the way out rather than letting the UI leak a stale value
        // into the save payload.
        feedingMode: (p.type === 'dog' || p.type === 'cat') ? p.feedingMode : null,
      })),
    };
    // Persist household + rental + mortgage in parallel (Todos #36 + #28).
    // All three must succeed for the user-facing "Saved." banner. forkJoin
    // emits once all complete; an error from any arm propagates and
    // surfaces a single failure message. Each arm short-circuits to of(null)
    // when not dirty so we don't fire spurious PUTs.
    forkJoin({
      household: this.api.updateHousehold(payload),
      rental: this.rental.dirty() ? this.rental.save() : of(null),
      financial: this.financialDirty()
        ? this.api.updateFinancial({
            mortgageMonthlyPayment: this.mortgageMonthlyPayment(),
            mortgageEndYear: this.mortgageEndYear(),
            transitionYearExtraIncome: this.healthcare.transitionYearExtraIncome(),
            // Income composition + ACA assumptions (now persisted).
            ...this.healthcare.incomeSavePayload(),
          })
        : of(null),
    }).subscribe({
      next: ({ household: h }) => {
        this.draft.set(h);
        this.dirty.set(false);
        this.financialDirty.set(false);
        this.saving.set(false);
        // First successful PUT created the profile — flip out of new-user mode
        // so the welcome banner disappears and the button label reverts.
        const wasNew = this.isNew();
        this.isNew.set(false);
        this.saveMsg.set(wasNew ? 'Profile created.' : 'Saved.');
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

  fmt(amount: number): string { return this.currency.currency(amount); }
}
