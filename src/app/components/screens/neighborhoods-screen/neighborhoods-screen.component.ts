import {
  Component, inject, signal, computed, OnInit, OnDestroy,
  ElementRef, viewChild, AfterViewInit, effect,
  ChangeDetectionStrategy
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
  templateUrl: './neighborhoods-screen.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./neighborhoods-screen.component.scss'],
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
