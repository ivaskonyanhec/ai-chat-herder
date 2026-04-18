import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { SessionsPanelComponent } from '../sessions/sessions-panel.component';

type WorkspaceView = 'rooms' | 'sessions';

@Component({
  selector: 'app-workspace-shell',
  imports: [SessionsPanelComponent],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.scss',
})
export class WorkspaceShellComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly activeView = signal<WorkspaceView>('rooms');
  readonly logoutError = signal('');
  readonly user = this.authSession.user;
  readonly memberStatusTestId = computed(() => {
    const user = this.user();
    return user ? `member-status-${user.id}` : 'member-status-anonymous';
  });

  setActiveView(view: WorkspaceView): void {
    this.activeView.set(view);
  }

  logout(): void {
    this.logoutError.set('');

    this.authApi.logout()
      .subscribe({
        next: () => {
          this.authSession.clearSession();
          void this.router.navigateByUrl('/auth');
        },
        error: () => {
          this.logoutError.set('Unable to sign out right now. Try again in a moment.');
        },
      });
  }
}
