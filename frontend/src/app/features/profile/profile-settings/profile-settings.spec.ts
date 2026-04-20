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
import { FilesApiService } from '../../../core/files/files-api.service';
import type { User } from '../../../core/auth/auth.models';

@Component({ standalone: true, template: '' })
class StubAuthComponent {}

const stubUser: User = { id: 'u1', username: 'alice', email: 'alice@example.com', avatarUrl: null };

let mockUsersApi: { getMe: ReturnType<typeof vi.fn>; patchMe: ReturnType<typeof vi.fn> };
let mockAuthSession: { user: ReturnType<typeof signal<User | null>>; clearSession: ReturnType<typeof vi.fn>; updateAvatarUrl: ReturnType<typeof vi.fn> };

function setup() {
  const getMe = vi.fn().mockReturnValue(of(stubUser));
  const changePassword = vi.fn();
  const deleteAccount = vi.fn();
  const uploadFile = vi.fn();
  const patchMe = vi.fn();
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
        useValue: { user: signal<User | null>(stubUser), clearSession, updateAvatarUrl: vi.fn() },
      },
      { provide: UsersApiService, useValue: { getMe, patchMe } },
      { provide: FilesApiService, useValue: { uploadFile, getFileUrl: (id: string) => `/api/files/${id}`, getFileBlob: vi.fn().mockReturnValue(of(new Blob())) } },
    ],
  });

  const component = TestBed.createComponent(ProfileSettingsComponent).componentInstance;
  return { component, changePassword, deleteAccount, clearSession, uploadFile, patchMe };
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

  describe('onAvatarFileSelected()', () => {
    it('uploads the selected image, patches avatarUrl, and updates the profile', () => {
      const { component, uploadFile, patchMe } = setup();
      const file = new File(['avatar-bytes'], 'avatar.png', { type: 'image/png' });
      const updatedUser: User = { ...stubUser, avatarUrl: '/api/files/att-1' };
      uploadFile.mockReturnValue(of({
        id: 'att-1',
        fileName: 'avatar.png',
        contentType: 'image/png',
        sizeBytes: file.size,
        comment: null,
      }));
      patchMe.mockReturnValue(of(updatedUser));

      component.onAvatarFileSelected(file);

      expect(uploadFile).toHaveBeenCalledWith(file);
      expect(patchMe).toHaveBeenCalledWith('/api/files/att-1');
      expect(component.profile()).toEqual(updatedUser);
      expect(component.avatarError()).toBe('');
      expect(component.isUploadingAvatar()).toBe(false);
    });

    it('ignores duplicate selections while an avatar upload is in progress', () => {
      const { component, uploadFile, patchMe } = setup();
      const file = new File(['avatar-bytes'], 'avatar.png', { type: 'image/png' });
      component.isUploadingAvatar.set(true);

      component.onAvatarFileSelected(file);

      expect(uploadFile).not.toHaveBeenCalled();
      expect(patchMe).not.toHaveBeenCalled();
    });

    it('sets avatarError when upload or profile patch fails', () => {
      const { component, uploadFile, patchMe } = setup();
      const file = new File(['avatar-bytes'], 'avatar.png', { type: 'image/png' });
      uploadFile.mockReturnValue(of({
        id: 'att-1',
        fileName: 'avatar.png',
        contentType: 'image/png',
        sizeBytes: file.size,
        comment: null,
      }));
      patchMe.mockReturnValue(throwError(() => ({ status: 500 })));

      component.onAvatarFileSelected(file);

      expect(component.avatarError()).toBe('Avatar upload failed. Please try again.');
      expect(component.isUploadingAvatar()).toBe(false);
    });
  });

  describe('selectIcon', () => {
    beforeEach(() => {
      mockUsersApi = {
        getMe: vi.fn().mockReturnValue(of(stubUser)),
        patchMe: vi.fn().mockReturnValue(of({ ...stubUser, avatarUrl: 'icon:star' })),
      };
      mockAuthSession = {
        user: signal<User | null>(stubUser),
        clearSession: vi.fn(),
        updateAvatarUrl: vi.fn(),
      };

      TestBed.configureTestingModule({
        imports: [ProfileSettingsComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([{ path: 'auth', component: StubAuthComponent }]),
          { provide: AuthApiService, useValue: { changePassword: vi.fn(), deleteAccount: vi.fn() } },
          { provide: AuthSessionService, useValue: mockAuthSession },
          { provide: UsersApiService, useValue: mockUsersApi },
          { provide: FilesApiService, useValue: { uploadFile: vi.fn(), getFileUrl: (id: string) => `/api/files/${id}`, getFileBlob: vi.fn().mockReturnValue(of(new Blob())) } },
        ],
      });
    });

    it('calls patchMe with icon:name URL', () => {
      const fixture = TestBed.createComponent(ProfileSettingsComponent);
      fixture.componentInstance.selectIcon('star');
      expect(mockUsersApi.patchMe).toHaveBeenCalledWith('icon:star');
    });

    it('updates profile signal and closes picker on success', async () => {
      const updated: User = { ...stubUser, avatarUrl: 'icon:star' };
      mockUsersApi.patchMe.mockReturnValue(of(updated));
      const fixture = TestBed.createComponent(ProfileSettingsComponent);
      fixture.componentInstance.showIconPicker.set(true);
      fixture.componentInstance.selectIcon('star');
      await fixture.whenStable();
      expect(fixture.componentInstance.profile()?.avatarUrl).toBe('icon:star');
      expect(fixture.componentInstance.showIconPicker()).toBe(false);
    });

    it('calls authSession.updateAvatarUrl with icon URL on success', async () => {
      const updated: User = { ...stubUser, avatarUrl: 'icon:bolt' };
      mockUsersApi.patchMe.mockReturnValue(of(updated));
      const fixture = TestBed.createComponent(ProfileSettingsComponent);
      fixture.componentInstance.selectIcon('bolt');
      await fixture.whenStable();
      expect(mockAuthSession.updateAvatarUrl).toHaveBeenCalledWith('icon:bolt');
    });

    it('sets avatarError on patchMe failure', async () => {
      mockUsersApi.patchMe.mockReturnValue(throwError(() => new Error('fail')));
      const fixture = TestBed.createComponent(ProfileSettingsComponent);
      fixture.componentInstance.selectIcon('star');
      await fixture.whenStable();
      expect(fixture.componentInstance.avatarError()).toBeTruthy();
    });

    it('does nothing when isUploadingAvatar is true', () => {
      const fixture = TestBed.createComponent(ProfileSettingsComponent);
      fixture.componentInstance.isUploadingAvatar.set(true);
      fixture.componentInstance.selectIcon('star');
      expect(mockUsersApi.patchMe).not.toHaveBeenCalled();
    });
  });
});
