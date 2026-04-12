import { Component, inject, computed } from '@angular/core';
import { NavigationService } from '@services/navigation.service';

@Component({
  selector: 'app-placeholder-screen',
  standalone: true,
  template: `
    <div class="placeholder">
      <div class="icon">{{ activeCat()?.icon ?? '📄' }}</div>
      <div class="title">{{ activeScreen()?.label ?? 'Select a screen' }}</div>
      <div class="hint">
        This screen will display {{ activeScreen()?.label }} content
        from the {{ activeCat()?.label }} section.
      </div>
      @if (activeScreen()?.tier === 'premium') {
        <div class="premium-badge">🔒 Premium feature — requires Basic+ tier</div>
      }
    </div>
  `,
  styles: [`
    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      text-align: center;
      gap: 8px;
    }
    .icon { font-size: 48px; }
    .title {
      font-size: 18px;
      font-weight: 600;
      color: var(--dark-text);
    }
    .hint {
      font-size: 12px;
      color: var(--dark-text-muted);
      max-width: 400px;
      line-height: 1.5;
    }
    .premium-badge {
      margin-top: 8px;
      padding: 6px 14px;
      font-size: 11px;
      color: var(--dark-amber);
      background: rgba(212, 148, 58, 0.08);
      border-radius: 6px;
      border: 1px solid rgba(212, 148, 58, 0.2);
    }
  `],
})
export class PlaceholderScreenComponent {
  private readonly nav = inject(NavigationService);

  readonly activeCat = computed(() => this.nav.activeCat());
  readonly activeScreen = computed(() =>
    this.nav.activeCat()?.screens.find(s => s.id === this.nav.activeScreenId())
  );
}
