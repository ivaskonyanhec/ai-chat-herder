# Profile Settings Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the four dead interactive sections of the Profile Settings page (password change, account deletion, avatar upload, decorative cleanup) to the existing backend endpoints.

**Architecture:** Add `changePassword()` and `deleteAccount()` to `AuthApiService`. Extend `ProfileSettingsComponent` with signals and handlers for each action. Avatar upload chains `FilesApiService.uploadFile()` → `UsersApiService.patchMe()`. All form inputs switch from one-way `[value]` to two-way `[(ngModel)]` or `(input)` signal updates. Decorative fields with no backend equivalent are made read-only or removed.

**Tech Stack:** Angular 21 Signals, `HttpClient`, Angular `FormsModule`, Vitest + `HttpTestingController`, Playwright UAT.

**Backend endpoints used (all already implemented):**
- `POST /api/auth/change-password` — body `{ currentPassword, newPassword }`
- `DELETE /api/auth/account` — no body, requires JWT
- `PATCH /api/users/me` — body `{ avatarUrl }` (URL string ≤ 2048 chars)
- `POST /api/files/upload` — multipart, returns `AttachmentDto { id, fileName, … }`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `frontend/src/app/core/auth/auth-api.service.ts` | Modify | Add `changePassword()`, `deleteAccount()` |
| `frontend/src/app/core/auth/auth-api.service.spec.ts` | Modify | Tests for two new methods |
| `frontend/src/app/features/profile/profile-settings/profile-settings.ts` | Modify | Add signals + handlers for password, deletion, avatar |
| `frontend/src/app/features/profile/profile-settings/profile-settings.html` | Modify | Wire inputs, add handlers, clean decoratives |
| `frontend/src/app/features/profile/profile-settings/profile-settings.spec.ts` | Replace | Full spec covering all four interactions |
| `e2e/tests/uat/09-profile-settings.uat.spec.ts` | Create | UAT: password change + account deletion browser tests |

---

### Task 1: Extend `AuthApiService` with `changePassword()` and `deleteAccount()`

**Files:**
- Modify: `frontend/src/app/core/auth/auth-api.service.ts`
- Modify: `frontend/src/app/core/auth/auth-api.service.spec.ts`

- [ ] **Step 1: Write failing tests for `changePassword()` and `deleteAccount()`**

Open `frontend/src/app/core/auth/auth-api.service.spec.ts` and add these two tests after the existing `refresh()` test:

```typescript
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
```

- [ ] **Step 2: Run to confirm RED**

```bash
cd frontend && npm test -- --run 2>&1 | grep -E "(FAIL|cannot find|deleteAccount|changePassword)"
```

Expected: compilation errors or test failures — `changePassword` and `deleteAccount` do not exist yet.

- [ ] **Step 3: Add the two methods to `AuthApiService`**

In `frontend/src/app/core/auth/auth-api.service.ts`, add after `logout()`:

```typescript
changePassword(currentPassword: string, newPassword: string): Observable<void> {
  return this.http.post<void>('/api/auth/change-password', { currentPassword, newPassword });
}

deleteAccount(): Observable<void> {
  return this.http.delete<void>('/api/auth/account');
}
```

- [ ] **Step 4: Run tests to confirm GREEN**

```bash
cd frontend && npm test -- --run 2>&1 | tail -8
```

Expected: `3 passed` in `auth-api.service.spec.ts`, overall suite still green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/auth/auth-api.service.ts \
        frontend/src/app/core/auth/auth-api.service.spec.ts
git commit -m "feat(auth): add changePassword and deleteAccount to AuthApiService"
```

---

### Task 2: Wire password-change section in `ProfileSettingsComponent`

**Files:**
- Modify: `frontend/src/app/features/profile/profile-settings/profile-settings.ts`
- Modify: `frontend/src/app/features/profile/profile-settings/profile-settings.spec.ts`
- Modify: `frontend/src/app/features/profile/profile-settings/profile-settings.html`

- [ ] **Step 1: Write failing tests for the password-change handler**

Replace the entire contents of `frontend/src/app/features/profile/profile-settings/profile-settings.spec.ts`:

```typescript
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { ProfileSettingsComponent } from './profile-settings';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { UsersApiService } from '../../../core/users/users-api.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import type { User } from '../../../core/auth/auth.models';

