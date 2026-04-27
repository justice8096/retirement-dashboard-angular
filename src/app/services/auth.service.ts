import { Injectable, signal, computed } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Minimal structural type for the runtime Clerk instance loaded from
 * Clerk's CDN script. We don't import @clerk/clerk-js directly because
 * its npm main entry exports the headless core (no UI components like
 * SignIn / SignUp), and Clerk's documented integration pattern is the
 * UMD bundle from its CDN — `clerk.browser.js` — which is what carries
 * the UI components used by mountSignIn().
 */
interface RuntimeClerk {
  load(): Promise<void>;
  loaded: boolean;
  session: { getToken(): Promise<string | null> } | null;
  user: ClerkUser | null;
  signOut(): Promise<void>;
  mountSignIn(node: HTMLDivElement, options?: Record<string, unknown>): void;
  unmountSignIn(node: HTMLDivElement): void;
  addListener(listener: () => void): void;
}

interface ClerkUser {
  firstName?: string | null;
  fullName?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
}

declare global {
  interface Window {
    Clerk?: new (publishableKey: string) => RuntimeClerk;
  }
}

/**
 * Thin Angular wrapper around Clerk's vanilla JS SDK.
 *
 * Loads `clerk.browser.js` from Clerk's per-instance CDN (which carries
 * the full UI bundle) and exposes Clerk state through Angular signals.
 * Decision: script-tag injection over npm-direct-import — Clerk's npm
 * main is headless-only and `clerk.mountSignIn()` throws "Clerk was not
 * loaded with Ui components" if used. The Clerk JS Quickstart docs are
 * explicit that the UI bundle is shipped via their CDN.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private clerk: RuntimeClerk | null = null;
  private clerkLoaded: Promise<RuntimeClerk> | null = null;

  /** True once the Clerk SDK script has loaded and `clerk.load()` resolved. */
  readonly ready = signal(false);

  /** Current sign-in state. False until ready() is true and a session exists. */
  readonly isSignedIn = signal(false);

  /** The Clerk user record, or null if signed out. */
  readonly user = signal<ClerkUser | null>(null);

  /** Display label — first name, full name, or email — whichever is available. */
  readonly displayName = computed(() => {
    const u = this.user();
    if (!u) return null;
    return u.firstName || u.fullName || u.primaryEmailAddress?.emailAddress || 'Signed in';
  });

  /**
   * Inject the Clerk CDN script, then `new Clerk(pk)` and `await load()`.
   * Idempotent — returns the same Promise on subsequent calls. Called
   * once by app.config.ts's provideAppInitializer.
   */
  init(): Promise<RuntimeClerk> {
    if (this.clerkLoaded) return this.clerkLoaded;
    const key = environment.clerkPublishableKey;
    if (!key?.startsWith('pk_')) {
      return Promise.reject(new Error(
        'AuthService.init: clerkPublishableKey missing or malformed in environment.ts',
      ));
    }

    this.clerkLoaded = this.loadClerkScript(key).then(async (Clerk) => {
      const clerk = new Clerk(key);
      await clerk.load();
      this.clerk = clerk;
      this.ready.set(true);
      this.refreshSession();
      clerk.addListener(() => this.refreshSession());
      return clerk;
    });

    return this.clerkLoaded;
  }

  /**
   * Resolve the Clerk frontend-API host from the publishable key. The pk
   * format is `pk_test_<base64>` or `pk_live_<base64>`, where the decoded
   * base64 is the host (with a trailing `$`). e.g.
   *   pk_test_bWludC1zbmFrZS0yMi5jbGVyay5hY2NvdW50cy5kZXYk
   *     → mint-snake-22.clerk.accounts.dev$
   *     → mint-snake-22.clerk.accounts.dev
   */
  private clerkCdnHost(key: string): string {
    const b64 = key.replace(/^pk_(test|live)_/, '');
    const decoded = atob(b64);
    return decoded.endsWith('$') ? decoded.slice(0, -1) : decoded;
  }

  private loadClerkScript(key: string): Promise<NonNullable<Window['Clerk']>> {
    if (window.Clerk) return Promise.resolve(window.Clerk);

    return new Promise((resolve, reject) => {
      const host = this.clerkCdnHost(key);
      // Pin to major version 6 so behaviour matches our @clerk/clerk-js
      // dev-time types and lockfile. Clerk's CDN serves the UMD bundle
      // that carries the full UI components.
      const url = `https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`;

      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        if (!window.Clerk) {
          reject(new Error('Clerk script loaded but window.Clerk is undefined'));
          return;
        }
        resolve(window.Clerk);
      };
      script.onerror = () => reject(new Error(`Failed to load Clerk SDK from ${url}`));
      document.head.appendChild(script);
    });
  }

  private refreshSession(): void {
    const c = this.clerk;
    if (!c) return;
    this.isSignedIn.set(!!c.session);
    this.user.set(c.user);
  }

  /** Fresh JWT for the current session (Clerk handles refresh internally). */
  async getToken(): Promise<string | null> {
    if (!this.clerk?.session) return null;
    return this.clerk.session.getToken();
  }

  /** Mount Clerk's hosted sign-in component into the given element. */
  mountSignIn(node: HTMLDivElement): void {
    if (!this.clerk) {
      throw new Error('AuthService.mountSignIn called before init() resolved');
    }
    this.clerk.mountSignIn(node, {});
  }

  /** Tear down a previously-mounted sign-in component. */
  unmountSignIn(node: HTMLDivElement): void {
    this.clerk?.unmountSignIn(node);
  }

  /** Sign out of all sessions; the listener flips the signals. */
  async signOut(): Promise<void> {
    await this.clerk?.signOut();
  }
}
