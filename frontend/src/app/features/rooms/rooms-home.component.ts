import { Component, computed, inject } from '@angular/core';
import { AuthSessionService } from '../../core/auth/auth-session.service';

@Component({
  selector: 'app-rooms-home',
  templateUrl: './rooms-home.component.html',
  styleUrl: './rooms-home.component.scss',
})
export class RoomsHomeComponent {
  private readonly authSession = inject(AuthSessionService);

  readonly user = this.authSession.user;
  readonly memberStatusTestId = computed(() => {
    const user = this.user();
    return user ? `member-status-${user.id}` : 'member-status-anonymous';
  });
}
