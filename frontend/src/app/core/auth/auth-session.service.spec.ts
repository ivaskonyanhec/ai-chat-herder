import { TestBed } from '@angular/core/testing';
import { AuthSessionService } from './auth-session.service';

function buildJwt(expiresAtSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expiresAtSeconds }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return `header.${payload}.signature`;
}

describe('AuthSessionService', () => {
  let service: AuthSessionService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [AuthSessionService] });
    service = TestBed.inject(AuthSessionService);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('does not persist refresh tokens in browser storage', () => {
    service.setSession({
      accessToken: 'access-token',
      keepSignedIn: true,
      user: { id: 'u1', username: 'alice', email: 'alice@example.com', avatarUrl: null },
    });

    const raw = localStorage.getItem('chat-herder.session.persistent');

    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({
      accessToken: 'access-token',
      user: { id: 'u1', username: 'alice', email: 'alice@example.com', avatarUrl: null },
    });
  });

  it('reports an access token as expired when exp is in the past', () => {
    service.setSession({
      accessToken: buildJwt(Math.floor(Date.now() / 1000) - 60),
      keepSignedIn: false,
    });

    expect(service.isAccessTokenExpired()).toBe(true);
  });
});
