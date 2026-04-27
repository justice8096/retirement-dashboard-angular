import { Injectable, signal, computed } from '@angular/core';
import { Clerk } from '@clerk/clerk-js';
import { environment } from '../../environments/environment';

// Clerk's UserResource type is re-exported from @clerk/clerk-js without a
// stable named import, so widen to a structural type for our needs. The
// fields we actually read are the ones declared here.
type ClerkUser = {
  firstName?: string | null;
  fullName?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
};

/**
 * Thin Angular wrapper around Clerk's vanilla JS SDK.
 *
 * Responsibilities:
 *  - Boot the Clerk SDK exactly once on app startup.
 *  - Expose auth state as Angular signals so templates / other services
 *    can react without RxJS.
 *  - Provide `getToken()` for the HTTP interceptor that injects the
 *    Bearer token on every /api/* request.
 *  - Expose `mountSignIn` / `signOut` for the auth UI components.
 *
 * The Clerk instance is held in a private field, not a signal — Clerk
 * mutates its session/user objects in place and we proxy the relevant
 * fields through signals for change detection.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private clerk: Clerk | null = null;
  private clerkLoaded: Promise<Clerk> | null = null;

  /** True once Clerk's SDK has finished its initial network handshake. */
  readonly ready = signal(false);

  /** Current sign-in state. False until ready() is true and a session exists. */
  readonly isSignedIn = signal(false);

  /** The Clerk user record, or null if signed out. Proxied so templates can react. */
  readonly user = signal<ClerkUser | null>(null);

  /** Display label — first name, full name, or email — whichever is available. */
  readonly displayName = computed(() => {
    const u = this.user();
    if (!u) return null;
    return u.firstName || u.fullName || u.primaryEmailAddress?.emailAddress || 'Signed in';
  });

  /**
   * Initialize Clerk. Idempotent — returns the same Promise on subsequent
   * calls. Caller is `app.config.ts`'s APP_INITIALIZER so the SDK is loaded
   * before the first component renders.
   */
  init(): Promise<Clerk> {
    if (this.clerkLoaded) return this.clerkLoaded;
    const key = environment.clerkPublishableKey;
    if (!key || !key.startsWith('pk_')) {
      // Fail loudly at startup rather than silently 401'ing every api call.
      return Promise.reject(new Error(
        'AuthService.init: clerkPublishableKey missing or malformed in environment.ts',
      ));
    }
    const clerk = new Clerk(key);
    this.clerkLoaded = clerk.load().then(() => {
      this.clerk = clerk;
      this.ready.set(true);
      this.refreshSession();
      // Subscribe to Clerk's session changes — fires on sign-in, sign-out,
      // session-touch (token refresh), user updates.
      clerk.addListener(() => this.refreshSession());
      return clerk;
    });
    return this.clerkLoaded;
  }

  private refreshSession(): void {
    const c = this.clerk;
    if (!c) return;
    const signedIn = !!c.session;
    this.isSignedIn.set(signedIn);
    this.user.set((c.user ?? null) as ClerkUser | null);
  }

  /**
   * Get a fresh JWT for the current session, or null if signed out.
   * Clerk handles refresh internally — calling this on every request is
   * the documented pattern.
   */
  async getToken(): Promise<string | null> {
    if (!this.clerk?.session) return null;
    return this.clerk.session.getToken();
  }

  /**
   * Mount Clerk's hosted sign-in component into the given element.
   * Used by SignInComponent's view init.
   */
  mountSignIn(node: HTMLDivElement): void {
    if (!this.clerk) {
      throw new Error('AuthService.mountSignIn called before init() resolved');
    }
    // Default routing ('path') is fine — Clerk handles its own internal
    // navigation inside the mounted component without affecting the host
    // app's URL since this dashboard doesn't use Angular Router.
    this.clerk.mountSignIn(node, {});
  }

  /** Tear down a previously-mounted sign-in component (use in ngOnDestroy). */
  unmountSignIn(node: HTMLDivElement): void {
    this.clerk?.unmountSignIn(node);
  }

  /** Sign out of all sessions and surface the auth screen on next render. */
  async signOut(): Promise<void> {
    await this.clerk?.signOut();
    // The listener fires after sign-out completes and updates the signals.
  }
}
