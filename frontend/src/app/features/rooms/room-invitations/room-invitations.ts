import { Component, inject } from '@angular/core';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

@Component({
  selector: 'app-room-invitations',
  standalone: true,
  imports: [],
  templateUrl: './room-invitations.html',
  styleUrl: './room-invitations.scss',
})
export class RoomInvitationsComponent {
  private readonly authSession = inject(AuthSessionService);
  readonly user = this.authSession.user;
}
