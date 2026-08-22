import { Component, inject, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { bulletText } from '@models/api.model';

@Component({
  selector: 'app-brochure-screen',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="brochure-screen">
      <div class="screen-header">
        <span class="header-icon">📄</span>
        <div>
          <h2 class="header-title">Brochures</h2>
          <p class="header-sub">Generate printable location summaries</p>
        </div>
      </div>

      @if (loc.loading()) {
        <div class="status-msg">Loading locations…</div>
      } @else if (!loc.fullLocations().length) {
        <div class="status-msg">Load locations first to generate brochures.</div>
      } @else {
        <div class="brochure-grid">
          @for (item of brochureData(); track item.id) {
            <div class="brochure-card">
              <div class="b-header">
                <h3 class="b-name">{{ item.name }}</h3>
                <span class="b-country">{{ item.country }} · {{ item.region }}@if (item.subregion) { · {{ item.subregion }} }</span>
              </div>
              <div class="b-cost">
                <span class="b-cost-label">Monthly Cost</span>
                <span class="b-cost-value" [class]="dyscalculia.numberSpacingClass()">
                  {{ fmt(item.total) }}
                </span>
              </div>
              <div class="b-highlights">
                @if (item.climate) {
                  <span class="b-tag">{{ item.climate }}</span>
                }
                @if (item.visa) {
                  <span class="b-tag">{{ item.visa }}</span>
                }
                <span class="b-tag">{{ item.currency }}</span>
              </div>
              @if (item.pros.length) {
                <div class="b-pros">
                  @for (p of item.pros.slice(0, 3); track $index) {
                    <span class="b-pro">✓ {{ bulletText(p) }}</span>
                  }
                </div>
              }
              <button mat-stroked-button class="b-print-btn" (click)="printBrochure(item.id)">
                🖨️ Print
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .brochure-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: calc(32px * var(--font-scale, 1)); }
    .header-title { font-size: calc(20px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: calc(12px * var(--font-scale, 1)); color: var(--dark-text-muted); margin: 2px 0 0; }

    .brochure-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .brochure-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px;
    }
    .b-header {}
    .b-name { font-size: calc(16px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-text); margin: 0; }
    .b-country { font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-muted); }
    .b-cost { display: flex; justify-content: space-between; align-items: baseline; }
    .b-cost-label { font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-sec); }
    .b-cost-value { font-size: calc(18px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-amber); }
    .b-highlights { display: flex; flex-wrap: wrap; gap: 6px; }
    .b-tag {
      font-size: calc(10px * var(--font-scale, 1)); padding: 3px 8px; border-radius: 4px;
      background: var(--dark-bg-secondary); color: var(--dark-text-sec);
    }
    .b-pros { display: flex; flex-direction: column; gap: 3px; }
    .b-pro { font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-green); }
    .b-print-btn {
      align-self: flex-start; margin-top: auto;
      --mat-button-outlined-container-height: 32px;
      --mat-button-outlined-label-text-size: 11px;
      --mat-button-outlined-outline-color: var(--dark-border);
    }

    .status-msg { padding: 40px; text-align: center; color: var(--dark-text-sec); font-size: calc(13px * var(--font-scale, 1)); }
  `],
})
export class BrochureScreenComponent implements OnInit {
  readonly bulletText = bulletText;
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly brochureData = computed(() =>
    this.loc.fullLocations().map(l => ({
      id: l.id,
      name: l.name,
      country: l.country,
      region: l.region,
      subregion: l.subregion,
      currency: l.currency,
      total: l.monthlyCostTotal ?? 0,
      climate: l.climate?.type ?? null,
      visa: l.visa?.type ?? null,
      pros: l.pros ?? [],
    }))
  );

  ngOnInit(): void {
    this.loc.loadFull();
  }

  printBrochure(id: string): void {
    const loc = this.loc.fullLocations().find(l => l.id === id);
    if (!loc) return;

    const breakdown = this.loc.getCostBreakdown(loc);
    const esc = (s: string) => s.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

    const rows = breakdown.map(b =>
      `<tr><td>${b.icon} ${esc(b.label)}</td><td class="num">${this.fmt(b.value)}</td></tr>`
    ).join('');

    const bullets = (arr: Array<string | { text: string }> | undefined, cls: string, mark: string) =>
      (arr ?? []).map(x => `<li class="${cls}">${mark} ${esc(bulletText(x))}</li>`).join('');

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(loc.name)} — Brochure</title>
<style>
  @page { size: Letter; margin: 0.6in; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #222; margin: 0; }
  h1 { font-size: calc(28px * var(--font-scale, 1)); margin: 0 0 4px; }
  .sub { color: #666; font-size: calc(13px * var(--font-scale, 1)); margin-bottom: 18px; }
  .cost-hero { background: #fef3e2; border: 1px solid #e8b86d; border-radius: 8px;
    padding: 14px 18px; display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 18px; }
  .cost-hero .lbl { font-size: calc(12px * var(--font-scale, 1)); color: #8a6a30; text-transform: uppercase; letter-spacing: 0.5px; }
  .cost-hero .val { font-size: calc(26px * var(--font-scale, 1)); font-weight: 700; color: #c47a1a; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
  .tag { font-size: calc(11px * var(--font-scale, 1)); padding: 4px 10px; background: #f1f1f1; border-radius: 4px; }
  h2 { font-size: calc(15px * var(--font-scale, 1)); margin: 18px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: calc(12px * var(--font-scale, 1)); }
  td { padding: 5px 4px; border-bottom: 1px solid #eee; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  ul { margin: 0; padding-left: 18px; font-size: calc(12px * var(--font-scale, 1)); }
  .pro { color: #2a7a2a; }
  .con { color: #a33; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  footer { margin-top: 24px; font-size: calc(10px * var(--font-scale, 1)); color: #999; text-align: center; }
</style></head><body onload="setTimeout(function(){window.print()},250)">
  <h1>${esc(loc.name)}</h1>
  <div class="sub">${esc(loc.country)} · ${esc(loc.region)}${loc.subregion ? ' · ' + esc(loc.subregion) : ''} · ${esc(loc.currency)}</div>
  <div class="cost-hero">
    <span class="lbl">Estimated Monthly Cost</span>
    <span class="val">${this.fmt(loc.monthlyCostTotal ?? 0)}</span>
  </div>
  <div class="tags">
    ${loc.climate?.type ? `<span class="tag">🌤️ ${esc(loc.climate.type)}</span>` : ''}
    ${loc.visa?.type ? `<span class="tag">🛂 ${esc(loc.visa.type)}</span>` : ''}
    <span class="tag">💱 ${esc(loc.currency)}</span>
  </div>
  ${rows ? `<h2>Cost Breakdown</h2><table>${rows}</table>` : ''}
  <div class="two-col">
    ${loc.pros?.length ? `<div><h2>Pros</h2><ul>${bullets(loc.pros, 'pro', '✓')}</ul></div>` : ''}
    ${loc.cons?.length ? `<div><h2>Cons</h2><ul>${bullets(loc.cons, 'con', '✗')}</ul></div>` : ''}
  </div>
  <footer>Generated ${new Date().toLocaleDateString()} · Retirement Dashboard</footer>
</body></html>`;

    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    // `noopener` severs window.opener in the new tab, blocking tab-nabbing.
    // Under noopener we can't listen for the child's `load` event or call
    // win.print() from the parent — the child's <body onload="window.print()">
    // triggers the dialog, and we free the Blob URL on a long fallback timeout.
    const win = window.open(url, '_blank', 'width=800,height=1000,noopener,noreferrer');
    if (!win) { URL.revokeObjectURL(url); return; }
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(amount)
      : '$' + Math.round(amount).toLocaleString();
  }
}
