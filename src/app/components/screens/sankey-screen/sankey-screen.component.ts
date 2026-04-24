import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink, SankeyGraph } from 'd3-sankey';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { NumericInputDirective } from '@directives/numeric-input.directive';
import {
  FinancialSettings, HouseholdProfile, HouseholdMember, LocationFull,
} from '@models/api.model';

/* Chart dimensions — legacy used 800×500, which shrank on narrow panes.
 * 960×520 fits comfortably in the dashboard content area and leaves room
 * for the value labels that sit beneath each node. */
const CHART_W = 960;
const CHART_H = 520;

/** SS benefit at the chosen claim age — matches estimateBenefitAtClaim in
 *  montecarlo-screen and ss-screen so all three surfaces agree. */
function estimateBenefitAtClaim(m: HouseholdMember): number {
  const pia = Number(m.ssPia) || 0;
  if (!pia || !m.ssFra || !m.ssClaimAge) return 0;
  const diff = m.ssClaimAge - m.ssFra;
  if (diff === 0) return pia;
  if (diff > 0) return Math.round(pia * (1 + diff * 0.08));
  const yearsEarly = Math.abs(diff);
  const reduction = yearsEarly <= 3
    ? yearsEarly * 0.0667
    : 3 * 0.0667 + (yearsEarly - 3) * 0.05;
  return Math.round(pia * (1 - reduction));
}

type NodeKind = 'income' | 'pool' | 'taxes' | 'afterTax' | 'expense' | 'surplus' | 'drawdown';

interface FlowNode {
  name: string;
  value: number;
  kind: NodeKind;
}

interface FlowLink {
  source: number;
  target: number;
  value: number;
}

type D3Node = SankeyNode<FlowNode, FlowLink>;
type D3Link = SankeyLink<FlowNode, FlowLink>;

const NODE_COLORS: Record<NodeKind, string> = {
  income:   '#4CAF50', // green — sources
  pool:     '#5C9CE6', // blue — pooled totals (Total Income, After-Tax Income)
  taxes:    '#E57373', // red
  afterTax: '#5C9CE6',
  expense:  '#9C6FDE', // purple — expense categories
  surplus:  '#27AE60', // deep green
  drawdown: '#E8B86D', // amber — eating principal
};

/* Expense categories we break out as their own Sankey nodes. The rest of
 * the monthlyCosts keys get rolled into a single "Other Expenses" bucket so
 * the diagram doesn't end up with 17 tiny terminal nodes. */
const BREAKOUT_EXPENSE_KEYS: Record<string, string> = {
  rent: 'Rent',
  groceries: 'Groceries',
  healthcare: 'Healthcare',
  transportation: 'Transportation',
  entertainment: 'Entertainment',
  utilities: 'Utilities',
  insurance: 'Insurance',
};

