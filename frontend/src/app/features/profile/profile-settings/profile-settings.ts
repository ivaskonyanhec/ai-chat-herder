import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { UsersApiService } from '../../../core/users/users-api.service';
import type { User } from '../../../core/auth/auth.models';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [FormsModule, AvatarComponent],
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.scss',
  host: { class: 'block flex-1 min-h-0 overflow-hidden' },
})
export class ProfileSettingsComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly filesApi = inject(FilesApiService);
  private readonly usersApi = inject(UsersApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly profile = signal<User | null>(this.authSession.user());
  readonly isLoadingProfile = signal(true);
  readonly displayAvatarUrl = signal(this.authSession.user()?.avatarUrl || 'default-avatar.png');

  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly isChangingPassword = signal(false);
  readonly passwordError = signal('');
  readonly passwordSuccess = signal('');

  readonly isDeletingAccount = signal(false);
  readonly deleteError = signal('');

  readonly isUploadingAvatar = signal(false);
  readonly avatarError = signal('');

  readonly PREDEFINED_ICONS = [
    'person', 'face', 'emoji_emotions', 'psychology',
    'rocket_launch', 'star', 'bolt', 'favorite',
    'pets', 'explore', 'palette', 'headphones',
  ] as const;

  readonly showIconPicker = signal(false);

  private objectAvatarUrl: string | null = null;

  constructor() {
    this.updateDisplayAvatar(this.profile()?.avatarUrl ?? null);
    this.usersApi.getMe()
      .pipe(finalize(() => this.isLoadingProfile.set(false)))
      .subscribe({
        next: user => {
          this.profile.set(user);
          this.updateDisplayAvatar(user.avatarUrl);
        },
        error: () => { /* fall back to cached session user */ },
      });
    this.destroyRef.onDestroy(() => this.revokeObjectAvatarUrl());
  }

  onAvatarFileSelected(file: File | null): void {
    if (!file || this.isUploadingAvatar()) return;

    this.avatarError.set('');
    this.isUploadingAvatar.set(true);
    this.filesApi.uploadFile(file)
      .pipe(
        switchMap(attachment => this.usersApi.patchMe(this.filesApi.getFileUrl(attachment.id))),
        finalize(() => this.isUploadingAvatar.set(false)),
      )
      .subscribe({
        next: user => {
          this.profile.set(user);
          this.authSession.updateAvatarUrl(user.avatarUrl ?? null);
          this.setObjectAvatarUrl(URL.createObjectURL(file));
        },
        error: () => {
          this.avatarError.set('Avatar upload failed. Please try again.');
        },
      });
  }

  selectIcon(iconName: string): void {
    if (this.isUploadingAvatar()) return;
    this.avatarError.set('');
    this.isUploadingAvatar.set(true);
    const url = `icon:${iconName}`;
    this.usersApi.patchMe(url)
      .pipe(finalize(() => this.isUploadingAvatar.set(false)))
      .subscribe({
        next: user => {
          this.profile.set(user);
          this.authSession.updateAvatarUrl(url);
          this.revokeObjectAvatarUrl();
          this.displayAvatarUrl.set(url);
          this.showIconPicker.set(false);
        },
        error: () => {
          this.avatarError.set('Failed to set icon. Please try again.');
        },
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

  private updateDisplayAvatar(avatarUrl: string | null): void {
    if (avatarUrl?.startsWith('icon:')) {
      this.revokeObjectAvatarUrl();
      this.displayAvatarUrl.set(avatarUrl);
      return;
    }
    const attachmentId = this.getAttachmentId(avatarUrl);
    if (!attachmentId) {
      this.revokeObjectAvatarUrl();
      this.displayAvatarUrl.set(avatarUrl || 'default-avatar.png');
      return;
    }

    this.filesApi.getFileBlob(attachmentId).subscribe({
      next: blob => this.setObjectAvatarUrl(URL.createObjectURL(blob)),
      error: () => this.displayAvatarUrl.set('default-avatar.png'),
    });
  }

  private setObjectAvatarUrl(url: string): void {
    this.revokeObjectAvatarUrl();
    this.objectAvatarUrl = url;
    this.displayAvatarUrl.set(url);
  }

  private revokeObjectAvatarUrl(): void {
    if (!this.objectAvatarUrl) return;
    URL.revokeObjectURL(this.objectAvatarUrl);
    this.objectAvatarUrl = null;
  }

  private getAttachmentId(avatarUrl: string | null): string | null {
    const match = avatarUrl?.match(/^\/api\/files\/([^/?#]+)$/);
    return match?.[1] ?? null;
  }
}
