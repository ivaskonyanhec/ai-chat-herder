import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RoomCatalogItem, RoomDto, RoomMemberDto, CreateRoomRequest } from './rooms.models';
import type { MessageDto } from '../signalr/hub.models';

@Injectable({ providedIn: 'root' })
export class RoomsApiService {
  private readonly http = inject(HttpClient);

  getPublicCatalog(search?: string, page = 1, limit = 20): Observable<RoomCatalogItem[]> {
    let params = new HttpParams().set('page', page).set('limit', limit);
    if (search) params = params.set('search', search);
    return this.http.get<RoomCatalogItem[]>('/api/rooms', { params });
  }

  getMyRooms(): Observable<RoomDto[]> {
    return this.http.get<RoomDto[]>('/api/rooms/my');
  }

  getRoom(id: string): Observable<RoomDto> {
    return this.http.get<RoomDto>(`/api/rooms/${id}`);
  }

  createRoom(req: CreateRoomRequest): Observable<RoomDto> {
    return this.http.post<RoomDto>('/api/rooms', req);
  }

  joinRoom(id: string): Observable<void> {
    return this.http.post<void>(`/api/rooms/${id}/join`, {});
  }

  leaveRoom(id: string): Observable<void> {
    return this.http.delete<void>(`/api/rooms/${id}/leave`);
  }

  getMembers(id: string): Observable<RoomMemberDto[]> {
    return this.http.get<RoomMemberDto[]>(`/api/rooms/${id}/members`);
  }

  getMessages(id: string, before?: string, limit = 50): Observable<MessageDto[]> {
    let params = new HttpParams().set('limit', limit);
    if (before) params = params.set('before', before);
    return this.http.get<MessageDto[]>(`/api/rooms/${id}/messages`, { params });
  }
}
