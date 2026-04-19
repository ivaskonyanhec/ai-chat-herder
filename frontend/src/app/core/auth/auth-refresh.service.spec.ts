import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { AuthRefreshService } from './auth-refresh.service';
import { AuthSessionService } from './auth-session.service';
import type { AuthResponse, StoredSession } from './auth.models';

describe('AuthRefreshService', () => {
  let service: AuthRefreshService;
  let http: HttpTestingController;
  let setSession: ReturnType<typeof vi.fn>;
  let clearSession: ReturnType<typeof vi.fn>;
  const currentSession = signal<StoredSession | null>({
    accessToken: 'expired-token',
    keepSignedIn: true,
    user: { id: 'u1', username: 'alice', email: 'alice@example.com', avatarUrl: null },
  });

  beforeEach(() => {
    setSession = vi.fn();
    clearSession = vi.fn();
    currentSession.set({
      accessToken: 'expired-token',
      keepSignedIn: true,
      user: { id: 'u1', username: 'alice', email: 'alice@example.com', avatarUrl: null },
    });

    TestBed.configureTestingModule({
      providers: [
        AuthRefreshService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthSessionService,
          useValue: {
            session: currentSession.asReadonly(),
            setSession,
            clearSession,
          },
        },
      ],
    });
    service = TestBed.inject(AuthRefreshService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the HttpOnly refresh cookie and persists the rotated access token response', () => {
    const response = authResponse('fresh-access-token');
    let token: string | undefined;

    service.refreshAccessToken().subscribe(value => {
      token = value;
    });

    const request = http.expectOne('/api/auth/refresh');
    expect(request.request.body).toEqual({});
    expect(request.request.withCredentials).toBe(true);
    request.flush(response);

    expect(token).toBe('fresh-access-token');
    expect(setSession).toHaveBeenCalledWith({
      accessToken: response.accessToken,
      user: response.user,
      keepSignedIn: true,
    });
  });

  it('shares one refresh request between concurrent callers', () => {
    const tokens: string[] = [];

    service.refreshAccessToken().subscribe(token => tokens.push(token));
    service.refreshAccessToken().subscribe(token => tokens.push(token));

    const request = http.expectOne('/api/auth/refresh');
    request.flush(authResponse('shared-token'));

    expect(tokens).toEqual(['shared-token', 'shared-token']);
    expect(setSession).toHaveBeenCalledTimes(1);
  });

  it('clears the session when refresh fails', () => {
    service.refreshAccessToken().subscribe({
      error: () => undefined,
    });

    const request = http.expectOne('/api/auth/refresh');
    request.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(clearSession).toHaveBeenCalledTimes(1);
  });
});

function authResponse(accessToken: string): AuthResponse {
  return {
    accessToken,
    refreshToken: '',
    user: { id: 'u1', username: 'alice', email: 'alice@example.com', avatarUrl: null },
  };
}
