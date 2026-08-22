import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-video-screen',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="video-screen">
      <div class="screen-header">
        <span class="header-icon">🎬</span>
        <div>
          <h2 class="header-title">Video</h2>
          <p class="header-sub">Create shareable video summaries of your retirement plan</p>
        </div>
      </div>

      <div class="card">
        <div class="coming-soon">
          <div class="cs-icon">🎬</div>
          <h3 class="cs-title">Coming Soon</h3>
          <p class="cs-desc">
            Generate animated video summaries of your retirement plan,
            location comparisons, and financial projections to share
            with family and advisors.
          </p>
          <div class="features">
            <div class="feature">
              <span class="f-icon">📊</span>
              <span class="f-text">Animated cost comparisons</span>
            </div>
            <div class="feature">
              <span class="f-icon">🗺️</span>
              <span class="f-text">Location highlight reels</span>
            </div>
            <div class="feature">
              <span class="f-icon">📈</span>
              <span class="f-text">Portfolio projection animations</span>
            </div>
            <div class="feature">
              <span class="f-icon">👨‍👩‍👧</span>
              <span class="f-text">Shareable family summaries</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .video-screen { display: flex; flex-direction: column; gap: 16px; }
    .screen-header { display: flex; align-items: center; gap: 12px; }
    .header-icon { font-size: calc(32px * var(--font-scale, 1)); }
    .header-title { font-size: calc(20px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-text); margin: 0; }
    .header-sub { font-size: calc(12px * var(--font-scale, 1)); color: var(--dark-text-muted); margin: 2px 0 0; }

    .card {
      background: var(--dark-bg-card); border: 1px solid var(--dark-border);
      border-radius: 12px; padding: 40px;
    }
    .coming-soon { text-align: center; }
    .cs-icon { font-size: calc(64px * var(--font-scale, 1)); margin-bottom: 16px; }
    .cs-title { font-size: calc(20px * var(--font-scale, 1)); font-weight: 700; color: var(--dark-text); margin: 0 0 8px; }
    .cs-desc {
      font-size: calc(13px * var(--font-scale, 1)); color: var(--dark-text-sec); max-width: 500px;
      margin: 0 auto 24px; line-height: 1.5;
    }
    .features {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px; max-width: 500px; margin: 0 auto;
    }
    .feature {
      display: flex; align-items: center; gap: 8px;
      padding: 10px; background: var(--dark-bg-secondary);
      border-radius: 8px; text-align: left;
    }
    .f-icon { font-size: calc(18px * var(--font-scale, 1)); }
    .f-text { font-size: calc(12px * var(--font-scale, 1)); color: var(--dark-text); }
  `],
})
export class VideoScreenComponent {}
