import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { SessionsApiService, SessionRecord } from '../../core/session/sessions-api.service';

@Component({
  selector: 'app-sessions-panel',
  imports: [CommonModule, ButtonModule, CardModule, ProgressSpinnerModule, TagModule],
  templateUrl: './sessions-panel.component.html',
  styleUrl: './sessions-panel.component.scss',
})
export class SessionsPanelComponent {
  private readonly sessionsApi = inject(SessionsApiService);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly sessions = signal<SessionRecord[]>([]);
  readonly revokingSessionIds = signal<string[]>([]);
  readonly currentSession = computed(() => this.sessions().find((session) => session.isCurrent) ?? null);
  readonly otherSessions = computed(() => this.sessions().filter((session) => !session.isCurrent));

  constructor() {
    this.loadSessions();
  }

  revokeSession(sessionId: string): void {
    this.errorMessage.set('');
    this.revokingSessionIds.update((ids) => [...ids, sessionId]);

    this.sessionsApi.revokeSession(sessionId)
      .pipe(finalize(() => {
        this.revokingSessionIds.update((ids) => ids.filter((id) => id !== sessionId));
      }))
      .subscribe({
        next: () => {
          this.sessions.update((sessions) => sessions.filter((session) => session.id !== sessionId));
        },
        error: () => {
          this.errorMessage.set('Unable to revoke that session right now.');
        },
      });
  }

  isRevoking(sessionId: string): boolean {
    return this.revokingSessionIds().includes(sessionId);
  }

  formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  private loadSessions(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.sessionsApi.getSessions()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (sessions) => {
          this.sessions.set(sessions);
        },
        error: () => {
          this.errorMessage.set('Unable to load active sessions.');
        },
      });
  }
}
