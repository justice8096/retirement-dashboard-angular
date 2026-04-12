import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { HouseholdProfile } from '@models/api.model';

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
      </div>

      @if (loading()) {
        <div class="status-msg">Loading household data…</div>
      } @else if (!household()) {
        <div class="status-msg">No household profile found. Create one to get started.</div>
      } @else {
        <!-- Planning parameters -->
        <div class="card">
          <h3 class="card-title">Planning Parameters</h3>
          <div class="field-grid">
            <label class="field">
              <span class="field-label">Target Annual Income</span>
              <div class="field-value" [class]="dyscalculia.numberSpacingClass()">
                {{ fmt(household()!.targetAnnualIncome) }}
              </div>
            </label>
            <div class="field">
              <span class="field-label">Planning Start Year</span>
              <div class="field-value">{{ household()!.planningStartYear }}</div>
            </div>
            <div class="field">
              <span class="field-label">Planning Horizon</span>
              <div class="field-value">{{ household()!.planningYears }} years</div>
            </div>
            <div class="field">
              <span class="field-label">Adults in Household</span>
              <div class="field-value">{{ household()!.adultsCount }}</div>
            </div>
          </div>
        </div>

        <!-- Members -->
        <div class="card">
          <h3 class="card-title">Household Members</h3>
          @for (member of household()!.members; track member.id) {
            <div class="member-row">
              <div class="member-info">
                <span class="member-name">{{ member.name }}</span>
                <span class="member-badge">{{ member.role }}</span>
                @if (member.dependentType) {
                  <span class="member-badge dep">{{ member.dependentType }}</span>
                }
              </div>
              <div class="member-details">
                <span>Born {{ member.birthYear }}</span>
                @if (member.ssPia) {
                  <span>· PIA {{ fmt(member.ssPia) }}</span>
                }
              </div>
            </div>
          } @empty {
            <div class="empty-hint">No members added yet.</div>
          }
        </div>

        <!-- Pets -->
        @if (household()!.pets.length) {
          <div class="card">
            <h3 class="card-title">Pets</h3>
            @for (pet of household()!.pets; track pet.id) {
              <div class="member-row">
                <div class="member-info">
                  <span class="member-name">{{ pet.name }}</span>
                  <span class="member-badge">{{ pet.type }}</span>
                  @if (pet.breed) {
                    <span class="member-badge">{{ pet.breed }}</span>
                  }
                </div>
                <div class="member-details">
                  <span>{{ pet.weight }}{{ pet.weightTier }} · Born {{ pet.birthYear }}</span>
                  <span>· Lifespan ~{{ pet.expectedLifespan }}yr</span>
                </div>
              </div>
            }
          </div>
        }

        <!-- Requirements -->
        @if (household()!.requirements.length) {
          <div class="card">
            <h3 class="card-title">Requirements</h3>
            <div class="req-list">
              @for (req of household()!.requirements; track req) {
                <span class="req-chip">{{ req }}</span>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .assumptions-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .field-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field-label { font-size: 11px; color: var(--dark-text-muted); }
    .field-value { font-size: 16px; font-weight: 600; color: var(--dark-text); }

    .member-row {
      padding: 10px 0; border-bottom: 1px solid var(--dark-bg-secondary);
    }
    .member-row:last-child { border-bottom: none; }
    .member-info { display: flex; align-items: center; gap: 8px; }
    .member-name { font-size: 14px; font-weight: 600; color: var(--dark-text); }
    .member-badge {
      font-size: 10px; color: var(--dark-text-muted); text-transform: uppercase;
      padding: 2px 6px; background: var(--dark-bg-secondary); border-radius: 4px;
    }
    .member-badge.dep { background: rgba(156, 111, 222, 0.12); color: var(--dark-purple); }
    .member-details { font-size: 11px; color: var(--dark-text-sec); margin-top: 4px; }

    .req-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .req-chip {
      padding: 4px 10px; font-size: 11px; border-radius: 6px;
      background: rgba(92, 156, 230, 0.1); color: var(--dark-blue);
      border: 1px solid rgba(92, 156, 230, 0.2);
    }

    .empty-hint { font-size: 12px; color: var(--dark-text-muted); }
    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class AssumptionsScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loading = signal(false);
  readonly household = signal<HouseholdProfile | null>(null);

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getHousehold().subscribe({
      next: (h) => { this.household.set(h); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
