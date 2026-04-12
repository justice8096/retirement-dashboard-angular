import {
  Component, inject, signal, computed, OnInit, OnDestroy,
  ElementRef, viewChild, AfterViewInit,
} from '@angular/core';
import { LocationService } from '@services/location.service';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NeighborhoodsSupplement, Neighborhood, LocationFull } from '@models/api.model';
import * as L from 'leaflet';

/* Fix Leaflet default icon paths (webpack strips them) */
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
L.Marker.prototype.options.icon = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41] });

/** Hardcoded geocode fallback for common cities */
const CITY_COORDS: Record<string, [number, number]> = {
  'lisbon': [38.7223, -9.1393], 'porto': [41.1579, -8.6291], 'faro': [37.0194, -7.9322],
  'lagos': [37.1028, -8.6731], 'medellin': [6.2442, -75.5812], 'bogota': [4.7110, -74.0721],
  'cartagena': [10.3910, -75.5144], 'lyon': [45.7640, 4.8357], 'toulouse': [43.6047, 1.4442],
  'montpellier': [43.6108, 3.8767], 'brittany': [48.2020, -2.9326], 'rennes': [48.1173, -1.6778],
  'panama city': [8.9824, -79.5199], 'boquete': [8.7804, -82.4413], 'atlanta': [33.7490, -84.3880],
  'alicante': [38.3452, -0.4810], 'waterford': [52.2593, -7.1101],
  'barcelona': [41.3874, 2.1686], 'madrid': [40.4168, -3.7038], 'malaga': [36.7213, -4.4214],
  'valencia': [39.4699, -0.3763], 'seville': [37.3891, -5.9845],
  'san jose': [9.9281, -84.0907], 'cuenca': [2.9001, -79.0059], 'quito': [-0.1807, -78.4678],
  'merida': [20.9674, -89.5926], 'mexico city': [19.4326, -99.1332],
  'bangkok': [13.7563, 100.5018], 'chiang mai': [18.7061, 98.9817],
  'kuala lumpur': [3.1390, 101.6869], 'penang': [5.4164, 100.3327],
  'ho chi minh city': [10.8231, 106.6297], 'da nang': [16.0471, 108.2068],
  'bali': [-8.3405, 115.0920], 'buenos aires': [-34.6037, -58.3816],
};

function geocodeCity(name: string): [number, number] | null {
  const key = name.toLowerCase().trim();
  return CITY_COORDS[key] ?? null;
}

interface LocWithNeighborhoods {
  loc: LocationFull;
  supplement: NeighborhoodsSupplement | null;
  loading: boolean;
}

