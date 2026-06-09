import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { MonteCarloStateService } from '@services/monte-carlo-state.service';
import { LocationService } from '@services/location.service';

/**
 * Read-only timeline visualization of all configured Life Events on the
 * Monte Carlo scenarios screen (#31 priority 6 — closes the Life Events
 * framework). Renders one lane per event kind — moves, spouse death,
 * survivor relocation, one-time expenses, one-time incomes, inherited-
 * IRA drain — across a single year axis from 0 to `state.years()`.
 *
 * Pure UI — does not touch the kernel or runner. Reads directly from the
 * `MonteCarloStateService` signals so the chart re-renders automatically
 * when any timeline-relevant signal changes.
 *
 * Dyscalculia-aware: lane palette intentionally avoids `--dark-red`
 * except for negative-magnitude indicators where the alarm is
 * legitimate. Per the 2026-04-24 dyscalculia gap analysis, soft data
 * concerns use `--dark-neutral` rather than red.
 */

interface LaneSpec {
  /** CSS color for markers in this lane. */
  readonly color: string;
  /** Lane label rendered in the left gutter. */
  readonly label: string;
  /** Pixel y-coordinate (top of the lane track) inside the SVG viewBox. */
  readonly y: number;
}

interface PointMark {
  /** Year (sim-year, 0-based). */
  readonly year: number;
  /** Pixel x-coordinate after axis projection. */
  readonly x: number;
  /** Magnitude radius modifier (3–8 px) — larger = bigger event. */
  readonly r: number;
  /** Tooltip title. */
  readonly title: string;
}

interface SpanMark {
  /** Start year. */
  readonly fromYear: number;
  /** End year (inclusive). */
  readonly toYear: number;
  /** Pixel x-coordinate of the start. */
  readonly x: number;
  /** Pixel width of the bar. */
  readonly w: number;
  /** Tooltip title. */
  readonly title: string;
}

@Component({
  selector: 'app-mc-life-events-timeline',
  standalone: true,
  imports: [],
  templateUrl: './mc-life-events-timeline.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./mc-life-events-timeline.component.scss'],
})
export class McLifeEventsTimelineComponent {
  protected readonly state = inject(MonteCarloStateService);
  private readonly loc = inject(LocationService);

  /** SVG viewBox geometry. Scales fluidly via CSS (`width: 100%`). */
  protected readonly W = 800;
  protected readonly H = 220;
  /** Inner-track origin: leaves room for lane labels (left) + axis (bottom). */
  protected readonly LEFT = 84;
  protected readonly RIGHT = 12;
  protected readonly TOP = 8;
  protected readonly BOTTOM = 22;
  /** Plot area width / height in px. */
  protected readonly trackW = this.W - this.LEFT - this.RIGHT;
  protected readonly trackH = this.H - this.TOP - this.BOTTOM;
  /** Lane row height (6 lanes evenly spaced inside trackH). */
  protected readonly LANE_H = this.trackH / 6;

  /** Lane definitions, top to bottom. y is the lane's vertical CENTER. */
  protected readonly lanes: ReadonlyArray<LaneSpec> = [
    { label: 'Moves',          color: 'var(--dark-blue)',    y: this.TOP + this.LANE_H * 0.5 },
    { label: 'Spouse death',   color: 'var(--dark-neutral)', y: this.TOP + this.LANE_H * 1.5 },
    { label: 'Survivor reloc.', color: 'var(--dark-purple)', y: this.TOP + this.LANE_H * 2.5 },
    { label: 'Lump expenses',  color: 'var(--dark-amber)',   y: this.TOP + this.LANE_H * 3.5 },
    { label: 'Lump incomes',   color: 'var(--dark-green)',   y: this.TOP + this.LANE_H * 4.5 },
    { label: 'Inherited IRA',  color: 'var(--dark-teal)',    y: this.TOP + this.LANE_H * 5.5 },
  ];

  /** Map a sim year to an x pixel inside the plot area. */
  private xForYear(year: number): number {
    const years = this.state.years();
    if (years <= 0) return this.LEFT;
    return this.LEFT + (year / years) * this.trackW;
  }

  /** Year-axis ticks every 5 years (or every year if horizon < 10). */
  protected readonly yearTicks = computed(() => {
    const years = this.state.years();
    const step = years <= 10 ? 1 : 5;
    const out: { year: number; x: number }[] = [];
    for (let y = 0; y <= years; y += step) {
      out.push({ year: y, x: this.xForYear(y) });
    }
    return out;
  });

