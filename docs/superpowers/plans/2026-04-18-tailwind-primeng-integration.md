# Tailwind v4 + PrimeNG Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate Tailwind CSS v4 utility classes mapped to design tokens, and apply PrimeNG components to interactive elements in the workspace shell, room chat composer, and auth form inputs.

**Architecture:** Tailwind CSS v4 is already installed (`tailwindcss ^4.2.2`) but the `tailwind.config.js` (v3 format) is silently ignored — Tailwind v4 requires CSS-native `@theme inline {}` config. PrimeNG v21 is fully configured (`providePrimeNG` in `app.config.ts`, custom `chatHerderPrimeNgPreset` using design tokens) but no existing component uses PrimeNG components yet. This plan fixes the Tailwind pipeline and wires PrimeNG into the three most interactive components without touching the bespoke auth form styling.

**Tech Stack:** Angular 21 standalone components, Tailwind CSS v4 with `@tailwindcss/postcss`, PrimeNG 21.1.6 with Aura preset, PrimeIcons 7.

---

## File Map

| Action | File |
|--------|------|
| Modify | `frontend/src/tailwind.css` |
| Delete | `frontend/tailwind.config.js` |
| Modify | `frontend/src/app/features/workspace/workspace-shell.component.ts` |
| Modify | `frontend/src/app/features/workspace/workspace-shell.component.html` |
| Modify | `frontend/src/app/features/workspace/workspace-shell.component.scss` |
| Modify | `frontend/src/app/features/workspace/workspace-shell.component.spec.ts` |
| Modify | `frontend/src/app/features/rooms/room-chat/room-chat.ts` |
| Modify | `frontend/src/app/features/rooms/room-chat/room-chat.html` |
| Modify | `frontend/src/app/features/rooms/room-chat/room-chat.scss` |
| Modify | `frontend/src/app/features/auth/authentication-page.component.ts` |
| Modify | `frontend/src/app/features/auth/authentication-page.component.html` |

---

## Task 1: Activate Tailwind v4 CSS theme

The `tailwind.config.js` uses v3 syntax (`module.exports = { theme: { extend: ... } }`). Tailwind v4's `@tailwindcss/postcss` plugin ignores it. Move token mappings to `@theme inline {}` in `tailwind.css` so utilities like `bg-primary`, `text-on-surface`, `shadow-ambient` are generated.

**Files:**
- Modify: `frontend/src/tailwind.css`
- Delete: `frontend/tailwind.config.js`

- [ ] **Step 1: Replace `tailwind.css` content**

```css
/* frontend/src/tailwind.css */
@import 'tailwindcss';
@import 'primeicons/primeicons.css';

/*
 * Map design tokens (from public/tokens.css) to Tailwind v4 utility classes.
 * `@theme inline` means Tailwind inlines the var() reference into generated CSS
 * rather than creating its own CSS custom property — avoids variable name collisions.
 */
@theme inline {
  /* Brand */
  --color-primary: var(--color-primary);
  --color-primary-dim: var(--color-primary-dim);
  --color-primary-container: var(--color-primary-container);
  --color-on-primary: var(--color-on-primary);
  --color-on-primary-container: var(--color-on-primary-container);

  /* Surface */
  --color-surface: var(--color-surface);
  --color-surface-container: var(--color-surface-container);
  --color-surface-container-low: var(--color-surface-container-low);
  --color-surface-container-lowest: var(--color-surface-container-lowest);
  --color-surface-container-high: var(--color-surface-container-high);
  --color-surface-container-highest: var(--color-surface-container-highest);
  --color-surface-variant: var(--color-surface-variant);

  /* Text / outline */
  --color-on-surface: var(--color-on-surface);
  --color-on-surface-variant: var(--color-on-surface-variant);
  --color-outline: var(--color-outline);
  --color-outline-variant: var(--color-outline-variant);
  --color-inverse-surface: var(--color-inverse-surface);

  /* Status / error */
  --color-error: var(--color-error);
  --color-status-online: var(--color-status-online);
  --color-status-afk: var(--color-status-afk);
  --color-status-offline: var(--color-status-offline);

  /* Shadow */
  --shadow-ambient: var(--shadow-ambient);
}
```

