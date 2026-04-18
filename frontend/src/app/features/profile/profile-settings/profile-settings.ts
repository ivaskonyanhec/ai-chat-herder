import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { UsersApiService } from '../../../core/users/users-api.service';
import type { User } from '../../../core/auth/auth.models';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [],
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.scss',
})
export class ProfileSettingsComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly usersApi = inject(UsersApiService);

  readonly isLoading = signal(true);
  readonly profile = signal<User | null>(this.authSession.user());

  constructor() {
    this.usersApi.getMe()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: user => this.profile.set(user),
        error: () => { /* fall back to cached session user */ },
      });
  }
}
