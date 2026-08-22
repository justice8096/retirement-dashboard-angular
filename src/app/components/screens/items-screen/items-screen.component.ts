import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ItemsService } from '@services/items.service';
import { ITEM_CATEGORIES, ItemCategoryKey } from '../../../data/item-catalog';

@Component({
  selector: 'app-items-screen',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="items-screen">
      <div class="screen-header">
        <span class="header-icon">🧾</span>
        <div>
          <h2 class="header-title">Items</h2>
          <p class="header-sub">
            Pick which items count toward your monthly costs. Unchecked items are excluded;
            an empty category falls back to defaults.
          </p>
        </div>
      </div>

      @for (cat of categories; track cat.key) {
        <div class="cat-card">
          <div class="cat-head">
            <h3 class="cat-title">
              <span class="cat-icon">{{ cat.icon }}</span>
              {{ cat.label }}
              <span class="cat-count">
                {{ itemsSel.selections()[cat.key].length }} / {{ cat.items.length }} selected
              </span>
            </h3>
            <div class="cat-actions">
              <button mat-stroked-button class="sm-btn"
                      (click)="itemsSel.resetCategory(cat.key)">All</button>
              <button mat-stroked-button class="sm-btn"
                      (click)="itemsSel.clearCategory(cat.key)">None</button>
            </div>
          </div>
          <div class="items-grid">
            @for (item of cat.items; track item.id) {
              <label class="item-chk" [class.on]="isOn(cat.key, item.id)">
                <input type="checkbox"
                  [checked]="isOn(cat.key, item.id)"
                  (change)="itemsSel.toggle(cat.key, item.id)" />
                <span>{{ item.label }}</span>
              </label>
            }
          </div>
          @if (cat.costKey) {
            <div class="cat-foot">
              Scales <strong>{{ cat.costKey }}</strong> costs by
              <strong>{{ scalePct(cat.key, cat.items.length) }}%</strong> of location default.
            </div>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .items-screen { display: flex; flex-direction: column; gap: 14px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: calc(32px * var(--font-scale, 1)); }
    .header-title { font-size: calc(20px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: calc(12px * var(--font-scale, 1)); color: var(--dark-text-muted); margin: 2px 0 0; max-width: 640px; line-height: 1.5; }

    .cat-card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 18px;
    }
    .cat-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 10px; flex-wrap: wrap; }
    .cat-title { font-size: calc(14px * var(--font-scale, 1)); margin: 0; color: var(--dark-text); font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .cat-icon { font-size: calc(18px * var(--font-scale, 1)); }
    .cat-count { font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-muted); font-weight: 400; margin-left: 4px; }
    .cat-actions { display: flex; gap: 6px; }
    .sm-btn {
      --mat-button-outlined-container-height: 26px;
      --mat-button-outlined-label-text-size: 10px;
      --mat-button-outlined-label-text-tracking: 0;
    }

    .items-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; }
    .item-chk {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px; border-radius: 6px;
      background: var(--dark-bg-secondary); border: 1px solid transparent;
      font-size: calc(12px * var(--font-scale, 1)); color: var(--dark-text-sec); cursor: pointer;
      transition: all 0.15s;
    }
    .item-chk:hover { border-color: var(--dark-border); }
    .item-chk.on { background: rgba(212, 148, 58, 0.08); border-color: rgba(212, 148, 58, 0.3); color: var(--dark-text); }
    .item-chk input { accent-color: var(--dark-amber); }

    .cat-foot {
      margin-top: 10px; padding: 8px 10px;
      background: var(--dark-bg-secondary); border-radius: 6px;
      font-size: calc(11px * var(--font-scale, 1)); color: var(--dark-text-muted);
    }
    .cat-foot strong { color: var(--dark-text); font-variant-numeric: tabular-nums; }
  `],
})
export class ItemsScreenComponent implements OnInit {
  readonly itemsSel = inject(ItemsService);
  readonly categories = ITEM_CATEGORIES;

  ngOnInit(): void {
    this.itemsSel.load();
  }

  isOn(cat: ItemCategoryKey, id: string): boolean {
    return (this.itemsSel.selections()[cat] ?? []).includes(id);
  }

  scalePct(cat: ItemCategoryKey, total: number): string {
    const selected = this.itemsSel.selections()[cat]?.length ?? 0;
    const ratio = selected === 0 ? 1 : selected / total;
    return (ratio * 100).toFixed(0);
  }
}
