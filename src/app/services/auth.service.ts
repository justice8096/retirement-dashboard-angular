import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Local username/password auth (Clerk removed 2026-08-21 — see
 * retirement-api docs/superpowers/specs/2026-08-21-local-auth-design.md).
 *
 * `POST /api/auth/login` returns a self-issued JWT; we keep it in
 * localStorage and attach it via the auth interceptor. `isSignedIn`
 * derives from token presence + its `exp` claim, so an expired token
 * drops the user back to the sign-in screen on next app boot.
 */

const TOKEN_KEY = 'retirement.auth.token';
const USER_KEY = 'retirement.auth.user';

export interface AuthUser {
  username: string | null;
  displayName: string | null;
  tier: string;
}

interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

/** Decode a JWT payload without verification (expiry check only — the
 *  server verifies the signature on every request). */
function decodeExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly token = signal<string | null>(null);

  /** True once init() has restored (or discarded) any stored session.
   *  Kept from the Clerk-era contract — the app shell waits on it. */
  readonly ready = signal(false);

  readonly user = signal<AuthUser | null>(null);

  readonly isSignedIn = computed(() => this.token() !== null);

  readonly displayName = computed(() =>
    this.user()?.displayName || this.user()?.username || null);

  /** Plain-language error from the last login attempt (cleared on retry). */
  readonly loginError = signal<string | null>(null);

  /** True while a login request is in flight (submit-button pending state). */
  readonly loggingIn = signal(false);

  /** App-boot session restore. Synchronous; APP_INITIALIZER awaits it. */
  init(): void {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const expiry = token ? decodeExpiry(token) : null;
      if (token && expiry !== null && expiry > Date.now()) {
        this.token.set(token);
        const rawUser = localStorage.getItem(USER_KEY);
        if (rawUser) this.user.set(JSON.parse(rawUser) as AuthUser);
      } else if (token) {
        // Expired or undecodable — clear it so the shell shows sign-in.
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    } catch {
      // Storage unavailable (private mode edge cases) — start signed out.
    }
    this.ready.set(true);
  }

  /** Attempt a login. Resolves true on success; on failure sets
   *  `loginError` to a plain-language message and resolves false. */
  async login(username: string, password: string): Promise<boolean> {
    this.loginError.set(null);
    this.loggingIn.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<LoginResponse>(`${environment.apiBaseUrl}/auth/login`, { username, password }),
      );
      this.token.set(res.token);
      this.user.set(res.user);
      try {
        localStorage.setItem(TOKEN_KEY, res.token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      } catch {
        // Storage unavailable — session lives for this tab only.
      }
      return true;
    } catch (err) {
      const apiError = (err as { error?: { error?: string } })?.error?.error;
      this.loginError.set(apiError ?? "We couldn't sign you in. Please check your connection and try again.");
      return false;
    } finally {
      this.loggingIn.set(false);
    }
  }

  signOut(): void {
    this.token.set(null);
    this.user.set(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // Storage unavailable — in-memory state is cleared regardless.
    }
  }

  /** Current bearer token, or null when signed out. */
  getToken(): string | null {
    return this.token();
  }
}
