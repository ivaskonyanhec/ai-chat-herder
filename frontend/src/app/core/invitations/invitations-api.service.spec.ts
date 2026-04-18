import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { InvitationsApiService } from './invitations-api.service';
import type { RoomInvitationDto } from './invitations.models';

describe('InvitationsApiService', () => {
  let httpMock: HttpTestingController;
  let service: InvitationsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), InvitationsApiService],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(InvitationsApiService);
  });

  afterEach(() => httpMock.verify());

  it('fetches my invitations', () => {
    const expected: RoomInvitationDto[] = [{
      id: 'inv-1', roomId: 'r1', roomName: 'Hub', invitedByUserId: 'u1',
      invitedByUsername: 'alice', invitedUserId: 'u2', invitedUsername: 'bob',
      status: 'Pending', createdAt: '2026-01-01T00:00:00Z',
    }];
    let actual: RoomInvitationDto[] | undefined;

    service.getMyInvitations().subscribe(inv => (actual = inv));

    const req = httpMock.expectOne('/api/invitations');
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('accepts an invitation', () => {
    service.acceptInvitation('inv-1').subscribe();
    const req = httpMock.expectOne('/api/invitations/inv-1/accept');
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('rejects an invitation', () => {
    service.rejectInvitation('inv-1').subscribe();
    const req = httpMock.expectOne('/api/invitations/inv-1/reject');
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });
});