- [ ] **Step 2: Delete the inactive v3 config file**

```bash
rm frontend/tailwind.config.js
```

- [ ] **Step 3: Verify build succeeds**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -5
```

Expected output ends with: `Application bundle generation complete.` (no errors).

- [ ] **Step 4: Spot-check a Tailwind utility in a component**

Open `frontend/src/app/features/workspace/workspace-shell.component.html` and temporarily add `class="bg-primary"` to one element, rebuild, then remove it. This confirms the utility generates. (No commit for this step — just verify and revert.)

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/tailwind.css && git rm tailwind.config.js
git commit -m "feat: migrate Tailwind config from v3 tailwind.config.js to v4 @theme inline"
```

---

## Task 2: Apply PrimeNG Button to workspace shell

Replace the raw `<button>` elements for "Create Room" and "Sign out" with PrimeNG `<p-button>`. Use `icon="pi pi-plus"` for Create Room and `severity="secondary"` + `[text]="true"` for Sign out. Remove now-redundant SCSS rules for those buttons.

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.ts:8`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.html:72-76`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.scss:236-275`
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.spec.ts` (add `providePrimeNG`)

- [ ] **Step 1: Add `Button` and `providePrimeNG` imports**

In `frontend/src/app/features/workspace/workspace-shell.component.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';

@Component({
  selector: 'app-workspace-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, Button],
  templateUrl: './workspace-shell.component.html',
  styleUrl: './workspace-shell.component.scss',
})
export class WorkspaceShellComponent {
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly user = this.authSession.user;
  readonly logoutError = signal('');

  logout(): void {
    this.logoutError.set('');

    this.authApi.logout()
      .subscribe({
        next: () => {
          this.authSession.clearSession();
          void this.router.navigateByUrl('/auth');
        },
        error: () => {
          this.logoutError.set('Unable to sign out right now. Try again in a moment.');
        },
      });
  }
}
```

- [ ] **Step 2: Replace sidebar footer buttons in template**

Find this block in `frontend/src/app/features/workspace/workspace-shell.component.html`:
```html
      <button class="workspace-sidebar__create-btn" type="button">
        <span class="material-symbols-outlined">add</span>
        Create Room
      </button>
      <button class="workspace-sidebar__logout-btn" type="button" (click)="logout()">Sign out</button>
```

Replace with:
```html
      <p-button
        label="Create Room"
        icon="pi pi-plus"
        styleClass="w-full justify-center"
      />
      @if (logoutError()) {
        <p class="workspace-sidebar__error">{{ logoutError() }}</p>
      }
      <p-button
        label="Sign out"
        severity="secondary"
        [text]="true"
        styleClass="w-full justify-center text-sm"
        (onClick)="logout()"
      />
```

Note: Move the `@if (logoutError())` block above the Sign out button — it was inside the footer in the original template. Keep `workspace-sidebar__footer` wrapper unchanged.

- [ ] **Step 3: Remove replaced SCSS rules**

In `frontend/src/app/features/workspace/workspace-shell.component.scss`, delete the `&__create-btn` and `&__logout-btn` blocks (lines 236–268 approximately):

```scss
  // DELETE these two blocks:
  &__create-btn {
    width: 100%;
    padding: var(--spacing-3);
    background: var(--color-primary);
    color: var(--color-on-primary);
    font-weight: var(--font-weight-bold);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-2);
    border: none;
    transition: opacity 0.2s;

    &:hover {
      opacity: 0.9;
    }
  }

  &__logout-btn {
    width: 100%;
    padding: var(--spacing-2);
    background: transparent;
    color: var(--color-on-surface-variant);
    font-size: var(--font-size-body-sm);
    border: none;
    text-align: center;
    cursor: pointer;
    
    &:hover {
      color: var(--color-on-surface);
    }
  }
```

