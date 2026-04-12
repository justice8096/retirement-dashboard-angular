import { Component, inject, signal, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { Scenario } from '@models/api.model';

@Component({
  selector: 'app-scenarios-screen',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="scenarios-screen">
      <div class="screen-header">
        <span class="header-icon">📋</span>
        <div>
          <h2 class="header-title">Saved Scenarios</h2>
          <p class="header-sub">Compare your saved retirement simulations</p>
        </div>
      </div>

      @if (loading()) {
        <div class="status-msg">Loading scenarios…</div>
      } @else if (!scenarios().length) {
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>No saved scenarios yet.</p>
          <p class="hint">Run a Monte Carlo simulation and save it to compare different assumptions.</p>
        </div>
      } @else {
        <div class="scenario-grid">
          @for (s of scenarios(); track s.id) {
            <div class="scenario-card" [class.favorite]="s.isFavorite">
              <div class="sc-header">
                <span class="sc-name">{{ s.name }}</span>
                @if (s.isFavorite) {
                  <span class="sc-fav">★</span>
                }
                <span class="sc-type">{{ s.scenarioType }}</span>
              </div>
              <div class="sc-body">
                @if (s.successRate !== null) {
                  <div class="sc-stat">
                    <span class="sc-label">Success Rate</span>
                    <span class="sc-value" [class.good]="s.successRate >= 90"
                      [class.warn]="s.successRate >= 70 && s.successRate < 90"
                      [class.bad]="s.successRate < 70">
                      {{ s.successRate }}%
                    </span>
                  </div>
                }
                @if (s.medianBalance !== null) {
                  <div class="sc-stat">
                    <span class="sc-label">Median Balance</span>
                    <span class="sc-value" [class]="dyscalculia.numberSpacingClass()">{{ fmt(s.medianBalance) }}</span>
                  </div>
                }
                @if (s.simulationRuns !== null) {
                  <div class="sc-stat">
                    <span class="sc-label">Runs</span>
                    <span class="sc-value">{{ s.simulationRuns.toLocaleString() }}</span>
                  </div>
                }
              </div>
              <div class="sc-footer">
                <span class="sc-date">{{ s.updatedAt.substring(0, 10) }}</span>
                <button mat-button class="sc-delete" (click)="deleteScenario(s.id)">Delete</button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .scenarios-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .scenario-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .scenario-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 10px; overflow: hidden;
    }
    .scenario-card.favorite { border-color: var(--dark-amber); }

    .sc-header {
      display: flex; align-items: center; gap: 8px;
      padding: 14px 16px 0;
    }
    .sc-name { font-size: 14px; font-weight: 700; color: var(--dark-text); flex: 1; }
    .sc-fav { color: var(--dark-amber); font-size: 14px; }
    .sc-type {
      font-size: 10px; color: var(--dark-text-muted); text-transform: uppercase;
      padding: 2px 6px; background: var(--dark-bg-secondary); border-radius: 4px;
    }

    .sc-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
    .sc-stat { display: flex; justify-content: space-between; align-items: baseline; }
    .sc-label { font-size: 11px; color: var(--dark-text-sec); }
    .sc-value { font-size: 14px; font-weight: 600; color: var(--dark-amber); }
    .sc-value.good { color: var(--dark-green); }
    .sc-value.warn { color: var(--dark-amber); }
    .sc-value.bad { color: var(--dark-red); }

    .sc-footer {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 16px; border-top: 1px solid var(--dark-bg-secondary);
    }
    .sc-date { font-size: 10px; color: var(--dark-text-muted); }
    .sc-delete { --mdc-text-button-label-text-size: 11px; --mdc-text-button-label-text-color: var(--dark-red); }

    .empty-state { padding: 40px; text-align: center; color: var(--dark-text-muted); font-size: 13px; }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
    .hint { font-size: 11px; color: var(--dark-text-sec); margin-top: 4px; }
    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class ScenariosScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loading = signal(false);
  readonly scenarios = signal<Scenario[]>([]);

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getScenarios().subscribe({
      next: (s) => { this.scenarios.set(s); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  deleteScenario(id: string): void {
    this.api.deleteScenario(id).subscribe({
      next: () => this.scenarios.update(list => list.filter(s => s.id !== id)),
      error: () => {},
    });
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
