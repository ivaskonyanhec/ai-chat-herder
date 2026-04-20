import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { Router } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FriendsApiService } from '../../../core/friends/friends-api.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import { BlocksApiService } from '../../../core/blocks/blocks-api.service';
import { UsersApiService, UserSearchResult } from '../../../core/users/users-api.service';
import type { FriendDto, FriendRequestDto } from '../../../core/friends/friends.models';
import type { BlockDto } from '../../../core/blocks/blocks.models';

@Component({
  selector: 'app-contacts-home',
  standalone: true,
  imports: [FormsModule, AvatarComponent],
  templateUrl: './contacts-home.html',
  styleUrl: './contacts-home.scss',
})
export class ContactsHomeComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly friendsApi = inject(FriendsApiService);
  private readonly dialogsApi = inject(DialogsApiService);
  private readonly blocksApi = inject(BlocksApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly router = inject(Router);

  readonly user = this.authSession.user;
  readonly view = signal<'friends' | 'blocked'>('friends');
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly friends = signal<FriendDto[]>([]);
  readonly blockedUsers = signal<BlockDto[]>([]);
  readonly requests = signal<FriendRequestDto[]>([]);
  readonly searchText = signal('');
  readonly newRequestUsername = signal('');
  readonly newRequestMessage = signal('');
  readonly requestStatusMessage = signal('');
  readonly removingId = signal<string | null>(null);
  readonly openingChatId = signal<string | null>(null);
  readonly unblockingId = signal<string | null>(null);
  readonly processingRequestId = signal<string | null>(null);
  readonly sendingRequest = signal(false);
  readonly userSuggestions = signal<UserSearchResult[]>([]);
  readonly isSearchingUsers = signal(false);

  readonly incomingRequests = computed(() => {
    const userId = this.user()?.id;
    if (!userId) return [];
    return this.requests().filter(request => request.receiverId === userId);
  });

  readonly outgoingRequests = computed(() => {
    const userId = this.user()?.id;
    return userId ? this.requests().filter(request => request.senderId === userId) : [];
  });

  readonly filteredFriends = computed(() => {
    const query = this.normalizedSearch();
    if (!query) return this.friends();
    return this.friends().filter(friend => friend.username.toLowerCase().includes(query));
  });

  readonly filteredBlockedUsers = computed(() => {
    const query = this.normalizedSearch();
    if (!query) return this.blockedUsers();
    return this.blockedUsers().filter(blocked => blocked.blockedUsername.toLowerCase().includes(query));
  });

  constructor() {
    this.loadInitialData();
  }

  switchView(v: 'friends' | 'blocked'): void {
    this.view.set(v);
    this.errorMessage.set('');
    if (v === 'blocked' && this.blockedUsers().length === 0) {
      this.loadBlocked();
    }
  }

  removeFriend(userId: string): void {
    if (this.removingId()) return;
    this.removingId.set(userId);
    this.friendsApi.removeFriend(userId)
      .pipe(finalize(() => this.removingId.set(null)))
      .subscribe({
        next: () => this.friends.update(list => list.filter(f => f.userId !== userId)),
        error: () => this.errorMessage.set('Unable to remove friend right now.'),
      });
  }

  openChat(userId: string): void {
    if (this.openingChatId()) return;
    this.openingChatId.set(userId);
    this.dialogsApi.createDialog(userId)
      .pipe(finalize(() => this.openingChatId.set(null)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/app/messages'),
        error: () => this.errorMessage.set('Unable to open chat right now.'),
      });
  }

  unblockUser(userId: string): void {
    if (this.unblockingId()) return;
    this.unblockingId.set(userId);
    this.blocksApi.unblockUser(userId)
      .pipe(finalize(() => this.unblockingId.set(null)))
      .subscribe({
        next: () => this.blockedUsers.update(list => list.filter(b => b.blockedUserId !== userId)),
        error: () => this.errorMessage.set('Unable to unblock user right now.'),
      });
  }

  acceptRequest(id: string): void {
    if (this.processingRequestId()) return;
    this.processingRequestId.set(id);
    this.friendsApi.acceptFriendRequest(id)
      .pipe(finalize(() => this.processingRequestId.set(null)))
      .subscribe({
        next: () => {
          this.requests.update(list => list.filter(request => request.id !== id));
          this.loadFriends();
        },
        error: () => this.errorMessage.set('Unable to accept the request right now.'),
      });
  }

  rejectRequest(id: string): void {
    if (this.processingRequestId()) return;
    this.processingRequestId.set(id);
    this.friendsApi.rejectFriendRequest(id)
      .pipe(finalize(() => this.processingRequestId.set(null)))
      .subscribe({
        next: () => this.requests.update(list => list.filter(request => request.id !== id)),
        error: () => this.errorMessage.set('Unable to decline the request right now.'),
      });
  }

  sendFriendRequest(): void {
    if (this.sendingRequest()) return;
    const username = this.newRequestUsername().trim().replace(/^@+/, '');
    const message = this.newRequestMessage().trim();
    this.errorMessage.set('');
    this.requestStatusMessage.set('');

    if (!username) {
      this.errorMessage.set('Enter a username to send a request.');
      return;
    }

    this.sendingRequest.set(true);
    this.friendsApi.sendFriendRequest(username, message || undefined)
      .pipe(finalize(() => this.sendingRequest.set(false)))
      .subscribe({
        next: () => {
          this.newRequestUsername.set('');
          this.newRequestMessage.set('');
          this.userSuggestions.set([]);
          this.requestStatusMessage.set('Friend request sent.');
        },
        error: () => this.errorMessage.set('Unable to send friend request right now.'),
      });
  }

  onUsernameInput(value: string): void {
    this.newRequestUsername.set(value);
    const query = value.trim();
    if (query.length < 2) {
      this.userSuggestions.set([]);
      return;
    }

    this.isSearchingUsers.set(true);
    this.usersApi.searchUsers(query, 8)
      .pipe(finalize(() => this.isSearchingUsers.set(false)))
      .subscribe({
        next: users => {
          const selfId = this.user()?.id;
          const friendUsernames = new Set(this.friends().map(f => f.username.toLowerCase()));
          const pendingOutgoing = new Set(
            this.outgoingRequests().map(r => r.receiverUsername.toLowerCase())
          );
          this.userSuggestions.set(
            users.filter(u =>
              u.id !== selfId &&
              !friendUsernames.has(u.username.toLowerCase()) &&
              !pendingOutgoing.has(u.username.toLowerCase())
            )
          );
        },
        error: () => this.userSuggestions.set([]),
      });
  }

  selectSuggestion(user: UserSearchResult): void {
    this.newRequestUsername.set(user.username);
    this.userSuggestions.set([]);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  private loadFriends(): void {
    this.friendsApi.getFriends()
      .subscribe({
        next: friends => this.friends.set(friends),
        error: () => this.errorMessage.set('Unable to load contacts.'),
      });
  }

  private loadInitialData(): void {
    this.isLoading.set(true);
    forkJoin({
      friends: this.friendsApi.getFriends(),
      requests: this.friendsApi.getFriendRequests(),
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ friends, requests }) => {
          this.friends.set(friends);
          this.requests.set(requests);
        },
        error: () => this.errorMessage.set('Unable to load contacts.'),
      });
  }

  private loadBlocked(): void {
    this.isLoading.set(true);
    this.blocksApi.getBlocks()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: blocked => this.blockedUsers.set(blocked),
        error: () => this.errorMessage.set('Unable to load blocked users.'),
      });
  }

  private normalizedSearch(): string {
    return this.searchText().trim().toLowerCase();
  }
}
