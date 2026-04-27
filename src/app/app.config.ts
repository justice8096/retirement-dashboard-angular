import {
  ApplicationConfig, provideZoneChangeDetection,
  provideAppInitializer, inject,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { AuthService } from '@services/auth.service';
import { clerkAuthInterceptor } from './interceptors/clerk-auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimationsAsync(),
    provideHttpClient(
      withFetch(),
      withInterceptors([clerkAuthInterceptor]),
    ),
    // Boot Clerk before the first component renders. AuthService.init()
    // resolves once the SDK has done its initial handshake — the app
    // shell then renders either the sign-in screen or the dashboard.
    provideAppInitializer(() => inject(AuthService).init()),
  ],
};
