import { Component, DestroyRef, OnInit, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { Button } from 'primeng/button';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { PresenceService } from '../../core/signalr/presence.service';
import { ChatService } from '../../core/signalr/chat.service';
import { UnreadService } from '../../core/signalr/unread.service';
import { NotificationsApiService } from '../../core/notifications/notifications-api.service';
import { RoomsApiService } from '../../core/rooms/rooms-api.service';
import { FriendsApiService } from '../../core/friends/friends-api.service';
import { InvitationsApiService } from '../../core/invitations/invitations-api.service';
import type { RoomDto } from '../../core/rooms/rooms.models';
import type { FriendDto } from '../../core/friends/friends.models';

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Button],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.scss',
})
export class WorkspaceShellComponent implements OnInit, OnDestroy {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly presence = inject(PresenceService);
  private readonly chat = inject(ChatService);
  private readonly unread = inject(UnreadService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly roomsApi = inject(RoomsApiService);
  private readonly friendsApi = inject(FriendsApiService);
  private readonly invitationsApi = inject(InvitationsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = this.authSession.user;
  readonly presenceMap = this.presence.presenceMap;
  readonly logoutError = signal('');
  readonly myRooms = signal<RoomDto[]>([]);
  readonly friends = signal<FriendDto[]>([]);
  readonly unreadCounts = this.unread.unreadCounts;

  readonly publicRooms = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.myRooms().filter(r =>
      r.visibility === 'Public' && (!q || r.name.toLowerCase().includes(q))
    );
  });
  readonly privateRooms = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.myRooms().filter(r =>
      r.visibility === 'Private' && (!q || r.name.toLowerCase().includes(q))
    );
  });
  readonly publicRoomsExpanded = signal(true);
  readonly privateRoomsExpanded = signal(true);
  readonly sidebarOpen = signal(false);
  readonly pendingInvitationCount = signal(0);
  readonly searchQuery = signal('');

  constructor() {
    effect(() => {
      if (this.presence.addedToRoom()) this.loadRooms();
    });
    effect(() => {
      if (this.presence.invitationReceived()) {
        untracked(() => this.pendingInvitationCount.update(n => n + 1));
      }
    });
  }

  readonly isCreatingRoom = signal(false);
  readonly newRoomName = signal('');
  readonly newRoomVisibility = signal<'Public' | 'Private'>('Public');
  readonly isCreatingRoomPending = signal(false);
  readonly createRoomError = signal('');

  ngOnInit(): void {
    void this.presence.connect();
    void this.chat.connect();
    this.bootstrapData();
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(event => {
        this.loadRooms();
        if (event.urlAfterRedirects.startsWith('/app/invitations')) {
          this.pendingInvitationCount.set(0);
        }
      });
  }

  ngOnDestroy(): void {
    void this.presence.disconnect();
    void this.chat.disconnect();
  }

  logout(): void {
    this.logoutError.set('');
    this.authApi.logout().subscribe({
      next: async () => {
        await this.presence.disconnect();
        await this.chat.disconnect();
        this.unread.clearAll();
        this.authSession.clearSession();
        void this.router.navigateByUrl('/auth');
      },
      error: () => {
        this.logoutError.set('Unable to sign out right now. Try again in a moment.');
      },
    });
  }

  getUnreadCount(contextType: string, contextId: string): number {
    return this.unread.getCount(contextType, contextId);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  openCreateRoom(): void {
    this.isCreatingRoom.set(true);
    this.newRoomName.set('');
    this.newRoomVisibility.set('Public');
    this.createRoomError.set('');
  }

  cancelCreateRoom(): void {
    this.isCreatingRoom.set(false);
  }

  submitCreateRoom(): void {
    const name = this.newRoomName().trim();
    if (!name || this.isCreatingRoomPending()) return;
    this.isCreatingRoomPending.set(true);
    this.createRoomError.set('');
    this.roomsApi.createRoom({ name, description: null, visibility: this.newRoomVisibility() }).subscribe({
      next: room => {
        this.myRooms.update(rooms => [...rooms, room]);
        this.isCreatingRoom.set(false);
        this.isCreatingRoomPending.set(false);
        void this.router.navigate(['/app/rooms', room.id]);
      },
      error: () => {
        this.createRoomError.set('Failed to create room. Try again.');
        this.isCreatingRoomPending.set(false);
      },
    });
  }

  private bootstrapData(): void {
    this.loadRooms();
    this.notificationsApi.getUnreadCounts().subscribe({
      next: counts => counts.forEach(c => this.unread.setCount(c.contextType, c.contextId, c.count)),
    });
    this.friendsApi.getFriends().subscribe({
      next: friends => this.friends.set(friends),
    });
    this.invitationsApi.getMyInvitations().subscribe({
      next: invitations => this.pendingInvitationCount.set(
        invitations.filter(i => i.status === 'Pending').length
      ),
    });
  }

  private loadRooms(): void {
    this.roomsApi.getMyRooms().subscribe({
      next: rooms => this.myRooms.set(rooms),
    });
  }
}
