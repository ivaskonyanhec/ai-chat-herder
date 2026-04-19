import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, map, shareReplay, tap, throwError } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import type { AuthResponse } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthRefreshService {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly authSession = inject(AuthSessionService);

  private inFlightRefresh: Observable<AuthResponse> | null = null;

  refreshAccessToken(): Observable<string> {
    const currentSession = this.authSession.session();

    if (!this.inFlightRefresh) {
      this.inFlightRefresh = this.http.post<AuthResponse>('/api/auth/refresh', {}, { withCredentials: true }).pipe(
        tap(response => {
          this.authSession.setSession({
            accessToken: response.accessToken,
            user: response.user,
            keepSignedIn: currentSession?.keepSignedIn ?? false,
          });
        }),
        catchError(error => {
          this.authSession.clearSession();
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
        finalize(() => {
          this.inFlightRefresh = null;
        }),
      );
    }

    return this.inFlightRefresh.pipe(
      map(response => response.accessToken),
    );
  }
}
