import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.scss',
})
export class WorkspaceShellComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly user = this.authSession.user;
  readonly logoutError = signal('');

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
