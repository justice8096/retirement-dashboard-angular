import {
  ApplicationConfig, provideZoneChangeDetection,
  provideAppInitializer, inject,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { AuthService } from '@services/auth.service';
import { authInterceptor } from './interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimationsAsync(),
    provideHttpClient(
      withFetch(),
      withInterceptors([authInterceptor]),
    ),
    // Restore any stored local-auth session before the first component
    // renders — the app shell then shows either the sign-in form or the
    // dashboard. Synchronous (localStorage read); no SDK handshake.
    provideAppInitializer(() => inject(AuthService).init()),
  ],
};
