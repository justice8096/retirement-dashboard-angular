import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AuthService } from '@services/auth.service';

/**
 * Adds `Authorization: Bearer <clerk-jwt>` to every same-origin request,
 * so api routes guarded by `requireAuth` see a valid Clerk session.
 *
 * Clerk's `getToken()` returns a JWT that's auto-refreshed; calling it on
 * every request is the documented pattern (it's a fast in-memory lookup
 * unless a refresh is actively in flight).
 *
 * No-op for cross-origin requests (e.g. the dashboard fetching tile images
 * from cartocdn) — those neither need nor want a Clerk token.
 */
export const clerkAuthInterceptor: HttpInterceptorFn = (req, next) => {
  // Only attach the token to same-origin / relative URLs targeting our api.
  // Tile servers, Google Fonts, etc. should never see the JWT.
  const isApi = req.url.startsWith('/api/') || req.url.includes('/api/');
  // Stricter check — only relative paths or our own host. Cross-origin
  // absolute URLs (https://*.openstreetmap.org, ...) skip the header.
  const isCrossOrigin = /^https?:\/\//.test(req.url) && !req.url.startsWith(window.location.origin);
  if (!isApi || isCrossOrigin) {
    return next(req);
  }

  const auth = inject(AuthService);
  return from(auth.getToken()).pipe(
    switchMap((token) => {
      if (!token) return next(req);
      const authed = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
      return next(authed);
    }),
  );
};
