import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { NotificationsApiService } from './notifications-api.service';

describe('NotificationsApiService', () => {
  let service: NotificationsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotificationsApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NotificationsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getUnreadCounts() sends GET /api/unread', () => {
    service.getUnreadCounts().subscribe();
    const req = http.expectOne('/api/unread');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('markRoomRead() sends POST /api/rooms/{id}/read', () => {
    const roomId = 'aaaaaaaa-0000-0000-0000-000000000000';
    service.markRoomRead(roomId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/read`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('markDialogRead() sends POST /api/dialogs/{id}/read', () => {
    const dialogId = 'bbbbbbbb-0000-0000-0000-000000000000';
    service.markDialogRead(dialogId).subscribe();
    const req = http.expectOne(`/api/dialogs/${dialogId}/read`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
