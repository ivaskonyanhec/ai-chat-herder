import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { PresenceService } from '../../core/signalr/presence.service';
import { ChatService } from '../../core/signalr/chat.service';
import { UnreadService } from '../../core/signalr/unread.service';
import { NotificationsApiService } from '../../core/notifications/notifications-api.service';
import { RoomsApiService } from '../../core/rooms/rooms-api.service';
import { FriendsApiService } from '../../core/friends/friends-api.service';
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

  readonly user = this.authSession.user;
  readonly presenceMap = this.presence.presenceMap;
  readonly logoutError = signal('');
  readonly myRooms = signal<RoomDto[]>([]);
  readonly friends = signal<FriendDto[]>([]);
  readonly unreadCounts = this.unread.unreadCounts;

  readonly publicRooms = computed(() => this.myRooms().filter(r => r.visibility === 'Public'));
  readonly privateRooms = computed(() => this.myRooms().filter(r => r.visibility === 'Private'));
  readonly publicRoomsExpanded = signal(true);
  readonly privateRoomsExpanded = signal(true);
  readonly sidebarOpen = signal(false);

  readonly isCreatingRoom = signal(false);
  readonly newRoomName = signal('');
  readonly newRoomVisibility = signal<'Public' | 'Private'>('Public');
  readonly isCreatingRoomPending = signal(false);
  readonly createRoomError = signal('');

  ngOnInit(): void {
    void this.presence.connect();
    void this.chat.connect();
    this.bootstrapData();
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
    this.roomsApi.getMyRooms().subscribe({
      next: rooms => this.myRooms.set(rooms),
    });
    this.notificationsApi.getUnreadCounts().subscribe({
      next: counts => counts.forEach(c => this.unread.setCount(c.contextType, c.contextId, c.count)),
    });
    this.friendsApi.getFriends().subscribe({
      next: friends => this.friends.set(friends),
    });
  }
}