@Component({
  selector: 'app-sankey-screen',
  standalone: true,
  imports: [FormsModule, NumericInputDirective],
  template: `
    <div class="sankey-screen">
      <div class="screen-header">
        <span class="header-icon">🌊</span>
        <div>
          <h2 class="header-title">Cash Flow</h2>
          <p class="header-sub">
            One retirement year for a single location — where your money comes from, what taxes take,
            and how the rest disperses across expense categories.
          </p>
        </div>
        <span class="badge-new">NEW</span>
      </div>

      <div class="card controls">
        <label class="ctrl">
          <span class="ctrl-label">Location</span>
          <select class="ctrl-input"
            [ngModel]="selectedLocId()" (ngModelChange)="selectedLocId.set($event)">
            @for (l of loc.fullLocations(); track l.id) {
              <option [value]="l.id">{{ l.name }}</option>
            }
          </select>
        </label>
        <label class="ctrl">
          <span class="ctrl-label">Withdrawal Rate (%)</span>
          <input appNumeric="percent" class="ctrl-input" step="0.1" min="0" max="20"
            [ngModel]="withdrawalPct()" (ngModelChange)="withdrawalPct.set($event)" />
          <span class="param-hint">Applied to portfolio balance for the IRA withdrawal source.</span>
        </label>
        <label class="ctrl">
          <span class="ctrl-label">Other Monthly Income</span>
          <input appNumeric="currency" class="ctrl-input"
            [class]="dyscalculia.numberSpacingClass()"
            [ngModel]="otherMonthlyIncome()" (ngModelChange)="otherMonthlyIncome.set($event)" />
          <span class="param-hint">Pension, annuity, part-time work, etc. Monthly.</span>
        </label>
      </div>

      <!-- Summary cards -->
      <div class="results">
        <div class="result-card">
          <div class="result-label">Total Income</div>
          <div class="result-value green">{{ fmt(summary().totalIncome) }}</div>
        </div>
        <div class="result-card">
          <div class="result-label">Taxes</div>
          <div class="result-value red">{{ fmt(summary().taxes) }}</div>
        </div>
        <div class="result-card">
          <div class="result-label">Annual Expenses</div>
          <div class="result-value">{{ fmt(summary().expenses) }}</div>
        </div>
        <div class="result-card highlight">
          <div class="result-label">Net Cash Flow</div>
          <div class="result-value" [class.green]="summary().net >= 0" [class.red]="summary().net < 0">
            {{ fmt(summary().net) }}
          </div>
          <div class="result-explain">
            @if (summary().net >= 0) { Surplus — added to savings } @else { Deficit — drawn from portfolio }
          </div>
        </div>
      </div>

      <!-- Sankey -->
      <div class="card chart-card">
        @if (layout(); as lay) {
          <svg [attr.viewBox]="'0 0 ' + CHART_W + ' ' + CHART_H" class="sankey-svg">
            <!-- Links first so nodes draw on top -->
            @for (link of lay.links; track $index) {
              <path
                [attr.d]="linkPath(link)"
                fill="none"
                [attr.stroke]="linkColor(link)"
                [attr.stroke-width]="Math.max(1, link.width ?? 1)"
                [attr.opacity]="hoveredLink() === $index ? 0.55 : 0.28"
                (mouseenter)="hoveredLink.set($index)"
                (mouseleave)="hoveredLink.set(null)"
                class="link-path">
                <title>{{ linkTitle(link) }}</title>
              </path>
            }

            <!-- Nodes -->
            @for (node of lay.nodes; track $index) {
              <g>
                <rect
                  [attr.x]="node.x0"
                  [attr.y]="node.y0"
                  [attr.width]="(node.x1 ?? 0) - (node.x0 ?? 0)"
                  [attr.height]="(node.y1 ?? 0) - (node.y0 ?? 0)"
                  [attr.fill]="NODE_COLORS[node.kind]"
                  opacity="0.85"
                  rx="3">
                  <title>{{ node.name }} — {{ fmt(node.value) }}</title>
                </rect>
                <!-- aria-hidden so NVDA/JAWS doesn't double-read the adjacent
                     <rect>'s <title> element (DFA-2026-04-21-003). The rect
                     title is the accessible name; these <text>s are visual only. -->
                <text
                  [attr.x]="nodeLabelX(node)"
                  [attr.y]="((node.y0 ?? 0) + (node.y1 ?? 0)) / 2"
                  [attr.text-anchor]="nodeLabelAnchor(node)"
                  dominant-baseline="middle"
                  aria-hidden="true"
                  class="node-label">
                  {{ node.name }}
                </text>
                <text
                  [attr.x]="nodeLabelX(node)"
                  [attr.y]="((node.y0 ?? 0) + (node.y1 ?? 0)) / 2 + 14"
                  [attr.text-anchor]="nodeLabelAnchor(node)"
                  dominant-baseline="middle"
                  aria-hidden="true"
                  class="node-value">
                  {{ fmt(node.value) }}
                </text>
              </g>
            }
          </svg>
        } @else {
          <div class="empty-state">
            No flows to show — add income or expenses in Assumptions, or pick a populated location.
          </div>
        }
      </div>

      <div class="legend">
        <span class="lg-item"><span class="sw" [style.background]="NODE_COLORS.income"></span>Income source</span>
        <span class="lg-item"><span class="sw" [style.background]="NODE_COLORS.pool"></span>Pooled / After-tax</span>
        <span class="lg-item"><span class="sw" [style.background]="NODE_COLORS.taxes"></span>Taxes</span>
        <span class="lg-item"><span class="sw" [style.background]="NODE_COLORS.expense"></span>Expense category</span>
        <span class="lg-item"><span class="sw" [style.background]="NODE_COLORS.surplus"></span>Surplus → savings</span>
        <span class="lg-item"><span class="sw" [style.background]="NODE_COLORS.drawdown"></span>Portfolio drawdown</span>
      </div>
    </div>
  `,
  styles: [`
    .sankey-screen { display: flex; flex-direction: column; gap: 16px; }
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

    .controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; }
    .ctrl { display: flex; flex-direction: column; gap: 4px; flex: 1 1 200px; }
    .ctrl-label { font-size: 11px; color: var(--dark-text-muted); }
    .ctrl-input {
      padding: 8px 10px; border-radius: 6px; border: 1px solid var(--dark-border);
      background: var(--dark-bg-secondary); color: var(--dark-text);
      font-size: 13px; font-family: var(--font-sans); outline: none;
    }
    .ctrl-input:focus { border-color: var(--dark-blue); }
    .param-hint {
      font-size: 11px; color: var(--dark-text-muted);
      line-height: var(--prose-line-height, 1.5);
    }

    .results { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .result-card {
      padding: 14px; background: var(--dark-bg-card);
      border: 1px solid var(--dark-border); border-radius: 10px;
    }
    .result-card.highlight { border-color: var(--dark-amber); }
    .result-label { font-size: 11px; color: var(--dark-text-muted); text-transform: uppercase; }
    .result-value { font-size: 22px; font-weight: 700; color: var(--dark-amber); margin-top: 4px; font-variant-numeric: tabular-nums; }
    .result-value.green { color: var(--dark-green); }
    .result-value.red   { color: var(--dark-neutral); }
    .result-explain { font-size: 11px; color: var(--dark-text-muted); margin-top: 4px; }

    .chart-card { padding: 20px 24px; }
    .sankey-svg { width: 100%; height: auto; max-height: 640px; display: block; }
    .link-path { cursor: pointer; transition: opacity 0.2s; }
    .node-label {
      font-size: 11px; font-weight: 600; fill: var(--dark-text);
      font-family: var(--font-sans);
      paint-order: stroke; stroke: var(--dark-bg-card); stroke-width: 3px; stroke-linejoin: round;
    }
    .node-value {
      font-size: 11px; fill: var(--dark-text-muted);
      font-family: var(--font-sans); font-variant-numeric: tabular-nums;
      paint-order: stroke; stroke: var(--dark-bg-card); stroke-width: 3px;
    }

    .empty-state {
      padding: 40px; text-align: center; color: var(--dark-text-muted);
      font-size: 13px; line-height: var(--prose-line-height, 1.5);
    }

    .legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: var(--dark-text-sec); }
    .lg-item { display: inline-flex; align-items: center; gap: 6px; }
    .sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  `],
})
export class SankeyScreenComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly loc = inject(LocationService);
  readonly tax = inject(TaxService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly Math = Math;

  readonly CHART_W = CHART_W;
  readonly CHART_H = CHART_H;
  readonly NODE_COLORS = NODE_COLORS;

  readonly selectedLocId = signal<string>('');
  readonly withdrawalPct = signal(4);
  readonly otherMonthlyIncome = signal(0);
  readonly household = signal<HouseholdProfile | null>(null);
  readonly financial = signal<FinancialSettings | null>(null);
  readonly hoveredLink = signal<number | null>(null);

  /** Pre-layout graph — nodes + links in dollar amounts. Recomputes when any
   *  input signal (location, household SS, portfolio, other income, wdraw rate)
   *  changes. */
  readonly graph = computed<{ nodes: FlowNode[]; links: FlowLink[] } | null>(() => {
    const l = this.selectedLoc();
    const h = this.household();
    const f = this.financial();
    if (!l) return null;

    const ss = (h?.members ?? [])
      .filter(m => m.role === 'primary' || m.role === 'spouse')
      .map(m => ({ name: m.name || m.role, annual: estimateBenefitAtClaim(m) * 12 }));

    const portfolio = Number(f?.portfolioBalance) || 0;
    const iraWithdrawal = portfolio * (this.withdrawalPct() / 100);
    const otherAnnual = this.otherMonthlyIncome() * 12;

    const totalIncome =
      ss.reduce((s, m) => s + m.annual, 0) + iraWithdrawal + otherAnnual;

    // Expense breakdown — sum monthlyCosts excluding 'taxes' (we compute that),
    // split into 7 named categories + "Other Expenses" catch-all.
    const expenses: Record<string, number> = {};
    let otherExpenses = 0;
    for (const [key, cost] of Object.entries(l.monthlyCosts ?? {})) {
      if (key === 'taxes') continue;
      const annual = (cost?.typical ?? 0) * 12;
      if (annual <= 0) continue;
      const label = BREAKOUT_EXPENSE_KEYS[key];
      if (label) expenses[label] = (expenses[label] ?? 0) + annual;
      else otherExpenses += annual;
    }
    if (otherExpenses > 0) expenses['Other Expenses'] = otherExpenses;
    const annualExpenses = Object.values(expenses).reduce((s, v) => s + v, 0);

    // Income tax using the bracket-aware service (total-income as base).
    const taxResult = this.tax.computeIncomeTax(l, totalIncome);
    const taxes = taxResult.monthlyTax * 12;
    const afterTax = Math.max(0, totalIncome - taxes);

    const nodes: FlowNode[] = [];
    const idx: Record<string, number> = {};
    const add = (name: string, value: number, kind: NodeKind): number => {
      idx[name] = nodes.length;
      nodes.push({ name, value, kind });
      return idx[name]!;
    };

    // Sources
    for (const m of ss) {
      if (m.annual > 0) add(`SS — ${m.name}`, m.annual, 'income');
    }
    if (otherAnnual > 0) add('Other Income', otherAnnual, 'income');
    if (iraWithdrawal > 0) add('Portfolio Withdrawal', iraWithdrawal, 'income');

    // Pool
    add('Total Income', totalIncome, 'pool');
    if (taxes > 0) add('Taxes', taxes, 'taxes');
    add('After-Tax Income', afterTax, 'afterTax');

    // Expense categories
    for (const [name, value] of Object.entries(expenses)) {
      if (value > 0) add(name, value, 'expense');
    }

    // Surplus / drawdown
    const net = afterTax - annualExpenses;
    if (net > 0) add('Savings / Surplus', net, 'surplus');

    // Links
    const links: FlowLink[] = [];
    for (const key of Object.keys(idx)) {
      if (nodes[idx[key]!]!.kind === 'income') {
        links.push({ source: idx[key]!, target: idx['Total Income']!, value: nodes[idx[key]!]!.value });
      }
    }
    if (taxes > 0) links.push({ source: idx['Total Income']!, target: idx['Taxes']!, value: taxes });
    if (afterTax > 0) links.push({ source: idx['Total Income']!, target: idx['After-Tax Income']!, value: afterTax });
    for (const [name, value] of Object.entries(expenses)) {
      if (value > 0 && idx[name] !== undefined) {
        // Cap each expense link by the after-tax income so the Sankey layout
        // doesn't try to assign more flow than the source can carry. Any
        // uncovered portion shows up as Portfolio Drawdown below.
        links.push({ source: idx['After-Tax Income']!, target: idx[name]!, value });
      }
    }
    if (net > 0 && idx['Savings / Surplus'] !== undefined) {
      links.push({ source: idx['After-Tax Income']!, target: idx['Savings / Surplus']!, value: net });
    }
    if (net < 0) {
      const drawdownIdx = add('Portfolio Drawdown', -net, 'drawdown');
      links.push({ source: drawdownIdx, target: idx['After-Tax Income']!, value: -net });
    }

    // Prune any node that ended up with value <= 0 (shouldn't happen but
    // guards against a runtime glitch when expenses or income are all zero).
    if (!links.length) return null;
    return { nodes, links };
  });

  /** Runs the d3-sankey layout algorithm. Outputs positions on the nodes
   *  (`x0/x1/y0/y1`) and widths on the links (`width`). */
  readonly layout = computed(() => {
    const g = this.graph();
    if (!g) return null;
    const s = sankey<FlowNode, FlowLink>()
      .nodeWidth(18)
      .nodePadding(14)
      .extent([[20, 20], [CHART_W - 20, CHART_H - 20]]);
    const input: SankeyGraph<FlowNode, FlowLink> = {
      nodes: g.nodes.map(n => ({ ...n })),
      links: g.links.map(l => ({ ...l })),
    };
    try {
      const laid = s(input);
      return laid;
    } catch (err) {
      console.warn('Sankey layout failed:', err);
      return null;
    }
  });

  readonly summary = computed(() => {
    const g = this.graph();
    if (!g) return { totalIncome: 0, taxes: 0, expenses: 0, net: 0 };
    const ti = g.nodes.find(n => n.name === 'Total Income')?.value ?? 0;
    const tx = g.nodes.find(n => n.name === 'Taxes')?.value ?? 0;
    const at = g.nodes.find(n => n.name === 'After-Tax Income')?.value ?? 0;
    const expenses = g.nodes
      .filter(n => n.kind === 'expense')
      .reduce((s, n) => s + n.value, 0);
    return { totalIncome: ti, taxes: tx, expenses, net: at - expenses };
  });

  readonly selectedLoc = computed<LocationFull | null>(() => {
    const id = this.selectedLocId();
    if (!id) return null;
    return this.loc.fullLocations().find(l => l.id === id) ?? null;
  });

  ngOnInit(): void {
    this.loc.loadFull();

    this.api.getHousehold().subscribe({
      next: (h) => this.household.set(h),
      error: (err) => console.warn('Sankey: household fetch failed.', err),
    });
    this.api.getFinancial().subscribe({
      next: (f) => this.financial.set(f),
      error: (err) => console.warn('Sankey: financial fetch failed.', err),
    });

    // Default to first selected location, else first full location, once loaded.
    queueMicrotask(() => {
      const tryPick = () => {
        if (this.selectedLocId()) return;
        const sel = [...this.loc.selectedIds()][0];
        if (sel) { this.selectedLocId.set(sel); return; }
        const full = this.loc.fullLocations();
        if (full.length) this.selectedLocId.set(full[0]!.id);
      };
      tryPick();
      setTimeout(tryPick, 1500);  // one late retry in case fullLocations loads slow
    });
  }

  linkPath(link: D3Link): string {
    const pathGen = sankeyLinkHorizontal<FlowNode, FlowLink>();
    return pathGen(link) ?? '';
  }

  linkColor(link: D3Link): string {
    // Color by source kind — sets the "this band is tax" or "this is surplus" read.
    const src = link.source as D3Node;
    return NODE_COLORS[src.kind];
  }

  linkTitle(link: D3Link): string {
    const src = link.source as D3Node;
    const dst = link.target as D3Node;
    return `${src.name} → ${dst.name}: ${this.fmt(link.value)}`;
  }

  /** Labels sit to the right of left-half nodes and to the left of right-half
   *  nodes so they never overlap the node rect. */
  nodeLabelX(node: D3Node): number {
    const mid = CHART_W / 2;
    const x = node.x0 ?? 0;
    return x < mid ? (node.x1 ?? 0) + 6 : x - 6;
  }

  nodeLabelAnchor(node: D3Node): 'start' | 'end' {
    return (node.x0 ?? 0) < CHART_W / 2 ? 'start' : 'end';
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(Math.round(amount), '/yr')
      : '$' + Math.round(amount).toLocaleString() + '/yr';
  }
}
