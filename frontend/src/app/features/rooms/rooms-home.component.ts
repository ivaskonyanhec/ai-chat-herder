import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { RoomsApiService } from '../../core/rooms/rooms-api.service';
import type { RoomCatalogItem } from '../../core/rooms/rooms.models';

@Component({
  selector: 'app-rooms-home',
  templateUrl: './rooms-home.component.html',
  styleUrl: './rooms-home.component.scss',
})
export class RoomsHomeComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly roomsApi = inject(RoomsApiService);
  private readonly router = inject(Router);

  readonly user = this.authSession.user;
  readonly memberStatusTestId = computed(() => {
    const user = this.user();
    return user ? `member-status-${user.id}` : 'member-status-anonymous';
  });

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly rooms = signal<RoomCatalogItem[]>([]);
  readonly joiningRoomId = signal<string | null>(null);

  constructor() {
    this.loadCatalog();
  }

  navigateToRoom(roomId: string): void {
    void this.router.navigateByUrl(`/app/rooms/${roomId}`);
  }

  joinAndNavigate(roomId: string): void {
    if (this.joiningRoomId()) return;
    this.joiningRoomId.set(roomId);
    this.roomsApi.joinRoom(roomId)
      .pipe(finalize(() => this.joiningRoomId.set(null)))
      .subscribe({
        next: () => void this.router.navigateByUrl(`/app/rooms/${roomId}`),
        error: () => this.navigateToRoom(roomId),
      });
  }

  private loadCatalog(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.roomsApi.getPublicCatalog()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: rooms => this.rooms.set(rooms),
        error: () => this.errorMessage.set('Unable to load rooms right now.'),
      });
  }
}
