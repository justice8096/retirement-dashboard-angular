import {
  Component, inject, signal, computed, effect, ElementRef, viewChild,
  AfterViewInit, OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { LocationService } from '@services/location.service';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { LocationFull } from '@models/api.model';
import { getCityCenter, listMissingCoords } from '@app/data/city-coordinates';

type MetricId = 'cost' | 'safety' | 'healthcare' | 'climate' | 'internet' | 'expat';

interface MetricDef {
  id: MetricId;
  label: string;
  /** Map a location onto a 0-10 score where 10 is "best". Cost is inverted
   *  (cheapest = 10). Missing data returns `null` and the marker gets a
   *  neutral color. */
  score: (l: LocationFull) => number | null;
  /** Short one-liner to show in the popup next to the score. */
  detail: (l: LocationFull) => string;
}

const METRICS: MetricDef[] = [
  {
    id: 'cost', label: 'Cost (cheaper = greener)',
    score: (l) => {
      const rent = l.monthlyCosts?.rent?.typical;
      if (rent === undefined || rent === null) return null;
      return clamp01to10(10 - rent / 500);
    },
    detail: (l) => {
      const rent = l.monthlyCosts?.rent?.typical ?? 0;
      const total = l.monthlyCostTotal ?? 0;
      return `Rent $${Math.round(rent).toLocaleString()}/mo · Total $${Math.round(total).toLocaleString()}/mo`;
    },
  },
  {
    id: 'safety', label: 'Safety',
    score: (l) => l.lifestyle?.safetyRating ?? null,
    detail: (l) => `Safety ${(l.lifestyle?.safetyRating ?? 0).toFixed(1)}/10`,
  },
  {
    id: 'healthcare', label: 'Healthcare Quality',
    score: (l) => l.healthcare?.qualityRating ?? null,
    detail: (l) => `Healthcare ${(l.healthcare?.qualityRating ?? 0).toFixed(1)}/10`,
  },
  {
    id: 'climate', label: 'Climate Comfort',
    score: (l) => {
      const summer = l.climate?.summerHighF;
      const winter = l.climate?.winterLowF;
      if (summer === undefined || winter === undefined) return null;
      const avg = (summer + winter) / 2;
      return clamp01to10(10 - Math.abs(avg - 75) / 10);
    },
    detail: (l) => {
      const summer = l.climate?.summerHighF ?? 0;
      const winter = l.climate?.winterLowF ?? 0;
      return `${winter.toFixed(0)}°F – ${summer.toFixed(0)}°F`;
    },
  },
  {
    id: 'internet', label: 'Internet Speed',
    score: (l) => {
      const raw = l.lifestyle?.internetSpeed;
      if (!raw) return null;
      const mbps = parseSpeedMbps(raw);
      return clamp01to10(mbps / 10);
    },
    detail: (l) => l.lifestyle?.internetSpeed ?? 'n/a',
  },
  {
    id: 'expat', label: 'Expat Community',
    score: (l) => l.lifestyle?.expatCommunity ?? null,
    detail: (l) => `Expat presence ${(l.lifestyle?.expatCommunity ?? 0).toFixed(1)}/10`,
  },
];

@Component({
  selector: 'app-map-screen',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="map-screen">
      <div class="screen-header">
        <span class="header-icon">🗺️</span>
        <div>
          <h2 class="header-title">Location Map</h2>
          <p class="header-sub">
            All {{ totalWithCoords() }} locations plotted geographically, color-coded by the metric you pick.
          </p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      <div class="card controls">
        <label class="ctrl">
          <span class="ctrl-label">Color by</span>
          <select class="ctrl-input"
            [ngModel]="metricId()" (ngModelChange)="metricId.set($event)">
            @for (m of metrics; track m.id) {
              <option [value]="m.id">{{ m.label }}</option>
            }
          </select>
        </label>
        <label class="ctrl">
          <span class="ctrl-label">Country</span>
          <select class="ctrl-input"
            [ngModel]="countryFilter()" (ngModelChange)="countryFilter.set($event)">
            <option value="">All</option>
            @for (c of countries(); track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select>
        </label>
        <div class="scale">
          <span class="scale-label">Scale:</span>
          <span class="swatch s-0"></span><span class="scale-tick">0</span>
          <span class="swatch s-3"></span>
          <span class="swatch s-5"></span><span class="scale-tick">5</span>
          <span class="swatch s-7"></span>
          <span class="swatch s-10"></span><span class="scale-tick">10</span>
        </div>
      </div>

      <div class="map-host">
        <div #mapEl class="map-el" aria-label="Interactive location map"></div>
      </div>

      @if (missingCoordIds().length > 0) {
        <div class="card missing-card">
          <h3 class="card-title">Not on map ({{ missingCoordIds().length }})</h3>
          <p class="param-hint">
            These locations don't have coordinates yet. Add them to <code>city-coordinates.ts</code> to include on the map.
          </p>
          <div class="missing-list">
            @for (id of missingCoordIds(); track id) {
              <span class="missing-chip">{{ id }}</span>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .map-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: 32px; }
    .header-title { font-size: 20px; font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: 12px; color: var(--dark-text-muted); margin: 2px 0 0; line-height: var(--prose-line-height, 1.5); }
    .badge-new {
      font-size: 10px; font-weight: 700; color: var(--dark-green);
      padding: 2px 8px; background: rgba(76, 175, 80, 0.12); border-radius: 4px;
    }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 10px; }

    .controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
    .ctrl { display: flex; flex-direction: column; gap: 4px; flex: 1 1 200px; max-width: 320px; }
    .ctrl-label { font-size: 11px; color: var(--dark-text-muted); }
    .ctrl-input {
      padding: 8px 10px; border-radius: 6px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text);
      font-size: 13px; font-family: var(--font-sans); outline: none;
    }
    .ctrl-input:focus { border-color: var(--dark-blue); }

    .scale {
      display: inline-flex; align-items: center; gap: 2px; margin-left: auto;
      font-size: 11px; color: var(--dark-text-muted);
    }
    .scale-label { margin-right: 6px; }
    .scale-tick { padding: 0 4px; font-variant-numeric: tabular-nums; }
    .swatch { display: inline-block; width: 14px; height: 14px; border-radius: 50%; }
    .swatch.s-0  { background: #D32F2F; }
    .swatch.s-3  { background: #E65100; }
    .swatch.s-5  { background: #F9A825; }
    .swatch.s-7  { background: #9CCC65; }
    .swatch.s-10 { background: #2E7D32; }

    .map-host {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 6px; overflow: hidden;
    }
    .map-el {
      width: 100%; height: 560px; border-radius: 8px;
      /* Leaflet sets its own background; keep ours dark so the flash is quick. */
      background: #1a1a1a;
    }

    .missing-card { font-size: 13px; }
    .param-hint {
      font-size: 12px; color: var(--dark-text-muted);
      line-height: var(--prose-line-height, 1.5); margin: 0 0 10px;
    }
    .param-hint code {
      background: var(--dark-bg-secondary); padding: 1px 6px; border-radius: 4px;
      font-family: var(--font-mono, monospace); font-size: 11px;
    }
    .missing-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .missing-chip {
      font-size: 11px; padding: 2px 8px; border-radius: 10px;
      background: var(--dark-bg-secondary); color: var(--dark-text-muted);
    }

    /* Leaflet popup styling override — match dashboard dark theme. */
    :host ::ng-deep .leaflet-popup-content-wrapper {
      background: var(--dark-bg-card);
      color: var(--dark-text);
      border: 1px solid var(--dark-border);
      border-radius: 8px;
    }
    :host ::ng-deep .leaflet-popup-tip { background: var(--dark-bg-card); border: 1px solid var(--dark-border); }
    :host ::ng-deep .leaflet-popup-content {
      font-family: var(--font-sans); font-size: 12px;
      line-height: 1.5; margin: 10px 14px;
    }
    :host ::ng-deep .leaflet-popup-content .popup-title {
      font-weight: 700; font-size: 13px; color: var(--dark-text); margin-bottom: 4px;
    }
    :host ::ng-deep .leaflet-popup-content .popup-country {
      font-size: 11px; color: var(--dark-text-muted); margin-bottom: 8px;
    }
    :host ::ng-deep .leaflet-popup-content .popup-score {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-weight: 700; margin-bottom: 6px; font-size: 11px;
    }
    :host ::ng-deep .leaflet-popup-content .popup-detail { color: var(--dark-text-sec); margin-bottom: 8px; }
    :host ::ng-deep .leaflet-popup-content .popup-link {
      display: inline-block; padding: 4px 10px; border-radius: 6px;
      background: var(--dark-amber); color: #000; font-weight: 700;
      text-decoration: none; font-size: 11px; cursor: pointer; border: none;
    }
    :host ::ng-deep .leaflet-container { background: #1a1a1a; }
    :host ::ng-deep .map-marker {
      border-radius: 50%; border: 2px solid rgba(0, 0, 0, 0.5);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      transition: transform 0.12s;
    }
    :host ::ng-deep .map-marker:hover { transform: scale(1.3); }
    :host ::ng-deep .leaflet-control-attribution {
      background: rgba(0, 0, 0, 0.5) !important;
      color: var(--dark-text-muted) !important;
    }
    :host ::ng-deep .leaflet-control-attribution a { color: var(--dark-blue) !important; }
  `],
})
export class MapScreenComponent implements AfterViewInit, OnDestroy {
  readonly loc = inject(LocationService);
  readonly nav = inject(NavigationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');

  readonly metrics = METRICS;
  readonly metricId = signal<MetricId>('cost');
  readonly countryFilter = signal<string>('');

  private map: L.Map | null = null;
  private markerLayer: L.LayerGroup | null = null;

  readonly currentMetric = computed<MetricDef>(() =>
    METRICS.find(m => m.id === this.metricId()) ?? METRICS[0]!
  );

  readonly countries = computed(() =>
    [...new Set(this.loc.fullLocations().map(l => l.country).filter(Boolean))].sort()
  );

  readonly plottable = computed(() => {
    const country = this.countryFilter();
    return this.loc.fullLocations()
      .filter(l => !country || l.country === country)
      .map(l => ({ l, coords: getCityCenter(l.id) }))
      .filter((x): x is { l: LocationFull; coords: [number, number] } => x.coords !== null);
  });

  readonly totalWithCoords = computed(() =>
    this.loc.fullLocations().filter(l => getCityCenter(l.id) !== null).length
  );

  readonly missingCoordIds = computed(() =>
    listMissingCoords(this.loc.fullLocations().map(l => l.id))
  );

  constructor() {
    this.loc.loadFull();
    // Re-render markers whenever plottable data or metric changes.
    effect(() => {
      this.plottable();
      this.metricId();
      if (this.map) this.refreshMarkers();
    });
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.refreshMarkers();
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }

  private initMap(): void {
    const host = this.mapEl().nativeElement;
    // CartoDB Dark Matter — free tile server that matches the dashboard's
    // dark aesthetic without needing an API key. No watermark on non-commercial
    // use per their ToS.
    this.map = L.map(host, {
      center: [30, 0],
      zoom: 2,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 12,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(this.map);
    this.markerLayer = L.layerGroup().addTo(this.map);
  }

  private refreshMarkers(): void {
    if (!this.map || !this.markerLayer) return;
    this.markerLayer.clearLayers();

    const metric = this.currentMetric();
    const points = this.plottable();
    const popupRoot = (l: LocationFull, score: number | null) => {
      const scoreBadge = score === null
        ? `<span class="popup-score" style="background:#555;color:#fff">no data</span>`
        : `<span class="popup-score" style="background:${scoreColor(score)};color:#000">${score.toFixed(1)}/10 · ${escape(metric.label)}</span>`;
      return `
        <div class="popup-title">${escape(l.name)}</div>
        <div class="popup-country">${escape(l.country)}${l.subregion ? ' · ' + escape(l.subregion) : ''}</div>
        ${scoreBadge}
        <div class="popup-detail">${escape(metric.detail(l))}</div>
        <button class="popup-link" data-loc-id="${escape(l.id)}">View Detail →</button>
      `;
    };

    for (const { l, coords } of points) {
      const score = metric.score(l);
      const color = score === null ? '#666' : scoreColor(score);
      const icon = L.divIcon({
        className: 'map-marker',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        html: `<div style="width:100%;height:100%;background:${color};border-radius:50%"></div>`,
      });
      const marker = L.marker(coords, { icon, title: l.name });
      marker.bindPopup(popupRoot(l, score), { maxWidth: 300 });
      marker.on('popupopen', (e) => {
        const el = (e.popup.getElement() as HTMLElement | null)?.querySelector('.popup-link');
        if (!el) return;
        el.addEventListener('click', () => {
          this.loc.selectLocation(l.id);
          this.nav.selectScreen('overview');
          this.nav.selectCategory('locations');
        }, { once: true });
      });
      this.markerLayer.addLayer(marker);
    }
  }
}

function clamp01to10(n: number): number {
  return Math.max(0, Math.min(10, n));
}

/** Color ramp red → orange → yellow → green for scores 0-10. */
function scoreColor(score: number): string {
  const s = Math.max(0, Math.min(10, score));
  if (s < 2)  return '#D32F2F';
  if (s < 4)  return '#E65100';
  if (s < 5.5) return '#F9A825';
  if (s < 7.5) return '#9CCC65';
  return '#2E7D32';
}

function parseSpeedMbps(raw: string): number {
  const match = String(raw).match(/(\d+(?:\.\d+)?)\s*(G|M)?/i);
  if (!match) return 10;
  const n = parseFloat(match[1]!);
  const unit = (match[2] ?? 'M').toUpperCase();
  return unit === 'G' ? n * 1000 : n;
}

/** HTML-escape popup content. Tile-popup content is fed into
 *  `bindPopup(htmlString)`, so we need to escape user/data strings. */
function escape(s: string | undefined | null): string {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
}
