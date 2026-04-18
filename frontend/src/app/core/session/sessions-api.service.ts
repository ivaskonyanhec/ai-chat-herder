import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SessionRecord {
  id: string;
  userAgent: string;
  ipAddress: string;
  keepSignedIn: boolean;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

@Injectable({ providedIn: 'root' })
export class SessionsApiService {
  private readonly http = inject(HttpClient);

  getSessions(): Observable<SessionRecord[]> {
    return this.http.get<SessionRecord[]>('/api/sessions');
  }

  revokeSession(sessionId: string): Observable<void> {
    return this.http.delete<void>(`/api/sessions/${sessionId}`);
  }

  revokeCurrentSession(): Observable<void> {
    return this.http.delete<void>('/api/sessions/current');
  }
}
