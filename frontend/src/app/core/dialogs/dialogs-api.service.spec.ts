import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { DialogsApiService } from './dialogs-api.service';

describe('DialogsApiService', () => {
  let service: DialogsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DialogsApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DialogsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getDialogs() sends GET /api/dialogs', () => {
    service.getDialogs().subscribe();
    const req = http.expectOne('/api/dialogs');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createDialog() sends POST /api/dialogs with userId body', () => {
    const userId = 'aaaaaaaa-0000-0000-0000-000000000000';
    service.createDialog(userId).subscribe();
    const req = http.expectOne('/api/dialogs');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId });
    req.flush({});
  });

  it('getDialog() sends GET /api/dialogs/{id}', () => {
    const id = 'bbbbbbbb-0000-0000-0000-000000000000';
    service.getDialog(id).subscribe();
    const req = http.expectOne(`/api/dialogs/${id}`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('getMessages() sends GET /api/dialogs/{id}/messages with limit param', () => {
    const id = 'cccccccc-0000-0000-0000-000000000000';
    service.getMessages(id).subscribe();
    const req = http.expectOne(r => r.url === `/api/dialogs/${id}/messages`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe('50');
    req.flush([]);
  });

  it('editMessage() sends PATCH /api/dm-messages/{id}', () => {
    const id = 'dddddddd-0000-0000-0000-000000000000';
    service.editMessage(id, 'updated').subscribe();
    const req = http.expectOne(`/api/dm-messages/${id}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ content: 'updated' });
    req.flush({});
  });

  it('deleteMessage() sends DELETE /api/dm-messages/{id}', () => {
    const id = 'eeeeeeee-0000-0000-0000-000000000000';
    service.deleteMessage(id).subscribe();
    const req = http.expectOne(`/api/dm-messages/${id}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
