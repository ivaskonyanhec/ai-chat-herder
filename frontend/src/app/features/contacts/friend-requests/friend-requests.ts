import { Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FriendsApiService } from '../../../core/friends/friends-api.service';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import type { FriendRequestDto } from '../../../core/friends/friends.models';

@Component({
  selector: 'app-friend-requests',
  standalone: true,
  imports: [AvatarComponent],
  templateUrl: './friend-requests.html',
  styleUrl: './friend-requests.scss',
  host: { class: 'block flex-1 min-h-0 overflow-hidden' },
})
export class FriendRequestsComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly friendsApi = inject(FriendsApiService);

  readonly user = this.authSession.user;
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly processingId = signal<string | null>(null);

  private readonly requests = signal<FriendRequestDto[]>([]);

  readonly incomingRequests = computed(() => {
    const userId = this.user()?.id;
    return this.requests().filter(r => r.receiverId === userId);
  });

  readonly outgoingRequests = computed(() => {
    const userId = this.user()?.id;
    return this.requests().filter(r => r.senderId === userId);
  });

  constructor() {
    this.loadRequests();
  }

  accept(id: string): void {
    if (this.processingId()) return;
    this.processingId.set(id);
    this.friendsApi.acceptFriendRequest(id)
      .pipe(finalize(() => this.processingId.set(null)))
      .subscribe({
        next: () => this.requests.update(list => list.filter(r => r.id !== id)),
        error: () => this.errorMessage.set('Unable to accept the request right now.'),
      });
  }

  reject(id: string): void {
    if (this.processingId()) return;
    this.processingId.set(id);
    this.friendsApi.rejectFriendRequest(id)
      .pipe(finalize(() => this.processingId.set(null)))
      .subscribe({
        next: () => this.requests.update(list => list.filter(r => r.id !== id)),
        error: () => this.errorMessage.set('Unable to decline the request right now.'),
      });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  private loadRequests(): void {
    this.isLoading.set(true);
    this.friendsApi.getFriendRequests()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: requests => this.requests.set(requests),
        error: () => this.errorMessage.set('Unable to load friend requests.'),
      });
  }
}
