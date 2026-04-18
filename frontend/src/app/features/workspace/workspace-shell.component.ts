import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';

@Component({
  selector: 'app-workspace-shell',
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.scss',
})
export class WorkspaceShellComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly user = this.authSession.user;
  readonly memberStatusTestId = computed(() => {
    const user = this.user();
    return user ? `member-status-${user.id}` : 'member-status-anonymous';
  });

  logout(): void {
    this.authApi.logout()
      .pipe(finalize(() => {
        this.authSession.clearSession();
        void this.router.navigateByUrl('/auth');
      }))
      .subscribe({
        error: () => undefined,
      });
  }
}
