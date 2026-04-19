import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { User } from '../auth/auth.models';

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  private readonly http = inject(HttpClient);

  getMe(): Observable<User> {
    return this.http.get<User>('/api/users/me');
  }

  patchMe(avatarUrl: string): Observable<User> {
    return this.http.patch<User>('/api/users/me', { avatarUrl });
  }

  getByUsername(username: string): Observable<User> {
    return this.http.get<User>(`/api/users/by-username/${username}`);
  }
}
