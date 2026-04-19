import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RoomsAdminApiService } from './rooms-admin-api.service';

describe('RoomsAdminApiService', () => {
  let service: RoomsAdminApiService;
  let http: HttpTestingController;

  const roomId = 'aaaaaaaa-0000-0000-0000-000000000001';
  const userId = 'bbbbbbbb-0000-0000-0000-000000000002';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RoomsAdminApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RoomsAdminApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getBans() sends GET /api/rooms/{id}/bans', () => {
    service.getBans(roomId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/bans`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('banMember() sends POST /api/rooms/{id}/members/{userId}/ban', () => {
    service.banMember(roomId, userId, 'spam').subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/members/${userId}/ban`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'spam' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('unbanMember() sends DELETE /api/rooms/{id}/bans/{userId}', () => {
    service.unbanMember(roomId, userId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/bans/${userId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('makeAdmin() sends POST /api/rooms/{id}/members/{userId}/make-admin', () => {
    service.makeAdmin(roomId, userId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/members/${userId}/make-admin`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('demoteAdmin() sends DELETE /api/rooms/{id}/members/{userId}/admin', () => {
    service.demoteAdmin(roomId, userId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/members/${userId}/admin`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('getInvitations() sends GET /api/rooms/{id}/invitations', () => {
    service.getInvitations(roomId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/invitations`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('sendInvitation() sends POST /api/rooms/{id}/invitations with username', () => {
    service.sendInvitation(roomId, 'alice').subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}/invitations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'alice' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('updateRoom() sends PATCH /api/rooms/{id}', () => {
    service.updateRoom(roomId, { name: 'new-name', description: null, visibility: null }).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'new-name', description: null, visibility: null });
    req.flush({});
  });

  it('deleteRoom() sends DELETE /api/rooms/{id}', () => {
    service.deleteRoom(roomId).subscribe();
    const req = http.expectOne(`/api/rooms/${roomId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
