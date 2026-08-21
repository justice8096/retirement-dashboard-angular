import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

/** Unsigned JWT-shaped token with a chosen exp (seconds). Signature is
 *  irrelevant client-side — only the exp decode matters. */
function fakeToken(expMs: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: Math.floor(expMs / 1000) })}.sig`;
}

describe('AuthService (local auth)', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('starts signed out and becomes ready after init()', () => {
    expect(service.ready()).toBe(false);
    service.init();
    expect(service.ready()).toBe(true);
    expect(service.isSignedIn()).toBe(false);
  });

  it('restores a stored, unexpired session', () => {
    localStorage.setItem('retirement.auth.token', fakeToken(Date.now() + 60_000));
    localStorage.setItem('retirement.auth.user', JSON.stringify({ username: 'justice', displayName: 'Justice', tier: 'admin' }));
    service.init();
    expect(service.isSignedIn()).toBe(true);
    expect(service.displayName()).toBe('Justice');
  });

  it('drops an expired stored token', () => {
    localStorage.setItem('retirement.auth.token', fakeToken(Date.now() - 60_000));
    service.init();
    expect(service.isSignedIn()).toBe(false);
    expect(localStorage.getItem('retirement.auth.token')).toBeNull();
  });

  it('login stores the token and flips signals; signOut clears everything', async () => {
    service.init();
    const pending = service.login('justice', 'pw');
    const req = http.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(req.request.body).toEqual({ username: 'justice', password: 'pw' });
    req.flush({
      token: fakeToken(Date.now() + 60_000),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: { username: 'justice', displayName: 'Justice', tier: 'admin' },
    });
    expect(await pending).toBe(true);
    expect(service.isSignedIn()).toBe(true);
    expect(service.getToken()).toBeTruthy();
    expect(localStorage.getItem('retirement.auth.token')).toBeTruthy();

    service.signOut();
    expect(service.isSignedIn()).toBe(false);
    expect(localStorage.getItem('retirement.auth.token')).toBeNull();
  });

  it('login failure surfaces the API plain-language error', async () => {
    service.init();
    const pending = service.login('justice', 'wrong');
    http.expectOne(`${environment.apiBaseUrl}/auth/login`)
      .flush({ error: "That username or password didn't match." }, { status: 401, statusText: 'Unauthorized' });
    expect(await pending).toBe(false);
    expect(service.loginError()).toBe("That username or password didn't match.");
    expect(service.isSignedIn()).toBe(false);
  });
});
