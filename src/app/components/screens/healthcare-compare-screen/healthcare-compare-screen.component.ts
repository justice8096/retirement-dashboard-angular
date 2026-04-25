import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocationService } from '@services/location.service';
import { DyscalculiaService } from '@services/dyscalculia.service';
import { LocationFull } from '@models/api.model';
import { SourceTooltipComponent } from '@components/source-tooltip/source-tooltip.component';
import { ACA_PCT_SOURCES_2026, FPL_SOURCES_2026 } from '../../../lib/aca-constants';

interface Metric {
  loc: LocationFull;
  quality: number;      // 1-10
  monthlyHealth: number;
  annualHealth: number;
  value: number;        // quality per $100/mo
  medCoverageAvail: boolean;
}

/** Representative ACA bronze/silver premium for ages 60-64, US only. Legacy
 *  pinned this to $1,200/mo; kept identical so comparisons line up. */
const ACA_MONTHLY_ESTIMATE = 1200;

@Component({
  selector: 'app-healthcare-compare-screen',
  standalone: true,
  imports: [FormsModule, SourceTooltipComponent],
  templateUrl: './healthcare-compare-screen.component.html',
  styleUrls: ['./healthcare-compare-screen.component.scss'],
})
export class HealthcareCompareScreenComponent implements OnInit {
  readonly loc = inject(LocationService);
  readonly dyscalculia = inject(DyscalculiaService);

  readonly ACA_MONTHLY_ESTIMATE = ACA_MONTHLY_ESTIMATE;
  readonly acaLabel = '$' + ACA_MONTHLY_ESTIMATE.toLocaleString();
  readonly acaSources = [...ACA_PCT_SOURCES_2026, ...FPL_SOURCES_2026];

  readonly selectedId = signal<string | null>(null);

  readonly allMetrics = computed<Metric[]>(() =>
    this.loc.fullLocations().map(l => this.metricFor(l))
      .sort((a, b) => b.quality - a.quality)
  );

  readonly topValues = computed<Metric[]>(() =>
    this.allMetrics().filter(m => m.monthlyHealth > 0)
      .slice()
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  );

  readonly stats = computed(() => {
    const all = this.allMetrics();
    const withData = all.filter(m => m.monthlyHealth > 0);
    if (!all.length) return { bestQuality: null, cheapest: null, bestValue: null, avgCost: 0 };
    const bestQuality = all.reduce((a, b) => b.quality > a.quality ? b : a, all[0]!);
    const cheapest = withData.reduce((a, b) => b.monthlyHealth < a.monthlyHealth ? b : a, withData[0] ?? all[0]!);
    const bestValue = withData.length ? withData.slice().sort((a, b) => b.value - a.value)[0]! : null;
    const avgCost = withData.length ? withData.reduce((s, m) => s + m.monthlyHealth, 0) / withData.length : 0;
    return { bestQuality, cheapest, bestValue, avgCost };
  });

  /** X-axis upper bound for the scatter — round up the observed max so the
   *  plot uses the whole width. */
  readonly xMax = computed(() => {
    const max = this.allMetrics().reduce((m, p) => Math.max(m, p.monthlyHealth), 0);
    return Math.max(400, Math.ceil(max / 200) * 200);
  });

  readonly selected = computed<Metric | null>(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.allMetrics().find(m => m.loc.id === id) ?? null;
  });

  ngOnInit(): void {
    this.loc.loadFull();
  }

  toggleSelect(id: string): void {
    this.selectedId.update(cur => cur === id ? null : id);
  }

  dotX(monthly: number): number {
    return Math.min(100, (monthly / this.xMax()) * 100);
  }

  dotY(quality: number): number {
    return Math.min(100, (quality / 10) * 100);
  }

  /** Non-color text tier for the quality column — lets AT users read the
   *  same "good / mid / low" signal the color conveys. (DFA-2026-04-21-002) */
  qualityTierLabel(quality: number): 'strong' | 'moderate' | 'weak' {
    if (quality >= 6) return 'strong';
    if (quality >= 4) return 'moderate';
    return 'weak';
  }

  private metricFor(loc: LocationFull): Metric {
    const quality = loc.healthcare?.qualityRating ?? 5;
    const monthlyHealth = loc.monthlyCosts?.healthcare?.typical ?? 0;
    const annualHealth = monthlyHealth * 12;
    // Quality per $100/mo — higher is better value. Matches legacy formula.
    const value = monthlyHealth > 0 ? quality / (monthlyHealth / 100) : 0;
    return {
      loc,
      quality,
      monthlyHealth,
      annualHealth,
      value,
      medCoverageAvail: loc.country === 'United States',
    };
  }

  fmt(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(Math.round(amount), '')
      : '$' + Math.round(amount).toLocaleString();
  }

  fmtYr(amount: number): string {
    return this.dyscalculia.isEnabled()
      ? this.dyscalculia.formatCurrency(Math.round(amount), '/yr')
      : '$' + Math.round(amount).toLocaleString() + '/yr';
  }
}
