import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { LocationService } from '@services/location.service';
import { NavigationService } from '@services/navigation.service';
import { ApiService } from '@services/api.service';
import { LocalService, LocationFull } from '@models/api.model';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';

@Component({
  selector: 'app-services-screen',
  standalone: true,
  imports: [SourceTooltipComponent],
  template: `
    <div class="svc-screen">
      <div class="screen-header">
        <span class="header-icon">🏥</span>
        <div>
          <h2 class="header-title">Local Services</h2>
          <p class="header-sub">Hospitals, markets, transport, and daily services by location</p>
        </div>
      </div>

      @if (!selectedCities().length) {
        <div class="empty-state">
          <div class="empty-icon">📍</div>
          <p>Select cities on the
            <button class="link-btn" (click)="goToOverview()">Overview</button>
            tab using the checkboxes, then come back to view their services.
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
          <div class="status-msg">Loading services…</div>
        } @else if (services().length) {
          @for (group of grouped(); track group.categoryId) {
            <div class="group-section" [class.group-empty]="group.empty">
              <h3 class="group-title">{{ group.category }}</h3>
              @if (group.empty) {
                <div class="svc-empty">
                  No {{ group.category.toLowerCase() }} listed yet for this city.
                </div>
              } @else {
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
                        <div class="svc-notes">
                          {{ svc.notes }}
                          <app-source-tooltip [sources]="svc.sources" />
                        </div>
                      } @else {
                        <div class="svc-notes">
                          <app-source-tooltip [sources]="svc.sources" />
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }
        } @else if (activeCity()) {
          <!-- Fallback: healthcare + lifestyle from location data -->
          @if (activeLoc(); as sl) {
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
          <div class="status-msg">Select a city tab above to view its services.</div>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .svc-screen { display: flex; flex-direction: column; gap: 16px; }
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

    .group-section { margin-top: 4px; }
    .group-section.group-empty .group-title { color: var(--dark-text-muted); }
    .group-title {
      font-size: 13px; font-weight: 700; color: var(--dark-text-sec);
      text-transform: capitalize; margin: 0 0 8px;
      padding-bottom: 6px; border-bottom: 1px solid var(--dark-bg-secondary);
    }
    .svc-empty {
      font-size: 11px; color: var(--dark-text-muted); font-style: italic;
      padding: 8px 12px; margin-bottom: 12px;
      border: 1px dashed var(--dark-border); border-radius: 6px;
      background: var(--dark-bg-secondary);
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
  private readonly nav = inject(NavigationService);
  private readonly api = inject(ApiService);

  readonly activeCity = signal<string | null>(null);
  readonly services = signal<LocalService[]>([]);
  readonly isLoading = signal(false);

  /** Cities selected via checkboxes on Overview */
  readonly selectedCities = computed(() => {
    const ids = this.loc.selectedIds();
    return this.loc.fullLocations().filter(l => ids.has(l.id));
  });

  readonly activeLoc = computed<LocationFull | null>(() =>
    this.loc.fullLocations().find(l => l.id === this.activeCity()) ?? null
  );

  /**
   * Canonical category list — displayed in this order. `essential: true`
   * categories render even when the current city has no entries; users
   * see a "no listings yet" card instead of the category silently
   * disappearing (makes data gaps visible).
   *
   * Any categoryId arriving in `services()` that isn't in this list is
   * rendered at the end using the raw id as the label (fallback path
   * for future additions before this map is updated).
   */
  private readonly CATEGORY_META: { id: string; label: string; essential: boolean }[] = [
    { id: 'hospital',             label: 'Hospitals',                essential: true },
    { id: 'doctor_gp',            label: 'General Practitioners',    essential: true },
    { id: 'dentist',              label: 'Dentists',                 essential: true },
    { id: 'pharmacy',             label: 'Pharmacies',               essential: true },
    { id: 'grocery',              label: 'Grocery & Supermarkets',   essential: true },
    { id: 'electronics',          label: 'Electronics',              essential: true },
    { id: 'hardware',             label: 'Hardware / Home Improvement', essential: true },
    { id: 'clothing_womens',      label: 'Women\'s Clothing',        essential: true },
    { id: 'clothing_mens',        label: 'Men\'s Clothing',          essential: true },
    { id: 'clothing_childrens',   label: 'Children\'s Clothing',     essential: true },
    { id: 'clothing_bigtall',     label: 'Big & Tall Clothing',      essential: true },
    { id: 'grocery_halal',        label: 'Halal Groceries',          essential: false },
    { id: 'grocery_kosher',       label: 'Kosher Groceries',         essential: false },
    { id: 'hair_care_african',    label: 'Black / African Hair Care', essential: false },
    { id: 'religious_mosque',     label: 'Mosques',                  essential: false },
    { id: 'religious_synagogue',  label: 'Synagogues / Hebrew Temples', essential: false },
    { id: 'restaurant_local',     label: 'Top-Rated Local Restaurants', essential: false },
    { id: 'restaurant_italian',   label: 'Italian Restaurants',      essential: false },
    { id: 'restaurant_mexican',   label: 'Mexican Restaurants',      essential: false },
    { id: 'restaurant_thai_or_asian', label: 'Thai / Asian Restaurants', essential: false },
    { id: 'restaurant_indian',    label: 'Indian Restaurants',       essential: false },
    { id: 'bank',                 label: 'Banks',                    essential: true },
    { id: 'public_transit',       label: 'Public Transit',           essential: true },
    { id: 'airport',              label: 'Airports',                 essential: true },
    { id: 'gym',                  label: 'Gyms & Fitness',           essential: true },
    { id: 'coworking',            label: 'Coworking Spaces',         essential: false },
    { id: 'english_church',       label: 'English-Speaking Churches', essential: false },
    { id: 'international_school', label: 'International Schools',    essential: false },
    { id: 'vet',                  label: 'Veterinarians',            essential: false },
    { id: 'pet_groomer',          label: 'Pet Groomers',             essential: false },
    { id: 'pet_daycare',          label: 'Pet Daycare',              essential: false },
    { id: 'dog_park',             label: 'Dog Parks',                essential: false },
    { id: 'legal',                label: 'Legal Services',           essential: false },
    { id: 'postal',               label: 'Postal Services',          essential: false },
    { id: 'library',              label: 'Libraries',                essential: false },
    { id: 'home_repair',          label: 'Home Repair',              essential: false },
    { id: 'attraction',           label: 'Attractions',              essential: false },
    { id: 'cultural',             label: 'Cultural',                 essential: false },
  ];

  readonly grouped = computed(() => {
    // Bucket services by categoryId.
    const byCat = new Map<string, LocalService[]>();
    for (const svc of this.services()) {
      const cat = svc.categoryId || 'other';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(svc);
    }

    // Emit canonical categories in order — include empty ones where
    // `essential: true`, skip empty non-essentials, then append any
    // unknown categoryIds at the end.
    const out: { category: string; items: LocalService[]; empty: boolean; categoryId: string }[] = [];
    const seen = new Set<string>();
    for (const meta of this.CATEGORY_META) {
      const items = byCat.get(meta.id) ?? [];
      seen.add(meta.id);
      if (items.length === 0 && !meta.essential) continue;
      out.push({ category: meta.label, items, empty: items.length === 0, categoryId: meta.id });
    }
    // Fallback: any categoryId in data that wasn't in CATEGORY_META.
    for (const [cat, items] of byCat) {
      if (seen.has(cat) || items.length === 0) continue;
      out.push({ category: cat, items, empty: false, categoryId: cat });
    }
    return out;
  });

  ngOnInit(): void {
    this.loc.loadFull();
    // Auto-select first checked city
    const cities = this.selectedCities();
    if (cities.length && !this.activeCity()) {
      this.selectCity(cities[0].id);
    }
  }

  selectCity(id: string): void {
    this.activeCity.set(id);
    this.isLoading.set(true);
    this.services.set([]);
    this.api.getLocationSupplement(id, 'services').subscribe({
      next: (data) => {
        // API returns the full supplement envelope:
        // `{ distanceUnit, currency, services, attractions }`.
        // Older code assigned the whole envelope to `services()`, which
        // made `services().length` undefined and always triggered the
        // fallback branch. Unwrap `.services` explicitly.
        const payload = data as { services?: LocalService[] } | LocalService[] | null;
        const arr = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.services) ? payload!.services : [];
        this.services.set(arr);
        this.isLoading.set(false);
      },
      error: () => {
        this.services.set([]);
        this.isLoading.set(false);
      },
    });
  }

  goToOverview(): void {
    this.nav.selectScreen('overview');
    this.nav.selectCategory('locations');
  }
}
