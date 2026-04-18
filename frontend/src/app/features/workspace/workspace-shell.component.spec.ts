import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { throwError } from 'rxjs';
import { providePrimeNG } from 'primeng/config';
import { WorkspaceShellComponent } from './workspace-shell.component';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';

describe('WorkspaceShellComponent', () => {
  function buildProviders(authApi: object, authSession: object) {
    return [
      provideRouter([]),
      provideNoopAnimations(),
      providePrimeNG({}),
      { provide: AuthApiService, useValue: authApi },
      { provide: AuthSessionService, useValue: authSession },
    ];
  }

  it('renders route-backed navigation links for rooms and sessions', () => {
    const authApi = { logout: vi.fn() };
    const authSession = { user: signal(null).asReadonly(), clearSession: vi.fn() };

    TestBed.configureTestingModule({
      imports: [WorkspaceShellComponent],
      providers: buildProviders(authApi, authSession),
    });

    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.detectChanges();

    const compiled: Element = fixture.nativeElement;
    expect(compiled.querySelector('[data-testid="go-to-rooms"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="go-to-sessions"]')).not.toBeNull();
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('does not clear local auth state when logout fails', () => {
    const authApi = {
      logout: vi.fn().mockReturnValue(throwError(() => new Error('network'))),
    };
    const authSession = {
      user: signal(null).asReadonly(),
      clearSession: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [WorkspaceShellComponent],
      providers: buildProviders(authApi, authSession),
    });

    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.componentInstance.logout();

    expect(authSession.clearSession).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
