import { Component, inject, signal, effect, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '@services/api.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { CurrencyFormatService } from '@services/currency-format.service';
import { MonteCarloScenarioService } from '@services/monte-carlo-scenario.service';
import { HealthcareService } from '@services/healthcare.service';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { CalmRevealService } from '@services/calm-reveal.service';

/**
 * Monte Carlo results sub-component. Owns everything that renders after
 * a sim run completes:
 *
 *  - Save bar (save scenario / save PNG / print)
 *  - 4-card success/median/worst/best grid (Dyscalculia F-002 calm tones)
 *  - Calm-mode pacer (Dyscalculia F-006 progressive reveal)
 *  - Plain-language summary (Dyscalculia F-003)
 *  - Paths chart, histogram, percentile-breakdown bars
 *
 * Reads simulation outcome from MonteCarloStateService; owns its own
 * UX state (saving flag, save message, save error). Calm-mode reveal is
 * delegated to CalmRevealService — the parent doesn't see it.
 *
 * Phase 2a of the god-component split (audit follow-up #1).
 */
@Component({
  selector: 'app-mc-results',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './mc-results.component.html',
  styleUrls: ['./mc-results.component.scss'],
  providers: [CalmRevealService],
})
export class McResultsComponent {
  private readonly api = inject(ApiService);
  private readonly currency = inject(CurrencyFormatService);
  private readonly scenarios = inject(MonteCarloScenarioService);
  private readonly healthcare = inject(HealthcareService);
  protected readonly dyscalculia = inject(DyscalculiaService);
  protected readonly state = inject(MonteCarloStateService);
  protected readonly calm = inject(CalmRevealService);

  /** Total reveal steps for calm mode: success, median, worst, best,
   *  summary, paths, histogram, percentiles. */
  protected readonly calmMax = 8;

  /* ─── Save-scenario UX state ───────────────────────────────────── */
  protected readonly savingScenario = signal(false);
  protected readonly saveMsg = signal<string | null>(null);
  protected readonly saveErr = signal(false);

  constructor() {
    this.calm.setMax(this.calmMax);
    // Reset reveal step every time a new sim completes (results.set()).
    // Read via untracked() to avoid re-firing the effect when the calm
    // service's own state changes inside this body.
    effect(() => {
      this.state.results();
      untracked(() => this.calm.reset(1));
    });
  }

  /** Predicate for the calm-mode reveal gate. Step N is shown if calm
   *  mode is off OR the step counter has reached N. */
  protected showStep(n: number): boolean {
    return !this.dyscalculia.isCalmMc() || this.calm.step() >= n;
  }

  protected revealNext(): void { this.calm.next(); }
  protected revealAll(): void { this.calm.all(); }

  /* ─── Format / tone helpers (template-bound) ───────────────────── */
  protected fmt(amount: number, unit: '/mo' | '/yr' | '' = '/mo'): string {
    if (unit === '/yr') return this.currency.currencyYearly(amount);
    if (unit === '/mo') return this.currency.currencyMonthly(amount);
    return this.currency.currency(amount);
  }

  protected fmtK(amount: number): string {
    return this.currency.currencyShort(amount);
  }

  protected toneClass(fraction: number): 'success' | 'warn' | 'neutral' {
    return this.dyscalculia.toneForSuccessRate(fraction);
  }

  /** Annual non-SS / non-other-income spending — anchor reference for
   *  percentile descriptions ("about X years of spending"). */
  protected annualSpending(): number {
    return (this.state.baseCost() - this.state.ssMonthly() - this.state.monthlyIncome()) * 12;
  }

  /* ─── Save current scenario ────────────────────────────────────── */
  protected saveCurrentScenario(): void {
    const r = this.state.results();
    if (!r) return;
    const name = window.prompt('Name this scenario:',
      `${this.state.selectedLoc()?.name ?? 'Scenario'} — ${new Date().toLocaleDateString()}`);
    if (!name) return;

    this.savingScenario.set(true);
    this.saveMsg.set(null);
    this.saveErr.set(false);

    const s = this.state;
    const scenarioData = this.scenarios.buildPayload(r, s.runs(), s.years(), {
      location: { id: s.selectedLocationId(), name: s.selectedLoc()?.name },
      portfolio: s.portfolio(),
      ssMonthly: s.ssMonthly(),
      monthlyIncome: s.monthlyIncome(),
      partTimeMonthlyIncome: s.partTimeMonthlyIncome(),
      partTimeEndYear: s.partTimeEndYear(),
      meanReturn: s.meanReturn(),
      volatility: s.volatility(),
      meanInflation: s.meanInflation(),
      inflVol: s.inflVol(),
      currVol: s.currVol(),
      fxDrift: s.fxDrift(),
      incGrowth: s.incGrowth(),
      returnMode: s.returnMode(),
      historicalStartYear: s.historicalStartYear(),
      apportionStrategy: this.healthcare.apportionStrategy(),
      magiAnnual: this.healthcare.magi().magiForAca,
      subsidyRegime: this.healthcare.subsidyRegime(),
      transitionExtraIncome: this.healthcare.transitionYearExtraIncome(),
      movesEnabled: s.movesEnabled(),
      moves: s.moves(),
      oneTimeExpensesEnabled: s.oneTimeExpensesEnabled(),
      oneTimeExpenses: s.oneTimeExpenses(),
      ltcMode: s.ltcMode(),
      ltcProbability: s.ltcProbability(),
      ltcCostPerYearUSD: s.ltcCostPerYearUSD(),
      ltcDurationYears: s.ltcDurationYears(),
      ltcStartAgeMin: s.ltcStartAgeMin(),
      ltcStartAgeMax: s.ltcStartAgeMax(),
      ltcInsuranceMonthly: s.ltcInsuranceMonthly(),
      ltcInsuranceStartAge: s.ltcInsuranceStartAge(),
      fxShockEnabled: s.fxShockEnabled(),
      fxShockYear: s.fxShockYear(),
      fxShockPct: s.fxShockPct(),
      spouseDeathEnabled: s.spouseDeathEnabled(),
      spouseDeathYear: s.spouseDeathYear(),
      survivorCostRatio: s.survivorCostRatio(),
      survivorStepUpTaxableBalance: s.survivorStepUpTaxableBalance(),
      survivorStepUpGainRatio: s.survivorStepUpGainRatio(),
      survivorStepUpLtcgRate: s.survivorStepUpLtcgRate(),
    });

    this.api.createScenario({ name, scenarioData }).subscribe({
      next: () => {
        this.savingScenario.set(false);
        this.saveMsg.set('✓ Saved. View on Simulate → Scenarios.');
        setTimeout(() => this.saveMsg.set(null), 4000);
      },
      error: (err) => {
        this.savingScenario.set(false);
        this.saveErr.set(true);
        this.saveMsg.set('Save failed: ' + (err?.error?.error ?? err?.message ?? 'unknown'));
      },
    });
  }

  /* ─── PNG / print export ───────────────────────────────────────── */

  /** Download a PNG snapshot of the paths + histogram + percentile summary.
   *  Rebuilds the charts into a single self-contained SVG (no external CSS
   *  dependency), rasterizes via a data-URL Image → canvas pipeline, then
   *  triggers a browser download. */
  protected saveChartsPng(): void {
    const r = this.state.results();
    if (!r) return;
    const svgStr = this.buildStandaloneSvg();
    svgToPngBlob(svgStr, 2).then(blob => {
      const name = `monte-carlo-${new Date().toISOString().slice(0, 10)}-${Math.round(r.successRate * 100)}pct.png`;
      downloadBlob(name, blob);
    }).catch(err => {
      console.warn('Save PNG failed:', err);
      this.saveMsg.set('Save PNG failed: ' + (err?.message ?? 'unknown'));
      this.saveErr.set(true);
    });
  }

  /** Open a new window navigated to a Blob URL containing print-styled HTML
   *  with the charts + summary, then trigger the print dialog. The window
   *  owns its own stylesheet so the dashboard's dark theme doesn't bleed in. */
  protected printCharts(): void {
    const r = this.state.results();
    if (!r) return;
    const svgStr = this.buildStandaloneSvg();
    const html = buildPrintHtml(svgStr);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    // `noopener` severs `window.opener` in the new window, blocking tab-nabbing
    // and any future regression that might pass API data into the SVG builder
    // unescaped. Some browsers return null for `win` under noopener — the
    // null-check below handles that path the same as a popup-block.
    const win = window.open(url, '_blank', 'width=820,height=1000,noopener,noreferrer');
    if (!win) {
      URL.revokeObjectURL(url);
      this.saveMsg.set('Popup blocked — allow popups for this site to print.');
      this.saveErr.set(true);
      return;
    }
    // With noopener we can't listen for the child's load event, so use a
    // timeout fallback long enough for the new window to fetch the blob URL.
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  /** Build a standalone SVG document string containing: title, success rate,
   *  paths chart, histogram, and percentile list. Self-contained — no
   *  external CSS needed to render correctly. */
  private buildStandaloneSvg(): string {
    const s = this.state;
    const r = s.results()!;
    const locName = s.selectedLoc()?.name ?? 'No location';
    const headerH = 90;
    const gap = 24;
    const pctH = 120;
    const totalW = s.pathW;
    const totalH = headerH + s.pathH + gap + s.histH + gap + pctH + 30;

    const paths = s.pathData();
    const pathZeroY = s.pathZeroY();
    const pathYMax = s.pathYMax();
    const pathYMin = s.pathYMin();
    const histBars = s.histBars();
    const histMinStr = this.fmt(s.histMin(), '');
    const histMaxStr = this.fmt(s.histMax(), '');
    const medianX = s.medianX();
    const pctBars = s.percentileBars();

    const esc = (str: string) => String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
    );

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`;
    svg += `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#ffffff"/>`;
    svg += `<text x="16" y="28" font-family="system-ui" font-size="18" font-weight="700" fill="#111">Monte Carlo — ${esc(locName)}</text>`;
    svg += `<text x="16" y="50" font-family="system-ui" font-size="13" fill="#333">`
         + `Success rate: ${(r.successRate * 100).toFixed(0)}% · `
         + `${s.runs().toLocaleString()} simulated futures over ${s.years()} years`
         + `</text>`;
    svg += `<text x="16" y="70" font-family="system-ui" font-size="12" fill="#666">`
         + `Median ${this.fmt(r.median, '')} · 5th ${this.fmt(r.p5, '')} · 95th ${this.fmt(r.p95, '')}`
         + `</text>`;

    const pY = headerH;
    svg += `<g transform="translate(0,${pY})">`;
    svg += `<text x="16" y="16" font-family="system-ui" font-size="12" font-weight="600" fill="#333">Portfolio Paths</text>`;
    svg += `<g transform="translate(0,24)">`;
    svg += `<line x1="0" x2="${s.pathW}" y1="${pathZeroY}" y2="${pathZeroY}" stroke="#999" stroke-dasharray="3,3" stroke-width="1"/>`;
    for (const pd of paths) {
      svg += `<polyline points="${esc(pd.points)}" stroke="${pd.color}" stroke-width="1" fill="none" opacity="0.6"/>`;
    }
    svg += `<text x="4" y="12" font-family="system-ui" font-size="10" fill="#666">${esc(this.fmt(pathYMax, ''))}</text>`;
    svg += `<text x="4" y="${pathZeroY - 4}" font-family="system-ui" font-size="10" fill="#666">$0</text>`;
    svg += `<text x="4" y="${s.pathH - 4}" font-family="system-ui" font-size="10" fill="#666">${esc(this.fmt(pathYMin, ''))}</text>`;
    svg += `<text x="${s.pathW - 4}" y="${s.pathH - 4}" text-anchor="end" font-family="system-ui" font-size="10" fill="#666">Year ${s.years()}</text>`;
    svg += `</g></g>`;

    const hY = headerH + s.pathH + 24 + gap;
    svg += `<g transform="translate(0,${hY})">`;
    svg += `<text x="16" y="16" font-family="system-ui" font-size="12" font-weight="600" fill="#333">End Balance Distribution</text>`;
    svg += `<g transform="translate(0,24)">`;
    for (const bar of histBars) {
      svg += `<rect x="${bar.x}" y="${bar.y}" width="${bar.w}" height="${bar.h}" fill="${bar.color}"/>`;
    }
    svg += `<line x1="${medianX}" x2="${medianX}" y1="0" y2="${s.histH - 18}" stroke="#D4943A" stroke-width="2"/>`;
    svg += `<text x="${medianX}" y="12" text-anchor="middle" font-family="system-ui" font-size="10" fill="#333">Median</text>`;
    svg += `<text x="4" y="${s.histH - 4}" font-family="system-ui" font-size="10" fill="#666">${esc(histMinStr)}</text>`;
    svg += `<text x="${s.histW - 4}" y="${s.histH - 4}" text-anchor="end" font-family="system-ui" font-size="10" fill="#666">${esc(histMaxStr)}</text>`;
    svg += `</g></g>`;

    const bY = headerH + s.pathH + 24 + gap + s.histH + 24 + gap;
    svg += `<g transform="translate(0,${bY})">`;
    svg += `<text x="16" y="16" font-family="system-ui" font-size="12" font-weight="600" fill="#333">Percentile Breakdown</text>`;
    const rowH = 16;
    const labelW = 80;
    const barW = totalW - labelW - 40;
    pctBars.forEach((p, i) => {
      const y = 24 + i * rowH;
      const fillW = Math.max(2, (p.width / 100) * barW);
      svg += `<text x="16" y="${y + 11}" font-family="system-ui" font-size="11" fill="#333">${esc(p.label)}</text>`;
      svg += `<rect x="${labelW + 16}" y="${y}" width="${barW}" height="12" fill="#eee" rx="2"/>`;
      svg += `<rect x="${labelW + 16}" y="${y}" width="${fillW}" height="12" fill="${p.color}" rx="2"/>`;
      svg += `<text x="${labelW + 16 + fillW + 4}" y="${y + 10}" font-family="system-ui" font-size="10" fill="#333">${esc(this.fmt(p.value, ''))}</text>`;
    });
    svg += `</g>`;

    svg += `</svg>`;
    return svg;
  }
}

/** Build a print-ready HTML document wrapping the SVG with print CSS and an
 *  autoprint trigger. All interpolated values (the SVG string) are already
 *  escaped during SVG assembly. */
function buildPrintHtml(svgStr: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Monte Carlo Results</title>
<style>
  @page { size: letter; margin: 0.5in; }
  body { font-family: system-ui, sans-serif; color: #111; margin: 0; padding: 24px; background: #fff; }
  svg { display: block; max-width: 100%; height: auto; }
  .noprint { margin-bottom: 16px; color: #666; font-size: 12px; }
  .noprint button {
    padding: 6px 12px; border-radius: 4px; border: 1px solid #999;
    background: #eee; cursor: pointer; margin-right: 8px;
  }
  @media print { .noprint { display: none; } }
</style></head>
<body onload="setTimeout(function(){window.print()},250)">
  <div class="noprint">
    <button onclick="window.print()">Print</button>
    <button onclick="window.close()">Close</button>
  </div>
  ${svgStr}
</body></html>`;
}

/** Convert an SVG string to a PNG Blob via an off-screen canvas. Scales by
 *  `pixelRatio` so the export looks crisp on retina displays. */
function svgToPngBlob(svgStr: string, pixelRatio = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const widthMatch = svgStr.match(/width="(\d+)"/);
    const heightMatch = svgStr.match(/height="(\d+)"/);
    const w = widthMatch ? parseInt(widthMatch[1]!, 10) : 800;
    const h = heightMatch ? parseInt(heightMatch[1]!, 10) : 600;
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * pixelRatio;
      canvas.height = h * pixelRatio;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no 2d context')); return; }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(pixelRatio, pixelRatio);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error('image load failed: ' + e)); };
    img.src = url;
  });
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
