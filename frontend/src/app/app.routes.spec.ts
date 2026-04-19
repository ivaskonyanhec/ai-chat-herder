import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { routes } from './app.routes';
import { AuthApiService } from './core/auth/auth-api.service';
import { AuthSessionService } from './core/auth/auth-session.service';
import { FriendsApiService } from './core/friends/friends-api.service';
import { NotificationsApiService } from './core/notifications/notifications-api.service';
import { RoomsApiService } from './core/rooms/rooms-api.service';
import { SessionsApiService } from './core/session/sessions-api.service';

describe('app routes', () => {
  it('defines child routes under /app with a default redirect to rooms', () => {
    const appRoute = routes.find((route) => route.path === 'app');

    expect(appRoute?.children).toBeDefined();
    expect(appRoute?.children?.some((child) => child.path === 'rooms')).toBe(true);
    expect(appRoute?.children?.some((child) => child.path === 'sessions')).toBe(true);

    const defaultChild = appRoute?.children?.find((child) => child.path === '');
    expect(defaultChild?.redirectTo).toBe('rooms');
    expect(defaultChild?.pathMatch).toBe('full');
  });

  it('redirects /app to the rooms child view', async () => {
    const router = configureRouterTestBed();
    const fixture = TestBed.createComponent(App);

    await router.navigateByUrl('/app');
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled: Element = fixture.nativeElement;
    expect(compiled.querySelector('[data-testid="main-chat"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="rooms-home"]')).not.toBeNull();
  });

  it('activates the sessions child route under the workspace shell', async () => {
    const router = configureRouterTestBed();
    const fixture = TestBed.createComponent(App);

    await router.navigateByUrl('/app/sessions');
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled: Element = fixture.nativeElement;
    expect(compiled.querySelector('[data-testid="main-chat"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="sessions-title"]')).not.toBeNull();
  });
});

function configureRouterTestBed(): Router {
  const authSession = {
    user: signal({
      id: 'user-1',
      username: 'Builder',
      email: 'builder@example.com',
      avatarUrl: null,
    }).asReadonly(),
    isAuthenticated: signal(true).asReadonly(),
    accessToken: signal(null).asReadonly(),
    refreshToken: signal(null).asReadonly(),
    isAccessTokenExpired: vi.fn().mockReturnValue(false),
    clearSession: vi.fn(),
  };
  const authApi = {
    logout: vi.fn().mockReturnValue(of(void 0)),
  };
  const sessionsApi = {
    getSessions: vi.fn().mockReturnValue(of([])),
    revokeSession: vi.fn().mockReturnValue(of(void 0)),
  };
  const notificationsApi = {
    getUnreadCounts: vi.fn().mockReturnValue(of([])),
  };
  const roomsApi = {
    getMyRooms: vi.fn().mockReturnValue(of([])),
    getPublicCatalog: vi.fn().mockReturnValue(of([])),
    joinRoom: vi.fn().mockReturnValue(of(void 0)),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter(routes),
      { provide: AuthSessionService, useValue: authSession },
      { provide: AuthApiService, useValue: authApi },
      { provide: SessionsApiService, useValue: sessionsApi },
      { provide: NotificationsApiService, useValue: notificationsApi },
      { provide: RoomsApiService, useValue: roomsApi },
      { provide: FriendsApiService, useValue: { getFriends: vi.fn().mockReturnValue(of([])) } },
    ],
  });

  return TestBed.inject(Router);
}
