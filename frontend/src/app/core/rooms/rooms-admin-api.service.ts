import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { RoomBanDto, RoomDto, RoomInvitationDto, UpdateRoomRequest } from './rooms.models';

@Injectable({ providedIn: 'root' })
export class RoomsAdminApiService {
  private readonly http = inject(HttpClient);

  getBans(roomId: string): Observable<RoomBanDto[]> {
    return this.http.get<RoomBanDto[]>(`/api/rooms/${roomId}/bans`);
  }

  banMember(roomId: string, userId: string, reason: string): Observable<void> {
    return this.http.post<void>(`/api/rooms/${roomId}/members/${userId}/ban`, { reason });
  }

  unbanMember(roomId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`/api/rooms/${roomId}/bans/${userId}`);
  }

  makeAdmin(roomId: string, userId: string): Observable<void> {
    return this.http.post<void>(`/api/rooms/${roomId}/members/${userId}/make-admin`, {});
  }

  demoteAdmin(roomId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`/api/rooms/${roomId}/members/${userId}/admin`);
  }

  getInvitations(roomId: string): Observable<RoomInvitationDto[]> {
    return this.http.get<RoomInvitationDto[]>(`/api/rooms/${roomId}/invitations`);
  }

  sendInvitation(roomId: string, username: string): Observable<void> {
    return this.http.post<void>(`/api/rooms/${roomId}/invitations`, { username });
  }

  updateRoom(roomId: string, req: UpdateRoomRequest): Observable<RoomDto> {
    return this.http.patch<RoomDto>(`/api/rooms/${roomId}`, req);
  }

  deleteRoom(roomId: string): Observable<void> {
    return this.http.delete<void>(`/api/rooms/${roomId}`);
  }
}
