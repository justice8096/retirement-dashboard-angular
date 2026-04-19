import { Component, Input, computed, signal } from '@angular/core';

/**
 * Concrete tiles visual (Dashboard Dyscalculia F-004).
 *
 * Renders a dollar amount as a grid of unit tiles, giving readers who
 * struggle with large numerals a subitizable, proportional visual.
 *
 * Capped at 200 tiles to keep the render cheap; a legend line explains
 * the tile-to-dollar ratio when the amount exceeds `unitValue * 200`.
 */
@Component({
  selector: 'app-concrete-tiles',
  standalone: true,
  template: `
    <div class="concrete-tiles" role="img" [attr.aria-label]="ariaLabel()">
      <div class="tile-grid">
        @for (t of tiles(); track $index) {
          <span class="tile" aria-hidden="true"></span>
        }
      </div>
      <p class="tile-legend">{{ legend() }}</p>
    </div>
  `,
  styles: [`
    .concrete-tiles { display: flex; flex-direction: column; gap: 8px; }
    .tile-grid {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 3px;
      max-width: 240px;
    }
    .tile {
      aspect-ratio: 1;
      background: var(--dark-blue);
      border-radius: 2px;
      opacity: 0.85;
    }
    .tile-legend {
      font-size: 11px;
      color: var(--dark-text-muted);
      margin: 0;
    }
  `],
})
export class ConcreteTilesComponent {
  /** Dollar amount to visualize. */
  @Input({ required: true }) set amount(v: number) { this._amount.set(v); }
  /** Dollars per tile. Default: $10,000. */
  @Input() set unitValue(v: number) { if (v > 0) this._unit.set(v); }
  /** Short label for screen readers — e.g. "Portfolio value". */
  @Input() label = 'Amount';

  private readonly _amount = signal(0);
  private readonly _unit = signal(10_000);
  private readonly MAX_TILES = 200;

  readonly tiles = computed(() => {
    const n = Math.min(
      this.MAX_TILES,
      Math.max(0, Math.round(Math.abs(this._amount()) / this._unit())),
    );
    return Array.from({ length: n });
  });

  readonly legend = computed(() => {
    const unit = this._unit().toLocaleString();
    const shown = this.tiles().length;
    const full = Math.round(Math.abs(this._amount()) / this._unit());
    const capped = full > this.MAX_TILES;
    const base = `Each tile = $${unit}. ${shown} tile${shown === 1 ? '' : 's'} shown.`;
    return capped ? `${base} (capped at ${this.MAX_TILES} for display)` : base;
  });

  readonly ariaLabel = computed(() =>
    `${this.label}: about ${this.tiles().length} tiles, each worth $${this._unit().toLocaleString()}.`,
  );
}
