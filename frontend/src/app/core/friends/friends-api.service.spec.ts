import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { FriendsApiService } from './friends-api.service';

describe('FriendsApiService', () => {
  let service: FriendsApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FriendsApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FriendsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getFriends() sends GET /api/friends', () => {
    service.getFriends().subscribe();
    const req = http.expectOne('/api/friends');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getFriendRequests() sends GET /api/friends/requests', () => {
    service.getFriendRequests().subscribe();
    const req = http.expectOne('/api/friends/requests');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('sendFriendRequest() sends POST /api/friends/requests with body', () => {
    service.sendFriendRequest('bob', 'hi').subscribe();
    const req = http.expectOne('/api/friends/requests');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'bob', message: 'hi' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('acceptFriendRequest() sends POST /api/friends/requests/{id}/accept', () => {
    const id = '11111111-0000-0000-0000-000000000000';
    service.acceptFriendRequest(id).subscribe();
    const req = http.expectOne(`/api/friends/requests/${id}/accept`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('rejectFriendRequest() sends POST /api/friends/requests/{id}/reject', () => {
    const id = '22222222-0000-0000-0000-000000000000';
    service.rejectFriendRequest(id).subscribe();
    const req = http.expectOne(`/api/friends/requests/${id}/reject`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('removeFriend() sends DELETE /api/friends/{userId}', () => {
    const userId = '33333333-0000-0000-0000-000000000000';
    service.removeFriend(userId).subscribe();
    const req = http.expectOne(`/api/friends/${userId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