Keep `&__error` rule in place.

- [ ] **Step 4: Add `providePrimeNG` to the spec**

In `frontend/src/app/features/workspace/workspace-shell.component.spec.ts`, add the PrimeNG provider to both `configureTestingModule` calls:

```typescript
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
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -10
```

Expected: `16 passed` (or more). Zero failures.

- [ ] **Step 6: Commit**

```bash
git add \
  frontend/src/app/features/workspace/workspace-shell.component.ts \
  frontend/src/app/features/workspace/workspace-shell.component.html \
  frontend/src/app/features/workspace/workspace-shell.component.scss \
  frontend/src/app/features/workspace/workspace-shell.component.spec.ts
git commit -m "feat: replace workspace shell sidebar buttons with PrimeNG Button"
```

---

## Task 3: Apply PrimeNG Textarea + Button to room chat composer

The room chat composer has a raw `<textarea>` and a raw Send `<button>`. Apply the `pTextarea` directive to the textarea and replace the Send button with `<p-button>`. The toolbar icon buttons (attachment, emoji, bold, mention) keep their Material Symbols icons and custom SCSS — they're visual-only and not candidates for PrimeNG.

**Files:**
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.ts`
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.html:89,97`
- Modify: `frontend/src/app/features/rooms/room-chat/room-chat.scss:240-254`

- [ ] **Step 1: Add PrimeNG imports to room-chat.ts**

Full file `frontend/src/app/features/rooms/room-chat/room-chat.ts`:
```typescript
import { Component } from '@angular/core';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';

@Component({
  selector: 'app-room-chat',
  imports: [Button, Textarea],
  templateUrl: './room-chat.html',
  styleUrl: './room-chat.scss',
})
export class RoomChatComponent {}
```

Note: `RoomChatComponent` is a static mockup at this stage — no injectable services yet.

- [ ] **Step 2: Apply directives in template**

In `frontend/src/app/features/rooms/room-chat/room-chat.html`, find the composer section:

```html
        <textarea class="composer__input" placeholder="Message #engineering-room..." rows="3"></textarea>
```

Replace with:
```html
        <textarea
          pTextarea
          class="composer__input"
          placeholder="Message #engineering-room..."
          rows="3"
          autoResize="false"
        ></textarea>
```

Then find the Send button:
```html
          <button class="btn btn--primary" type="button">Send</button>
```

Replace with:
```html
          <p-button label="Send" icon="pi pi-send" iconPos="right" type="button" />
```

- [ ] **Step 3: Remove now-redundant `.btn--primary` and `.btn` SCSS in room-chat.scss**

The `.btn` and `.btn--primary` classes at the bottom of `room-chat.scss` (lines ~502-519) are replaced by PrimeNG's default button styling. Delete them:

```scss
// DELETE:
.btn {
  border: none;
  border-radius: var(--radius-md);
  padding: var(--spacing-2) var(--spacing-6);
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-body-sm);
  cursor: pointer;
  transition: all 0.2s;

  &--primary {
    background: var(--color-primary);
    color: var(--color-on-primary);

    &:hover {
      background: var(--color-primary-dim);
    }
  }
}
```

- [ ] **Step 4: Build and run tests**

```bash
cd frontend && npx ng build --configuration development 2>&1 | tail -5 && npx ng test --watch=false 2>&1 | tail -10
```

Expected: build succeeds; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add \
  frontend/src/app/features/rooms/room-chat/room-chat.ts \
  frontend/src/app/features/rooms/room-chat/room-chat.html \
  frontend/src/app/features/rooms/room-chat/room-chat.scss
