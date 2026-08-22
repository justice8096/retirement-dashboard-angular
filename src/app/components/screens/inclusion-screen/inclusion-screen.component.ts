import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { LocationService } from '@services/location.service';
import { ApiService } from '@services/api.service';
import { InclusionSupplement, InclusionCategory } from '@models/api.model';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';

interface LocInclusion {
  id: string;
  name: string;
  country: string;
  data: InclusionSupplement | null;
  loading: boolean;
}

@Component({
  selector: 'app-inclusion-screen',
  standalone: true,
  imports: [SourceTooltipComponent],
  template: `
    <div class="incl-screen">
      <div class="screen-header">
        <span class="header-icon">🌍</span>
        <div>
          <h2 class="header-title">Welcome and Safety</h2>
          <p class="header-sub">How welcoming and safe each location is across racial, religious, country-of-origin, LGBTQ+, disability, and age dimensions.</p>
        </div>
      </div>

      @if (loc.loading()) {
        <div class="status-msg">Loading…</div>
      } @else {
        <!-- Location selector -->
        <div class="loc-pills">
          @for (item of locEntries(); track item.id) {
            <button class="loc-pill"
              [class.active]="selectedId() === item.id"
              (click)="select(item.id)">
              {{ item.name }}
            </button>
          }
        </div>

        @if (active(); as entry) {
          @if (entry.loading) {
            <div class="status-msg">Loading inclusion data for {{ entry.name }}…</div>
          } @else if (!entry.data) {
            <!-- Fallback: show lifestyle ratings from location data -->
            <div class="fallback-card">
              <p class="fb-hint">Detailed inclusion data not available for {{ entry.name }}.</p>
              @if (getLifestyle(entry.id); as ls) {
                <div class="ls-grid">
                  <div class="ls-item"><span class="ls-label">Safety</span><span class="ls-val">{{ ls.safetyRating }}/10</span></div>
                  <div class="ls-item"><span class="ls-label">Expat Community</span><span class="ls-val">{{ ls.expatCommunity }}/10</span></div>
                  <div class="ls-item"><span class="ls-label">English</span><span class="ls-val">{{ ls.englishPrevalence }}/10</span></div>
                  <div class="ls-item"><span class="ls-label">Dog Friendly</span><span class="ls-val">{{ ls.dogFriendly }}/10</span></div>
                </div>
              }
            </div>
          } @else {
            @if (overallScore(entry.data); as overall) {
              <div class="overall-card">
                <div class="overall-score">{{ overall.score }}<span class="out-of">/10</span></div>
                <div class="overall-summary">
                  {{ overall.summary || 'Overall inclusion score — weighted across the categories below.' }}
                </div>
              </div>
            }

            <div class="cat-grid">
              @for (cat of allCategories(entry); track cat.key) {
                <div class="cat-card">
                  <div class="cat-header">
                    <span class="cat-name">{{ cat.label }}</span>
                    <span class="cat-score" [class]="scoreClass(cat.cat.score)">{{ cat.cat.score }}/10</span>
                  </div>
                  <p class="cat-summary">
                    {{ cat.cat.summary }}
                    <app-source-tooltip [sources]="cat.cat.sources" />
                  </p>
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
          }
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .incl-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: calc(32px * var(--font-scale, 1)); }
    .header-title { font-size: calc(20px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: calc(12px * var(--font-scale, 1)); color: var(--dark-text-muted); margin: 2px 0 0; }

    .loc-pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .loc-pill {
      padding: 6px 12px; font-size: calc(11px * var(--font-scale, 1)); border-radius: 6px; cursor: pointer;
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      color: var(--dark-text-sec); font-family: var(--font-sans); transition: all 0.15s;
    }
    .loc-pill:hover { border-color: var(--dark-blue); }
    .loc-pill.active { background: rgba(92, 156, 230, 0.12); border-color: var(--dark-blue); color: var(--dark-blue); font-weight: 600; }

    .overall-card {
      display: flex; align-items: center; gap: 16px;
      background: var(--dark-bg-card); border: 1px solid var(--dark-amber);
      border-radius: 12px; padding: 20px;
    }
    .overall-score { font-size: calc(40px * var(--font-scale, 1)); font-weight: 800; color: var(--dark-amber); }
    .out-of { font-size: calc(16px * var(--font-scale, 1)); color: var(--dark-text-muted); font-weight: 400; }
    .overall-summary { font-size: calc(13px * var(--font-scale, 1)); color: var(--dark-text-sec); line-height: 1.5; }

    .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
    .cat-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 8px;
    }
    .cat-header { display: flex; justify-content: space-between; align-items: center; }
    .cat-name { font-size: calc(14px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-text); text-transform: capitalize; }
    .cat-score { font-size: calc(12px * var(--font-scale, 1)); font-weight: 700; padding: 2px 8px; border-radius: 4px; }
    .cat-score.good { background: rgba(76, 175, 80, 0.12); color: var(--dark-green); }
    .cat-score.ok { background: rgba(212, 148, 58, 0.12); color: var(--dark-amber); }
    .cat-score.bad { background: rgba(139, 157, 195, 0.15); color: var(--dark-neutral); }
    .cat-summary { font-size: calc(12px * var(--font-scale, 1)); color: var(--dark-text-sec); line-height: 1.4; margin: 0; }
    .factors { display: flex; flex-direction: column; gap: 3px; }
    .factor { font-size: calc(11px * var(--font-scale, 1)); padding: 2px 0; line-height: var(--prose-line-height, 1.5); }
    .factor.pos { color: var(--dark-green); }
    .factor.neg { color: var(--dark-neutral); }

    .fallback-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .fb-hint { font-size: calc(12px * var(--font-scale, 1)); color: var(--dark-text-muted); margin: 0 0 12px; }
    .ls-grid { display: flex; flex-direction: column; gap: 8px; }
    .ls-item { display: flex; justify-content: space-between; max-width: 250px; }
    .ls-label { font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-sec); }
    .ls-val { font-size: calc(13px * var(--font-scale, 1)); font-weight: 600; color: var(--dark-amber); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: calc(13px * var(--font-scale, 1)); }
  `],
})
export class InclusionScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  private readonly api = inject(ApiService);

  readonly selectedId = signal<string | null>(null);
  readonly dataMap = signal<Record<string, InclusionSupplement | null>>({});
  readonly loadingSet = signal<Set<string>>(new Set());

  readonly locEntries = computed<LocInclusion[]>(() =>
    this.loc.fullLocations().map(l => ({
      id: l.id, name: l.name, country: l.country,
      data: this.dataMap()[l.id] ?? null,
      loading: this.loadingSet().has(l.id),
    }))
  );

  readonly active = computed(() => {
    const id = this.selectedId();
    return id ? this.locEntries().find(e => e.id === id) ?? null : null;
  });

  ngOnInit(): void {
    this.loc.loadFull();
  }

  select(id: string): void {
    this.selectedId.set(id);
    if (this.dataMap()[id] !== undefined) return;
    this.loadingSet.update(s => { const n = new Set(s); n.add(id); return n; });
    this.api.getLocationSupplement(id, 'inclusion').subscribe({
      next: (d) => {
        this.dataMap.update(m => ({ ...m, [id]: d as InclusionSupplement }));
        this.loadingSet.update(s => { const n = new Set(s); n.delete(id); return n; });
      },
      error: () => {
        this.dataMap.update(m => ({ ...m, [id]: null }));
        this.loadingSet.update(s => { const n = new Set(s); n.delete(id); return n; });
      },
    });
  }

  getLifestyle(id: string) {
    return this.loc.fullLocations().find(l => l.id === id)?.lifestyle ?? null;
  }

  inclusionCategories(data: InclusionSupplement): { key: string; label: string; cat: InclusionCategory }[] {
    const labels: Record<string, string> = {
      racial: 'Racial', religious: 'Religious', countryOfOrigin: 'Country of Origin',
      language: 'Language', lgbtq: 'LGBTQ+', disability: 'Disability', age: 'Age',
    };
    // The seeded shape nests categories under `categories.*`; older legacy
    // shape had them hoisted to the top level. Try both so either works.
    const categoriesBag = (data as unknown as { categories?: Record<string, InclusionCategory> }).categories
      ?? (data as unknown as Record<string, InclusionCategory>);
    return Object.entries(labels)
      .filter(([k]) => {
        const c = categoriesBag[k];
        return c && typeof c === 'object' && (c as InclusionCategory).score !== undefined;
      })
      .map(([k, label]) => ({ key: k, label, cat: categoriesBag[k] as InclusionCategory }));
  }

  /** Full category list shown on a given location — inclusion supplement
   *  categories first, then the synthetic Pet Friendliness card if the
   *  location has lifestyle data. */
  allCategories(entry: { id: string; data: InclusionSupplement | null }): { key: string; label: string; cat: InclusionCategory }[] {
    const inclusion = entry.data ? this.inclusionCategories(entry.data) : [];
    const pet = this.petFriendlinessCategory(entry.id);
    return pet ? [...inclusion, pet] : inclusion;
  }

  /** Synthesize a "Pet Friendliness" category from the location's lifestyle
   *  block. The only pet signal we have is `lifestyle.dogFriendly` (0-10),
   *  so the category is labeled generically but the summary flags that
   *  it's primarily dog-centric — a rental-or-public-spaces proxy that
   *  usually correlates with overall pet-friendliness. Returns `null` when
   *  lifestyle data is missing so the card simply doesn't render. */
  petFriendlinessCategory(locId: string): { key: string; label: string; cat: InclusionCategory } | null {
    const loc = this.loc.fullLocations().find(l => l.id === locId);
    const dog = loc?.lifestyle?.dogFriendly;
    if (dog === undefined || dog === null) return null;
    const tier = dog >= 7 ? 'welcoming' : dog >= 4 ? 'moderate' : 'limited';
    return {
      key: 'petFriendliness',
      label: 'Pet Friendliness',
      cat: {
        score: dog,
        summary: `Based on the city's dog-friendliness rating (${tier}). Dog-centric as a proxy — public spaces, rental norms, and vet access usually correlate with overall pet-friendliness. Cat / small-pet specifics vary.`,
      } as InclusionCategory,
    };
  }

  scoreClass(score: number): string {
    if (score >= 7) return 'good';
    if (score >= 4) return 'ok';
    return 'bad';
  }

  /** Normalize the "overall inclusion" block across the two shapes we've
   *  seen: the seeded data uses `overallInclusionScore` (flat number), older
   *  docs sometimes had `overall: { score, summary }`. Returns `null` so the
   *  `@if (... as overall)` block only renders when there's a score. */
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
