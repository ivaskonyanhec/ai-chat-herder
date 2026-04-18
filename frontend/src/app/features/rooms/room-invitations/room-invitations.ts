import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { InvitationsApiService } from '../../../core/invitations/invitations-api.service';
import type { RoomInvitationDto } from '../../../core/invitations/invitations.models';

@Component({
  selector: 'app-room-invitations',
  standalone: true,
  imports: [],
  templateUrl: './room-invitations.html',
  styleUrl: './room-invitations.scss',
})
export class RoomInvitationsComponent {
  private readonly invitationsApi = inject(InvitationsApiService);
  private readonly router = inject(Router);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly invitations = signal<RoomInvitationDto[]>([]);
  readonly processingId = signal<string | null>(null);

  constructor() {
    this.loadInvitations();
  }

  accept(invitation: RoomInvitationDto): void {
    if (this.processingId()) return;
    this.processingId.set(invitation.id);
    this.invitationsApi.acceptInvitation(invitation.id)
      .pipe(finalize(() => this.processingId.set(null)))
      .subscribe({
        next: () => {
          this.invitations.update(list => list.filter(i => i.id !== invitation.id));
          void this.router.navigateByUrl(`/app/rooms/${invitation.roomId}`);
        },
        error: () => this.errorMessage.set('Unable to accept the invitation right now.'),
      });
  }

  reject(id: string): void {
    if (this.processingId()) return;
    this.processingId.set(id);
    this.invitationsApi.rejectInvitation(id)
      .pipe(finalize(() => this.processingId.set(null)))
      .subscribe({
        next: () => this.invitations.update(list => list.filter(i => i.id !== id)),
        error: () => this.errorMessage.set('Unable to decline the invitation right now.'),
      });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  private loadInvitations(): void {
    this.isLoading.set(true);
    this.invitationsApi.getMyInvitations()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: invitations => this.invitations.set(invitations.filter(i => i.status === 'Pending')),
        error: () => this.errorMessage.set('Unable to load invitations.'),
      });
  }
}
