import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { PlatformBanDto } from './admin.models';

@Injectable({ providedIn: 'root' })
export class PlatformBansApiService {
  private readonly http = inject(HttpClient);

  getBans(): Observable<PlatformBanDto[]> {
    return this.http.get<PlatformBanDto[]>('/api/admin/bans');
  }

  issueBan(username: string, reason: string, durationHours: number | null): Observable<void> {
    return this.http.post<void>('/api/admin/bans', { username, reason, durationHours });
  }

  revokeBan(userId: string): Observable<void> {
    return this.http.delete<void>(`/api/admin/bans/${userId}`);
  }
}
