import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@services/auth.service';

/**
 * Local username/password sign-in form (Clerk removed 2026-08-21).
 *
 * Accounts are managed server-side via the retirement-api
 * `tools/manage-users.mjs` CLI — there is no self-registration or
 * password-reset flow here by design (two-person household app).
 * On success, AuthService flips `isSignedIn()` and the app shell
 * swaps to the main UI.
 */
@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-brand">
          <h1>Retirement Planning Dashboard</h1>
          <p>Sign in to access your household profile and projections.</p>
        </div>
        <form class="auth-form" (ngSubmit)="submit()">
          <label class="auth-field">
            <span>Username</span>
            <input name="username" type="text" autocomplete="username"
              autocapitalize="none" spellcheck="false" required
              [(ngModel)]="username" />
          </label>
          <label class="auth-field">
            <span>Password</span>
            <input name="password" type="password" autocomplete="current-password"
              required [(ngModel)]="password" />
          </label>
          @if (auth.loginError(); as error) {
            <p class="auth-error" role="alert">{{ error }}</p>
          }
          <button class="auth-submit" type="submit"
            [disabled]="auth.loggingIn() || !username || !password">
            {{ auth.loggingIn() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
      max-width: 420px;
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
    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      background: var(--dark-card, #242424);
      border: 1px solid var(--dark-border, #333);
      border-radius: 12px;
      padding: 24px;
    }
    .auth-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: var(--dark-text, #f0f0f0);
      font-size: 14px;
    }
    .auth-field input {
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--dark-border, #444);
      background: var(--dark-bg, #1a1a1a);
      color: var(--dark-text, #f0f0f0);
      font-size: 16px;
    }
    .auth-field input:focus-visible {
      outline: 2px solid var(--dark-amber, #E8B86D);
      outline-offset: 1px;
    }
    .auth-error {
      margin: 0;
      color: var(--dark-amber-light, #E8B86D);
      font-size: 14px;
    }
    .auth-submit {
      padding: 12px;
      border: none;
      border-radius: 8px;
      background: var(--dark-amber, #E8B86D);
      color: #1a1a1a;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }
    .auth-submit:disabled {
      opacity: 0.55;
      cursor: default;
    }
  `],
})
export class SignInComponent {
  protected readonly auth = inject(AuthService);

  protected username = '';
  protected password = '';

  protected readonly submitted = signal(false);

  protected async submit(): Promise<void> {
    if (!this.username || !this.password) return;
    this.submitted.set(true);
    await this.auth.login(this.username, this.password);
  }
}
