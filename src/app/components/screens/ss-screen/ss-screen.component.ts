import { Component, inject, computed, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { HouseholdProfile, HouseholdMember } from '@models/api.model';

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
                <div class="field-value">{{ member.ssClaimAge ?? '—' }}</div>
              </div>
              <div class="field">
                <label class="field-label">Birth Year</label>
                <div class="field-value">{{ member.birthYear }}</div>
              </div>
              <div class="field">
                <label class="field-label">Est. Monthly Benefit</label>
                <div class="field-value highlight" [class]="dyscalculia.numberSpacingClass()">
                  {{ member.ssPia ? fmt(estimateBenefit(member)) : '—' }}
                </div>
              </div>
              <div class="field">
                <label class="field-label">Est. Annual Benefit</label>
                <div class="field-value highlight" [class]="dyscalculia.numberSpacingClass()">
                  {{ member.ssPia ? fmt(estimateBenefit(member) * 12) : '—' }}
                </div>
              </div>
            </div>
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

  readonly ssMembers = computed(() => {
    const h = this.household();
    if (!h) return [];
    return h.members.filter(m => m.role === 'primary' || m.role === 'spouse');
  });

  readonly totalMonthly = computed(() =>
    this.ssMembers().reduce((sum, m) => sum + this.estimateBenefit(m), 0)
  );

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getHousehold().subscribe({
      next: (h) => { this.household.set(h); this.loading.set(false); },
      error: (err) => { this.error.set(err?.error?.message ?? 'Could not load household'); this.loading.set(false); },
    });
  }

  estimateBenefit(m: HouseholdMember): number {
    if (!m.ssPia || !m.ssFra || !m.ssClaimAge) return 0;
    const diff = m.ssClaimAge - m.ssFra;
    if (diff === 0) return m.ssPia;
    if (diff > 0) return Math.round(m.ssPia * (1 + diff * 0.08));
    // Early claiming: ~6.67% per year reduction for first 3 years, 5% after
    const yearsEarly = Math.abs(diff);
    const reduction = yearsEarly <= 3 ? yearsEarly * 0.0667 : 3 * 0.0667 + (yearsEarly - 3) * 0.05;
    return Math.round(m.ssPia * (1 - reduction));
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + Math.round(amount).toLocaleString();
  }
}
