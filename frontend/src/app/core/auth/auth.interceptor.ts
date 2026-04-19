import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthRefreshService } from './auth-refresh.service';
import { AuthSessionService } from './auth-session.service';

function addAuthorizationHeader(request: HttpRequest<unknown>, accessToken: string): HttpRequest<unknown> {
  return request.clone({
    setHeaders: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authSession = inject(AuthSessionService);
  const authRefresh = inject(AuthRefreshService);
  const accessToken = authSession.accessToken();
  const url = new URL(request.url, globalThis.location?.origin ?? 'http://localhost');
  const isRefreshRequest = url.pathname === '/api/auth/refresh';
  // Only skip 401-retry for public (unauthenticated) auth endpoints; authenticated auth endpoints
  // like change-password and account deletion should still participate in the token refresh flow.
  const isPublicAuthEndpoint = ['/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/refresh'].includes(url.pathname);

  const authenticatedRequest = accessToken && !isRefreshRequest
    ? addAuthorizationHeader(request, accessToken)
    : request;

  return next(authenticatedRequest).pipe(
    catchError(error => {
      if (
        isPublicAuthEndpoint
        || !accessToken
        || !(error instanceof HttpErrorResponse)
        || error.status !== 401
      ) {
        return throwError(() => error);
      }

      return authRefresh.refreshAccessToken().pipe(
        switchMap(freshToken => next(addAuthorizationHeader(request, freshToken))),
      );
    }),
  );
};
