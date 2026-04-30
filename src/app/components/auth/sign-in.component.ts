import {
  Component, inject, ElementRef, AfterViewInit, OnDestroy, viewChild,
} from '@angular/core';
import { AuthService } from '@services/auth.service';

/**
 * Mounts Clerk's hosted sign-in UI into a container div.
 *
 * The Clerk component handles sign-in, sign-up, password reset, social
 * providers, MFA — all the auth flows. After a successful sign-in,
 * Clerk fires the listener registered in AuthService.init(), which
 * flips `isSignedIn()` to true. The app shell watches that signal and
 * swaps to the main UI.
 */
@Component({
  selector: 'app-sign-in',
  standalone: true,
  template: `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-brand">
          <h1>Retirement Planning Dashboard</h1>
          <p>Sign in to access your household profile and projections.</p>
        </div>
        <div #host class="clerk-host"></div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; }
    .auth-shell {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--dark-bg, #1a1a1a);
      padding: 24px;
    }
    .auth-card {
      max-width: 480px;
      width: 100%;
    }
    .auth-brand {
      text-align: center;
      margin-bottom: 24px;
      color: var(--dark-text, #f0f0f0);
    }
    .auth-brand h1 {
      font-size: 24px;
      margin: 0 0 8px;
    }
    .auth-brand p {
      font-size: 14px;
      color: var(--dark-text-sec, #a0a0a0);
      margin: 0;
    }
    .clerk-host {
      display: flex;
      justify-content: center;
    }
  `],
})
export class SignInComponent implements AfterViewInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');

  ngAfterViewInit(): void {
    this.auth.mountSignIn(this.host().nativeElement);
  }

  ngOnDestroy(): void {
    this.auth.unmountSignIn(this.host().nativeElement);
  }
}
