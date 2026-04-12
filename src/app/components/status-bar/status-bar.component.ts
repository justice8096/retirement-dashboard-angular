import { Component, inject } from '@angular/core';
import { NavigationService } from '@services/navigation.service';
import { DyscalculiaService } from '@services/dyscalculia.service';

@Component({
  selector: 'app-status-bar',
  standalone: true,
  template: `
    <div class="bar">
      <span>
        Nav: {{ nav.navMode() === 'compact' ? 'Icons (52px)' : 'Labels (180px)' }}
        · Font: {{ nav.fontSize() }}
        @if (dyscalculia.isEnabled()) {
          · Dyscalculia: ON ({{ dyscalculia.settings().numberFormat }}/{{ dyscalculia.settings().percentageDisplay }})
        }
      </span>
      <span>
        Content width: {{ nav.navMode() === 'compact' ? '~1207px' : '~1079px' }} of 1259px viewport
      </span>
    </div>
  `,
  styles: [`
    .bar {
      background: var(--dark-bg-secondary);
      border-top: 1px solid var(--dark-border);
      padding: 4px 16px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--dark-text-muted);
      flex-shrink: 0;
    }
  `],
})
export class StatusBarComponent {
  readonly nav = inject(NavigationService);
  readonly dyscalculia = inject(DyscalculiaService);
}
