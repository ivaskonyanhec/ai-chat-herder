import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { FriendDto, FriendRequestDto } from './friends.models';

@Injectable({ providedIn: 'root' })
export class FriendsApiService {
  private readonly http = inject(HttpClient);

  getFriends(): Observable<FriendDto[]> {
    return this.http.get<FriendDto[]>('/api/friends');
  }

  getFriendRequests(): Observable<FriendRequestDto[]> {
    return this.http.get<FriendRequestDto[]>('/api/friends/requests');
  }

  sendFriendRequest(username: string, message?: string): Observable<void> {
    return this.http.post<void>('/api/friends/requests', { username, message });
  }

  acceptFriendRequest(id: string): Observable<void> {
    return this.http.post<void>(`/api/friends/requests/${id}/accept`, {});
  }

  rejectFriendRequest(id: string): Observable<void> {
    return this.http.post<void>(`/api/friends/requests/${id}/reject`, {});
  }

  removeFriend(userId: string): Observable<void> {
    return this.http.delete<void>(`/api/friends/${userId}`);
  }
}
