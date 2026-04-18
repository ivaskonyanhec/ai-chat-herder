import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FriendsApiService } from '../../../core/friends/friends-api.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import type { FriendDto } from '../../../core/friends/friends.models';

@Component({
  selector: 'app-contacts-home',
  standalone: true,
  imports: [],
  templateUrl: './contacts-home.html',
  styleUrl: './contacts-home.scss',
})
export class ContactsHomeComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly friendsApi = inject(FriendsApiService);
  private readonly dialogsApi = inject(DialogsApiService);
  private readonly router = inject(Router);

  readonly user = this.authSession.user;
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly friends = signal<FriendDto[]>([]);
  readonly removingId = signal<string | null>(null);
  readonly openingChatId = signal<string | null>(null);

  constructor() {
    this.loadFriends();
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

  private loadFriends(): void {
    this.isLoading.set(true);
    this.friendsApi.getFriends()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: friends => this.friends.set(friends),
        error: () => this.errorMessage.set('Unable to load contacts.'),
      });
  }
}
