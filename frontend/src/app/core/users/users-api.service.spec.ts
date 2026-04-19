import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { UsersApiService } from './users-api.service';
import type { User } from '../auth/auth.models';

describe('UsersApiService', () => {
  let httpMock: HttpTestingController;
  let service: UsersApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), UsersApiService],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(UsersApiService);
  });

  afterEach(() => httpMock.verify());

  it('fetches current user', () => {
    const expected: User = { id: 'u1', username: 'alice', email: 'alice@firm.com', avatarUrl: null };
    let actual: User | undefined;

    service.getMe().subscribe(u => (actual = u));

    const req = httpMock.expectOne('/api/users/me');
    expect(req.request.method).toBe('GET');
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('patches avatar URL', () => {
    const expected: User = {
      id: 'u1',
      username: 'alice',
      email: 'alice@firm.com',
      avatarUrl: 'https://example.com/avatar.jpg',
    };
    let actual: User | undefined;

    service.patchMe('https://example.com/avatar.jpg').subscribe(u => (actual = u));

    const req = httpMock.expectOne('/api/users/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ avatarUrl: 'https://example.com/avatar.jpg' });
    req.flush(expected);
    expect(actual).toEqual(expected);
  });

  it('fetches user by username', () => {
    service.getByUsername('alice').subscribe();
    const req = httpMock.expectOne('/api/users/by-username/alice');
    expect(req.request.method).toBe('GET');
    req.flush(null);
  });

  it('searches users by query with a limit', () => {
    service.searchUsers('ali', 8).subscribe();
    const req = httpMock.expectOne('/api/users/search?q=ali&limit=8');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
