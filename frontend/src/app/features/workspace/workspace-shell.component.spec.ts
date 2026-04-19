import { TestBed } from '@angular/core/testing';
import { Signal, signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { throwError, of } from 'rxjs';
import { vi } from 'vitest';
import { WorkspaceShellComponent } from './workspace-shell.component';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { PresenceService } from '../../core/signalr/presence.service';
import { ChatService } from '../../core/signalr/chat.service';
import { UnreadService } from '../../core/signalr/unread.service';
import { NotificationsApiService } from '../../core/notifications/notifications-api.service';
import { RoomsApiService } from '../../core/rooms/rooms-api.service';

type HubStub = { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
type AuthSessionStub = { user: Signal<null>; accessToken?: Signal<null>; clearSession: ReturnType<typeof vi.fn> };
type AuthApiStub = { logout: ReturnType<typeof vi.fn> };

function buildProviders(overrides: {
  authApi?: AuthApiStub;
  authSession?: AuthSessionStub;
  presenceService?: HubStub;
  chatService?: HubStub;
} = {}) {
  const authApi: AuthApiStub = overrides.authApi ?? { logout: vi.fn() };
  const authSession: AuthSessionStub = overrides.authSession ?? {
    user: signal(null).asReadonly(),
    accessToken: signal(null).asReadonly(),
    clearSession: vi.fn(),
  };
  const presenceService: HubStub = overrides.presenceService ?? {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  const chatService: HubStub = overrides.chatService ?? {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };

  return {
    providers: [
      provideRouter([]),
      { provide: AuthApiService, useValue: authApi },
      { provide: AuthSessionService, useValue: authSession },
      { provide: PresenceService, useValue: presenceService },
      { provide: ChatService, useValue: chatService },
      { provide: NotificationsApiService, useValue: { getUnreadCounts: vi.fn().mockReturnValue(of([])) } },
      { provide: RoomsApiService, useValue: { getMyRooms: vi.fn().mockReturnValue(of([])) } },
      UnreadService,
    ],
    authApi,
    authSession,
    presenceService,
    chatService,
  };
}

describe('WorkspaceShellComponent', () => {
  it('renders route-backed navigation links for rooms and sessions', () => {
    const { providers } = buildProviders();
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    const compiled: Element = fixture.nativeElement;
    expect(compiled.querySelector('[data-testid="go-to-rooms"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="go-to-sessions"]')).not.toBeNull();
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('does not clear local auth state when logout fails', () => {
    const authApi = {
      logout: vi.fn().mockReturnValue(throwError(() => new Error('network'))),
    };
    const authSession = {
      user: signal(null).asReadonly(),
      accessToken: signal(null).asReadonly(),
      clearSession: vi.fn(),
    };
    const { providers } = buildProviders({ authApi, authSession });
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.componentInstance.logout();
    expect(authSession.clearSession).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('calls presence and chat connect on init', async () => {
    const { providers, presenceService, chatService } = buildProviders();
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(presenceService.connect).toHaveBeenCalledTimes(1);
    expect(chatService.connect).toHaveBeenCalledTimes(1);
  });

  it('calls presence and chat disconnect before clearing session on logout', async () => {
    const authSession = {
      user: signal(null).asReadonly(),
      accessToken: signal(null).asReadonly(),
      clearSession: vi.fn(),
    };
    const authApiWithSuccess = { logout: vi.fn().mockReturnValue(of(null)) };
    const { providers, presenceService, chatService } = buildProviders({
      authApi: authApiWithSuccess,
      authSession,
    });

    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.logout();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await fixture.whenStable();

    expect(presenceService.disconnect).toHaveBeenCalledTimes(1);
    expect(chatService.disconnect).toHaveBeenCalledTimes(1);
    expect(authSession.clearSession).toHaveBeenCalled();
  });

  it('calls presence and chat disconnect on destroy', async () => {
    const { providers, presenceService, chatService } = buildProviders();
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.destroy();
    expect((presenceService as { disconnect: ReturnType<typeof vi.fn> }).disconnect).toHaveBeenCalledTimes(1);
    expect((chatService as { disconnect: ReturnType<typeof vi.fn> }).disconnect).toHaveBeenCalledTimes(1);
  });
});
