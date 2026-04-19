import { TestBed } from '@angular/core/testing';
import { Component, Signal, signal } from '@angular/core';
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
import { FriendsApiService } from '../../core/friends/friends-api.service';
import type { RoomDto } from '../../core/rooms/rooms.models';
import { InvitationsApiService } from '../../core/invitations/invitations-api.service';

type HubStub = { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; presenceMap?: unknown; addedToRoom?: unknown; invitationReceived?: unknown };
type AuthSessionStub = { user: Signal<null>; accessToken?: Signal<null>; clearSession: ReturnType<typeof vi.fn> };
type AuthApiStub = { logout: ReturnType<typeof vi.fn> };

@Component({ standalone: true, template: '' })
class EmptyAuthComponent {}

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
    presenceMap: signal(new Map()).asReadonly(),
    addedToRoom: signal(null).asReadonly(),
    invitationReceived: signal(null).asReadonly(),
  };
  const chatService: HubStub = overrides.chatService ?? {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };

  return {
    providers: [
      provideRouter([{ path: 'auth', component: EmptyAuthComponent }]),
      { provide: AuthApiService, useValue: authApi },
      { provide: AuthSessionService, useValue: authSession },
      { provide: PresenceService, useValue: presenceService },
      { provide: ChatService, useValue: chatService },
      { provide: NotificationsApiService, useValue: { getUnreadCounts: vi.fn().mockReturnValue(of([])) } },
      { provide: FriendsApiService, useValue: { getFriends: vi.fn().mockReturnValue(of([])) } },
      { provide: InvitationsApiService, useValue: { getMyInvitations: vi.fn().mockReturnValue(of([])) } },
      {
        provide: RoomsApiService,
        useValue: {
          getMyRooms: vi.fn().mockReturnValue(of([])),
          createRoom: vi.fn().mockReturnValue(of({ id: 'new-room-1', name: 'Test Room', description: null, visibility: 'Public', ownerId: 'u1', createdAt: '', memberCount: 1, callerRole: 'Owner' })),
        },
      },
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

  it('renders the sign out action with visible surface contrast', () => {
    const { providers } = buildProviders();
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    const compiled: Element = fixture.nativeElement;
    const logoutButton = [...compiled.querySelectorAll('button')]
      .find(button => button.textContent?.includes('Sign out'));

    expect(logoutButton).toBeTruthy();
    expect(logoutButton?.className).toContain('bg-surface-container-high');
    expect(logoutButton?.className).toContain('text-on-surface');
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
    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
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

  it('getUnreadCount() returns 0 when no unread data', () => {
    const { providers } = buildProviders();
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.getUnreadCount('room', 'some-id')).toBe(0);
  });

  it('openCreateRoom() shows the form panel and resets fields', () => {
    const { providers } = buildProviders();
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    comp.newRoomName.set('leftover');
    comp.createRoomError.set('old error');
    comp.openCreateRoom();

    expect(comp.isCreatingRoom()).toBe(true);
    expect(comp.newRoomName()).toBe('');
    expect(comp.newRoomVisibility()).toBe('Public');
    expect(comp.createRoomError()).toBe('');
  });

  it('submitCreateRoom() calls createRoom API and navigates to the new room', async () => {
    const { providers } = buildProviders();
    await TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const roomsApi = TestBed.inject(RoomsApiService);

    comp.openCreateRoom();
    comp.newRoomName.set('My New Room');
    comp.newRoomVisibility.set('Private');
    comp.submitCreateRoom();

    expect(roomsApi.createRoom).toHaveBeenCalledWith({ name: 'My New Room', description: null, visibility: 'Private' });
    await fixture.whenStable();
    expect(comp.isCreatingRoom()).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/app/rooms', 'new-room-1']);
  });

  it('renders contacts section in sidebar when friends are loaded', async () => {
    const friends = [
      { friendshipId: 'f1', userId: 'u10', username: 'alice', avatarUrl: null, friendSince: '' },
      { friendshipId: 'f2', userId: 'u11', username: 'bob', avatarUrl: null, friendSince: '' },
    ];
    const { providers } = buildProviders();
    const friendsStub = { getFriends: vi.fn().mockReturnValue(of(friends)) };
    const providersWithFriends = providers.map(p =>
      'provide' in p && p.provide === FriendsApiService
        ? { provide: FriendsApiService, useValue: friendsStub }
        : p,
    );
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers: providersWithFriends });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled: Element = fixture.nativeElement;
    expect(compiled.querySelector('[data-testid="sidebar-contacts"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="contact-alice"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="contact-bob"]')).not.toBeNull();
  });

  it('renders public and private room rows with distinct icons instead of hash prefixes', async () => {
    const rooms: RoomDto[] = [
      {
        id: 'public-room',
        name: 'Lobby',
        description: null,
        visibility: 'Public',
        ownerId: 'u1',
        createdAt: '',
        memberCount: 1,
        callerRole: 'Owner',
      },
      {
        id: 'private-room',
        name: 'Planning',
        description: null,
        visibility: 'Private',
        ownerId: 'u1',
        createdAt: '',
        memberCount: 1,
        callerRole: 'Owner',
      },
    ];
    const roomsApi = {
      getMyRooms: vi.fn().mockReturnValue(of(rooms)),
      createRoom: vi.fn(),
    };
    const { providers } = buildProviders();
    const providersWithRooms = providers.map(p =>
      'provide' in p && p.provide === RoomsApiService ? { provide: RoomsApiService, useValue: roomsApi } : p,
    );
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers: providersWithRooms });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const publicRow = fixture.nativeElement.querySelector('[data-testid="public-room-public-room"]') as HTMLElement;
    const privateRow = fixture.nativeElement.querySelector('[data-testid="private-room-private-room"]') as HTMLElement;

    expect(publicRow.textContent).toContain('Lobby');
    expect(publicRow.textContent).not.toContain('#Lobby');
    expect(publicRow.querySelector('[data-testid="public-room-icon"]')?.textContent?.trim()).toBe('public');
    expect(publicRow.className).toContain('bg-surface-container/40');

    expect(privateRow.textContent).toContain('Planning');
    expect(privateRow.textContent).not.toContain('#Planning');
    expect(privateRow.querySelector('[data-testid="private-room-icon"]')?.textContent?.trim()).toBe('lock');
    expect(privateRow.className).toContain('bg-surface-container-high/70');
  });

  it('submitCreateRoom() sets createRoomError when API fails', async () => {
    const roomsApiWithError = {
      getMyRooms: vi.fn().mockReturnValue(of([])),
      createRoom: vi.fn().mockReturnValue(throwError(() => new Error('server error'))),
    };
    const { providers } = buildProviders();
    const providersWithError = providers.map(p =>
      'provide' in p && p.provide === RoomsApiService ? { provide: RoomsApiService, useValue: roomsApiWithError } : p,
    );
    await TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers: providersWithError }).compileComponents();
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    comp.openCreateRoom();
    comp.newRoomName.set('bad room');
    comp.submitCreateRoom();

    await fixture.whenStable();
    expect(comp.createRoomError()).toBe('Failed to create room. Try again.');
    expect(comp.isCreatingRoomPending()).toBe(false);
  });

  it('shows invitation badge when pendingInvitationCount > 0', async () => {
    const { providers } = buildProviders();
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.pendingInvitationCount.set(3);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="invitation-badge"]')).not.toBeNull();
  });

  it('hides invitation badge when pendingInvitationCount is 0', async () => {
    const { providers } = buildProviders();
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="invitation-badge"]')).toBeNull();
  });

  it('bootstraps pendingInvitationCount from GET /invitations', async () => {
    const { providers } = buildProviders();
    const invitationsStub = {
      getMyInvitations: vi.fn().mockReturnValue(of([
        { id: 'i1', status: 'Pending' },
        { id: 'i2', status: 'Pending' },
      ])),
    };
    const providersWithInvitations = providers.map(p =>
      'provide' in p && p.provide === InvitationsApiService
        ? { provide: InvitationsApiService, useValue: invitationsStub }
        : p,
    );
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers: providersWithInvitations });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.pendingInvitationCount()).toBe(2);
  });

  it('filters publicRooms by searchQuery', async () => {
    const rooms: RoomDto[] = [
      { id: 'r1', name: 'General', description: null, visibility: 'Public', ownerId: 'u1', createdAt: '', memberCount: 1, callerRole: 'Member' },
      { id: 'r2', name: 'Design', description: null, visibility: 'Public', ownerId: 'u1', createdAt: '', memberCount: 1, callerRole: 'Member' },
    ];
    const roomsApi = { getMyRooms: vi.fn().mockReturnValue(of(rooms)), createRoom: vi.fn() };
    const { providers } = buildProviders();
    const providersWithRooms = providers.map(p =>
      'provide' in p && p.provide === RoomsApiService ? { provide: RoomsApiService, useValue: roomsApi } : p,
    );
    TestBed.configureTestingModule({ imports: [WorkspaceShellComponent], providers: providersWithRooms });
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.searchQuery.set('des');
    expect(fixture.componentInstance.publicRooms()).toHaveLength(1);
    expect(fixture.componentInstance.publicRooms()[0].name).toBe('Design');
  });
});
