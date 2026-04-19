import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthRefreshService } from './auth-refresh.service';
import { AuthSessionService } from './auth-session.service';

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let refresh: { refreshAccessToken: ReturnType<typeof vi.fn> };
  let authSession: {
    accessToken: ReturnType<typeof signal<string | null>>;
    clearSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    refresh = {
      refreshAccessToken: vi.fn().mockReturnValue(of('fresh-token')),
    };
    authSession = {
      accessToken: signal<string | null>('expired-token'),
      clearSession: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthSessionService,
          useValue: authSession,
        },
        { provide: AuthRefreshService, useValue: refresh },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('refreshes once after a protected request returns 401 and retries with the new access token', () => {
    let result: { ok: boolean } | undefined;

    TestBed.inject(HttpClient).get<{ ok: boolean }>('/api/users/me').subscribe(response => {
      result = response;
    });

    const first = http.expectOne('/api/users/me');
    expect(first.request.headers.get('Authorization')).toBe('Bearer expired-token');
    first.flush(null, {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'www-authenticate': 'Bearer error="invalid_token"' },
    });

    expect(refresh.refreshAccessToken).toHaveBeenCalledTimes(1);

    const retry = http.expectOne('/api/users/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    retry.flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('does NOT refresh public auth endpoint 401s (login)', () => {
    TestBed.inject(HttpClient).post('/api/auth/login', {}).subscribe({
      error: () => undefined,
    });

    const login = http.expectOne('/api/auth/login');
    login.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(refresh.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('DOES retry /api/auth/change-password 401 with refreshed token', () => {
    let result: unknown;

    TestBed.inject(HttpClient).post('/api/auth/change-password', {}).subscribe(r => {
      result = r;
    });

    const first = http.expectOne('/api/auth/change-password');
    expect(first.request.headers.get('Authorization')).toBe('Bearer expired-token');
    first.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(refresh.refreshAccessToken).toHaveBeenCalledTimes(1);

    const retry = http.expectOne('/api/auth/change-password');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    retry.flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });
});
