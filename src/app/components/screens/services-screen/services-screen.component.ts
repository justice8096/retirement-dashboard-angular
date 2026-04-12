import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { LocationService } from '@services/location.service';
import { ApiService } from '@services/api.service';
import { LocalService } from '@models/api.model';

@Component({
  selector: 'app-services-screen',
  standalone: true,
  template: `
    <div class="svc-screen">
      <div class="screen-header">
        <span class="header-icon">🏥</span>
        <div>
          <h2 class="header-title">Local Services</h2>
          <p class="header-sub">Hospitals, markets, transport, and daily services by location</p>
        </div>
      </div>

      @if (loc.loading()) {
        <div class="status-msg">Loading…</div>
      } @else {
        <!-- Location selector -->
        <div class="loc-pills">
          @for (l of loc.fullLocations(); track l.id) {
            <button class="loc-pill"
              [class.active]="selectedId() === l.id"
              (click)="select(l.id)">
              {{ l.name }}
            </button>
          }
        </div>

        @if (isLoading()) {
          <div class="status-msg">Loading services…</div>
        } @else if (services().length) {
          <!-- Group by category -->
          @for (group of grouped(); track group.category) {
            <div class="group-section">
              <h3 class="group-title">{{ group.category }}</h3>
              <div class="svc-grid">
                @for (svc of group.items; track svc.name) {
                  <div class="svc-card">
                    <div class="svc-name">{{ svc.name }}</div>
                    @if (svc.address) {
                      <div class="svc-address">📍 {{ svc.address }}</div>
                    }
                    @if (svc.distanceKm) {
                      <div class="svc-dist">{{ svc.distanceKm }} km away</div>
                    }
                    @if (svc.notes) {
                      <div class="svc-notes">{{ svc.notes }}</div>
                    }
                    @if (svc.sources?.length) {
                      <div class="svc-sources">
                        @for (src of svc.sources; track src.url) {
                          <a [href]="src.url" target="_blank" class="src-link">{{ src.title }}</a>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        } @else if (selectedId()) {
          <!-- Fallback: healthcare + lifestyle from location data -->
          @if (selectedLoc(); as sl) {
            <div class="fallback-card">
              <h3 class="fb-title">{{ sl.name }} — Available Info</h3>
              @if (sl.healthcare) {
                <div class="info-section">
                  <h4 class="info-title">🏥 Healthcare</h4>
                  <div class="kv-grid">
                    <div class="kv"><span class="k">System</span><span class="v">{{ sl.healthcare.system }}</span></div>
                    <div class="kv"><span class="k">Quality</span><span class="v">{{ sl.healthcare.qualityRating }}/10</span></div>
                    <div class="kv"><span class="k">Wait Times</span><span class="v">{{ sl.healthcare.waitTimes }}</span></div>
                    <div class="kv"><span class="k">Dental</span><span class="v">{{ sl.healthcare.dentalIncluded ? 'Included' : 'Not Included' }}</span></div>
                    <div class="kv"><span class="k">Rx Coverage</span><span class="v">{{ sl.healthcare.prescriptionCoverage }}</span></div>
                  </div>
                </div>
              }
              @if (sl.lifestyle) {
                <div class="info-section">
                  <h4 class="info-title">🌐 Connectivity</h4>
                  <div class="kv-grid">
                    <div class="kv"><span class="k">Internet</span><span class="v">{{ sl.lifestyle.internetSpeed }}</span></div>
                    <div class="kv"><span class="k">English</span><span class="v">{{ sl.lifestyle.englishPrevalence }}/10</span></div>
                  </div>
                </div>
              }
            </div>
          }
        } @else {
          <div class="status-msg">Select a location above to view local services.</div>
        }
      }
    </div>
  `,
  styles: [`
    .svc-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    .loc-pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .loc-pill {
      padding: 6px 12px; font-size: 11px; border-radius: 6px; cursor: pointer;
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      color: var(--dark-text-sec); font-family: var(--font-sans); transition: all 0.15s;
    }
    .loc-pill:hover { border-color: var(--dark-blue); }
    .loc-pill.active { background: rgba(92, 156, 230, 0.12); border-color: var(--dark-blue); color: var(--dark-blue); font-weight: 600; }

    .group-section { margin-top: 4px; }
    .group-title {
      font-size: 13px; font-weight: 700; color: var(--dark-text-sec);
      text-transform: capitalize; margin: 0 0 8px;
      padding-bottom: 6px; border-bottom: 1px solid var(--dark-bg-secondary);
    }
    .svc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .svc-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 4px;
    }
    .svc-name { font-size: 13px; font-weight: 600; color: var(--dark-text); }
    .svc-address { font-size: 11px; color: var(--dark-text-sec); }
    .svc-dist { font-size: 10px; color: var(--dark-text-muted); }
    .svc-notes { font-size: 11px; color: var(--dark-text-sec); line-height: 1.3; }
    .svc-sources { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .src-link { font-size: 10px; color: var(--dark-blue); text-decoration: none; }
    .src-link:hover { text-decoration: underline; }

    .fallback-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .fb-title { font-size: 16px; font-weight: 700; color: var(--dark-text); margin: 0 0 16px; }
    .info-section { margin-bottom: 16px; }
    .info-section:last-child { margin-bottom: 0; }
    .info-title { font-size: 13px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 10px; }
    .kv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .kv { display: flex; flex-direction: column; gap: 2px; }
    .k { font-size: 10px; color: var(--dark-text-muted); }
    .v { font-size: 13px; font-weight: 500; color: var(--dark-text); }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class ServicesScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  private readonly api = inject(ApiService);

  readonly selectedId = signal<string | null>(null);
  readonly services = signal<LocalService[]>([]);
  readonly isLoading = signal(false);

  readonly selectedLoc = computed(() =>
    this.loc.fullLocations().find(l => l.id === this.selectedId()) ?? null
  );

  readonly grouped = computed(() => {
    const map = new Map<string, LocalService[]>();
    for (const svc of this.services()) {
      const cat = svc.categoryId || 'other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(svc);
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  });

  ngOnInit(): void {
    this.loc.loadFull();
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.isLoading.set(true);
    this.services.set([]);
    this.api.getLocationSupplement(id, 'services').subscribe({
      next: (data) => {
        this.services.set(data as LocalService[]);
        this.isLoading.set(false);
      },
      error: () => {
        this.services.set([]);
        this.isLoading.set(false);
      },
    });
  }
}