const stubUser: User = { id: 'u1', username: 'alice', email: 'alice@example.com', avatarUrl: null };

function setup() {
  const getMe = vi.fn().mockReturnValue({ subscribe: (o: { next: (u: User) => void }) => { o.next(stubUser); return { unsubscribe: vi.fn() }; } });
  const changePassword = vi.fn();
  const deleteAccount = vi.fn();
  const patchMe = vi.fn();
  const uploadFile = vi.fn();
  const clearSession = vi.fn();

  TestBed.configureTestingModule({
    imports: [ProfileSettingsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthApiService, useValue: { changePassword, deleteAccount } },
      { provide: AuthSessionService, useValue: { user: signal(stubUser), clearSession } },
      { provide: UsersApiService, useValue: { getMe, patchMe } },
      { provide: FilesApiService, useValue: { uploadFile, getFileUrl: (id: string) => `/api/files/${id}` } },
    ],
  });

  const component = TestBed.createComponent(ProfileSettingsComponent).componentInstance;
  return { component, changePassword, deleteAccount, patchMe, uploadFile, clearSession };
}

describe('ProfileSettingsComponent', () => {
  it('creates successfully', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });

  describe('changePassword()', () => {
    it('calls AuthApiService.changePassword with current and new password on success', () => {
      const { component, changePassword } = setup();
      const { of } = require('rxjs');
      changePassword.mockReturnValue(of(undefined));

      component.currentPassword.set('old123');
      component.newPassword.set('new456');
      component.confirmPassword.set('new456');
      component.submitPasswordChange();

      expect(changePassword).toHaveBeenCalledWith('old123', 'new456');
    });

    it('sets passwordError when new passwords do not match', () => {
      const { component, changePassword } = setup();
      component.currentPassword.set('old123');
      component.newPassword.set('new456');
      component.confirmPassword.set('different');
      component.submitPasswordChange();

      expect(changePassword).not.toHaveBeenCalled();
      expect(component.passwordError()).toBeTruthy();
    });

    it('sets passwordError when any field is empty', () => {
      const { component, changePassword } = setup();
      component.submitPasswordChange();

      expect(changePassword).not.toHaveBeenCalled();
      expect(component.passwordError()).toBeTruthy();
    });

    it('clears password fields and sets successMessage on success', () => {
      const { component, changePassword } = setup();
      const { of } = require('rxjs');
      changePassword.mockReturnValue(of(undefined));

      component.currentPassword.set('old');
      component.newPassword.set('newpass1');
      component.confirmPassword.set('newpass1');
      component.submitPasswordChange();

      expect(component.currentPassword()).toBe('');
      expect(component.newPassword()).toBe('');
      expect(component.confirmPassword()).toBe('');
      expect(component.passwordSuccess()).toBeTruthy();
    });

    it('sets passwordError on API failure', () => {
      const { component, changePassword } = setup();
      const { throwError } = require('rxjs');
      changePassword.mockReturnValue(throwError(() => ({ status: 400, error: { error: 'Current password is incorrect.' } })));

      component.currentPassword.set('wrong');
      component.newPassword.set('new123');
      component.confirmPassword.set('new123');
      component.submitPasswordChange();

      expect(component.passwordError()).toBeTruthy();
    });
  });

  describe('deleteAccount()', () => {
    it('calls AuthApiService.deleteAccount and clears session on confirmation', () => {
      const { component, deleteAccount, clearSession } = setup();
      const { of } = require('rxjs');
      deleteAccount.mockReturnValue(of(undefined));

      vi.spyOn(window, 'confirm').mockReturnValue(true);
      component.initiateAccountDeletion();

      expect(deleteAccount).toHaveBeenCalledTimes(1);
      expect(clearSession).toHaveBeenCalledTimes(1);
    });

    it('does not call deleteAccount when user cancels the confirmation', () => {
      const { component, deleteAccount } = setup();
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      component.initiateAccountDeletion();

      expect(deleteAccount).not.toHaveBeenCalled();
    });
  });

  describe('uploadAvatar()', () => {
    it('uploads file then PATCHes avatarUrl with the constructed file URL', () => {
      const { component, uploadFile, patchMe } = setup();
      const { of } = require('rxjs');
      const attachment = { id: 'att-1', fileName: 'avatar.png', contentType: 'image/png', sizeBytes: 1024, comment: null };
      uploadFile.mockReturnValue(of(attachment));
      patchMe.mockReturnValue(of({ ...stubUser, avatarUrl: '/api/files/att-1' }));

      const file = new File([''], 'avatar.png', { type: 'image/png' });
      component.onAvatarFileSelected(file);

      expect(uploadFile).toHaveBeenCalledWith(file);
      expect(patchMe).toHaveBeenCalledWith('/api/files/att-1');
    });

    it('sets avatarError on upload failure', () => {
      const { component, uploadFile } = setup();
      const { throwError } = require('rxjs');
      uploadFile.mockReturnValue(throwError(() => new Error('upload failed')));

      component.onAvatarFileSelected(new File([''], 'avatar.png', { type: 'image/png' }));

      expect(component.avatarError()).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run to confirm RED**

```bash
cd frontend && npm test -- --run 2>&1 | grep -E "(FAIL|cannot find|submitPasswordChange|initiateAccountDeletion|onAvatarFileSelected)"
```

Expected: compilation errors — none of the new signals/methods exist yet.

- [ ] **Step 3: Implement `ProfileSettingsComponent` TS**

Replace `frontend/src/app/features/profile/profile-settings/profile-settings.ts` entirely:

```typescript
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { UsersApiService } from '../../../core/users/users-api.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import type { User } from '../../../core/auth/auth.models';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile-settings.html',
  styleUrl: './profile-settings.scss',
})
export class ProfileSettingsComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly usersApi = inject(UsersApiService);
  private readonly filesApi = inject(FilesApiService);
  private readonly router = inject(Router);

  readonly profile = signal<User | null>(this.authSession.user());
  readonly isLoadingProfile = signal(true);

  // Password change
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly isChangingPassword = signal(false);
  readonly passwordError = signal('');
  readonly passwordSuccess = signal('');

  // Avatar upload
  readonly isUploadingAvatar = signal(false);
  readonly avatarError = signal('');

  // Account deletion
  readonly isDeletingAccount = signal(false);
  readonly deleteError = signal('');

  constructor() {
    this.usersApi.getMe()
      .pipe(finalize(() => this.isLoadingProfile.set(false)))
      .subscribe({
        next: user => this.profile.set(user),
        error: () => { /* fall back to cached session user */ },
      });
  }

  submitPasswordChange(): void {
    const current = this.currentPassword().trim();
    const next = this.newPassword().trim();
    const confirm = this.confirmPassword().trim();

    this.passwordError.set('');
    this.passwordSuccess.set('');

    if (!current || !next || !confirm) {
      this.passwordError.set('All password fields are required.');
      return;
    }
    if (next !== confirm) {
      this.passwordError.set('New passwords do not match.');
      return;
    }
    if (next.length < 8) {
      this.passwordError.set('New password must be at least 8 characters.');
      return;
    }
    if (this.isChangingPassword()) return;

    this.isChangingPassword.set(true);
    this.authApi.changePassword(current, next)
      .pipe(finalize(() => this.isChangingPassword.set(false)))
      .subscribe({
        next: () => {
          this.currentPassword.set('');
          this.newPassword.set('');
          this.confirmPassword.set('');
          this.passwordSuccess.set('Password changed successfully.');
        },
        error: (err) => {
          const msg: string = err?.error?.error ?? '';
          this.passwordError.set(msg || 'Failed to change password. Check your current password.');
        },
      });
  }

  initiateAccountDeletion(): void {
    if (!confirm('Permanently delete your account? This cannot be undone.')) return;
    if (this.isDeletingAccount()) return;

    this.isDeletingAccount.set(true);
    this.deleteError.set('');
    this.authApi.deleteAccount()
      .pipe(finalize(() => this.isDeletingAccount.set(false)))
      .subscribe({
        next: () => {
          this.authSession.clearSession();
          void this.router.navigateByUrl('/auth');
        },
        error: () => {
          this.deleteError.set('Account deletion failed. Please try again.');
        },
      });
  }

  onAvatarSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.onAvatarFileSelected(file);
    (event.target as HTMLInputElement).value = '';
  }

  onAvatarFileSelected(file: File): void {
    if (this.isUploadingAvatar()) return;
    this.isUploadingAvatar.set(true);
    this.avatarError.set('');

    this.filesApi.uploadFile(file).pipe(
      switchMap(attachment => {
        const url = this.filesApi.getFileUrl(attachment.id);
        return this.usersApi.patchMe(url);
      }),
      finalize(() => this.isUploadingAvatar.set(false)),
    ).subscribe({
      next: (updatedUser) => {
        if (updatedUser) this.profile.set(updatedUser as unknown as User);
      },
      error: () => {
        this.avatarError.set('Avatar upload failed. Please try again.');
      },
    });
  }
}
```

Note: `UsersApiService.patchMe()` currently returns `Observable<void>`. It needs to return the updated `User` for the avatar signal to update. Update `users-api.service.ts` to return `Observable<User>`:

In `frontend/src/app/core/users/users-api.service.ts`, change line 14:
```typescript
patchMe(avatarUrl: string): Observable<User> {
  return this.http.patch<User>('/api/users/me', { avatarUrl });
}
```

- [ ] **Step 4: Run tests to confirm GREEN**

```bash
cd frontend && npm test -- --run 2>&1 | tail -8
```

Expected: all profile-settings tests pass, overall suite green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/profile/profile-settings/profile-settings.ts \
        frontend/src/app/features/profile/profile-settings/profile-settings.spec.ts \
        frontend/src/app/core/users/users-api.service.ts
git commit -m "feat(profile): add password change, account deletion, and avatar upload handlers"
```

---

### Task 3: Rewire the profile-settings template

**Files:**
- Modify: `frontend/src/app/features/profile/profile-settings/profile-settings.html`

- [ ] **Step 1: Replace the template**

Replace `frontend/src/app/features/profile/profile-settings/profile-settings.html` entirely with the wired version below.

Key changes vs. the original:
- "Display Name" input: `disabled` (no backend update endpoint for username)
- "Professional Role" field: removed (no backend equivalent)
- Password inputs: `[(ngModel)]` bound to signals; submit calls `submitPasswordChange()`
- Avatar button: `(click)="avatarInput.click()"` + hidden `<input type="file" #avatarInput>`
- "Save Profile" button: replaced by per-section submit buttons
- "Discard Changes" button: resets password fields
- "Initiate Permanent Deletion": `(click)="initiateAccountDeletion()"`
- Theme toggles: kept as decorative (no backend, no handler)
- Footer: hardcoded stats removed
- All `data-testid` attributes added for E2E

```html
<div class="flex flex-col h-full bg-surface-container-low overflow-hidden">
  <div class="flex-1 overflow-y-auto p-6 md:p-10">
    <div class="max-w-5xl mx-auto space-y-8">
      <div class="space-y-1">
        <h2 class="text-3xl font-extrabold tracking-tighter text-on-surface">Account Settings</h2>
        <p class="text-sm text-on-surface-variant font-medium">Manage your profile and security settings.</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Identity Sidebar -->
        <section class="lg:col-span-4 space-y-6">
          <div class="bg-surface-container-lowest rounded-xl p-8 shadow-sm">
            <div class="flex flex-col items-center gap-6">
              <div class="relative">
                <div class="w-32 h-32 rounded-full ring-4 ring-surface-container-high overflow-hidden">
                  <img
                    data-testid="profile-avatar"
                    [src]="profile()?.avatarUrl || 'assets/default-avatar.svg'"
                    alt="Current Avatar"
                    class="w-full h-full object-cover"
                  />
                </div>
                <input type="file" #avatarInput hidden accept="image/*"
                       data-testid="avatar-file-input"
                       (change)="onAvatarSelected($event)" />
                <button
                  class="absolute bottom-1 right-1 bg-primary text-white p-2 rounded-full shadow-lg hover:bg-primary-dim transition-transform active:scale-95 disabled:opacity-50"
                  data-testid="avatar-upload-btn"
                  type="button"
                  [disabled]="isUploadingAvatar()"
                  (click)="avatarInput.click()"
                >
                  <span class="material-symbols-outlined text-sm">
                    {{ isUploadingAvatar() ? 'progress_activity' : 'photo_camera' }}
                  </span>
                </button>
              </div>
              @if (avatarError()) {
                <p class="text-error text-xs text-center" data-testid="avatar-error">{{ avatarError() }}</p>
              }
              <div class="text-center">
                <h3 class="text-lg font-bold text-on-surface tracking-tight">{{ profile()?.username }}</h3>
                <p class="text-xs text-on-surface-variant">{{ profile()?.email }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Main Form Area -->
        <section class="lg:col-span-8 space-y-6">
          <!-- Identity Details (read-only) -->
          <div class="bg-surface-container-lowest rounded-xl p-8 shadow-sm">
            <div class="space-y-6">
              <div class="flex items-center gap-2 border-b border-surface-container pb-4">
                <span class="material-symbols-outlined text-primary">person</span>
                <h3 class="text-sm font-bold uppercase tracking-widest text-on-surface">Identity Details</h3>
              </div>
              <div class="space-y-2">
                <label class="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Display Name
                </label>
                <input
                  class="w-full bg-surface-container-low border-none rounded-lg text-sm py-3 px-4 text-on-surface font-medium outline-none opacity-60 cursor-not-allowed"
                  type="text"
                  disabled
                  [value]="profile()?.username ?? ''"
                  data-testid="profile-username"
                />
                <p class="text-[10px] text-on-surface-variant italic">Username cannot be changed.</p>
              </div>
              <div class="space-y-2">
                <label class="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Email Address
                </label>
                <input
                  class="w-full bg-surface-container-low border-none rounded-lg text-sm py-3 px-4 text-on-surface font-medium outline-none opacity-60 cursor-not-allowed"
                  disabled
                  type="email"
                  [value]="profile()?.email ?? ''"
                  data-testid="profile-email"
                />
              </div>
            </div>
          </div>

          <!-- Change Password -->
          <div class="bg-surface-container-lowest rounded-xl p-8 shadow-sm" data-testid="change-password-section">
            <form class="space-y-6" (ngSubmit)="submitPasswordChange()">
              <div class="flex items-center gap-2 border-b border-surface-container pb-4">
                <span class="material-symbols-outlined text-primary">lock</span>
                <h3 class="text-sm font-bold uppercase tracking-widest text-on-surface">Change Password</h3>
              </div>
              <div class="space-y-2">
                <label class="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Current Password
                </label>
                <input
                  class="w-full bg-surface-container-low border-none rounded-lg text-sm py-3 px-4 focus:ring-1 focus:ring-primary text-on-surface font-medium outline-none"
                  placeholder="••••••••••••"
                  type="password"
                  data-testid="current-password"
                  [ngModel]="currentPassword()"
                  (ngModelChange)="currentPassword.set($event)"
                  name="currentPassword"
                />
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-2">
                  <label class="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                    New Password
                  </label>
                  <input
                    class="w-full bg-surface-container-low border-none rounded-lg text-sm py-3 px-4 focus:ring-1 focus:ring-primary text-on-surface font-medium outline-none"
                    type="password"
                    data-testid="new-password"
                    [ngModel]="newPassword()"
                    (ngModelChange)="newPassword.set($event)"
                    name="newPassword"
                  />
                </div>
                <div class="space-y-2">
                  <label class="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                    Confirm Password
                  </label>
                  <input
                    class="w-full bg-surface-container-low border-none rounded-lg text-sm py-3 px-4 focus:ring-1 focus:ring-primary text-on-surface font-medium outline-none"
                    type="password"
                    data-testid="confirm-password"
                    [ngModel]="confirmPassword()"
                    (ngModelChange)="confirmPassword.set($event)"
                    name="confirmPassword"
                  />
                </div>
              </div>
              @if (passwordError()) {
                <p class="text-error text-xs" data-testid="password-error">{{ passwordError() }}</p>
              }
              @if (passwordSuccess()) {
                <p class="text-status-online text-xs" data-testid="password-success">{{ passwordSuccess() }}</p>
              }
              <div class="flex justify-end gap-4 pt-2">
                <button
                  class="px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
                  type="button"
                  data-testid="discard-password"
                  (click)="currentPassword.set(''); newPassword.set(''); confirmPassword.set(''); passwordError.set(''); passwordSuccess.set('')"
                >Discard</button>
                <button
                  class="px-10 py-2.5 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-primary-dim transition-all shadow-sm disabled:opacity-50"
                  type="submit"
                  data-testid="save-password"
                  [disabled]="isChangingPassword()"
                >{{ isChangingPassword() ? 'Saving…' : 'Change Password' }}</button>
              </div>
            </form>
          </div>

          <!-- Danger Zone -->
          <div class="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm border border-error/20" data-testid="danger-zone">
            <div class="p-6 bg-error/5 flex items-start gap-4">
              <div class="p-2 bg-error-container text-on-error-container rounded-lg shrink-0">
                <span class="material-symbols-outlined">warning</span>
              </div>
              <div class="space-y-2 flex-1">
                <h4 class="text-sm font-bold text-error tracking-tight">Critical Actions: Account Deletion</h4>
                <p class="text-xs text-on-surface-variant leading-relaxed">
                  Permanently removes your account, messages, and files. This cannot be undone.
                </p>
                @if (deleteError()) {
                  <p class="text-error text-xs" data-testid="delete-error">{{ deleteError() }}</p>
                }
                <div class="pt-4">
                  <button
                    class="px-6 py-2.5 border border-error text-error text-[10px] font-black uppercase tracking-widest rounded-md hover:bg-error hover:text-white transition-all duration-200 disabled:opacity-50"
                    type="button"
                    data-testid="delete-account-btn"
                    [disabled]="isDeletingAccount()"
                    (click)="initiateAccountDeletion()"
                  >{{ isDeletingAccount() ? 'Deleting…' : 'Delete Account' }}</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Run tests to confirm GREEN**

```bash
cd frontend && npm test -- --run 2>&1 | tail -8
```

Expected: all tests green.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/features/profile/profile-settings/profile-settings.html
git commit -m "feat(profile): wire template inputs to component signals and handlers"
```

---

### Task 4: UAT E2E tests for Profile Settings

**Files:**
- Create: `e2e/tests/uat/09-profile-settings.uat.spec.ts`

- [ ] **Step 1: Write the UAT spec**

Create `e2e/tests/uat/09-profile-settings.uat.spec.ts`:

```typescript
import { test, expect } from '../../fixtures/test-fixtures';
import { ApiHelpers } from '../../helpers/api.helpers';
import { bootstrapAuthenticatedContext } from '../../helpers/auth.helpers';

test.describe('UAT: Profile Settings page', () => {

  test('settings page loads with username and email pre-filled', async ({ userAPage, userA }) => {
    await userAPage.goto('/app/settings');

    await expect(userAPage.locator('[data-testid="profile-username"]'))
      .toHaveValue(userA.username, { timeout: 10_000 });
    await expect(userAPage.locator('[data-testid="profile-email"]'))
      .toHaveValue(userA.email, { timeout: 5_000 });
  });

  test('change-password section shows validation error when passwords do not match', async ({ userAPage }) => {
    await userAPage.goto('/app/settings');
    await expect(userAPage.locator('[data-testid="current-password"]')).toBeVisible({ timeout: 10_000 });

    await userAPage.fill('[data-testid="current-password"]', 'anything');
    await userAPage.fill('[data-testid="new-password"]', 'newpass123');
    await userAPage.fill('[data-testid="confirm-password"]', 'doesnotmatch');
    await userAPage.click('[data-testid="save-password"]');

    await expect(userAPage.locator('[data-testid="password-error"]')).toBeVisible({ timeout: 3_000 });
    await expect(userAPage.locator('[data-testid="password-error"]'))
      .toContainText('do not match', { ignoreCase: true });
  });

  test('change-password succeeds end-to-end and clears the fields', async ({ browser, api }) => {
    // Register a fresh user so we own their credentials
    const user = await api.register();
    const newPassword = 'NewTest@9876!';

    const ctx = await browser.newContext();
    await bootstrapAuthenticatedContext(ctx, user);
    const page = await ctx.newPage();

    await page.goto('/app/settings');
    await expect(page.locator('[data-testid="current-password"]')).toBeVisible({ timeout: 10_000 });

    await page.fill('[data-testid="current-password"]', user.password);
    await page.fill('[data-testid="new-password"]', newPassword);
    await page.fill('[data-testid="confirm-password"]', newPassword);
    await page.click('[data-testid="save-password"]');

    await expect(page.locator('[data-testid="password-success"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="current-password"]')).toHaveValue('', { timeout: 3_000 });
    await expect(page.locator('[data-testid="new-password"]')).toHaveValue('');
    await expect(page.locator('[data-testid="confirm-password"]')).toHaveValue('');

    // Verify the new password actually works on the backend
    const loginResult = await api.login(user.email, newPassword);
    expect(loginResult.accessToken).toBeTruthy();

    await ctx.close();
  });

  test('discard button clears all password fields', async ({ userAPage }) => {
    await userAPage.goto('/app/settings');
    await expect(userAPage.locator('[data-testid="current-password"]')).toBeVisible({ timeout: 10_000 });

    await userAPage.fill('[data-testid="current-password"]', 'something');
    await userAPage.fill('[data-testid="new-password"]', 'newpass1');
    await userAPage.fill('[data-testid="confirm-password"]', 'newpass1');
    await userAPage.click('[data-testid="discard-password"]');

    await expect(userAPage.locator('[data-testid="current-password"]')).toHaveValue('');
    await expect(userAPage.locator('[data-testid="new-password"]')).toHaveValue('');
    await expect(userAPage.locator('[data-testid="confirm-password"]')).toHaveValue('');
  });

  test('delete account: confirmation cancel does not delete account', async ({ userAPage }) => {
    await userAPage.goto('/app/settings');
    await expect(userAPage.locator('[data-testid="delete-account-btn"]')).toBeVisible({ timeout: 10_000 });

    userAPage.on('dialog', dialog => dialog.dismiss());
    await userAPage.click('[data-testid="delete-account-btn"]');

    // Still on settings page — no redirect
    await expect(userAPage).toHaveURL(/\/app\/settings/, { timeout: 3_000 });
  });

  test('delete account: confirmation accept deletes account and redirects to /auth', async ({ browser, api }) => {
    const user = await api.register();
    const ctx = await browser.newContext();
    await bootstrapAuthenticatedContext(ctx, user);
    const page = await ctx.newPage();

    await page.goto('/app/settings');
    await expect(page.locator('[data-testid="delete-account-btn"]')).toBeVisible({ timeout: 10_000 });

    page.on('dialog', dialog => dialog.accept());
    await page.click('[data-testid="delete-account-btn"]');

    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });

    // Verify the account is gone — login must fail
    const loginCtx = await api.context();
    const res = await loginCtx.post('/api/auth/login', {
      data: { email: user.email, password: user.password, keepSignedIn: false },
    });
    expect(res.status()).toBe(401);
    await loginCtx.dispose();
    await ctx.close();
  });
});
```

- [ ] **Step 2: Run the UAT tests (requires running stack)**

```bash
BASE_URL=http://localhost npm --prefix e2e run test:uat 2>&1 | tail -30
```

Expected: 6 tests pass under `UAT: Profile Settings page`.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/uat/09-profile-settings.uat.spec.ts
git commit -m "test(e2e): UAT for profile settings password change and account deletion"
```

---

## Self-Review Checklist

- [x] **Password change** — signals, validation (empty fields, mismatch, length), API call, success clear, error display — all in Tasks 2 + 3.
- [x] **Account deletion** — confirm guard, API call, session clear, redirect, error display — Tasks 2 + 3.
- [x] **Avatar upload** — file input, `FilesApiService.uploadFile` → `UsersApiService.patchMe(url)`, profile signal update — Tasks 2 + 3.
- [x] **Display Name read-only** — `disabled` input, helper text — Task 3.
- [x] **`UsersApiService.patchMe()` return type** — changed to `Observable<User>` in Task 2 Step 3.
- [x] **`data-testid` coverage** — every interactive element in the new template has a testid — Task 3.
- [x] **UAT** — settings page load, validation error, E2E password change + backend verification, discard, cancel deletion, accept deletion + backend verification — Task 4.
- [x] **No placeholders** — all steps have complete code.
- [x] **Type consistency** — `submitPasswordChange()`, `initiateAccountDeletion()`, `onAvatarFileSelected()`, `onAvatarSelected()` defined in Task 2 and used in Tasks 3–4.
