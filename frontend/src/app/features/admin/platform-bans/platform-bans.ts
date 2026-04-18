import { Component, inject } from '@angular/core';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

@Component({
  selector: 'app-platform-bans',
  standalone: true,
  imports: [],
  templateUrl: './platform-bans.html',
  styleUrl: './platform-bans.scss',
})
export class PlatformBansComponent {
  private readonly authSession = inject(AuthSessionService);
  readonly user = this.authSession.user;
}
