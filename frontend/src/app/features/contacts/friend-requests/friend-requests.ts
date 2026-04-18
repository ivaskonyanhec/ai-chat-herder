import { Component, inject } from '@angular/core';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

@Component({
  selector: 'app-friend-requests',
  standalone: true,
  imports: [],
  templateUrl: './friend-requests.html',
  styleUrl: './friend-requests.scss',
})
export class FriendRequestsComponent {
  private readonly authSession = inject(AuthSessionService);
  readonly user = this.authSession.user;
}
