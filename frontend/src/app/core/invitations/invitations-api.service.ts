import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { RoomInvitationDto } from './invitations.models';

@Injectable({ providedIn: 'root' })
export class InvitationsApiService {
  private readonly http = inject(HttpClient);

  getMyInvitations(): Observable<RoomInvitationDto[]> {
    return this.http.get<RoomInvitationDto[]>('/api/invitations');
  }

  getRoomInvitations(roomId: string): Observable<RoomInvitationDto[]> {
    return this.http.get<RoomInvitationDto[]>(`/api/rooms/${roomId}/invitations`);
  }

  sendInvitation(roomId: string, username: string): Observable<RoomInvitationDto> {
    return this.http.post<RoomInvitationDto>(`/api/rooms/${roomId}/invitations`, { username });
  }

  acceptInvitation(id: string): Observable<void> {
    return this.http.post<void>(`/api/invitations/${id}/accept`, {});
  }

  rejectInvitation(id: string): Observable<void> {
    return this.http.post<void>(`/api/invitations/${id}/reject`, {});
  }
}
