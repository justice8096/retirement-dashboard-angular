import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '@services/auth.service';
import { environment } from '../../environments/environment';

/**
 * Adds `Authorization: Bearer <jwt>` (local-auth token) to our own API
 * requests, and signs the user out when the API answers 401 — the token
 * has expired or the signing secret rotated, so the shell should fall
 * back to the sign-in screen instead of erroring on every call.
 *
 * No-op for cross-origin requests (tile servers, fonts, ...) — those
 * should never see the token.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Own API = the configured base URL (absolute in dev, `/api` in prod) or
  // any same-origin/relative /api path. Cross-origin hosts never get the token.
  const isOwnApi = req.url.startsWith(environment.apiBaseUrl)
    || (!/^https?:\/\//.test(req.url) && req.url.startsWith('/api/'))
    || (req.url.startsWith(window.location.origin) && req.url.includes('/api/'));
  if (!isOwnApi) return next(req);

  const auth = inject(AuthService);
  const token = auth.getToken();
  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authed).pipe(
    tap({
      error: (err) => {
        // A 401 outside the login call itself means the session is dead.
        if (err instanceof HttpErrorResponse && err.status === 401
            && !req.url.includes('/auth/login') && token) {
          auth.signOut();
        }
      },
    }),
  );
};
