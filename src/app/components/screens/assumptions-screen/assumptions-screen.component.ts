import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { HealthcareService } from '@services/healthcare.service';
import { LocationService } from '@services/location.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import {
  HouseholdProfile, HouseholdMember, HouseholdPet,
  MemberRole, DependentType, PetType,
} from '@models/api.model';

type MemberDraft = Partial<HouseholdMember> & { birthYear: number; role: MemberRole };
type PetDraft = Partial<HouseholdPet> & { birthYear: number; type: PetType };

@Component({
  selector: 'app-assumptions-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule, NumericInputDirective],
  templateUrl: './assumptions-screen.component.html',
  styleUrls: ['./assumptions-screen.component.scss'],
})
export class AssumptionsScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  private readonly currency = inject(CurrencyFormatService);
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

  fmt(amount: number): string { return this.currency.currency(amount); }
}
