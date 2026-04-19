import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PlatformBansApiService } from './platform-bans-api.service';

describe('PlatformBansApiService', () => {
  let service: PlatformBansApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PlatformBansApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlatformBansApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getBans() sends GET /api/admin/bans', () => {
    service.getBans().subscribe();
    const req = http.expectOne('/api/admin/bans');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('issueBan() sends POST /api/admin/bans with body', () => {
    service.issueBan('johndoe', 'spam', 24).subscribe();
    const req = http.expectOne('/api/admin/bans');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'johndoe', reason: 'spam', durationHours: 24 });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('revokeBan() sends DELETE /api/admin/bans/{userId}', () => {
    const id = 'aaaaaaaa-0000-0000-0000-000000000001';
    service.revokeBan(id).subscribe();
    const req = http.expectOne(`/api/admin/bans/${id}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
