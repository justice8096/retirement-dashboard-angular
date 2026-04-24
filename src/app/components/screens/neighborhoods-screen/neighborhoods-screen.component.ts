import {
  Component, inject, signal, computed, OnInit, OnDestroy,
  ElementRef, viewChild, AfterViewInit, effect,
} from '@angular/core';
import { LocationService } from '@services/location.service';
import { NavigationService } from '@services/navigation.service';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NeighborhoodsSupplement, Neighborhood, LocationFull } from '@models/api.model';
import * as L from 'leaflet';
import { getCityCenter } from '@app/data/city-coordinates';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';

/* Fix Leaflet default icon paths. Self-hosted in public/leaflet/ (copied from
 * node_modules/leaflet/dist/images/) — the previous unpkg.com URLs were blocked
 * by the dashboard's CSP img-src directive, rendering pins as broken images. */
const iconUrl = 'leaflet/marker-icon.png';
const shadowUrl = 'leaflet/marker-shadow.png';
const iconRetinaUrl = 'leaflet/marker-icon-2x.png';
L.Marker.prototype.options.icon = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41] });

/* Coordinate lookup now lives in `src/app/data/city-coordinates.ts` and is
 * keyed by location ID (not city name), so it covers all 158 locations
 * rather than the ~35 city-name hardcodes that used to live here. Shared
 * with the Location Map screen. */