git commit -m "feat: apply PrimeNG Textarea and Button to room chat composer"
```

---

## Task 4: Apply PrimeNG InputText to auth form inputs

The auth form inputs (`email`, `password`, `username`) are raw `<input>` elements. Add the `pInputText` attribute directive to each — this is an Angular attribute directive that adds semantic PrimeNG state classes (`.p-filled`, `.p-invalid`) without removing any existing classes. The visual styling stays driven by `.auth-form__control` in the component SCSS.

The mode-toggle buttons and submit button are left as custom elements — they have bespoke animations (`translateY`, `box-shadow` transitions) that are easier to own than to override in PrimeNG.

**Files:**
- Modify: `frontend/src/app/features/auth/authentication-page.component.ts:12`
- Modify: `frontend/src/app/features/auth/authentication-page.component.html` (6 input elements)

- [ ] **Step 1: Add `InputText` import to the component**

In `frontend/src/app/features/auth/authentication-page.component.ts`, change the imports:

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { InputText } from 'primeng/inputtext';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AuthResponse } from '../../core/auth/auth.models';

type AuthMode = 'login' | 'register';

@Component({
  selector: 'app-authentication-page',
  imports: [ReactiveFormsModule, InputText],
  templateUrl: './authentication-page.component.html',
  styleUrl: './authentication-page.component.scss',
})
```

Leave the rest of the class body unchanged.

- [ ] **Step 2: Add `pInputText` to login form inputs**

In `frontend/src/app/features/auth/authentication-page.component.html`, find the login email input:
```html
          <input
            data-testid="login-email"
            class="auth-form__control"
            type="email"
            formControlName="email"
            placeholder="name@workspace.com"
          />
```

Replace with (add `pInputText` attribute):
```html
          <input
            pInputText
            data-testid="login-email"
            class="auth-form__control"
            type="email"
            formControlName="email"
            placeholder="name@workspace.com"
          />
```

Then find the login password input and add `pInputText`:
```html
          <input
            pInputText
            data-testid="login-password"
            class="auth-form__control"
            type="password"
            formControlName="password"
            placeholder="••••••••"
          />
```

- [ ] **Step 3: Add `pInputText` to register form inputs**

Apply the same `pInputText` addition to all three register inputs:

```html
          <!-- username input -->
          <input
            pInputText
            data-testid="register-username"
            class="auth-form__control"
            type="text"
            formControlName="username"
            placeholder="architect_smith"
          />

          <!-- email input -->
          <input
            pInputText
            data-testid="register-email"
            class="auth-form__control"
            type="email"
            formControlName="email"
            placeholder="name@workspace.com"
          />

          <!-- password input -->
          <input
            pInputText
            data-testid="register-password"
            class="auth-form__control"
            type="password"
            formControlName="password"
            placeholder="••••••••"
          />
```

- [ ] **Step 4: Run auth page tests**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -10
```

Expected: all 16+ tests pass, including the `AuthenticationPageComponent` spec.

- [ ] **Step 5: Commit**

```bash
git add \
  frontend/src/app/features/auth/authentication-page.component.ts \
  frontend/src/app/features/auth/authentication-page.component.html
git commit -m "feat: add pInputText directive to auth form inputs"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Tailwind v4 config fix: Task 1 migrates to `@theme inline` and removes `tailwind.config.js`
- ✅ PrimeNG buttons: Task 2 (workspace shell), Task 3 (room chat send)
- ✅ PrimeNG textarea: Task 3 (composer)
- ✅ PrimeNG inputs: Task 4 (auth form)
- ✅ Tests stay green: Task 2 adds `providePrimeNG` to spec, Tasks 3-4 don't change tested behavior

**Placeholder scan:** No TBDs, TODOs, or vague instructions — all steps have exact code.

**Type consistency:** `Button` from `primeng/button`, `Textarea` from `primeng/textarea`, `InputText` from `primeng/inputtext` — consistent across all tasks.

**What's intentionally NOT migrated:**
- Auth mode-toggle buttons: custom pill-segmented-control with bespoke active state
- Auth submit buttons: pixel-precise animation (`translateY`, focus-ring, letter-spacing)
- Composer toolbar icon buttons: Material Symbols icons + hover background only
- All existing SCSS layout (flexbox, grid): already uses design tokens correctly
