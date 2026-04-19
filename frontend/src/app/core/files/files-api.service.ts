import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { AttachmentDto } from './files.models';

@Injectable({ providedIn: 'root' })
export class FilesApiService {
  private readonly http = inject(HttpClient);

  uploadFile(file: File, comment?: string): Observable<AttachmentDto> {
    const form = new FormData();
    form.append('file', file);
    if (comment) form.append('comment', comment);
    return this.http.post<AttachmentDto>('/api/files/upload', form);
  }

  /** Returns the authenticated download URL path (used with XHR download). */
  getFileUrl(attachmentId: string): string {
    return `/api/files/${attachmentId}`;
  }

  getFileBlob(attachmentId: string): Observable<Blob> {
    return this.http.get(this.getFileUrl(attachmentId), { responseType: 'blob' });
  }

  /** Fetches the file as a Blob and triggers a browser download. */
  downloadFile(attachmentId: string, fileName: string): void {
    this.getFileBlob(attachmentId).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}
