import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RoomsApiService } from './rooms-api.service';
import { RoomCatalogItem, RoomDto } from './rooms.models';

describe('RoomsApiService', () => {
  let httpMock: HttpTestingController;
  let service: RoomsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), RoomsApiService],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(RoomsApiService);
  });

  afterEach(() => httpMock.verify());

  it('fetches public catalog without search params', () => {
    const expected: RoomCatalogItem[] = [
      { id: 'r1', name: 'Design Hub', description: null, ownerId: 'u1', createdAt: '2026-01-01T00:00:00Z', memberCount: 42 },
    ];
    let actual: RoomCatalogItem[] | undefined;

    service.getPublicCatalog().subscribe(rooms => (actual = rooms));

    const req = httpMock.expectOne(r => r.url === '/api/rooms');
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('fetches public catalog with search query param', () => {
    service.getPublicCatalog('design').subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/rooms' && r.params.get('search') === 'design');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('fetches a single room by id', () => {
    const expected: RoomDto = {
      id: 'room-1', name: 'Hub', description: null, visibility: 'Public',
      ownerId: 'u1', createdAt: '2026-01-01T00:00:00Z', memberCount: 5, callerRole: 'Member',
    };
    let actual: RoomDto | undefined;

    service.getRoom('room-1').subscribe(r => (actual = r));

    const req = httpMock.expectOne('/api/rooms/room-1');
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('joins a room', () => {
    service.joinRoom('room-1').subscribe();
    const req = httpMock.expectOne('/api/rooms/room-1/join');
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('loads message history', () => {
    service.getMessages('room-1').subscribe();
    const req = httpMock.expectOne(r => r.url === '/api/rooms/room-1/messages' && r.params.get('limit') === '50');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('loads message history before a given message id', () => {
    service.getMessages('room-1', 'msg-99').subscribe();
    const req = httpMock.expectOne(r =>
      r.url === '/api/rooms/room-1/messages' &&
      r.params.get('before') === 'msg-99' &&
      r.params.get('limit') === '50'
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('creates a room', () => {
    service.createRoom({ name: 'New Room', description: null, visibility: 'Public' }).subscribe();
    const req = httpMock.expectOne('/api/rooms');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'New Room', description: null, visibility: 'Public' });
    req.flush({ id: 'r1', name: 'New Room', description: null, visibility: 'Public', ownerId: 'u1', createdAt: '2026-01-01T00:00:00Z', memberCount: 1, callerRole: 'Owner' });
  });

  it('leaves a room', () => {
    service.leaveRoom('room-1').subscribe();
    const req = httpMock.expectOne('/api/rooms/room-1/leave');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('fetches room members', () => {
    service.getMembers('room-1').subscribe();
    const req = httpMock.expectOne('/api/rooms/room-1/members');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
