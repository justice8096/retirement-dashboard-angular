import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { LocationService } from '@services/location.service';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { LocalInfoSupplement } from '@models/api.model';

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

        @if (selectedLoc(); as sl) {
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
        } @else {
          <div class="status-msg">Select a location above to view local info.</div>
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

    .loc-pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .loc-pill {
      padding: 6px 12px; font-size: 11px; border-radius: 6px; cursor: pointer;
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      color: var(--dark-text-sec); font-family: var(--font-sans); transition: all 0.15s;
    }
    .loc-pill:hover { border-color: var(--dark-blue); }
    .loc-pill.active { background: rgba(92, 156, 230, 0.12); border-color: var(--dark-blue); color: var(--dark-blue); font-weight: 600; }

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
  private readonly api = inject(ApiService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly selectedId = signal<string | null>(null);
  readonly supplement = signal<LocalInfoSupplement | null>(null);

  readonly selectedLoc = computed(() =>
    this.loc.fullLocations().find(l => l.id === this.selectedId()) ?? null
  );

  ngOnInit(): void {
    this.loc.loadFull();
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.supplement.set(null);
    this.api.getLocationSupplement(id, 'local-info').subscribe({
      next: (data) => this.supplement.set(data as LocalInfoSupplement),
      error: () => this.supplement.set(null),
    });
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + amount.toLocaleString();
  }
}
