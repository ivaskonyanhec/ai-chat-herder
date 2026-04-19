import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface UnreadContextDto {
  contextType: string;
  contextId: string;
  count: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);

  getUnreadCounts(): Observable<UnreadContextDto[]> {
    return this.http.get<UnreadContextDto[]>('/api/unread');
  }

  markRoomRead(roomId: string): Observable<void> {
    return this.http.post<void>(`/api/rooms/${roomId}/read`, {});
  }

  markDialogRead(dialogId: string): Observable<void> {
    return this.http.post<void>(`/api/dialogs/${dialogId}/read`, {});
  }
}
