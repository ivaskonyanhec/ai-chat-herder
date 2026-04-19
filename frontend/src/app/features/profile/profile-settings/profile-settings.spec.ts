import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ProfileSettingsComponent } from './profile-settings';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { UsersApiService } from '../../../core/users/users-api.service';
import type { User } from '../../../core/auth/auth.models';

@Component({ standalone: true, template: '' })
class StubAuthComponent {}

const stubUser: User = { id: 'u1', username: 'alice', email: 'alice@example.com', avatarUrl: null };

function setup() {
  const getMe = vi.fn().mockReturnValue(of(stubUser));
  const changePassword = vi.fn();
  const deleteAccount = vi.fn();
  const clearSession = vi.fn();

  TestBed.configureTestingModule({
    imports: [ProfileSettingsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: 'auth', component: StubAuthComponent }]),
      { provide: AuthApiService, useValue: { changePassword, deleteAccount } },
      {
        provide: AuthSessionService,
        useValue: { user: signal<User | null>(stubUser), clearSession },
      },
      { provide: UsersApiService, useValue: { getMe } },
    ],
  });

  const component = TestBed.createComponent(ProfileSettingsComponent).componentInstance;
  return { component, changePassword, deleteAccount, clearSession };
}

describe('ProfileSettingsComponent', () => {
  it('creates successfully', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });

  describe('submitPasswordChange()', () => {
    it('sends raw (untrimmed) password values to AuthApiService.changePassword', () => {
      const { component, changePassword } = setup();
      changePassword.mockReturnValue(of(undefined));

      component.currentPassword.set('old123');
      component.newPassword.set('new456789');
      component.confirmPassword.set('new456789');
      component.submitPasswordChange();

      expect(changePassword).toHaveBeenCalledWith('old123', 'new456789');
    });

    it('does not trim leading/trailing spaces from password before sending', () => {
      const { component, changePassword } = setup();
      changePassword.mockReturnValue(of(undefined));

      component.currentPassword.set(' spaced ');
      component.newPassword.set(' newpass1 ');
      component.confirmPassword.set(' newpass1 ');
      component.submitPasswordChange();

      expect(changePassword).toHaveBeenCalledWith(' spaced ', ' newpass1 ');
    });

    it('sets passwordError when new passwords do not match', () => {
      const { component, changePassword } = setup();
      component.currentPassword.set('old123');
      component.newPassword.set('new456789');
      component.confirmPassword.set('different');
      component.submitPasswordChange();

      expect(changePassword).not.toHaveBeenCalled();
      expect(component.passwordError()).toMatch(/do not match/i);
    });

    it('sets passwordError when any field is empty', () => {
      const { component, changePassword } = setup();
      component.submitPasswordChange();

      expect(changePassword).not.toHaveBeenCalled();
      expect(component.passwordError()).toBe('All password fields are required.');
    });

    it('sets passwordError when new password is fewer than 8 characters', () => {
      const { component, changePassword } = setup();
      component.currentPassword.set('old123');
      component.newPassword.set('short');
      component.confirmPassword.set('short');
      component.submitPasswordChange();

      expect(changePassword).not.toHaveBeenCalled();
      expect(component.passwordError()).toMatch(/at least 8/i);
    });

    it('clears fields and sets passwordSuccess on success', () => {
      const { component, changePassword } = setup();
      changePassword.mockReturnValue(of(undefined));

      component.currentPassword.set('oldPass1');
      component.newPassword.set('newpass123');
      component.confirmPassword.set('newpass123');
      component.submitPasswordChange();

      expect(component.currentPassword()).toBe('');
      expect(component.newPassword()).toBe('');
      expect(component.confirmPassword()).toBe('');
      expect(component.passwordSuccess()).toBeTruthy();
    });

    it('sets passwordError on API failure', () => {
      const { component, changePassword } = setup();
      changePassword.mockReturnValue(
        throwError(() => ({ status: 400, error: { error: 'Current password is incorrect.' } })),
      );

      component.currentPassword.set('wrong');
      component.newPassword.set('newpass123');
      component.confirmPassword.set('newpass123');
      component.submitPasswordChange();

      expect(component.passwordError()).toMatch(/incorrect|failed/i);
    });
  });

  describe('initiateAccountDeletion()', () => {
    it('calls deleteAccount, clearSession, and navigates to /auth when user confirms', () => {
      const { component, deleteAccount, clearSession } = setup();
      deleteAccount.mockReturnValue(of(undefined));
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      component.initiateAccountDeletion();

      expect(deleteAccount).toHaveBeenCalledTimes(1);
      expect(clearSession).toHaveBeenCalledTimes(1);
      expect(navSpy).toHaveBeenCalledWith('/auth');
    });

    it('does not call deleteAccount when user cancels the confirmation', () => {
      const { component, deleteAccount } = setup();
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      component.initiateAccountDeletion();

      expect(deleteAccount).not.toHaveBeenCalled();
    });
  });
});
