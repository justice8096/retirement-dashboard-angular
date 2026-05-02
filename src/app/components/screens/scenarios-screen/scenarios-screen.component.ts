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
  templateUrl: './scenarios-screen.component.html',
  styleUrls: ['./scenarios-screen.component.scss'],
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
