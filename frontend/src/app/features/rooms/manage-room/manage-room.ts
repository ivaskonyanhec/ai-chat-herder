import { Component, inject } from '@angular/core';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

@Component({
  selector: 'app-manage-room',
  standalone: true,
  imports: [],
  templateUrl: './manage-room.html',
  styleUrl: './manage-room.scss',
})
export class ManageRoomComponent {
  private readonly authSession = inject(AuthSessionService);
  readonly user = this.authSession.user;
}
