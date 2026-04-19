import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { UsersApiService } from '../../../core/users/users-api.service';
import type { User } from '../../../core/auth/auth.models';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.scss',
})
export class ProfileSettingsComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly usersApi = inject(UsersApiService);
  private readonly router = inject(Router);

  readonly profile = signal<User | null>(this.authSession.user());
  readonly isLoadingProfile = signal(true);

  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly isChangingPassword = signal(false);
  readonly passwordError = signal('');
  readonly passwordSuccess = signal('');

  readonly isDeletingAccount = signal(false);
  readonly deleteError = signal('');

  constructor() {
    this.usersApi.getMe()
      .pipe(finalize(() => this.isLoadingProfile.set(false)))
      .subscribe({
        next: user => this.profile.set(user),
        error: () => { /* fall back to cached session user */ },
      });
  }

  submitPasswordChange(): void {
    const current = this.currentPassword();
    const next = this.newPassword();
    const confirm = this.confirmPassword();

    this.passwordError.set('');
    this.passwordSuccess.set('');

    if (!current || !next || !confirm) {
      this.passwordError.set('All password fields are required.');
      return;
    }
    if (next !== confirm) {
      this.passwordError.set('New passwords do not match.');
      return;
    }
    if (next.length < 8) {
      this.passwordError.set('New password must be at least 8 characters.');
      return;
    }
    if (this.isChangingPassword()) return;

    this.isChangingPassword.set(true);
    this.authApi.changePassword(current, next)
      .pipe(finalize(() => this.isChangingPassword.set(false)))
      .subscribe({
        next: () => {
          this.currentPassword.set('');
          this.newPassword.set('');
          this.confirmPassword.set('');
          this.passwordSuccess.set('Password changed. All other sessions have been signed out.');
        },
        error: (err) => {
          // justification: HttpErrorResponse body from ASP.NET Minimal API error shape { error: string }
          const msg: string = (err as { error?: { error?: string } })?.error?.error ?? '';
          this.passwordError.set(msg || 'Failed to change password. Check your current password.');
        },
      });
  }

  initiateAccountDeletion(): void {
    if (!confirm('Permanently delete your account? This cannot be undone.')) return;
    if (this.isDeletingAccount()) return;

    this.isDeletingAccount.set(true);
    this.deleteError.set('');
    this.authApi.deleteAccount()
      .pipe(finalize(() => this.isDeletingAccount.set(false)))
      .subscribe({
        next: () => {
          this.authSession.clearSession();
          void this.router.navigateByUrl('/auth');
        },
        error: () => {
          this.deleteError.set('Account deletion failed. Please try again.');
        },
      });
  }
}