@Component({
  selector: 'app-neighborhoods-screen',
  standalone: true,
  template: `
    <div class="nbh-screen">
      <div class="screen-header">
        <span class="header-icon">🏘️</span>
        <div>
          <h2 class="header-title">Neighborhoods</h2>
          <p class="header-sub">Explore neighborhoods across {{ loc.fullLocations().length }} retirement destinations</p>
        </div>
      </div>

      <!-- Map -->
      <div class="map-card">
        <div #mapEl class="map-container"></div>
      </div>

      @if (loc.loading()) {
        <div class="status-msg">Loading locations…</div>
      } @else {

        <!-- Location selector -->
        <div class="loc-pills">
          @for (item of locEntries(); track item.loc.id) {
            <button class="loc-pill"
              [class.active]="selectedLocId() === item.loc.id"
              (click)="selectLoc(item.loc.id)">
              {{ item.loc.name }}
              @if (item.supplement) {
                <span class="pill-count">{{ item.supplement.neighborhoods.length }}</span>
              }
            </button>
          }
        </div>

        <!-- Neighborhood cards for selected location -->
        @if (activeEntry(); as entry) {
          @if (entry.loading) {
            <div class="status-msg">Loading neighborhoods for {{ entry.loc.name }}…</div>
          } @else if (!entry.supplement) {
            <!-- Fallback: show location-level data -->
            <div class="fallback-card">
              <h3 class="fb-title">{{ entry.loc.name }}, {{ entry.loc.country }}</h3>
              @if (entry.loc.cities?.length) {
                <div class="cities-row">
                  @for (city of entry.loc.cities; track city) {
                    <span class="city-chip">{{ city }}</span>
                  }
                </div>
              }
              @if (entry.loc.lifestyle) {
                <div class="lifestyle-grid">
                  <div class="ls-item">
                    <span class="ls-label">Safety</span>
                    <div class="rating-bar">
                      <div class="rating-fill" [style.width.%]="(entry.loc.lifestyle.safetyRating / 10) * 100"></div>
                    </div>
                    <span class="ls-val">{{ entry.loc.lifestyle.safetyRating }}/10</span>
                  </div>
                  <div class="ls-item">
                    <span class="ls-label">Expat Community</span>
                    <div class="rating-bar">
                      <div class="rating-fill expat" [style.width.%]="(entry.loc.lifestyle.expatCommunity / 10) * 100"></div>
                    </div>
                    <span class="ls-val">{{ entry.loc.lifestyle.expatCommunity }}/10</span>
                  </div>
                  <div class="ls-item">
                    <span class="ls-label">English</span>
                    <div class="rating-bar">
                      <div class="rating-fill english" [style.width.%]="(entry.loc.lifestyle.englishPrevalence / 10) * 100"></div>
                    </div>
                    <span class="ls-val">{{ entry.loc.lifestyle.englishPrevalence }}/10</span>
                  </div>
                  <div class="ls-item">
                    <span class="ls-label">Dog Friendly</span>
                    <div class="rating-bar">
                      <div class="rating-fill dog" [style.width.%]="(entry.loc.lifestyle.dogFriendly / 10) * 100"></div>
                    </div>
                    <span class="ls-val">{{ entry.loc.lifestyle.dogFriendly }}/10</span>
                  </div>
                </div>
              }
              <div class="no-nbh-hint">
                Detailed neighborhood data not available for this location.
              </div>
            </div>
          } @else {
            <div class="nbh-header-row">
              <h3 class="nbh-city">{{ entry.supplement.city }}</h3>
              <span class="nbh-count">{{ entry.supplement.neighborhoods.length }} neighborhoods</span>
            </div>
            <div class="nbh-grid">
              @for (nbh of entry.supplement.neighborhoods; track nbh.id) {
                <div class="nbh-card">
                  <div class="nbh-top">
                    <h4 class="nbh-name">{{ nbh.name }}</h4>
                    <span class="nbh-safety" [class]="safetyClass(nbh.safetyRating)">{{ nbh.safetyRating }}</span>
                  </div>
                  <p class="nbh-desc">{{ nbh.description }}</p>
                  <div class="nbh-character">{{ nbh.character }}</div>

                  <!-- Scores -->
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

                  <!-- Housing -->
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
                    <div class="nbh-notes">💡 {{ nbh.character_notes }}</div>
                  }
                </div>
              }
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

    /* Location pills */
    .loc-pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .loc-pill {
      padding: 6px 12px; font-size: 11px; border-radius: 6px; cursor: pointer;
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      color: var(--dark-text-sec); font-family: var(--font-sans);
      transition: all 0.15s;
    }
    .loc-pill:hover { border-color: var(--dark-blue); color: var(--dark-text); }
    .loc-pill.active {
      background: rgba(92, 156, 230, 0.12); border-color: var(--dark-blue);
      color: var(--dark-blue); font-weight: 600;
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
    .nbh-safety.moderate { background: rgba(229, 115, 115, 0.12); color: var(--dark-red); }
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
  readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly mapEl = viewChild<ElementRef>('mapEl');
  private map: L.Map | null = null;
  private markers: L.Marker[] = [];

  readonly selectedLocId = signal<string | null>(null);
  readonly supplementMap = signal<Record<string, NeighborhoodsSupplement | null>>({});
  readonly loadingSet = signal<Set<string>>(new Set());

  readonly locEntries = computed<LocWithNeighborhoods[]>(() => {
    const locs = this.loc.fullLocations();
    const supps = this.supplementMap();
    const loading = this.loadingSet();
    return locs.map(l => ({
      loc: l,
      supplement: supps[l.id] ?? null,
      loading: loading.has(l.id),
    }));
  });

  readonly activeEntry = computed(() => {
    const id = this.selectedLocId();
    if (!id) return null;
    return this.locEntries().find(e => e.loc.id === id) ?? null;
  });

  ngOnInit(): void {
    this.loc.loadFull();
  }

  ngAfterViewInit(): void {
    this.initMap();
    // Watch for locations loading and update map
    setTimeout(() => this.updateMapMarkers(), 1500);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  selectLoc(id: string): void {
    this.selectedLocId.set(id);
    this.loadSupplement(id);
    // Pan map to location
    const entry = this.locEntries().find(e => e.loc.id === id);
    if (entry?.loc.cities?.length && this.map) {
      const coords = geocodeCity(entry.loc.cities[0]);
      if (coords) this.map.flyTo(coords, 8, { duration: 1 });
    }
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
    // Clear existing
    this.markers.forEach(m => m.remove());
    this.markers = [];

    const locs = this.loc.fullLocations();
    const bounds: L.LatLng[] = [];

    for (const l of locs) {
      const city = l.cities?.[0] ?? l.name;
      const coords = geocodeCity(city);
      if (!coords) continue;

      const marker = L.marker(coords)
        .bindPopup(`<b>${l.name}</b><br>${l.country}`)
        .on('click', () => this.selectLoc(l.id));

      marker.addTo(this.map!);
      this.markers.push(marker);
      bounds.push(L.latLng(coords[0], coords[1]));
    }

    if (bounds.length > 1) {
      this.map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });
    }
  }

  safetyClass(rating: string): string {
    if (rating === 'high' || rating === 'very-high') return 'high';
    if (rating === 'moderate-high') return 'moderate-high';
    return 'moderate';
  }
}
