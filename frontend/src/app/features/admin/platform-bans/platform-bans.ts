import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { PlatformBansApiService } from '../../../core/admin/platform-bans-api.service';
import type { PlatformBanDto } from '../../../core/admin/admin.models';

@Component({
  selector: 'app-platform-bans',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './platform-bans.html',
  styleUrl: './platform-bans.scss',
})
export class PlatformBansComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly bansApi = inject(PlatformBansApiService);

  readonly user = this.authSession.user;

  readonly bans = signal<PlatformBanDto[]>([]);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');

  readonly activeBans = computed(() => this.bans().filter(b => b.revokedAt === null));
  readonly revokedBans = computed(() => this.bans().filter(b => b.revokedAt !== null));

  banUsername = '';
  banReason = '';
  banDuration = '24';

  constructor() {
    this.loadBans();
  }

  issueBan(): void {
    if (!this.banUsername.trim() || !this.banReason.trim() || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    const durationHours = this.banDuration === 'permanent' ? null : Number(this.banDuration);
    this.bansApi.issueBan(this.banUsername.trim(), this.banReason.trim(), durationHours)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.banUsername = '';
          this.banReason   = '';
          this.banDuration = '24';
          this.loadBans();
        },
        error: () => this.errorMessage.set('Failed to issue ban. Check the username and try again.'),
      });
  }

  revokeBan(userId: string): void {
    this.errorMessage.set('');
    this.bansApi.revokeBan(userId).subscribe({
      next: () => this.loadBans(),
      error: () => this.errorMessage.set('Failed to revoke ban.'),
    });
  }

  private loadBans(): void {
    this.isLoading.set(true);
    this.bansApi.getBans()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: bans => this.bans.set(bans),
        error: () => this.errorMessage.set('Unable to load bans.'),
      });
  }
}
