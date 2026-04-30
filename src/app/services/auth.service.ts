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
interface ClerkLoadOptions {
  ui?: { ClerkUI: unknown };
}

interface RuntimeClerk {
  load(options?: ClerkLoadOptions): Promise<void>;
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
    // Clerk's CDN browser bundle auto-instantiates via the
    // data-clerk-publishable-key attribute on the <script> tag, so by the
    // time onload fires window.Clerk is already an *instance* (not the
    // constructor). Calling `new window.Clerk(...)` would fail.
    Clerk?: RuntimeClerk;
    // The @clerk/ui bundle (loaded as a separate <script>) registers a
    // UI constructor on this global. We pass it to clerk.load() so the
    // Clerk instance has UI components mounted to it; without this,
    // mountSignIn() throws "Clerk was not loaded with Ui components".
    // See https://clerk.com/docs/getting-started/quickstart.js-frontend
    __internal_ClerkUICtor?: unknown;
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

    this.clerkLoaded = this.loadBothScripts(key).then(async (clerk) => {
      // window.Clerk is the auto-instantiated singleton (the CDN script
      // reads data-clerk-publishable-key off its own <script> tag and
      // calls `new Clerk(pk)` for us). We pass the UI constructor from
      // @clerk/ui to load() so the instance has mountable components
      // — without this, mountSignIn() throws "not loaded with Ui
      // components". See clerk.com/docs/getting-started/quickstart.js-frontend.
      const uiCtor = window.__internal_ClerkUICtor;
      if (!uiCtor) {
        throw new Error(
          'AuthService.init: window.__internal_ClerkUICtor is undefined — ' +
          'the @clerk/ui CDN bundle did not load before clerk.load()',
        );
      }
      await clerk.load({ ui: { ClerkUI: uiCtor } });
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

  /**
   * Load both Clerk scripts from the per-instance CDN, in order:
   *   1. @clerk/ui@1/dist/ui.browser.js   → registers __internal_ClerkUICtor
   *   2. @clerk/clerk-js@6/dist/clerk.browser.js → auto-instantiates window.Clerk
   *
   * Both must be loaded before clerk.load() runs, otherwise the UI
   * constructor isn't available and mountSignIn() throws. The UI bundle
   * loads first so its global is ready by the time we call load().
   */
  private loadBothScripts(key: string): Promise<RuntimeClerk> {
    if (window.Clerk && window.__internal_ClerkUICtor) {
      return Promise.resolve(window.Clerk);
    }
    const host = this.clerkCdnHost(key);

    return this.loadScript(`https://${host}/npm/@clerk/ui@1/dist/ui.browser.js`)
      .then(() => this.loadScript(
        `https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
        // Auto-instantiates window.Clerk via this attribute. Without it,
        // the script throws "Missing publishableKey" synchronously.
        { 'data-clerk-publishable-key': key },
      ))
      .then(() => {
        if (!window.Clerk) {
          throw new Error('Clerk SDK loaded but window.Clerk is undefined');
        }
        return window.Clerk;
      });
  }

  private loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
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
