import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReactionsApiService {
  private readonly http = inject(HttpClient);

  toggleReaction(messageId: string, emoji: string): Observable<void> {
    return this.http.post<void>(`/api/messages/${messageId}/reactions`, { emoji });
  }
}
