import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import { HouseholdProfile } from '@models/api.model';
import {
  IRMAABracket,
  IRMAA_BRACKETS_2026,
  BASE_PART_B_PREMIUM_2026,
} from '@app/lib/irmaa';

/* 2026 IRMAA brackets + base Part B premium are the single source of truth in
 * @app/lib/irmaa (also consumed by the Monte Carlo survivor phase). Aliased
 * here so this screen and the simulation never drift apart. */
const IRMAA_BRACKETS = IRMAA_BRACKETS_2026;
const BASE_PART_B_PREMIUM = BASE_PART_B_PREMIUM_2026;
const MEDICARE_START_AGE = 65;
const MAGI_GROWTH = 0.03;         // 3% annual assumed income growth
const PROJECTION_TO_AGE = 100;

interface ProjectionRow {
  age: number;
  year: number;
  projectedMAGI: number;
  tierLabel: string;
  tierIndex: number;
  partBAnnual: number;
  partDAnnual: number;
  totalAnnual: number;
}

@Component({
  selector: 'app-medicare-irmaa-screen',
  standalone: true,
  imports: [FormsModule, NumericInputDirective],
  templateUrl: './medicare-irmaa-screen.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./medicare-irmaa-screen.component.scss'],
})
export class MedicareIrmaaScreenComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly BASE_PART_B_PREMIUM = BASE_PART_B_PREMIUM;
  readonly PROJECTION_TO_AGE = PROJECTION_TO_AGE;

  readonly filingStatus = signal<'single' | 'married'>('married');
  readonly projectedMAGI = signal(85000);
  readonly household = signal<HouseholdProfile | null>(null);

  readonly brackets = computed(() => IRMAA_BRACKETS[this.filingStatus()]);

  /** Plain-language magnitude anchor for MAGI. Uses `withdrawal-year` since
   *  MAGI is an annual-income quantity; the service already has ranges
   *  calibrated for that context. */
  readonly magiAnchor = computed(() =>
    this.dyscalculia.getAnchor(this.projectedMAGI(), 'withdrawal-year')
  );

  readonly currentTierIndex = computed(() => {
    const magi = this.projectedMAGI();
    const bs = this.brackets();
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]!;
      if (magi >= b.min && magi < b.max) return i;
    }
    return bs.length - 1;
  });

  /** Earliest adult birth year in the household — Medicare coverage starts
   *  at 65 and this drives the start of the projection window. */
  readonly earliestBirthYear = computed<number | null>(() => {
    const h = this.household();
    if (!h) return null;
    const adults = h.members.filter(m => m.role === 'primary' || m.role === 'spouse');
    if (!adults.length) return null;
    return Math.min(...adults.map(a => a.birthYear));
  });

  readonly projections = computed<ProjectionRow[]>(() => {
    const earliest = this.earliestBirthYear();
    if (earliest === null) return [];
    const h = this.household();
    const startYear = h?.planningStartYear ?? new Date().getFullYear();
    const bs = this.brackets();
    const rows: ProjectionRow[] = [];
    let magi = this.projectedMAGI();

    for (let y = 0; y <= PROJECTION_TO_AGE - MEDICARE_START_AGE; y++) {
      const year = startYear + y;
      const age = year - earliest;
      if (age >= MEDICARE_START_AGE && age <= PROJECTION_TO_AGE) {
        const tierIdx = this.findBracketIndex(magi, bs);
        const bracket = bs[tierIdx]!;
        const partBAnnual = Math.round((BASE_PART_B_PREMIUM + bracket.partBSurcharge) * 12);
        const partDAnnual = Math.round(bracket.partDSurcharge * 12);
        rows.push({
          age, year,
          projectedMAGI: Math.round(magi),
          tierLabel: tierIdx === 0 ? 'No surcharge' : `Tier ${tierIdx}`,
          tierIndex: tierIdx,
          partBAnnual, partDAnnual,
          totalAnnual: partBAnnual + partDAnnual,
        });
      }
      magi *= 1 + MAGI_GROWTH;
    }
    return rows;
  });

  readonly summary = computed(() => {
    const rows = this.projections();
    if (!rows.length) return { totalCost: 0, averageAnnual: 0, peakYear: 0, yearsAtBase: 0 };
    const totalCost = rows.reduce((s, r) => s + r.totalAnnual, 0);
    const baseAnnual = BASE_PART_B_PREMIUM * 12;
    return {
      totalCost,
      averageAnnual: Math.round(totalCost / rows.length),
      peakYear: Math.max(...rows.map(r => r.totalAnnual)),
      yearsAtBase: rows.filter(r => r.totalAnnual === baseAnnual).length,
    };
  });

  ngOnInit(): void {
    this.api.getHousehold().subscribe({
      next: (h) => this.household.set(h),
      error: (err) => console.warn('MedicareIrmaa: household fetch failed.', err),
    });
  }

  rangeLabel(b: IRMAABracket): string {
    if (b.min === 0) return `$0 – ${this.plainDollars(b.max)}`;
    if (b.max === Infinity) return `${this.plainDollars(b.min)}+`;
    return `${this.plainDollars(b.min)} – ${this.plainDollars(b.max)}`;
  }

  private findBracketIndex(magi: number, bs: IRMAABracket[]): number {
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i]!;
      if (magi >= b.min && magi < b.max) return i;
    }
    return bs.length - 1;
  }

  /** Annual-dollar amount with the dyscalculia `/yr` unit so totals read
   *  correctly in calm / spaced-number / words mode. */
  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, '/yr')
      : '$' + Math.round(amount).toLocaleString() + '/yr';
  }

  /** Lump-sum dollar figure with no time-unit suffix — for income ranges and
   *  MAGI projections. */
  plainDollars(amount: number): string {
    if (amount === Infinity) return '∞';
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, '')
      : '$' + Math.round(amount).toLocaleString();
  }

  /** Small monthly surcharge amount for the bracket table — routes through
   *  DyscalculiaService so a user with spaced/words `numberFormat` mode gets
   *  consistent rendering across every dollar on the screen (F-016). */
  fmtSurcharge(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount, '/mo')
      : '$' + amount.toFixed(2) + '/mo';
  }
}
