import { Component, inject } from '@angular/core';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [],
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.scss',
})
export class ProfileSettingsComponent {
  private readonly authSession = inject(AuthSessionService);
  readonly user = this.authSession.user;
}
