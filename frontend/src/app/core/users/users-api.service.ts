import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { User } from '../auth/auth.models';

export interface UserSearchResult {
  id: string;
  username: string;
  avatarUrl: string | null;
}

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

  searchUsers(query: string, limit = 8): Observable<UserSearchResult[]> {
    const params = new HttpParams()
      .set('q', query)
      .set('limit', limit);
    return this.http.get<UserSearchResult[]>('/api/users/search', { params });
  }
}
