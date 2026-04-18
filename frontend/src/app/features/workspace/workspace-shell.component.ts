import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { PresenceService } from '../../core/signalr/presence.service';
import { ChatService } from '../../core/signalr/chat.service';
import { UnreadService } from '../../core/signalr/unread.service';

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Button],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.scss',
})
export class WorkspaceShellComponent implements OnInit, OnDestroy {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly presence = inject(PresenceService);
  private readonly chat = inject(ChatService);
  private readonly unread = inject(UnreadService);

  readonly user = this.authSession.user;
  readonly logoutError = signal('');

  ngOnInit(): void {
    void this.presence.connect();
    void this.chat.connect();
  }

  ngOnDestroy(): void {
    void this.presence.disconnect();
    void this.chat.disconnect();
  }

  logout(): void {
    this.logoutError.set('');

    this.authApi.logout().subscribe({
      next: async () => {
        await this.presence.disconnect();
        await this.chat.disconnect();
        this.unread.clearAll();
        this.authSession.clearSession();
        void this.router.navigateByUrl('/auth');
      },
      error: () => {
        this.logoutError.set('Unable to sign out right now. Try again in a moment.');
      },
    });
  }
}
