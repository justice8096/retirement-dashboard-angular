import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { sankey, sankeyLinkHorizontal, SankeyNode, SankeyLink, SankeyGraph } from 'd3-sankey';
import { ApiService } from '@services/api.service';
import { LocationService } from '@services/location.service';
import { TaxService } from '@services/tax.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { RentalIncomeService } from '@services/rental-income.service';
import { aggregateRentalIncome } from '@app/lib/rental-income';
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
  templateUrl: './sankey-screen.component.html',
  styleUrls: ['./sankey-screen.component.scss'],
})
export class SankeyScreenComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly loc = inject(LocationService);
  readonly tax = inject(TaxService);
  readonly dyscalculia = inject(DyscalculiaService);
  readonly rental = inject(RentalIncomeService);
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

    // Rental portfolio at year-1 (sim-year 0). Cash flow is what hits the
    // bank and shows in the diagram; depreciation is paper-only and shrinks
    // the taxable base (Schedule E shield) without reducing cash flow.
    const rentalAgg = aggregateRentalIncome(this.rental.properties(), 0);
    const rentalCash = rentalAgg.totalCashFlow;
    const rentalDepreciation = rentalAgg.totalDepreciation;

    const totalIncome =
      ss.reduce((s, m) => s + m.annual, 0) + iraWithdrawal + otherAnnual + rentalCash;

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

    // Income tax using the bracket-aware service. Schedule E depreciation
    // is the only paper expense in totalIncome — it reduces the taxable
    // base but not the cash flow that lands in the bank. Subtracting it
    // before the bracket lookup gives the depreciation shield real
    // teeth on the diagram (the explicit goal of Todo #29).
    const taxableBase = Math.max(0, totalIncome - rentalDepreciation);
    const taxResult = this.tax.computeIncomeTax(l, taxableBase);
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
    if (rentalCash > 0) add('Rental Income', rentalCash, 'income');
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