  // ─── Per-lane derived signals ──────────────────────────────────────

  /** Lane 0 — fixed-year moves from `state.moves()`. */
  protected readonly moveMarks = computed<PointMark[]>(() => {
    if (!this.state.movesEnabled()) return [];
    return this.state.moves().map(m => {
      const locName = this.loc.fullLocations().find(l => l.id === m.locationId)?.name ?? m.locationId;
      const moveCost = m.moveCostUSD ? ` ($${m.moveCostUSD.toLocaleString()} move cost)` : '';
      return {
        year: m.fromYear,
        x: this.xForYear(m.fromYear),
        r: 5,
        title: `Move to ${locName} at year ${m.fromYear}${moveCost}`,
      };
    });
  });

  /** Lane 1 — spouse death (single point, only when enabled). */
  protected readonly deathMarks = computed<PointMark[]>(() => {
    if (!this.state.spouseDeathEnabled()) return [];
    const y = this.state.spouseDeathYear();
    return [{
      year: y,
      x: this.xForYear(y),
      r: 6,
      title: `Spouse death at year ${y}`,
    }];
  });

  /** Lane 2 — survivor relocation: a span from death year to horizon
   *  (sticky; the trial lives in the relocate segment afterwards). */
  protected readonly survivorRelocSpan = computed<SpanMark[]>(() => {
    if (!this.state.spouseDeathEnabled() || !this.state.survivorRelocateEnabled()) return [];
    const startY = this.state.spouseDeathYear();
    const endY = this.state.years();
    const locId = this.state.survivorRelocateLocationId();
    if (!locId) return [];
    const locName = this.loc.fullLocations().find(l => l.id === locId)?.name ?? locId;
    const x = this.xForYear(startY);
    return [{
      fromYear: startY,
      toYear: endY,
      x,
      w: this.xForYear(endY) - x,
      title: `Survivor relocates to ${locName} at year ${startY}, sticks through year ${endY}`,
    }];
  });

  /** Lane 3 — one-time expenses (variable-radius dots scaled by amount). */
  protected readonly expenseMarks = computed<PointMark[]>(() => {
    if (!this.state.oneTimeExpensesEnabled()) return [];
    const list = this.state.oneTimeExpenses();
    const max = Math.max(1, ...list.map(e => e.amountUSD));
    return list.map(e => ({
      year: e.year,
      x: this.xForYear(e.year),
      r: 3 + 5 * Math.sqrt(e.amountUSD / max),
      title: `${e.label || 'Expense'}: −$${e.amountUSD.toLocaleString()} at year ${e.year}`,
    }));
  });

  /** Lane 4 — one-time incomes (variable-radius dots scaled by amount). */
  protected readonly incomeMarks = computed<PointMark[]>(() => {
    if (!this.state.oneTimeIncomesEnabled()) return [];
    const list = this.state.oneTimeIncomes();
    const max = Math.max(1, ...list.map(e => e.amountUSD));
    return list.map(e => ({
      year: e.year,
      x: this.xForYear(e.year),
      r: 3 + 5 * Math.sqrt(e.amountUSD / max),
      title: `${e.label || 'Income'}: +$${e.amountUSD.toLocaleString()} at year ${e.year}`,
    }));
  });

  /** Lane 5 — inherited-IRA drain spans. One bar per IRA event covering
   *  [year, year + drainOverYears - 1]. */
  protected readonly iraSpans = computed<SpanMark[]>(() => {
    if (!this.state.inheritedIRAsEnabled()) return [];
    return this.state.inheritedIRAs().map(e => {
      const drainYears = Math.max(1, e.drainOverYears);
      const fromYear = e.year;
      const toYear = Math.min(this.state.years(), e.year + drainYears);
      const x = this.xForYear(fromYear);
      return {
        fromYear,
        toYear,
        x,
        w: this.xForYear(toYear) - x,
        title: `${e.label || 'Inherited IRA'}: $${e.balanceUSD.toLocaleString()} drained over ${drainYears} years (y${fromYear}–y${toYear - 1}), ${e.effectiveTaxRate}% tax`,
      };
    });
  });

  /** Convenience: any events at all? Used to gate empty-state copy. */
  protected readonly hasAnyEvents = computed(() =>
    this.moveMarks().length +
    this.deathMarks().length +
    this.survivorRelocSpan().length +
    this.expenseMarks().length +
    this.incomeMarks().length +
    this.iraSpans().length > 0
  );
}
