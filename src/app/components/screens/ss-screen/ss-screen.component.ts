import { Component, inject, computed, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { HouseholdProfile, HouseholdMember } from '@models/api.model';
import { calcSSBenefit, calcSpousalBenefit } from '@retirement/shared';
import { formatClaimAge } from '@app/lib/social-security';

const CLAIM_AGE_MIN = 62;
const CLAIM_AGE_MAX = 70;

@Component({
  selector: 'app-ss-screen',
  standalone: true,
  imports: [FormsModule, MatButtonModule],
  template: `
    <div class="ss-screen">
      <div class="screen-header">
        <span class="header-icon">🏛️</span>
        <div>
          <h2 class="header-title">Social Security</h2>
          <p class="header-sub">Estimate benefits based on PIA, claim age, and COLA</p>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading household data…</div>
      } @else if (error()) {
        <div class="status-msg error">{{ error() }}</div>
      } @else {

        @for (member of ssMembers(); track member.id) {
          <div class="member-card">
            <div class="member-header">
              <span class="member-name">{{ member.name }}</span>
              <span class="member-role">{{ member.role }}</span>
            </div>

            <div class="field-grid">
              <div class="field">
                <label class="field-label">PIA (monthly)</label>
                <div class="field-value" [class]="dyscalculia.numberSpacingClass()">
                  {{ member.ssPia ? fmt(member.ssPia) : '—' }}
                </div>
              </div>
              <div class="field">
                <label class="field-label">FRA</label>
                <div class="field-value">{{ member.ssFra ?? '—' }}</div>
              </div>
              <div class="field">
                <label class="field-label">Claim Age</label>
                <div class="field-value">{{ claimAgeLabel(member) }}</div>
              </div>
              <div class="field">
                <label class="field-label">Birth Year</label>
                <div class="field-value">{{ member.birthYear }}</div>
              </div>
            </div>

            @if (member.ssPia && member.ssFra) {
              <div class="explore-block">
                <label class="slider-label" [attr.for]="'claim-slider-' + member.id">
                  Explore Claim Age: <strong>{{ exploreAgeFor(member) }}</strong>
                </label>
                <input
                  type="range"
                  class="claim-slider"
                  [id]="'claim-slider-' + member.id"
                  [min]="claimAgeMin" [max]="claimAgeMax" step="1"
                  [ngModel]="exploreAgeFor(member)"
                  (ngModelChange)="setExploreAge(member.id, +$event)"
                  [attr.aria-label]="member.name + ' claim age'"
                  [attr.aria-valuemin]="claimAgeMin"
                  [attr.aria-valuemax]="claimAgeMax"
                  [attr.aria-valuenow]="exploreAgeFor(member)"
                  [attr.aria-valuetext]="claimAgeValueText(member, exploreAgeFor(member))" />
                <div class="slider-legend">
                  <span>{{ claimAgeMin }} (early)</span>
                  <span>{{ member.ssFra }} (FRA)</span>
                  <span>{{ claimAgeMax }} (max)</span>
                </div>

                <div class="field-grid">
                  <div class="field">
                    <label class="field-label">Benefit at {{ exploreAgeFor(member) }}</label>
                    <div class="field-value highlight" [class]="dyscalculia.numberSpacingClass()">
                      {{ fmt(exploreBenefit(member)) }}
                      @if (spousalTopUpFor(member) > 0) {
                        <span class="spousal-note"> + {{ fmt(spousalTopUpFor(member)) }} spousal</span>
                      }
                    </div>
                  </div>
                  <div class="field">
                    <label class="field-label">Annual at {{ exploreAgeFor(member) }}</label>
                    <div class="field-value highlight" [class]="dyscalculia.numberSpacingClass()">
                      {{ fmt((exploreBenefit(member) + spousalTopUpFor(member)) * 12) }}
                    </div>
                  </div>
                </div>

                <table class="compare-table">
                  <caption>Claiming at 62 vs {{ member.ssFra }} (FRA) vs 70</caption>
                  <thead>
                    <tr>
                      <th scope="col">Age {{ claimAgeMin }}</th>
                      <th scope="col">Age {{ member.ssFra }} (FRA)</th>
                      <th scope="col">Age {{ claimAgeMax }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        [class]="dyscalculia.numberSpacingClass()"
                        [class.current]="exploreAgeFor(member) === claimAgeMin">
                        {{ fmt(benefitAt(member, claimAgeMin)) }}
                      </td>
                      <td
                        [class]="dyscalculia.numberSpacingClass()"
                        [class.current]="exploreAgeFor(member) === member.ssFra">
                        {{ fmt(benefitAt(member, member.ssFra!)) }}
                      </td>
                      <td
                        [class]="dyscalculia.numberSpacingClass()"
                        [class.current]="exploreAgeFor(member) === claimAgeMax">
                        {{ fmt(benefitAt(member, claimAgeMax)) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="hint explore-hint">
                Add a PIA and FRA on the Assumptions screen to explore claim ages for {{ member.name }}.
              </p>
            }
          </div>
        } @empty {
          <div class="empty-state">
            <p>No household members with Social Security data configured.</p>
            <p class="hint">Add PIA, FRA, and claim age info through the Setup → Assumptions screen.</p>
          </div>
        }

        @if (ssMembers().length) {
          <div class="total-card">
            <span class="total-label">Combined Monthly SS Income</span>
            <span class="total-value" [class]="dyscalculia.numberSpacingClass()">
              {{ fmt(totalMonthly()) }}
            </span>
          </div>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .ss-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .member-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .member-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
    .member-name { font-size: 16px; font-weight: 700; color: var(--dark-text); }
    .member-role {
      font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase;
      padding: 2px 8px; background: var(--dark-bg-secondary); border-radius: 4px;
    }

    .field-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
    .field-label { font-size: 11px; color: var(--dark-text-muted); margin-bottom: 4px; display: block; }
    .field-value { font-size: 15px; font-weight: 600; color: var(--dark-text); }
    .field-value.highlight { color: var(--dark-amber); }
    .spousal-note { font-size: 12px; color: var(--dark-text-sec); font-weight: 500; }

    .explore-block {
      margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--dark-border);
      display: flex; flex-direction: column; gap: 10px;
    }
    .slider-label { font-size: 13px; color: var(--dark-text); font-weight: 600; }
    .claim-slider { width: 100%; }
    .slider-legend {
      display: flex; justify-content: space-between; font-size: 11px; color: var(--dark-text-muted);
    }

    .compare-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .compare-table caption {
      text-align: left; font-size: 12px; color: var(--dark-text-muted); margin-bottom: 6px; caption-side: top;
    }
    .compare-table th, .compare-table td {
      text-align: center; padding: 8px; font-size: 14px; font-weight: 600; color: var(--dark-text);
      border: 1px solid var(--dark-border);
    }
    .compare-table th { font-size: 11px; font-weight: 700; color: var(--dark-text-muted); text-transform: uppercase; }
    .compare-table td.current { color: var(--dark-amber); background: var(--dark-bg-secondary); }

    .total-card {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 20px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-amber); border-radius: 10px;
    }
    .total-label { font-size: 14px; font-weight: 600; color: var(--dark-text); }
    .total-value { font-size: 24px; font-weight: 700; color: var(--dark-amber); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
    .status-msg.error { color: var(--dark-red); }
    .empty-state { padding: 40px; text-align: center; color: var(--dark-text-muted); font-size: 13px; }
    .hint { font-size: 11px; color: var(--dark-text-sec); margin-top: 8px; }
  `],
})
export class SsScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly household = signal<HouseholdProfile | null>(null);

  readonly claimAgeMin = CLAIM_AGE_MIN;
  readonly claimAgeMax = CLAIM_AGE_MAX;

  /** Local exploration state — per-member claim age chosen via the slider
   *  on this screen. Seeded from the persisted `ssClaimAge` (falling back
   *  to FRA, then 67) when the household loads, but changes here are NOT
   *  written back to the server. This mirrors the retired React
   *  SSBenefitsTab, whose sliders were explicitly local-only ("do NOT
   *  write back to the store") — the *base* claim age users commit to is
   *  edited on the Assumptions screen; this screen is for "what if I
   *  claimed at age X?" exploration. */
  readonly exploreAges = signal<Record<string, number>>({});

  readonly ssMembers = computed(() => {
    const h = this.household();
    if (!h) return [];
    return h.members.filter(m => m.role === 'primary' || m.role === 'spouse');
  });

  /** Live combined monthly total across all SS-eligible members at their
   *  currently-explored claim ages, including any spousal top-up. Updates
   *  as any slider moves. */
  readonly totalMonthly = computed(() =>
    this.ssMembers().reduce((sum, m) => sum + this.exploreBenefit(m) + this.spousalTopUpFor(m), 0)
  );

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getHousehold().subscribe({
      next: (h) => {
        this.household.set(h);
        this.exploreAges.set(Object.fromEntries(
          h.members
            .filter(m => m.role === 'primary' || m.role === 'spouse')
            .map(m => [m.id, m.ssClaimAge ?? m.ssFra ?? 67]),
        ));
        this.loading.set(false);
      },
      error: (err) => { this.error.set(err?.error?.message ?? 'Could not load household'); this.loading.set(false); },
    });
  }

  exploreAgeFor(m: HouseholdMember): number {
    return this.exploreAges()[m.id] ?? m.ssClaimAge ?? m.ssFra ?? 67;
  }

  setExploreAge(memberId: string, age: number): void {
    const clamped = Math.min(CLAIM_AGE_MAX, Math.max(CLAIM_AGE_MIN, age));
    this.exploreAges.update(cur => ({ ...cur, [memberId]: clamped }));
  }

  /** Own-record benefit at a given claim age, using the same SSA formula
   *  (`@retirement/shared`'s `calcSSBenefit`) the retired React dashboard
   *  used — early-claim reduction (5/9% per month for the first 36 months,
   *  5/12% per month beyond that) and delayed credits (8%/year to 70). */
  benefitAt(m: HouseholdMember, age: number): number {
    if (!m.ssPia || !m.ssFra) return 0;
    return calcSSBenefit(m.ssPia, m.ssFra, age);
  }

  /** Live benefit at the member's current exploration slider position. */
  exploreBenefit(m: HouseholdMember): number {
    return this.benefitAt(m, this.exploreAgeFor(m));
  }

  /** Spousal top-up, sourced from the primary member's PIA — applies only
   *  to a spouse-role member, mirroring the one-directional
   *  `calcSpousalBenefit(person1.pia, ...)` call in the retired React
   *  SSBenefitsTab (spousal top-up was only ever computed for "Person 2"
   *  there; a primary member never received a spousal top-up from the
   *  spouse's own PIA). Returns 0 for a single-person household or a
   *  primary-role member. */
  spousalTopUpFor(m: HouseholdMember): number {
    // Guard on the member's own PIA too: a spouse with FRA entered but PIA
    // still blank must not receive a phantom full top-up in the total.
    if (m.role !== 'spouse' || !m.ssFra || m.ssPia == null) return 0;
    const primary = this.household()?.members.find(x => x.role === 'primary');
    if (!primary?.ssPia) return 0;
    return calcSpousalBenefit(primary.ssPia, m.ssPia, m.ssFra, this.exploreAgeFor(m));
  }

  /** Plain-language `aria-valuetext` for the claim-age slider — read out
   *  by screen readers instead of a bare number (dyslexia/dyscalculia
   *  accessibility requirement). */
  claimAgeValueText(m: HouseholdMember, age: number): string {
    if (age === m.ssFra) return `Claim at age ${age}, your full retirement age`;
    if (age < (m.ssFra ?? 67)) return `Claim at age ${age}, before full retirement age`;
    return `Claim at age ${age}, after full retirement age`;
  }

  /** Plain-language display of the member's *persisted* claim age (years +
   *  months, set on the Assumptions screen) — distinct from the slider's
   *  local exploration state above. */
  claimAgeLabel(m: HouseholdMember): string {
    return formatClaimAge(m.ssClaimAge, m.ssClaimAgeMonths);
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + Math.round(amount).toLocaleString();
  }
}
