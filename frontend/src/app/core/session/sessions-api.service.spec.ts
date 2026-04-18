import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { SessionsApiService, SessionRecord } from './sessions-api.service';

describe('SessionsApiService', () => {
  let httpMock: HttpTestingController;
  let service: SessionsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), SessionsApiService],
    });

    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(SessionsApiService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads active sessions from the backend contract', () => {
    const expected: SessionRecord[] = [
      {
        id: 'f5db772b-8cbc-4f18-af02-4fb5fd84442f',
        userAgent: 'Chrome on macOS',
        ipAddress: '192.168.1.10',
        keepSignedIn: true,
        createdAt: '2026-04-18T10:00:00Z',
        expiresAt: '2026-04-25T10:00:00Z',
        isCurrent: true,
      },
    ];

    let actual: SessionRecord[] | undefined;
    service.getSessions().subscribe((sessions) => {
      actual = sessions;
    });

    const request = httpMock.expectOne('/api/sessions');
    expect(request.request.method).toBe('GET');
    request.flush(expected);

    expect(actual).toEqual(expected);
  });

  it('revokes a specific session by id', () => {
    service.revokeSession('session-123').subscribe();

    const request = httpMock.expectOne('/api/sessions/session-123');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });
});
