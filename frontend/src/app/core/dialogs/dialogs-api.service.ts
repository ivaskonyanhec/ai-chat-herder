import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { DialogDto } from './dialogs.models';
import type { DialogMessageDto } from '../signalr/hub.models';

@Injectable({ providedIn: 'root' })
export class DialogsApiService {
  private readonly http = inject(HttpClient);

  getDialogs(): Observable<DialogDto[]> {
    return this.http.get<DialogDto[]>('/api/dialogs');
  }

  createDialog(userId: string): Observable<DialogDto> {
    return this.http.post<DialogDto>('/api/dialogs', { userId });
  }

  getDialog(id: string): Observable<DialogDto> {
    return this.http.get<DialogDto>(`/api/dialogs/${id}`);
  }

  getMessages(id: string, before?: string, limit = 50): Observable<DialogMessageDto[]> {
    let params = new HttpParams().set('limit', limit);
    if (before) params = params.set('before', before);
    return this.http.get<DialogMessageDto[]>(`/api/dialogs/${id}/messages`, { params });
  }

  editMessage(id: string, content: string): Observable<DialogMessageDto> {
    return this.http.patch<DialogMessageDto>(`/api/dm-messages/${id}`, { content });
  }

  deleteMessage(id: string): Observable<void> {
    return this.http.delete<void>(`/api/dm-messages/${id}`);
  }
}
