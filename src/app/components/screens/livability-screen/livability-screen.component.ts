import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { LocationService } from '@services/location.service';
import { NavigationService } from '@services/navigation.service';
import { ApiService } from '@services/api.service';
import { InclusionSupplement, InclusionCategory } from '@models/api.model';

@Component({
  selector: 'app-livability-screen',
  standalone: true,
  template: `
    <div class="liv-screen">
      <div class="screen-header">
        <span class="header-icon">🏡</span>
        <div>
          <h2 class="header-title">Livability Index</h2>
          <p class="header-sub">Safety, community, and quality-of-life scores by location</p>
        </div>
      </div>

      @if (!selectedCities().length) {
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <p>Select cities on the
            <button class="link-btn" (click)="goToOverview()">Overview</button>
            tab using the checkboxes, then come back to view livability scores.
          </p>
        </div>
      } @else {
        <!-- City tabs from selection -->
        <div class="city-tabs">
          @for (city of selectedCities(); track city.id) {
            <button class="city-tab"
              [class.active]="activeCity() === city.id"
              (click)="selectCity(city.id)">
              {{ city.name }}
            </button>
          }
        </div>

        @if (isLoading()) {
          <div class="status-msg">Loading livability data…</div>
        } @else if (activeData()) {
          @if (overallScore(activeData()!); as overall) {
            <div class="overall-card">
              <div class="overall-score">{{ overall.score }}<span class="out-of">/10</span></div>
              <div class="overall-summary">
                {{ overall.summary || 'Composite livability score across the categories below.' }}
              </div>
            </div>
          }

          <div class="cat-grid">
            @for (cat of livabilityCategories(activeData()!); track cat.key) {
              <div class="cat-card">
                <div class="cat-header">
                  <span class="cat-name">{{ cat.label }}</span>
                  <span class="cat-score" [class]="scoreClass(cat.cat.score)">{{ cat.cat.score }}/10</span>
                </div>
                <p class="cat-summary">{{ cat.cat.summary }}</p>
                @if (cat.cat.positiveFactors?.length) {
                  <div class="factors">
                    @for (f of cat.cat.positiveFactors; track f) {
                      <span class="factor pos">✓ {{ f }}</span>
                    }
                  </div>
                }
                @if (cat.cat.riskFactors?.length) {
                  <div class="factors">
                    @for (f of cat.cat.riskFactors; track f) {
                      <span class="factor neg">⚠ {{ f }}</span>
                    }
                  </div>
                }
              </div>
            }
          </div>
        } @else if (activeCity()) {
          <!-- Fallback: lifestyle ratings from location data -->
          <div class="fallback-card">
            <p class="fb-hint">Detailed livability data not yet available for this location.</p>
            @if (activeLifestyle(); as ls) {
              <div class="ls-grid">
                <div class="ls-item"><span class="ls-label">Safety</span><span class="ls-val">{{ ls.safetyRating }}/10</span></div>
                <div class="ls-item"><span class="ls-label">Expat Community</span><span class="ls-val">{{ ls.expatCommunity }}/10</span></div>
                <div class="ls-item"><span class="ls-label">English</span><span class="ls-val">{{ ls.englishPrevalence }}/10</span></div>
                <div class="ls-item"><span class="ls-label">Dog Friendly</span><span class="ls-val">{{ ls.dogFriendly }}/10</span></div>
              </div>
            }
          </div>
        } @else {
          <div class="status-msg">Select a city tab above to view livability scores.</div>
        }
      }
    </div>
  `,
  styles: [`
    .liv-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; padding: 60px 24px; color: var(--dark-text-muted);
    }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
    .empty-state p { font-size: 13px; max-width: 360px; line-height: 1.5; }
    .link-btn {
      background: none; border: none; color: var(--dark-amber); cursor: pointer;
      font-size: 13px; font-family: var(--font-sans); padding: 0 2px;
      text-decoration: underline; text-underline-offset: 2px;
    }

    .city-tabs {
      display: flex; gap: 4px; flex-wrap: wrap;
      border-bottom: 1px solid var(--dark-border); padding-bottom: 8px;
    }
    .city-tab {
      padding: 6px 14px; font-size: 12px; border-radius: 6px 6px 0 0; cursor: pointer;
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-bottom: none; color: var(--dark-text-sec);
      font-family: var(--font-sans); transition: all 0.15s;
    }
    .city-tab:hover { color: var(--dark-text); }
    .city-tab.active {
      background: var(--dark-bg-secondary); border-color: var(--dark-amber);
      color: var(--dark-amber); font-weight: 600;
    }

    .overall-card {
      display: flex; align-items: center; gap: 16px;
      background: var(--dark-bg-card); border: 1px solid var(--dark-amber);
      border-radius: 12px; padding: 20px;
    }
    .overall-score { font-size: 40px; font-weight: 800; color: var(--dark-amber); }
    .out-of { font-size: 16px; color: var(--dark-text-muted); font-weight: 400; }
    .overall-summary { font-size: 13px; color: var(--dark-text-sec); line-height: 1.5; }

    .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .cat-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 8px;
    }
    .cat-header { display: flex; justify-content: space-between; align-items: center; }
    .cat-name { font-size: 14px; font-weight: 700; color: var(--dark-text); text-transform: capitalize; }
    .cat-score { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
    .cat-score.good { background: rgba(76, 175, 80, 0.12); color: var(--dark-green); }
    .cat-score.ok { background: rgba(212, 148, 58, 0.12); color: var(--dark-amber); }
    .cat-score.bad { background: rgba(139, 157, 195, 0.15); color: var(--dark-neutral); }
    .cat-summary { font-size: 12px; color: var(--dark-text-sec); line-height: 1.4; margin: 0; }
    .factors { display: flex; flex-direction: column; gap: 3px; }
    .factor { font-size: 10px; padding: 2px 0; }
    .factor.pos { color: var(--dark-green); }
    .factor.neg { color: var(--dark-neutral); }

    .fallback-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .fb-hint { font-size: 12px; color: var(--dark-text-muted); margin: 0 0 12px; }
    .ls-grid { display: flex; flex-direction: column; gap: 8px; }
    .ls-item { display: flex; justify-content: space-between; max-width: 250px; }
    .ls-label { font-size: 11px; color: var(--dark-text-sec); }
    .ls-val { font-size: 13px; font-weight: 600; color: var(--dark-amber); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class LivabilityScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  private readonly nav = inject(NavigationService);
  private readonly api = inject(ApiService);

  readonly activeCity = signal<string | null>(null);
  readonly dataMap = signal<Record<string, InclusionSupplement | null>>({});
  readonly isLoading = signal(false);

  /** Cities selected via checkboxes on Overview */
  readonly selectedCities = computed(() => {
    const ids = this.loc.selectedIds();
    return this.loc.fullLocations().filter(l => ids.has(l.id));
  });

  readonly activeData = computed<InclusionSupplement | null>(() => {
    const id = this.activeCity();
    return id ? (this.dataMap()[id] ?? null) : null;
  });

  readonly activeLifestyle = computed(() => {
    const id = this.activeCity();
    return id ? (this.loc.fullLocations().find(l => l.id === id)?.lifestyle ?? null) : null;
  });

  ngOnInit(): void {
    this.loc.loadFull();
    const cities = this.selectedCities();
    if (cities.length && !this.activeCity()) {
      this.selectCity(cities[0].id);
    }
  }

  selectCity(id: string): void {
    this.activeCity.set(id);
    if (this.dataMap()[id] !== undefined) return;
    this.isLoading.set(true);
    this.api.getLocationSupplement(id, 'inclusion').subscribe({
      next: (d) => {
        this.dataMap.update(m => ({ ...m, [id]: d as InclusionSupplement }));
        this.isLoading.set(false);
      },
      error: () => {
        this.dataMap.update(m => ({ ...m, [id]: null }));
        this.isLoading.set(false);
      },
    });
  }

  goToOverview(): void {
    this.nav.selectScreen('overview');
    this.nav.selectCategory('locations');
  }

  livabilityCategories(data: InclusionSupplement): { key: string; label: string; cat: InclusionCategory }[] {
    const labels: Record<string, string> = {
      racial: 'Cultural Openness', religious: 'Religious Freedom',
      countryOfOrigin: 'Expat Acceptance', language: 'Language',
      lgbtq: 'LGBTQ+ Safety', disability: 'Accessibility', age: 'Age-Friendliness',
    };
    // The seeded API shape nests categories under `.categories.*`; older
    // shape had them hoisted to the top level. Accept either (same pattern
    // as inclusion-screen post-fix).
    const categoriesBag = (data as unknown as { categories?: Record<string, InclusionCategory> }).categories
      ?? (data as unknown as Record<string, InclusionCategory>);
    return Object.entries(labels)
      .filter(([k]) => {
        const c = categoriesBag[k];
        return c && typeof c === 'object' && (c as InclusionCategory).score !== undefined;
      })
      .map(([k, label]) => ({ key: k, label, cat: categoriesBag[k] as InclusionCategory }));
  }

  scoreClass(score: number): string {
    if (score >= 7) return 'good';
    if (score >= 4) return 'ok';
    return 'bad';
  }

  /** Normalize overall-score access across the two shapes — seeded data uses
   *  `overallInclusionScore` (flat number); older docs used `overall: { score, summary }`. */
  overallScore(data: InclusionSupplement): { score: number; summary?: string } | null {
    const d = data as unknown as {
      overall?: { score?: number; summary?: string };
      overallInclusionScore?: number;
    };
    if (d.overall?.score !== undefined) return { score: d.overall.score, summary: d.overall.summary };
    if (typeof d.overallInclusionScore === 'number') return { score: d.overallInclusionScore };
    return null;
  }
}
