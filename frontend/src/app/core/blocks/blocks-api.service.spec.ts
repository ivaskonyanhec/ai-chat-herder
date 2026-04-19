import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BlocksApiService } from './blocks-api.service';

describe('BlocksApiService', () => {
  let service: BlocksApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BlocksApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BlocksApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getBlocks() sends GET /api/blocks', () => {
    service.getBlocks().subscribe();
    const req = http.expectOne('/api/blocks');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('blockUser() sends POST /api/blocks with userId body', () => {
    const userId = 'aaaaaaaa-0000-0000-0000-000000000000';
    service.blockUser(userId).subscribe();
    const req = http.expectOne('/api/blocks');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('unblockUser() sends DELETE /api/blocks/{userId}', () => {
    const userId = 'bbbbbbbb-0000-0000-0000-000000000000';
    service.unblockUser(userId).subscribe();
    const req = http.expectOne(`/api/blocks/${userId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
