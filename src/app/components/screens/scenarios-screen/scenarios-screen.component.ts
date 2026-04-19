import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { Scenario } from '@models/api.model';

/**
 * A scenario card + comparison table view. The stored Scenario has top-level
 * `successRate` / `medianBalance` columns but the backend POST endpoint only
 * persists `name` + `scenarioData`. So reading `scenarioData.successRate.value`
 * and `scenarioData.percentiles.p50.value` is our source of truth — the top-
 * level columns are a legacy display fallback.
 */
interface ScenarioView {
  scenario: Scenario;
  successRatePct: number | null;  // 0-100
  medianBalance: number | null;
  p5Balance: number | null;
  p95Balance: number | null;
  runs: number | null;
  years: number | null;
  locationName: string | null;
  apportion: string | null;
  regime: string | null;
  magi: number | null;
}

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
      } @else if (!views().length) {
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>No saved scenarios yet.</p>
          <p class="hint">Run a Monte Carlo simulation and click "💾 Save this scenario" to capture it here.</p>
        </div>
      } @else {
        @if (selectedCount() >= 2) {
          <!-- Side-by-side comparison table -->
          <div class="compare-card">
            <div class="compare-head">
              <h3 class="compare-title">Side-by-Side ({{ selectedCount() }} selected)</h3>
              <button mat-button class="compare-clear" (click)="clearSelection()">Clear selection</button>
            </div>
            <div class="compare-scroll">
              <table class="compare-table">
                <thead>
                  <tr>
                    <th class="lbl">Metric</th>
                    @for (v of selectedViews(); track v.scenario.id) {
                      <th class="sc-col">{{ v.scenario.name }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="lbl">Location</td>
                    @for (v of selectedViews(); track v.scenario.id) {
                      <td>{{ v.locationName ?? '—' }}</td>
                    }
                  </tr>
                  <tr class="hi">
                    <td class="lbl">Success Rate</td>
                    @for (v of selectedViews(); track v.scenario.id) {
                      <td [class.best]="isBestSuccess(v)" [class.worst]="isWorstSuccess(v)">
                        @if (v.successRatePct !== null) {
                          <div class="sr">
                            <span class="sr-num">{{ v.successRatePct.toFixed(0) }}%</span>
                            <div class="sr-bar">
                              <div class="sr-fill" [style.width.%]="v.successRatePct"
                                   [class.good]="v.successRatePct >= 90"
                                   [class.mid]="v.successRatePct >= 70 && v.successRatePct < 90"
                                   [class.low]="v.successRatePct < 70"></div>
                            </div>
                          </div>
                        } @else { — }
                      </td>
                    }
                  </tr>
                  <tr>
                    <td class="lbl">Median End Balance</td>
                    @for (v of selectedViews(); track v.scenario.id) {
                      <td [class.best]="isBestMedian(v)" [class.worst]="isWorstMedian(v)"
                          [class]="dyscalculia.numberSpacingClass()">
                        {{ v.medianBalance !== null ? fmt(v.medianBalance) : '—' }}
                      </td>
                    }
                  </tr>
                  <tr>
                    <td class="lbl">5th Percentile</td>
                    @for (v of selectedViews(); track v.scenario.id) {
                      <td [class]="dyscalculia.numberSpacingClass()">
                        {{ v.p5Balance !== null ? fmt(v.p5Balance) : '—' }}
                      </td>
                    }
                  </tr>
                  <tr>
                    <td class="lbl">95th Percentile</td>
                    @for (v of selectedViews(); track v.scenario.id) {
                      <td [class]="dyscalculia.numberSpacingClass()">
                        {{ v.p95Balance !== null ? fmt(v.p95Balance) : '—' }}
                      </td>
                    }
                  </tr>
                  <tr>
                    <td class="lbl">Apportionment</td>
                    @for (v of selectedViews(); track v.scenario.id) {
                      <td>{{ v.apportion ?? '—' }}</td>
                    }
                  </tr>
                  <tr>
                    <td class="lbl">ACA Regime</td>
                    @for (v of selectedViews(); track v.scenario.id) {
                      <td>{{ v.regime ?? '—' }}</td>
                    }
                  </tr>
                  <tr>
                    <td class="lbl">MAGI (entered)</td>
                    @for (v of selectedViews(); track v.scenario.id) {
                      <td [class]="dyscalculia.numberSpacingClass()">
                        {{ v.magi !== null ? fmt(v.magi) : '—' }}
                      </td>
                    }
                  </tr>
                  <tr>
                    <td class="lbl">Runs × Years</td>
                    @for (v of selectedViews(); track v.scenario.id) {
                      <td>{{ (v.runs ?? '—') }} × {{ (v.years ?? '—') }}</td>
                    }
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        } @else if (selectedCount() === 1) {
          <div class="compare-hint">Select one more scenario to compare side-by-side.</div>
        } @else {
          <div class="compare-hint">Check the boxes on 2+ scenarios below to compare side-by-side.</div>
        }

        <div class="scenario-grid">
          @for (v of views(); track v.scenario.id) {
            <div class="scenario-card"
                 [class.favorite]="v.scenario.isFavorite"
                 [class.selected]="selectedIds().has(v.scenario.id)">
              <div class="sc-header">
                <input type="checkbox"
                  [checked]="selectedIds().has(v.scenario.id)"
                  (change)="toggleSelected(v.scenario.id)"
                  [attr.aria-label]="'Select ' + v.scenario.name" />
                <span class="sc-name">{{ v.scenario.name }}</span>
                <button class="sc-fav-btn" (click)="toggleFavorite(v.scenario)"
                        [title]="v.scenario.isFavorite ? 'Unfavorite' : 'Favorite'">
                  {{ v.scenario.isFavorite ? '★' : '☆' }}
                </button>
              </div>
              <div class="sc-body">
                @if (v.successRatePct !== null) {
                  <div class="sc-stat">
                    <span class="sc-label">Success Rate</span>
                    <span class="sc-value"
                      [class.good]="v.successRatePct >= 90"
                      [class.warn]="v.successRatePct >= 70 && v.successRatePct < 90"
                      [class.bad]="v.successRatePct < 70">
                      {{ v.successRatePct.toFixed(0) }}%
                    </span>
                  </div>
                }
                @if (v.medianBalance !== null) {
                  <div class="sc-stat">
                    <span class="sc-label">Median Balance</span>
                    <span class="sc-value" [class]="dyscalculia.numberSpacingClass()">{{ fmt(v.medianBalance) }}</span>
                  </div>
                }
                @if (v.locationName) {
                  <div class="sc-stat">
                    <span class="sc-label">Location</span>
                    <span class="sc-value sc-loc">{{ v.locationName }}</span>
                  </div>
                }
                @if (v.runs !== null) {
                  <div class="sc-stat">
                    <span class="sc-label">Runs</span>
                    <span class="sc-value">{{ v.runs.toLocaleString() }}</span>
                  </div>
                }
              </div>
              <div class="sc-footer">
                <span class="sc-date">{{ v.scenario.updatedAt.substring(0, 10) }}</span>
                <button mat-button class="sc-delete" (click)="deleteScenario(v.scenario.id)">Delete</button>
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

    .compare-hint {
      padding: 10px 14px;
      background: var(--dark-bg-secondary);
      border-left: 3px solid var(--dark-blue);
      border-radius: 6px;
      font-size: 12px; color: var(--dark-text-sec);
    }
    .compare-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-amber);
      border-radius: 12px; padding: 16px;
    }
    .compare-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .compare-title { font-size: 14px; margin: 0; color: var(--dark-text); font-weight: 600; }
    .compare-clear { --mdc-text-button-label-text-size: 11px; }
    .compare-scroll { overflow-x: auto; }
    .compare-table {
      width: 100%; border-collapse: collapse; font-size: 12px;
    }
    .compare-table th, .compare-table td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--dark-bg-secondary);
    }
    .compare-table th.sc-col { font-size: 11px; color: var(--dark-text); font-weight: 600; min-width: 140px; }
    .compare-table td.lbl, .compare-table th.lbl {
      color: var(--dark-text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
      min-width: 130px;
    }
    .compare-table tr.hi { background: rgba(212, 148, 58, 0.04); }
    .compare-table td.best { color: var(--dark-green); font-weight: 700; }
    .compare-table td.worst { color: var(--dark-neutral); font-weight: 600; }
    .sr { display: flex; flex-direction: column; gap: 3px; }
    .sr-num { font-weight: 700; }
    .sr-bar { height: 6px; background: var(--dark-bg-secondary); border-radius: 3px; overflow: hidden; }
    .sr-fill { height: 100%; border-radius: 3px; }
    .sr-fill.good { background: var(--dark-green); }
    .sr-fill.mid  { background: var(--dark-amber); }
    .sr-fill.low  { background: var(--dark-neutral); }

    .scenario-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .scenario-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 10px; overflow: hidden; transition: border-color 0.15s;
    }
    .scenario-card.favorite { border-color: var(--dark-amber); }
    .scenario-card.selected { border-color: var(--dark-blue); box-shadow: 0 0 0 1px var(--dark-blue); }

    .sc-header {
      display: flex; align-items: center; gap: 8px;
      padding: 14px 16px 0;
    }
    .sc-header input[type="checkbox"] { accent-color: var(--dark-amber); cursor: pointer; }
    .sc-name { font-size: 14px; font-weight: 700; color: var(--dark-text); flex: 1; }
    .sc-fav-btn {
      background: transparent; border: none; cursor: pointer;
      color: var(--dark-amber); font-size: 16px; padding: 2px 6px;
    }

    .sc-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
    .sc-stat { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
    .sc-label { font-size: 11px; color: var(--dark-text-muted); }
    .sc-value { font-size: 13px; font-weight: 600; color: var(--dark-text); text-align: right; }
    .sc-value.good { color: var(--dark-green); }
    .sc-value.warn { color: var(--dark-amber); }
    .sc-value.bad  { color: var(--dark-neutral); }
    .sc-value.sc-loc { font-weight: 500; font-size: 12px; color: var(--dark-text-sec); }

    .sc-footer {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px; border-top: 1px solid var(--dark-bg-secondary);
      background: var(--dark-bg);
    }
    .sc-date { font-size: 10px; color: var(--dark-text-muted); }
    .sc-delete { --mdc-text-button-label-text-color: var(--dark-text-muted); font-size: 11px; }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
    .empty-state {
      text-align: center; padding: 60px 20px;
      color: var(--dark-text-sec);
    }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
    .empty-state .hint { font-size: 12px; color: var(--dark-text-muted); margin-top: 4px; }
  `],
})
export class ScenariosScreenComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly loading = signal(false);
  readonly scenarios = signal<Scenario[]>([]);
  readonly selectedIds = signal<Set<string>>(new Set());

  /** Derived display-friendly views — prefers scenarioData envelope, falls back to top-level columns. */
  readonly views = computed<ScenarioView[]>(() =>
    this.scenarios().map(s => this.buildView(s))
  );

  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly selectedViews = computed(() =>
    this.views().filter(v => this.selectedIds().has(v.scenario.id))
  );

  ngOnInit(): void {
    this.loading.set(true);
    this.api.getScenarios().subscribe({
      next: (s) => { this.scenarios.set(s); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        console.warn('ScenariosScreen: getScenarios failed.', err);
      },
    });
  }

  toggleSelected(id: string): void {
    this.selectedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  toggleFavorite(s: Scenario): void {
    // Optimistic flip, roll back on error.
    const newFav = !s.isFavorite;
    this.scenarios.update(list => list.map(x =>
      x.id === s.id ? { ...x, isFavorite: newFav } : x));
    this.api.updateScenario(s.id, {
      name: s.name,
      scenarioData: s.scenarioData,
      isFavorite: newFav,
    }).subscribe({
      error: (err) => {
        console.warn('ScenariosScreen: toggleFavorite failed.', err);
        this.scenarios.update(list => list.map(x =>
          x.id === s.id ? { ...x, isFavorite: !newFav } : x));
      },
    });
  }

  deleteScenario(id: string): void {
    this.api.deleteScenario(id).subscribe({
      next: () => {
        this.scenarios.update(list => list.filter(s => s.id !== id));
        this.selectedIds.update(ids => {
          const next = new Set(ids); next.delete(id); return next;
        });
      },
      error: (err) => console.warn('ScenariosScreen: delete failed.', err),
    });
  }

  isBestSuccess(v: ScenarioView): boolean {
    const vals = this.selectedViews().map(x => x.successRatePct).filter((n): n is number => n !== null);
    return vals.length > 1 && v.successRatePct === Math.max(...vals);
  }
  isWorstSuccess(v: ScenarioView): boolean {
    const vals = this.selectedViews().map(x => x.successRatePct).filter((n): n is number => n !== null);
    return vals.length > 1 && v.successRatePct === Math.min(...vals);
  }
  isBestMedian(v: ScenarioView): boolean {
    const vals = this.selectedViews().map(x => x.medianBalance).filter((n): n is number => n !== null);
    return vals.length > 1 && v.medianBalance === Math.max(...vals);
  }
  isWorstMedian(v: ScenarioView): boolean {
    const vals = this.selectedViews().map(x => x.medianBalance).filter((n): n is number => n !== null);
    return vals.length > 1 && v.medianBalance === Math.min(...vals);
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + Math.round(amount).toLocaleString();
  }

  /**
   * Build a ScenarioView — reads preferentially from the monte_carlo_v1
   * envelope inside scenarioData (what the MC screen saves), falls back to
   * top-level Prisma columns (successRate/medianBalance) if present.
   */
  private buildView(s: Scenario): ScenarioView {
    const data = s.scenarioData as Record<string, unknown> | null;
    const envelope = data?.['kind'] === 'monte_carlo_v1' ? data : null;

    const getPct = (sr: unknown): number | null => {
      if (typeof sr === 'number') return sr <= 1 ? sr * 100 : sr;
      if (sr && typeof sr === 'object' && 'value' in sr) {
        const v = (sr as { value: number }).value;
        return v <= 1 ? v * 100 : v;
      }
      return null;
    };
    const getPercentile = (key: string): number | null => {
      const p = envelope?.['percentiles'] as Record<string, { value?: number }> | undefined;
      return p?.[key]?.value ?? null;
    };
    const params = (envelope?.['params'] ?? {}) as Record<string, unknown>;

    return {
      scenario: s,
      successRatePct: envelope
        ? getPct(envelope['successRate'])
        : (typeof s.successRate === 'number' ? s.successRate : null),
      medianBalance: getPercentile('p50') ?? (typeof s.medianBalance === 'number' ? s.medianBalance : null),
      p5Balance: getPercentile('p5')  ?? (typeof s.p10Balance === 'number' ? s.p10Balance : null),
      p95Balance: getPercentile('p95') ?? (typeof s.p90Balance === 'number' ? s.p90Balance : null),
      runs: (envelope?.['runs'] as number | undefined) ?? s.simulationRuns ?? null,
      years: (envelope?.['years'] as number | undefined) ?? null,
      locationName: (params['location'] as { name?: string } | undefined)?.name ?? null,
      apportion: (params['apportionStrategy'] as string | undefined) ?? null,
      regime: (params['subsidyRegime'] as string | undefined) ?? null,
      magi: (params['magiAnnual'] as number | undefined) ?? null,
    };
  }
}