@Component({
  selector: 'app-neighborhoods-screen',
  standalone: true,
  imports: [SourceTooltipComponent],
  template: `
    <div class="nbh-screen">
      <div class="screen-header">
        <span class="header-icon">🏘️</span>
        <div>
          <h2 class="header-title">Neighborhoods</h2>
          <p class="header-sub">Explore neighborhoods in your selected retirement destinations</p>
        </div>
      </div>

      <!-- Map -->
      <div class="map-card">
        <div #mapEl class="map-container"></div>
      </div>

      @if (!selectedCities().length) {
        <div class="empty-state">
          <div class="empty-icon">📍</div>
          <p>Select cities on the
            <button class="link-btn" (click)="goToOverview()">Overview</button>
            tab using the checkboxes, then come back to explore their neighborhoods.
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
              @if (supplementMap()[city.id]; as supp) {
                <span class="pill-count">{{ supp.neighborhoods.length }}</span>
              }
            </button>
          }
        </div>

        <!-- Neighborhood content -->
        @if (isLoading()) {
          <div class="status-msg">Loading neighborhoods…</div>
        } @else if (activeSupplement()) {
          <div class="nbh-header-row">
            <h3 class="nbh-city">{{ activeSupplement()!.city }}</h3>
            <span class="nbh-count">{{ activeSupplement()!.neighborhoods.length }} neighborhoods</span>
          </div>
          <div class="nbh-grid">
            @for (nbh of activeSupplement()!.neighborhoods; track nbh.id) {
              <div class="nbh-card">
                <div class="nbh-top">
                  <h4 class="nbh-name">{{ nbh.name }}</h4>
                  <span class="nbh-safety" [class]="safetyClass(nbh.safetyRating)">{{ nbh.safetyRating }}</span>
                </div>
                <p class="nbh-desc">{{ nbh.description }}</p>
                <div class="nbh-character">{{ nbh.character }}</div>

                <div class="score-row">
                  <div class="score">
                    <span class="score-val">{{ nbh.walkabilityScore }}</span>
                    <span class="score-label">Walk</span>
                  </div>
                  <div class="score">
                    <span class="score-val">{{ nbh.transitScore }}</span>
                    <span class="score-label">Transit</span>
                  </div>
                  <div class="score expat-score">
                    <span class="score-val">{{ nbh.expats.communitySize }}</span>
                    <span class="score-label">Expats</span>
                  </div>
                </div>

                @if (nbh.housing) {
                  <div class="housing-section">
                    <div class="housing-row">
                      @if (nbh.housing.avgRentOneBedroomEUR) {
                        <div class="housing-item">
                          <span class="h-label">1BR Rent</span>
                          <span class="h-value">€{{ nbh.housing.avgRentOneBedroomEUR.toLocaleString() }}</span>
                        </div>
                      }
                      @if (nbh.housing.avgRentTwoBedroomEUR) {
                        <div class="housing-item">
                          <span class="h-label">2BR Rent</span>
                          <span class="h-value">€{{ nbh.housing.avgRentTwoBedroomEUR.toLocaleString() }}</span>
                        </div>
                      }
                      @if (nbh.housing.buyPricePerSqmEUR) {
                        <div class="housing-item">
                          <span class="h-label">Buy/m²</span>
                          <span class="h-value">€{{ nbh.housing.buyPricePerSqmEUR.toLocaleString() }}</span>
                        </div>
                      }
                    </div>
                    @if (nbh.housing.predominantType) {
                      <div class="housing-type">{{ nbh.housing.predominantType }}</div>
                    }
                  </div>
                }

                @if (nbh.character_notes) {
                  <div class="nbh-notes">
                    💡 {{ nbh.character_notes }}
                    <app-source-tooltip [sources]="nbh.sources" />
                  </div>
                } @else {
                  <div class="nbh-notes">
                    <app-source-tooltip [sources]="nbh.sources" />
                  </div>
                }
              </div>
            }
          </div>
        } @else if (activeCity()) {
          <!-- Fallback: show lifestyle data -->
          @if (activeLoc(); as entry) {
            <div class="fallback-card">
              <h3 class="fb-title">{{ entry.name }}, {{ entry.country }}</h3>
              @if (entry.cities?.length) {
                <div class="cities-row">
                  @for (city of entry.cities; track city) {
                    <span class="city-chip">{{ city }}</span>
                  }
                </div>
              }
              @if (entry.lifestyle) {
                <div class="lifestyle-grid">
                  <div class="ls-item">
                    <span class="ls-label">Safety</span>
                    <div class="rating-bar">
                      <div class="rating-fill" [style.width.%]="(entry.lifestyle.safetyRating / 10) * 100"></div>
                    </div>
                    <span class="ls-val">{{ entry.lifestyle.safetyRating }}/10</span>
                  </div>
                  <div class="ls-item">
                    <span class="ls-label">Expat Community</span>
                    <div class="rating-bar">
                      <div class="rating-fill expat" [style.width.%]="(entry.lifestyle.expatCommunity / 10) * 100"></div>
                    </div>
                    <span class="ls-val">{{ entry.lifestyle.expatCommunity }}/10</span>
                  </div>
                  <div class="ls-item">
                    <span class="ls-label">English</span>
                    <div class="rating-bar">
                      <div class="rating-fill english" [style.width.%]="(entry.lifestyle.englishPrevalence / 10) * 100"></div>
                    </div>
                    <span class="ls-val">{{ entry.lifestyle.englishPrevalence }}/10</span>
                  </div>
                  <div class="ls-item">
                    <span class="ls-label">Dog Friendly</span>
                    <div class="rating-bar">
                      <div class="rating-fill dog" [style.width.%]="(entry.lifestyle.dogFriendly / 10) * 100"></div>
                    </div>
                    <span class="ls-val">{{ entry.lifestyle.dogFriendly }}/10</span>
                  </div>
                </div>
              }
              <div class="no-nbh-hint">
                Detailed neighborhood data not available for this location.
              </div>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [`
    .nbh-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; }

    /* Map */
    .map-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; overflow: hidden; height: 280px;
    }
    .map-container { width: 100%; height: 100%; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; padding: 40px 24px; color: var(--dark-text-muted);
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
    .pill-count {
      display: inline-flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border-radius: 50%; font-size: 10px;
      background: var(--dark-blue); color: #fff; margin-left: 4px;
    }

    /* Fallback location card */
    .fallback-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .fb-title { font-size: 16px; font-weight: 700; color: var(--dark-text); margin: 0 0 12px; }
    .cities-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
    .city-chip {
      font-size: 11px; padding: 4px 10px; border-radius: 6px;
      background: rgba(92, 156, 230, 0.1); color: var(--dark-blue);
      border: 1px solid rgba(92, 156, 230, 0.2);
    }
    .lifestyle-grid { display: flex; flex-direction: column; gap: 10px; }
    .ls-item { display: flex; align-items: center; gap: 10px; }
    .ls-label { font-size: 11px; color: var(--dark-text-muted); width: 110px; }
    .rating-bar {
      flex: 1; height: 8px; background: var(--dark-bg-secondary);
      border-radius: 4px; overflow: hidden; max-width: 200px;
    }
    .rating-fill { height: 100%; border-radius: 4px; background: var(--dark-amber); }
    .rating-fill.expat { background: var(--dark-blue); }
    .rating-fill.english { background: var(--dark-green); }
    .rating-fill.dog { background: var(--dark-purple); }
    .ls-val { font-size: 11px; color: var(--dark-text-sec); font-weight: 600; width: 35px; }
    .no-nbh-hint { font-size: 11px; color: var(--dark-text-muted); margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--dark-bg-secondary); }

    /* Neighborhood header */
    .nbh-header-row { display: flex; justify-content: space-between; align-items: baseline; }
    .nbh-city { font-size: 16px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .nbh-count { font-size: 11px; color: var(--dark-text-muted); }

    /* Neighborhood grid */
    .nbh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
    .nbh-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 8px;
    }
    .nbh-top { display: flex; justify-content: space-between; align-items: center; }
    .nbh-name { font-size: 14px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .nbh-safety {
      font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
      text-transform: capitalize;
    }
    .nbh-safety.high { background: rgba(76, 175, 80, 0.12); color: var(--dark-green); }
    .nbh-safety.moderate-high { background: rgba(212, 148, 58, 0.12); color: var(--dark-amber); }
    .nbh-safety.moderate { background: rgba(139, 157, 195, 0.15); color: var(--dark-neutral); }
    .nbh-desc { font-size: 12px; color: var(--dark-text-sec); line-height: 1.4; margin: 0; }
    .nbh-character { font-size: 10px; color: var(--dark-text-muted); font-style: italic; }

    .score-row { display: flex; gap: 12px; }
    .score { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .score-val { font-size: 18px; font-weight: 700; color: var(--dark-blue); }
    .score-label { font-size: 9px; color: var(--dark-text-muted); text-transform: uppercase; }
    .expat-score .score-val { font-size: 12px; font-weight: 600; text-transform: capitalize; }

    .housing-section {
      padding-top: 8px; border-top: 1px solid var(--dark-bg-secondary);
    }
    .housing-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .housing-item { display: flex; flex-direction: column; gap: 2px; }
    .h-label { font-size: 10px; color: var(--dark-text-muted); }
    .h-value { font-size: 13px; font-weight: 600; color: var(--dark-amber); }
    .housing-type { font-size: 10px; color: var(--dark-text-muted); margin-top: 4px; line-height: 1.3; }

    .nbh-notes {
      font-size: 11px; color: var(--dark-text-sec); line-height: 1.4;
      padding: 8px; background: var(--dark-bg-secondary); border-radius: 6px;
    }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class NeighborhoodsScreenComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly loc = inject(LocationService);
  private readonly nav = inject(NavigationService);
  readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly mapEl = viewChild<ElementRef>('mapEl');
  private map: L.Map | null = null;
  private markers: L.Marker[] = [];

  readonly activeCity = signal<string | null>(null);
  readonly supplementMap = signal<Record<string, NeighborhoodsSupplement | null>>({});
  readonly loadingSet = signal<Set<string>>(new Set());

  readonly selectedCities = computed(() => {
    const ids = this.loc.selectedIds();
    return this.loc.fullLocations().filter(l => ids.has(l.id));
  });

  readonly activeLoc = computed<LocationFull | null>(() =>
    this.loc.fullLocations().find(l => l.id === this.activeCity()) ?? null
  );

  readonly isLoading = computed(() => {
    const id = this.activeCity();
    return id ? this.loadingSet().has(id) : false;
  });

  readonly activeSupplement = computed<NeighborhoodsSupplement | null>(() => {
    const id = this.activeCity();
    return id ? (this.supplementMap()[id] ?? null) : null;
  });

  ngOnInit(): void {
    this.loc.loadFull();
    const cities = this.selectedCities();
    if (cities.length && !this.activeCity()) {
      this.selectCity(cities[0].id);
    }
  }

  ngAfterViewInit(): void {
    this.initMap();
    // Update markers once locations load
    setTimeout(() => this.updateMapMarkers(), 1500);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  selectCity(id: string): void {
    this.activeCity.set(id);
    this.loadSupplement(id);
    // Pan map to location
    if (this.map) {
      const coords = getCityCenter(id);
      if (coords) this.map.flyTo(coords, 8, { duration: 1 });
    }
  }

  goToOverview(): void {
    this.nav.selectScreen('overview');
    this.nav.selectCategory('locations');
  }

  private loadSupplement(locId: string): void {
    if (this.supplementMap()[locId] !== undefined) return;
    this.loadingSet.update(s => { const n = new Set(s); n.add(locId); return n; });
    this.api.getLocationSupplement(locId, 'neighborhoods').subscribe({
      next: (data) => {
        this.supplementMap.update(m => ({ ...m, [locId]: data as NeighborhoodsSupplement }));
        this.loadingSet.update(s => { const n = new Set(s); n.delete(locId); return n; });
      },
      error: () => {
        this.supplementMap.update(m => ({ ...m, [locId]: null }));
        this.loadingSet.update(s => { const n = new Set(s); n.delete(locId); return n; });
      },
    });
  }

  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el) return;

    this.map = L.map(el, {
      center: [30, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(this.map);
  }

  updateMapMarkers(): void {
    if (!this.map) return;
    this.markers.forEach(m => m.remove());
    this.markers = [];

    // Only show markers for selected cities
    const cities = this.selectedCities();
    const bounds: L.LatLng[] = [];

    for (const l of cities) {
      const coords = getCityCenter(l.id);
      if (!coords) continue;

      const marker = L.marker(coords)
        .bindPopup(`<b>${l.name}</b><br>${l.country}`)
        .on('click', () => this.selectCity(l.id));

      marker.addTo(this.map!);
      this.markers.push(marker);
      bounds.push(L.latLng(coords[0], coords[1]));
    }

    if (bounds.length > 1) {
      this.map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
    } else if (bounds.length === 1) {
      this.map.setView(bounds[0], 6);
    }
  }

  safetyClass(rating: string): string {
    if (rating === 'high' || rating === 'very-high') return 'high';
    if (rating === 'moderate-high') return 'moderate-high';
    return 'moderate';
  }
}
