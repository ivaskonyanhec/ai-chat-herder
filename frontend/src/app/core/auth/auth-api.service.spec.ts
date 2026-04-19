import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthApiService } from './auth-api.service';
import type { AuthResponse } from './auth.models';

describe('AuthApiService', () => {
  let service: AuthApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('refresh() uses the HttpOnly refresh cookie to request a new auth response', () => {
    const response: AuthResponse = {
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
      user: { id: 'u1', username: 'alice', email: 'alice@example.com', avatarUrl: null },
    };
    let actual: AuthResponse | undefined;

    service.refresh().subscribe(result => {
      actual = result;
    });

    const request = http.expectOne('/api/auth/refresh');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.withCredentials).toBe(true);
    request.flush(response);

    expect(actual).toEqual(response);
  });

  it('changePassword() POSTs to /api/auth/change-password with currentPassword and newPassword', () => {
    service.changePassword('old123', 'new456').subscribe();

    const req = http.expectOne('/api/auth/change-password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ currentPassword: 'old123', newPassword: 'new456' });
    req.flush({ message: 'Password changed successfully.' });
  });

  it('deleteAccount() sends DELETE to /api/auth/account with no body', () => {
    service.deleteAccount().subscribe();

    const req = http.expectOne('/api/auth/account');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
