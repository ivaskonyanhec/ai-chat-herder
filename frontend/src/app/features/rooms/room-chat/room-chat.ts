import { Component, inject } from '@angular/core';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

@Component({
  selector: 'app-room-chat',
  standalone: true,
  imports: [],
  templateUrl: './room-chat.html',
  styleUrl: './room-chat.scss',
})
export class RoomChatComponent {
  private readonly authSession = inject(AuthSessionService);
  readonly user = this.authSession.user;
}
