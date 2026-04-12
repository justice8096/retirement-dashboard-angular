import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { LocationService } from '@services/location.service';
import { NavigationService } from '@services/navigation.service';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { LocalInfoSupplement, LocationFull } from '@models/api.model';

@Component({
  selector: 'app-localinfo-screen',
  standalone: true,
  template: `
    <div class="info-screen">
      <div class="screen-header">
        <span class="header-icon">ℹ️</span>
        <div>
          <h2 class="header-title">Local Info</h2>
          <p class="header-sub">Climate, visa, webcams, blogs, and practical details</p>
        </div>
      </div>

      @if (!selectedCities().length) {
        <div class="empty-state">
          <div class="empty-icon">📍</div>
          <p>Select cities on the
            <button class="link-btn" (click)="goToOverview()">Overview</button>
            tab using the checkboxes, then come back to view local info.
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

        @if (activeLoc(); as sl) {
          <div class="detail-grid">
            <!-- Climate & Visa -->
            <div class="card">
              <h3 class="card-title">Practical Info</h3>
              @if (sl.climate) {
                <div class="detail-row">
                  <span class="dl">🌡️ Climate</span>
                  <span class="dv">{{ sl.climate.type }}
                    @if (sl.climate.avgTemp) { · {{ sl.climate.avgTemp.low }}°–{{ sl.climate.avgTemp.high }}°F }
                  </span>
                </div>
              }
              @if (sl.visa) {
                <div class="detail-row">
                  <span class="dl">🛂 Visa</span>
                  <span class="dv">{{ sl.visa.type }}@if (sl.visa.duration) { · {{ sl.visa.duration }} }</span>
                </div>
                @if (sl.visa.costUSD) {
                  <div class="detail-row">
                    <span class="dl">Visa Cost</span>
                    <span class="dv" [class]="dyscalculia.numberSpacingClass()">{{ fmt(sl.visa.costUSD) }}</span>
                  </div>
                }
              }
              <div class="detail-row">
                <span class="dl">💱 Currency</span>
                <span class="dv">{{ sl.currency }}@if (sl.exchangeRate) { · {{ sl.exchangeRate }}:1 USD }</span>
              </div>
            </div>

            <!-- Pros and Cons -->
            @if (sl.pros?.length || sl.cons?.length) {
              <div class="card">
                <h3 class="card-title">Pros & Cons</h3>
                @if (sl.pros?.length) {
                  <div class="pc-section">
                    @for (p of sl.pros; track p) {
                      <div class="pc-item pro">✓ {{ p }}</div>
                    }
                  </div>
                }
                @if (sl.cons?.length) {
                  <div class="pc-section">
                    @for (c of sl.cons; track c) {
                      <div class="pc-item con">✗ {{ c }}</div>
                    }
                  </div>
                }
              </div>
            }

            <!-- Links from supplement -->
            @if (supplement()) {
              <div class="card">
                <h3 class="card-title">Resources & Links</h3>
                @if (supplement()!.webcams?.length) {
                  <div class="link-group">
                    <span class="link-label">📹 Webcams</span>
                    @for (link of supplement()!.webcams; track link.url) {
                      <a [href]="link.url" target="_blank" class="ext-link">{{ link.title }}</a>
                    }
                  </div>
                }
                @if (supplement()!.youtubeChannels?.length) {
                  <div class="link-group">
                    <span class="link-label">▶️ YouTube</span>
                    @for (link of supplement()!.youtubeChannels; track link.url) {
                      <a [href]="link.url" target="_blank" class="ext-link">{{ link.title }}</a>
                    }
                  </div>
                }
                @if (supplement()!.bloggers?.length) {
                  <div class="link-group">
                    <span class="link-label">📝 Blogs</span>
                    @for (link of supplement()!.bloggers; track link.url) {
                      <a [href]="link.url" target="_blank" class="ext-link">{{ link.title }}</a>
                    }
                  </div>
                }
                @if (supplement()!.officialSites?.length) {
                  <div class="link-group">
                    <span class="link-label">🏛️ Official</span>
                    @for (link of supplement()!.officialSites; track link.url) {
                      <a [href]="link.url" target="_blank" class="ext-link">{{ link.title }}</a>
                    }
                  </div>
                }
              </div>
            }
          </div>
        } @else if (activeCity()) {
          <div class="status-msg">Loading…</div>
        } @else {
          <div class="status-msg">Select a city tab above to view local info.</div>
        }
      }
    </div>
  `,
  styles: [`
    .info-screen { display: flex; flex-direction: column; gap: 16px; }
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

    .detail-grid { display: flex; flex-direction: column; gap: 12px; }
    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 20px;
    }
    .card-title { font-size: 14px; font-weight: 600; color: var(--dark-text-sec); margin: 0 0 14px; }

    .detail-row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; border-bottom: 1px solid var(--dark-bg-secondary); }
    .detail-row:last-child { border-bottom: none; }
    .dl { font-size: 12px; color: var(--dark-text-sec); }
    .dv { font-size: 12px; color: var(--dark-text); font-weight: 500; }

    .pc-section { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .pc-section:last-child { margin-bottom: 0; }
    .pc-item { font-size: 12px; padding: 4px 0; line-height: 1.3; }
    .pc-item.pro { color: var(--dark-green); }
    .pc-item.con { color: var(--dark-red); }

    .link-group { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
    .link-group:last-child { margin-bottom: 0; }
    .link-label { font-size: 11px; font-weight: 600; color: var(--dark-text-muted); margin-bottom: 2px; }
    .ext-link { font-size: 12px; color: var(--dark-blue); text-decoration: none; }
    .ext-link:hover { text-decoration: underline; }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: 13px; }
  `],
})
export class LocalinfoScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  private readonly nav = inject(NavigationService);
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly activeCity = signal<string | null>(null);
  readonly supplementMap = signal<Record<string, LocalInfoSupplement | null>>({});

  readonly selectedCities = computed(() => {
    const ids = this.loc.selectedIds();
    return this.loc.fullLocations().filter(l => ids.has(l.id));
  });

  readonly activeLoc = computed<LocationFull | null>(() =>
    this.loc.fullLocations().find(l => l.id === this.activeCity()) ?? null
  );

  readonly supplement = computed<LocalInfoSupplement | null>(() => {
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

  selectCity(id: string): void {
    this.activeCity.set(id);
    if (this.supplementMap()[id] !== undefined) return;
    this.api.getLocationSupplement(id, 'local-info').subscribe({
      next: (data) => this.supplementMap.update(m => ({ ...m, [id]: data as LocalInfoSupplement })),
      error: () => this.supplementMap.update(m => ({ ...m, [id]: null })),
    });
  }

  goToOverview(): void {
    this.nav.selectScreen('overview');
    this.nav.selectCategory('locations');
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
