import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { BlockDto } from './blocks.models';

@Injectable({ providedIn: 'root' })
export class BlocksApiService {
  private readonly http = inject(HttpClient);

  getBlocks(): Observable<BlockDto[]> {
    return this.http.get<BlockDto[]>('/api/blocks');
  }

  blockUser(userId: string): Observable<void> {
    return this.http.post<void>('/api/blocks', { userId });
  }

  unblockUser(userId: string): Observable<void> {
    return this.http.delete<void>(`/api/blocks/${userId}`);
  }
}
