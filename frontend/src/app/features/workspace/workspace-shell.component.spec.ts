import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { WorkspaceShellComponent } from './workspace-shell.component';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';

describe('WorkspaceShellComponent', () => {
  it('does not clear local auth state when logout fails', () => {
    const authApi = {
      logout: vi.fn().mockReturnValue(throwError(() => new Error('network'))),
    };
    const authSession = {
      user: signal(null).asReadonly(),
      clearSession: vi.fn(),
    };
    const navigateByUrl = vi.fn();

    TestBed.configureTestingModule({
      imports: [WorkspaceShellComponent],
      providers: [
        { provide: Router, useValue: { navigateByUrl } },
        { provide: AuthApiService, useValue: authApi },
        { provide: AuthSessionService, useValue: authSession },
      ],
    });

    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.componentInstance.logout();

    expect(authSession.clearSession).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
