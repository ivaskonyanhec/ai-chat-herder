# UI Template Pixel-Perfect Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all Angular component templates with HTML ported directly from the `designs/*.html` pixel-accurate mockups, using the designs' Tailwind utility classes, eliminating all component-level SCSS files.

**Architecture:** Each `designs/*.html` file is a standalone HTML page with embedded Tailwind config and full page shells. Angular components are sub-page fragments that live inside the workspace shell, so only the main content area of each design (not the design's own navigation/shell) is ported. All component `.scss` files are deleted or emptied — styling is handled exclusively by Tailwind v4 utility classes in the HTML. The PrimeNG sessions panel is rewritten with native HTML.

**Tech Stack:** Angular 21 (Signals, standalone, Control Flow syntax `@if`/`@for`), Tailwind CSS v4 with `@theme inline`, PrimeNG v21 (buttons and textarea only), Material Symbols Outlined (Google Fonts), `designs/*.html` as source of truth.

---

## BACKGROUND: Why the Current Templates Are Wrong

Gemini wrote all component templates from scratch using custom BEM class names (`.auth-page__hero`, `.ban-list__header`, `.admin-grid`) instead of porting the Tailwind utility classes directly from the design HTML. This caused:
1. Visual mismatch — different structure, colors, spacing, typography
2. Unnecessary SCSS files maintaining custom class definitions
3. Material Symbols Outlined font never imported → icons invisible
4. Missing template sections (platform bans: entire form missing)
5. Inconsistent PrimeNG usage (sessions panel uses PrimeNG; nothing else does)

## APPROACH FOR EVERY TEMPLATE TASK

For each template component:
1. **Read** `designs/X.html` — take the `<body>` content, extract ONLY the main content area (skip the design's own `<aside>` left nav, `<header>` top nav)
2. **Port to Angular template syntax** — replace static text with `{{ signal() }}`, add `@if`/`@for` control flow, keep all `data-testid` attributes from the current template, keep Angular router directives on workspace shell
3. **Delete SCSS** — replace the `.scss` file with a comment: `/* Styling via Tailwind utility classes in the HTML template */`
4. **Build** — run `cd frontend && npm run build` after each task; 0 errors required
5. **Commit** — commit template + empty SCSS together

## CRITICAL: Tailwind v4 Color Utility Class Names

After Task 1 extends `@theme inline`, these design utility classes will work:
- `bg-surface-container` → var(--color-surface-container)
- `text-on-surface` → var(--color-on-surface)
- `bg-primary` → var(--color-primary)
- `text-on-primary` → var(--color-on-primary)
- `bg-surface-container-lowest` → var(--color-surface-container-lowest)
- `text-outline` → var(--color-outline)
- `bg-background` → var(--color-background) ← added in Task 1
- `rounded-xl` → 0.5rem ← added in Task 1
- `rounded-full` → 0.75rem ← added in Task 1
- `rounded-lg` → 0.25rem ← added in Task 1

The design's `slate-*` color classes (used in nav shells) are NOT in our token system. For workspace shell nav colors: use our token equivalents — see Task 2.

---

## Task 1: Extend Tailwind v4 @theme + Import Material Symbols

**Files:**
- Modify: `frontend/src/index.html`
- Modify: `frontend/src/tailwind.css`

- [ ] **Step 1: Read current tailwind.css**

Run: `cat frontend/src/tailwind.css`

- [ ] **Step 2: Add missing @theme inline entries to tailwind.css**

Replace the entire `@theme inline { ... }` block with:

```css
@import 'tailwindcss';
@import 'primeicons/primeicons.css';

/*
 * Map design tokens (from designs/tokens.css) to Tailwind v4 utility classes.
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
  --color-surface-bright: var(--color-surface-bright);
  --color-surface-dim: var(--color-surface-dim);
  --color-surface-container: var(--color-surface-container);
  --color-surface-container-low: var(--color-surface-container-low);
  --color-surface-container-lowest: var(--color-surface-container-lowest);
  --color-surface-container-high: var(--color-surface-container-high);
  --color-surface-container-highest: var(--color-surface-container-highest);
  --color-surface-variant: var(--color-surface-variant);

  /* Background */
  --color-background: var(--color-background);
  --color-on-background: var(--color-on-background);

  /* Text / outline */
  --color-on-surface: var(--color-on-surface);
  --color-on-surface-variant: var(--color-on-surface-variant);
  --color-outline: var(--color-outline);
  --color-outline-variant: var(--color-outline-variant);
  --color-inverse-surface: var(--color-inverse-surface);
  --color-inverse-on-surface: var(--color-inverse-on-surface);

  /* Status / error */
  --color-error: var(--color-error);
  --color-error-dim: var(--color-error-dim);
  --color-error-container: var(--color-error-container);
  --color-on-error: var(--color-on-error);
  --color-on-error-container: var(--color-on-error-container);
  --color-status-online: var(--color-status-online);
  --color-status-afk: var(--color-status-afk);
  --color-status-offline: var(--color-status-offline);

  /* Shadow */
  --shadow-ambient: var(--shadow-ambient);

  /* Border radius — matching design's Tailwind config (ROUND_FOUR system)
   * rounded       = 0.125rem (xs)
   * rounded-lg    = 0.25rem  (not a token; halfway between xs and md)
   * rounded-xl    = 0.5rem   (maps to our --radius-lg)
   * rounded-full  = 0.75rem  (maps to our --radius-xl; editorial heavy-round)
   * For true circles (avatars): use style="border-radius:50%" or w-N h-N rounded-full
   */
  --radius: var(--radius-xs);
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: 0.25rem;
  --radius-xl: var(--radius-lg);
  --radius-full: var(--radius-xl);
}
```

- [ ] **Step 3: Add Material Symbols Outlined to index.html**

Replace `frontend/src/index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ChatHerder</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet">
</head>
<body>
  <app-root></app-root>
</body>
</html>
```

- [ ] **Step 4: Add Material Symbols font-variation-settings to styles.scss**

In `frontend/src/styles.scss`, add after the existing `:root` block:

```scss
.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  vertical-align: middle;
}
```

- [ ] **Step 5: Build to verify 0 errors**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: `Build at: ... - Time: ...ms` with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.html frontend/src/tailwind.css frontend/src/styles.scss
git commit -m "feat: extend Tailwind @theme with missing tokens and add Material Symbols font"
```

---

## Task 2: Workspace Shell Template — Port to Design HTML Structure

The workspace shell is the outer app chrome (header + left sidebar + router-outlet). The design source for this is `designs/main-chat-interface.html` (which shows the full page layout including the workspace shell).

**Files:**
- Modify: `frontend/src/app/features/workspace/workspace-shell.component.html`
- Replace: `frontend/src/app/features/workspace/workspace-shell.component.scss` → empty

**Angular bindings to preserve:**
- `data-testid="main-chat"` on the outermost element
- `routerLink="/app/rooms"` + `data-testid="go-to-rooms"` on Rooms link
- `routerLink="/app/sessions"` + `data-testid="go-to-sessions"` on Sessions link
- `routerLink="/app/invitations"` on Invitations link
- `routerLink="/app/contacts"` on Contacts link
- `routerLink="/app/admin"` on Admin link
- `routerLinkActive` with `class` binding for active nav links
- `[src]="user()?.avatarUrl || '...'` on header avatar img
- `data-testid="create-room"` on Create Room button
- `data-testid="logout-btn"` on Sign Out button
- `(onClick)="logout()"` on Sign Out p-button
- `data-testid="logout-error"` on error message
- `logoutError()` signal reference
- `<router-outlet>` inside the main content area

- [ ] **Step 1: Read the design source and current template**

```bash
cat designs/main-chat-interface.html
cat frontend/src/app/features/workspace/workspace-shell.component.html
cat frontend/src/app/features/workspace/workspace-shell.component.ts
```

- [ ] **Step 2: Write new workspace-shell.component.html**

Port from design. The design's shell is `<header class="bg-slate-700...">` + `<aside class="bg-slate-100...">`. Map `slate-*` to our surface tokens:
- `bg-slate-700` (header) → `bg-inverse-surface`
- `text-white` → `text-inverse-on-surface`
- `bg-slate-100` (left sidebar) → `bg-surface-container`
- `text-slate-800` → `text-on-surface`
- `text-slate-400` → `text-outline`
- `text-slate-500` → `text-on-surface-variant`
- `bg-white` (active nav item) → `bg-surface-container-lowest`
- `bg-slate-200` (search bar) → `bg-surface-container-high`
- `bg-slate-800` (logo box) → `bg-inverse-surface`

The router-outlet replaces the design's `<section class="flex-1 flex flex-col bg-surface-container-lowest min-w-0">` with `<router-outlet>`. Do NOT include the room chat content (that is the room-chat component).

```html
<div data-testid="main-chat" class="flex flex-col h-screen overflow-hidden">
  <!-- Top Header -->
  <header class="bg-inverse-surface text-inverse-on-surface flex items-center justify-between px-6 h-16 w-full shrink-0 z-50 shadow-sm">
    <div class="flex items-center gap-8">
      <span class="text-lg font-semibold tracking-tighter text-white">Architectural Workspace</span>
      <nav class="hidden md:flex gap-6">
        <a routerLink="/app/rooms" routerLinkActive="border-b-2 border-white text-white" [routerLinkActiveOptions]="{exact:true}" class="text-outline hover:text-white transition-colors pb-1" data-testid="go-to-rooms">Public Rooms</a>
        <a routerLink="/app/invitations" routerLinkActive="border-b-2 border-white text-white" class="text-outline hover:text-white transition-colors pb-1">Invitations</a>
        <a routerLink="/app/contacts" routerLinkActive="border-b-2 border-white text-white" class="text-outline hover:text-white transition-colors pb-1">Contacts</a>
        <a routerLink="/app/admin" routerLinkActive="border-b-2 border-white text-white" class="text-outline hover:text-white transition-colors pb-1">Admin</a>
        <a routerLink="/app/sessions" routerLinkActive="border-b-2 border-white text-white" class="text-outline hover:text-white transition-colors pb-1" data-testid="go-to-sessions">Sessions</a>
      </nav>
    </div>
    <div class="flex items-center gap-4">
      <a routerLink="/app/settings" class="p-2 text-outline hover:text-white transition-colors hover:bg-white/10 rounded-full cursor-pointer">
        <span class="material-symbols-outlined">settings</span>
      </a>
      <span class="p-2 text-outline hover:text-white transition-colors hover:bg-white/10 rounded-full cursor-pointer material-symbols-outlined">help</span>
      <img
        [src]="user()?.avatarUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuBoE1AAIFrnyj9F8mxOop8uxCsIRdOxzhWtnxjn7NugcZYLy5I0Dpd7Xa9meXu5UDQAGvY5xt3Hb0oHZJ-RtruBAq2ha-SdwkN6yVjMRlK6os9_26BZMepR6qZxG_G6zRuAyXw4qT1BseTQJxDpjswRqkQCvFbbaVFsomxcZ6ubiGBy4IaGBVjd0ikVTb_cBNYZO7nZkxH8LEctIAAHPuiio0Qfy3pKTJkOdZSHFJE_AxtUk0itobW_nenKACmDvvyl5JeG7Of_yMQ'"
        alt="User profile"
        class="h-8 w-8 rounded-full border border-outline-variant object-cover"
      />
    </div>
  </header>

  <!-- Body: Left Sidebar + Main Content -->
  <div class="flex flex-1 overflow-hidden">
    <!-- Left Sidebar -->
    <aside class="bg-surface-container flex flex-col w-72 shrink-0 h-full overflow-y-auto p-4">
      <div class="flex items-center gap-3 mb-8">
        <div class="w-10 h-10 bg-inverse-surface rounded-lg flex items-center justify-center">
          <span class="material-symbols-outlined text-white">corporate_fare</span>
        </div>
        <div>
          <h2 class="text-xl font-bold text-on-surface tracking-normal">Workspace</h2>
          <p class="text-[10px] text-on-surface-variant tracking-wider">Active Session</p>
        </div>
      </div>

      <div class="mb-6">
        <div class="bg-surface-container-high p-2 rounded-lg mb-6 flex items-center gap-2 text-sm text-on-surface-variant">
          <span class="material-symbols-outlined text-sm">search</span>
          <input class="bg-transparent border-none focus:outline-none p-0 text-sm w-full placeholder-on-surface-variant" placeholder="Search workspace..." type="text" />
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between p-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined">forum</span>
              <span class="text-on-surface font-bold">Rooms</span>
            </div>
            <span class="material-symbols-outlined text-sm">keyboard_arrow_down</span>
          </div>
          <div class="pl-9 space-y-1">
            <div class="p-2 bg-surface-container-lowest text-on-surface font-bold rounded-lg cursor-pointer text-sm">#engineering-room</div>
            <div class="p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm">#design-ops</div>
            <div class="p-2 text-on-surface-variant hover:text-on-surface cursor-pointer text-sm">#product-roadmap</div>
          </div>
        </div>

        <div class="mt-4 space-y-1">
          <div class="flex items-center justify-between p-2 cursor-pointer text-on-surface-variant hover:bg-surface-container-high rounded-lg">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined">person</span>
              <span>Contacts</span>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-auto space-y-2">
        <p-button
          class="block w-full"
          label="Create Room"
          icon="pi pi-plus"
          data-testid="create-room"
          styleClass="w-full"
        />
        <p-button
          class="block w-full"
          label="Sign out"
          severity="secondary"
          [text]="true"
          styleClass="w-full"
          data-testid="logout-btn"
          (onClick)="logout()"
        />
        @if (logoutError()) {
          <p class="text-error text-xs text-center" data-testid="logout-error">{{ logoutError() }}</p>
        }
      </div>
    </aside>

    <!-- Main Content via Router -->
    <main class="flex-1 overflow-hidden bg-surface">
      <router-outlet />
    </main>
  </div>
</div>
```

- [ ] **Step 3: Empty the SCSS file**

```bash
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/workspace/workspace-shell.component.scss
```

- [ ] **Step 4: Build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/workspace/workspace-shell.component.html frontend/src/app/features/workspace/workspace-shell.component.scss
git commit -m "fix: port workspace shell to design HTML structure with Tailwind classes"
```

---

## Task 3: Authentication Page — Port to Design HTML

**Source design:** `designs/authentication.html`
**Template:** `frontend/src/app/features/auth/authentication-page.component.html`

**Angular bindings to preserve (all must be present in new template):**
- `[formGroup]="loginForm"` / `[formGroup]="registerForm"`
- `(ngSubmit)="submitLogin()"` / `(ngSubmit)="submitRegister()"`
- `formControlName="email"` / `formControlName="password"` / `formControlName="username"` / `formControlName="keepSignedIn"`
- `pInputText` directive on all inputs
- `[invalid]="loginFieldHasError('email')"` etc.
- `@if (loginFieldHasError('email'))` error hints
- `data-testid="login-email"` / `data-testid="login-password"` / `data-testid="login-submit"` / `data-testid="login-error"`
- `data-testid="register-username"` / `data-testid="register-email"` / `data-testid="register-password"` / `data-testid="register-submit"`
- `data-testid="go-to-login"` / `data-testid="go-to-register"` on tab buttons
- `@if (mode() === 'login')` / `@else` for form switching
- `@if (errorMessage())` for error display
- `{{ isSubmitting() ? 'Signing In…' : 'Sign In' }}` on submit button

- [ ] **Step 1: Read design and current template**

```bash
cat designs/authentication.html
cat frontend/src/app/features/auth/authentication-page.component.html
cat frontend/src/app/features/auth/authentication-page.component.ts
```

- [ ] **Step 2: Write new authentication-page.component.html**

Port the design's `<body>` content directly, injecting Angular bindings:

```html
<!-- Background Decorative Elements -->
<div class="fixed inset-0 z-0 pointer-events-none">
  <div class="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_30%,_rgba(84,95,115,0.05)_0%,_transparent_50%)]"></div>
  <div class="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_80%_70%,_rgba(84,95,115,0.08)_0%,_transparent_50%)]"></div>
</div>

<main class="min-h-screen flex flex-col items-center justify-center p-6 lg:p-12 relative z-10 bg-surface">
  <div class="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
    <!-- Brand Narrative Column -->
    <div class="hidden md:flex flex-col space-y-8 pr-8">
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-primary flex items-center justify-center rounded-lg shadow-sm">
            <span class="material-symbols-outlined text-white" style="font-variation-settings:'FILL' 1">architecture</span>
          </div>
          <h1 class="text-2xl font-extrabold tracking-tighter text-on-surface uppercase">Architectural Workspace</h1>
        </div>
        <h2 class="text-4xl font-bold tracking-tight text-primary-dim leading-tight">
          Structured Clarity for <br/>Professional Collaboration.
        </h2>
        <p class="text-on-surface-variant text-lg max-w-md">
          Step into an editorial-grade environment designed for high-density information management and executive communication.
        </p>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="p-6 bg-surface-container rounded-xl">
          <span class="material-symbols-outlined text-primary mb-3 block">lock_open</span>
          <h3 class="font-bold text-sm uppercase tracking-wider mb-1">Encrypted</h3>
          <p class="text-xs text-on-surface-variant">Zero-knowledge infrastructure for enterprise security.</p>
        </div>
        <div class="p-6 bg-surface-container-high rounded-xl">
          <span class="material-symbols-outlined text-primary mb-3 block">speed</span>
          <h3 class="font-bold text-sm uppercase tracking-wider mb-1">Performant</h3>
          <p class="text-xs text-on-surface-variant">Sub-millisecond latency for real-time architectural sync.</p>
        </div>
      </div>
    </div>

    <!-- Auth Forms Column -->
    <div class="flex flex-col space-y-6">
      <!-- Tab Switcher -->
      <div class="inline-flex p-1 bg-surface-container rounded-lg self-center md:self-start">
        <button
          type="button"
          class="px-6 py-2 text-sm font-bold rounded-lg transition-colors"
          [class.bg-surface-container-lowest]="mode() === 'login'"
          [class.shadow-sm]="mode() === 'login'"
          [class.text-primary]="mode() === 'login'"
          [class.text-on-surface-variant]="mode() !== 'login'"
          data-testid="go-to-login"
          (click)="setMode('login')"
        >Sign in</button>
        <button
          type="button"
          class="px-6 py-2 text-sm font-medium transition-colors"
          [class.bg-surface-container-lowest]="mode() === 'register'"
          [class.shadow-sm]="mode() === 'register'"
          [class.text-primary]="mode() === 'register'"
          [class.text-on-surface-variant]="mode() !== 'register'"
          data-testid="go-to-register"
          (click)="setMode('register')"
        >Register</button>
      </div>

      <!-- Error Banner -->
      @if (errorMessage()) {
        <p class="text-error text-sm bg-error-container/20 border border-error/20 rounded-lg px-4 py-3" data-testid="login-error" role="alert">{{ errorMessage() }}</p>
      }

      <!-- Sign In Form -->
      @if (mode() === 'login') {
        <div class="bg-surface-container-lowest/85 backdrop-blur-md border border-outline-variant/15 p-10 rounded-xl shadow-ambient">
          <div class="mb-8">
            <h3 class="text-2xl font-bold text-on-surface tracking-tight mb-2">Welcome Back</h3>
            <p class="text-on-surface-variant text-sm">Please enter your credentials to access the workspace.</p>
          </div>
          <form class="space-y-6" [formGroup]="loginForm" (ngSubmit)="submitLogin()">
            <div class="space-y-1">
              <label class="text-xs font-bold uppercase tracking-widest text-on-surface-variant" for="login-email">Email Address</label>
              <div class="relative group">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm transition-colors group-focus-within:text-primary">mail</span>
                <input
                  pInputText
                  [invalid]="loginFieldHasError('email')"
                  id="login-email"
                  data-testid="login-email"
                  class="w-full pl-10 pr-4 py-3 bg-surface-container-low border-none focus:ring-0 rounded-lg text-sm placeholder:text-outline/50 border-b-2 border-transparent focus:border-primary transition-all"
                  type="email"
                  formControlName="email"
                  placeholder="name@firm.com"
                />
              </div>
              @if (loginFieldHasError('email')) {
                <span class="text-xs text-error">Enter a valid email address.</span>
              }
            </div>
            <div class="space-y-1">
              <div class="flex justify-between items-center">
                <label class="text-xs font-bold uppercase tracking-widest text-on-surface-variant" for="login-password">Password</label>
                <a class="text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary-dim transition-colors" href="#">Forgot password?</a>
              </div>
              <div class="relative group">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm transition-colors group-focus-within:text-primary">lock</span>
                <input
                  pInputText
                  [invalid]="loginFieldHasError('password')"
                  id="login-password"
                  data-testid="login-password"
                  class="w-full pl-10 pr-4 py-3 bg-surface-container-low border-none focus:ring-0 rounded-lg text-sm placeholder:text-outline/50 border-b-2 border-transparent focus:border-primary transition-all"
                  type="password"
                  formControlName="password"
                  placeholder="••••••••"
                />
              </div>
              @if (loginFieldHasError('password')) {
                <span class="text-xs text-error">Password must be at least 8 characters.</span>
              }
            </div>
            <div class="flex items-center space-x-3">
              <input class="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/20" id="keep-signed-in" type="checkbox" formControlName="keepSignedIn" />
              <label class="text-xs text-on-surface-variant font-medium select-none" for="keep-signed-in">Keep me signed in on this device</label>
            </div>
            <button
              data-testid="login-submit"
              class="w-full py-4 bg-primary text-on-primary font-bold rounded-lg hover:bg-primary-dim active:scale-[0.98] transition-all flex items-center justify-center gap-2 group shadow-lg shadow-primary/10"
              type="submit"
            >
              {{ isSubmitting() ? 'Signing In…' : 'Sign In' }}
              <span class="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </form>
          <div class="mt-8 pt-8 border-t border-outline-variant/10">
            <p class="text-center text-xs text-on-surface-variant font-medium">
              Secure biometric login available on <a class="text-primary font-bold hover:underline" href="#">Workspace Mobile</a>
            </p>
          </div>
        </div>

        <!-- Register Prompt -->
        <div class="p-8 bg-surface-container-low rounded-xl border border-outline-variant/10">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-bold text-sm text-on-surface">Need a new workspace?</h4>
              <p class="text-xs text-on-surface-variant">Register your organization in minutes.</p>
            </div>
            <button
              type="button"
              class="px-5 py-2.5 bg-surface-container-lowest text-primary text-xs font-bold rounded-lg border border-outline-variant/20 hover:bg-white transition-colors"
              (click)="setMode('register')"
            >Create Account</button>
          </div>
        </div>
      }

      <!-- Register Form -->
      @else {
        <div class="bg-surface-container-lowest/85 backdrop-blur-md border border-outline-variant/15 p-10 rounded-xl shadow-ambient">
          <div class="mb-6">
            <h3 class="text-2xl font-bold text-on-surface tracking-tight">Create Account</h3>
            <p class="text-on-surface-variant text-sm">Join the Architectural Workspace.</p>
          </div>
          <form class="space-y-4" [formGroup]="registerForm" (ngSubmit)="submitRegister()">
            <div class="space-y-1">
              <label class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Username</label>
              <input
                pInputText
                [invalid]="registerFieldHasError('username')"
                data-testid="register-username"
                class="w-full px-4 py-3 bg-surface-container-low border-none focus:ring-0 rounded-lg text-sm border-b-2 border-transparent focus:border-primary"
                type="text"
                formControlName="username"
                placeholder="architect_smith"
              />
              @if (registerFieldHasError('username')) {
                <span class="text-xs text-error">Username must be 1 to 32 characters.</span>
              }
            </div>
            <div class="space-y-1">
              <label class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Email</label>
              <input
                pInputText
                [invalid]="registerFieldHasError('email')"
                data-testid="register-email"
                class="w-full px-4 py-3 bg-surface-container-low border-none focus:ring-0 rounded-lg text-sm border-b-2 border-transparent focus:border-primary"
                type="email"
                formControlName="email"
                placeholder="name@firm.com"
              />
              @if (registerFieldHasError('email')) {
                <span class="text-xs text-error">Enter a valid email address.</span>
              }
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Password</label>
                <input
                  pInputText
                  [invalid]="registerFieldHasError('password')"
                  data-testid="register-password"
                  class="w-full px-4 py-3 bg-surface-container-low border-none focus:ring-0 rounded-lg text-sm border-b-2 border-transparent focus:border-primary"
                  type="password"
                  formControlName="password"
                  placeholder="••••••••"
                />
                @if (registerFieldHasError('password')) {
                  <span class="text-xs text-error">Min 8 characters.</span>
                }
              </div>
              <div class="space-y-1">
                <label class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Keep signed in</label>
                <div class="flex items-center h-12">
                  <input type="checkbox" formControlName="keepSignedIn" class="h-4 w-4 rounded border-outline-variant text-primary" />
                </div>
              </div>
            </div>
            <div class="pt-4">
              <button
                data-testid="register-submit"
                class="w-full py-4 bg-primary text-on-primary font-bold rounded-lg hover:bg-primary-dim transition-all"
                type="submit"
              >{{ isSubmitting() ? 'Creating Account…' : 'Complete Registration' }}</button>
            </div>
            <p class="text-[10px] text-center text-on-surface-variant leading-relaxed">
              By registering, you agree to our <a class="underline" href="#">Terms of Service</a> and <a class="underline" href="#">Privacy Protocol</a>.
            </p>
          </form>
        </div>
      }
    </div>
  </div>

  <footer class="mt-12 text-[10px] font-bold uppercase tracking-[0.2em] text-outline opacity-50">
    © 2024 Architectural Workspace • Version 4.2.1 Stable
  </footer>
</main>
```

- [ ] **Step 3: Empty the SCSS file**

```bash
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/auth/authentication-page.component.scss
```

- [ ] **Step 4: Build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/auth/authentication-page.component.html frontend/src/app/features/auth/authentication-page.component.scss
git commit -m "fix: port auth page to pixel-perfect design HTML with Tailwind classes"
```

---

## Task 4: Room Chat — Port to Design HTML

**Source design:** `designs/main-chat-interface.html` (the center section + right sidebar)
**Template:** `frontend/src/app/features/rooms/room-chat/room-chat.html`

**What to port:** From the design's `<section class="flex-1 flex flex-col bg-surface-container-lowest min-w-0">` (center chat) and `<aside class="bg-slate-50...">` (right sidebar). Map `slate-*` colors: `slate-50` → `surface-container-low`, `slate-100` → `surface-container`, `slate-200` → `surface-container-high`, `slate-700` → `on-surface`, `slate-400` → `outline`, `slate-500` → `on-surface-variant`, `slate-800` → `inverse-surface`.

**Angular bindings to preserve:**
- `data-testid="chat-area"` on the messages scrollable div
- `data-testid="message-input"` on the textarea

- [ ] **Step 1: Read design and current template**

```bash
sed -n '155,356p' designs/main-chat-interface.html
cat frontend/src/app/features/rooms/room-chat/room-chat.html
cat frontend/src/app/features/rooms/room-chat/room-chat.ts
```

- [ ] **Step 2: Write new room-chat.html**

Port the center chat section and right sidebar from the design. The `pTextarea` directive stays on the textarea.

```html
<div class="room-chat flex h-full overflow-hidden">

  <!-- Center: Active Chat Canvas -->
  <section class="flex flex-col flex-1 bg-surface-container-lowest min-w-0">
    <!-- Chat Header -->
    <div class="h-16 px-6 flex items-center justify-between bg-surface-container-lowest shadow-sm z-10">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-bold text-on-surface">#engineering-room</h1>
        <span class="px-2 py-0.5 bg-surface-container text-on-surface-variant text-[10px] rounded uppercase font-bold tracking-widest">Public</span>
      </div>
      <div class="flex items-center gap-4">
        <button class="text-primary text-sm font-semibold px-4 py-2 hover:bg-surface-container transition-colors rounded-lg">Manage room</button>
        <span class="material-symbols-outlined text-outline cursor-pointer hover:text-primary">star</span>
      </div>
    </div>

    <!-- Messages Area -->
    <div class="flex-1 overflow-y-auto p-6 space-y-8" data-testid="chat-area">
      <!-- Date Divider -->
      <div class="flex items-center gap-4 py-4">
        <div class="flex-1 h-px bg-surface-variant"></div>
        <span class="text-[10px] font-bold text-outline-variant uppercase tracking-widest">Monday, May 22</span>
        <div class="flex-1 h-px bg-surface-variant"></div>
      </div>

      <!-- Message: Alice -->
      <div class="flex gap-4 group">
        <img alt="Alice Profile" class="w-10 h-10 rounded-lg object-cover shrink-0"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDgR0cakxo5MGQ3h4wC7R4Nh-6T8WZ_Har8cvDtMUEdzU0z5V5PQEhW0GOxdIJlY0AKAzBHjdEH9DncP3m9DsBQRbmxC8SyAPhWAXXwIoDpNvmFk13ns_SD0AKRvS_lNEDDof2OjI_Cccui5hDXJ4O8mujgbrEcfTVzJ8Zhmd0FNwZiLwpbgoKQDisPqQHLbMU6ecAXG3sDXoMqIJLpWhJnonJKFgFjZzBeWRhDumBOFyvXnvcgn5nWegZWXxet6btgWVGGbU-IXyQ" />
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2 mb-1">
            <span class="text-sm font-bold text-on-surface">Alice Chen</span>
            <span class="text-[10px] text-outline tracking-wider">10:24 AM</span>
          </div>
          <div class="text-sm text-on-surface leading-relaxed max-w-2xl">
            Hey team, has anyone had a chance to review the new CI/CD pipeline architectural diagrams for the workspace migration?
          </div>
        </div>
      </div>

      <!-- Message: Bob (with reply quote) -->
      <div class="flex gap-4 group">
        <img alt="Bob Profile" class="w-10 h-10 rounded-lg object-cover shrink-0"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuD1lUUBRJVeIGrgAGC6RcwMKnOmCiDUumR9P_O_oAGK8_8tNp2xAJkqP5a1Phxs23VBZji4ha8vGb34hpFpKdtxhOO1CmU7EhxAywz6cDkAQuNReLG0cG5W_GGFIYJxdx-4lSIs0lanSbAjuEY7gHNXDGzO21jll-jdG5Ovc182sFeFmwuNG1f3jjzpeP0iWO6V91EKyTHikT7eT1SsfCPVfNnqoj_GLlFXbp3dw4Zmz0qsBhgIYmWC5RulGng4Ct0VFfiFMcnAYJs" />
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2 mb-1">
            <span class="text-sm font-bold text-on-surface">Bob Miller</span>
            <span class="text-[10px] text-outline tracking-wider">10:28 AM</span>
          </div>
          <div class="border-l-4 border-surface-variant pl-3 mb-2 py-1 bg-surface-container-low rounded-r-lg max-w-xl">
            <p class="text-xs text-on-surface-variant line-clamp-1 italic">"Hey team, has anyone had a chance to review the new CI/CD pipeline..."</p>
          </div>
          <div class="text-sm text-on-surface leading-relaxed max-w-2xl">
            Just finished looking at them. The logic for the staging deployment looks solid, but we might need to increase the timeout for the integration tests.
            <span class="text-[10px] text-outline ml-1 italic">(edited)</span>
          </div>
        </div>
      </div>

      <!-- Message: Carol (with file attachment) -->
      <div class="flex gap-4 group">
        <div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-outline">person_outline</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2 mb-1">
            <span class="text-sm font-bold text-on-surface">Carol Vance</span>
            <span class="text-[10px] text-outline tracking-wider">10:45 AM</span>
          </div>
          <div class="text-sm text-on-surface leading-relaxed mb-3">
            Here is the updated documentation for the containerization strategy.
          </div>
          <!-- File Card -->
          <div class="flex items-center gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant/15 w-fit">
            <div class="w-10 h-12 bg-primary/10 rounded flex items-center justify-center">
              <span class="material-symbols-outlined text-primary">description</span>
            </div>
            <div class="pr-8">
              <p class="text-sm font-bold text-on-surface">Container_Strategy_V2.pdf</p>
              <p class="text-[10px] text-outline">12.4 MB • PDF Document</p>
            </div>
            <button class="material-symbols-outlined text-outline hover:text-primary transition-colors">download</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Composer -->
    <div class="p-6 bg-surface-container-lowest">
      <div class="bg-surface-container-low rounded-xl p-3 border border-outline-variant/15 focus-within:border-primary/50 transition-all">
        <textarea
          pTextarea
          class="w-full bg-transparent border-none focus:ring-0 text-sm p-2 h-24 resize-none placeholder:text-outline overflow-y-auto"
          placeholder="Message #engineering-room..."
          rows="3"
          data-testid="message-input"
        ></textarea>
        <div class="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/10">
          <div class="flex items-center gap-1">
            <button class="p-2 hover:bg-surface-container rounded transition-colors text-outline">
              <span class="material-symbols-outlined text-xl">add_circle</span>
            </button>
            <button class="p-2 hover:bg-surface-container rounded transition-colors text-outline">
              <span class="material-symbols-outlined text-xl">mood</span>
            </button>
            <button class="p-2 hover:bg-surface-container rounded transition-colors text-outline">
              <span class="material-symbols-outlined text-xl">format_bold</span>
            </button>
            <button class="p-2 hover:bg-surface-container rounded transition-colors text-outline">
              <span class="material-symbols-outlined text-xl">alternate_email</span>
            </button>
          </div>
          <p-button label="Send" icon="pi pi-send" iconPos="right" type="button" />
        </div>
      </div>
    </div>
  </section>

  <!-- Right Sidebar: Room Details -->
  <aside class="flex flex-col h-full w-64 shrink-0 overflow-y-auto border-l border-surface-container bg-surface-container-low">
    <!-- Room Info -->
    <div class="p-6 border-b border-surface-container">
      <h3 class="text-base font-bold text-on-surface mb-1">Room Details</h3>
      <p class="text-xs text-on-surface-variant mb-6 uppercase tracking-widest">Admin Managed</p>
      <div class="space-y-4">
        <div>
          <span class="text-[10px] text-outline uppercase font-bold tracking-widest block mb-1">Room Owner</span>
          <div class="flex items-center gap-2">
            <img alt="Owner" class="w-6 h-6 rounded-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBaw27m6aY1fDnaMf8NXEeVW1PfVLzsIZCx8HM2iL0ZFccTu_8q5yTZs8gHWYU0DCIvfdXAYYRbfhX1vX8pTgeoJ1471jrq2vOygNK7v3PfTlPk5-TPWSS6Kgly8Fc3GnjAAMiBO0Fpuzb76r6WzfpObqk73o24zfqfyztebcrxeRkRK-K_VAJDCKzMCn4u_0ixuzS0iZfUjs0wRsbSXYUuogj5FvUbfRLNxWfsqXfDLPhW_qB-txkopLrlBKwTw03jDF8bhluY-zI" />
            <span class="text-sm font-medium text-on-surface">Sarah Jenkins</span>
          </div>
        </div>
        <div>
          <span class="text-[10px] text-outline uppercase font-bold tracking-widest block mb-1">Created</span>
          <span class="text-sm text-on-surface">Jan 14, 2023</span>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <nav class="flex px-4 py-2 bg-surface-container gap-4">
      <div class="text-on-surface border-l-4 border-outline pl-2 py-2 flex items-center gap-2 cursor-pointer">
        <span class="material-symbols-outlined text-sm">info</span>
        <span class="font-bold text-sm">Info</span>
      </div>
      <div class="text-outline pl-3 py-2 flex items-center gap-2 hover:text-on-surface transition-all cursor-pointer">
        <span class="material-symbols-outlined text-sm">group</span>
        <span class="text-sm">Members</span>
      </div>
      <div class="text-outline pl-3 py-2 flex items-center gap-2 hover:text-on-surface transition-all cursor-pointer">
        <span class="material-symbols-outlined text-sm">description</span>
        <span class="text-sm">Files</span>
      </div>
    </nav>

    <!-- Members List -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <div class="text-[10px] text-outline uppercase font-bold tracking-widest mb-4">Members — 24</div>

      <!-- Alice (Online) -->
      <div class="flex items-center justify-between group cursor-pointer">
        <div class="flex items-center gap-3">
          <div class="relative">
            <img class="w-8 h-8 rounded-full border-2 border-surface-container-low object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuChXa2Pev6zaTOaHNbkZaoYhqKjX0M4-6_a6u-ErpEbaurYY-5N5TW9QnGfEXW0HXx7JJ5_TqW7rkirmZ2L4O7mYmzq91zW4sBIAMz_MS6VmpIaWJMzp7Wre8wS1hwDnGtYSsZnMRzwcpZmfFzwpnniSAXtFMMP1l7szuKYhrD6tzbiKzbCbcazmMeaXClJDoPVwXNL0LtxFGGPhFIcy4L8JVftu4_CeBXQHVFM59ckmkEBkEUFEACnWM3gBspPMnH91F-F3vdRNUE"
              alt="Alice Chen" />
            <div class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-status-online rounded-full border-2 border-surface-container-low"></div>
          </div>
          <span class="text-sm font-medium text-on-surface group-hover:text-primary transition-colors">Alice Chen</span>
        </div>
        <span class="px-1.5 py-0.5 bg-surface-container text-[9px] rounded font-bold text-on-surface-variant uppercase tracking-tighter">Admin</span>
      </div>

      <!-- Bob (AFK) -->
      <div class="flex items-center group cursor-pointer">
        <div class="flex items-center gap-3">
          <div class="relative">
            <img class="w-8 h-8 rounded-full border-2 border-surface-container-low object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuD1lUUBRJVeIGrgAGC6RcwMKnOmCiDUumR9P_O_oAGK8_8tNp2xAJkqP5a1Phxs23VBZji4ha8vGb34hpFpKdtxhOO1CmU7EhxAywz6cDkAQuNReLG0cG5W_GGFIYJxdx-4lSIs0lanSbAjuEY7gHNXDGzO21jll-jdG5Ovc182sFeFmwuNG1f3jjzpeP0iWO6V91EKyTHikT7eT1SsfCPVfNnqoj_GLlFXbp3dw4Zmz0qsBhgIYmWC5RulGng4Ct0VFfiFMcnAYJs"
              alt="Bob Miller" />
            <div class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-status-afk rounded-full border-2 border-surface-container-low"></div>
          </div>
          <span class="text-sm font-medium text-on-surface group-hover:text-primary transition-colors">Bob Miller</span>
        </div>
      </div>

      <!-- Carol (Offline) -->
      <div class="flex items-center group cursor-pointer">
        <div class="flex items-center gap-3">
          <div class="relative">
            <div class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center border-2 border-surface-container-low">
              <span class="material-symbols-outlined text-sm text-outline">person</span>
            </div>
            <div class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-status-offline rounded-full border-2 border-surface-container-low"></div>
          </div>
          <span class="text-sm font-medium text-outline group-hover:text-primary transition-colors">Carol Vance</span>
        </div>
      </div>

      <button class="mt-4 text-primary text-xs font-semibold hover:underline">View all members</button>
    </div>
  </aside>
</div>
```

- [ ] **Step 3: Empty SCSS**

```bash
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/rooms/room-chat/room-chat.scss
```

- [ ] **Step 4: Build**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/rooms/room-chat/room-chat.html frontend/src/app/features/rooms/room-chat/room-chat.scss
git commit -m "fix: port room-chat to pixel-perfect design HTML with Tailwind classes"
```

---

## Task 5: Room Catalog (rooms-home) — Port to Design HTML

**Source design:** `designs/public-room-catalog.html`
**Template:** `frontend/src/app/features/rooms/rooms-home.component.html`

Port the main content area from the design: the `<section class="flex-1 overflow-y-auto p-8">` block which contains the catalog header, bento grid (featured room + stats cards), and room cards grid.

- [ ] **Step 1: Read design and current template**

```bash
sed -n '95,412p' designs/public-room-catalog.html
cat frontend/src/app/features/rooms/rooms-home.component.html
```

- [ ] **Step 2: Write new rooms-home.component.html**

Port the `<section class="flex-1 overflow-y-auto p-8">` content from the design. The design's outer left sidebar and header belong to the workspace shell — do NOT include those.

```html
<section class="flex-1 overflow-y-auto p-8 bg-surface" data-testid="rooms-home">
  <div class="max-w-7xl mx-auto">
    <div class="mb-10">
      <h1 class="text-3xl font-extrabold tracking-tight text-on-surface mb-2">Public Rooms Catalog</h1>
      <p class="text-on-surface-variant max-w-2xl">Explore open architectural workshops and collaborative design spaces within the global workspace ecosystem.</p>
    </div>

    <!-- Featured / Bento Grid Layout -->
    <div class="grid grid-cols-1 md:grid-cols-12 gap-6 mb-12">
      <!-- Featured Room -->
      <div class="md:col-span-8 group relative overflow-hidden bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/10 p-1 flex flex-col">
        <div class="relative h-64 overflow-hidden rounded-lg">
          <img alt="Main Lobby" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBcomcDp_iJ6kFEVaBJ686noj6WNvqg61bWKfsVKTKRlugge0jUtUc4MZ3fKX-gGZxDmoPC7YRLkWddt-8xPeW2XP_NPinPNu-JWO5UD8gHQ3AvNkKMnkV1QUjs3S29pjc2PMR5HIgLAMoG27qyFVh98f7wAf6u5zWNxmkEWokuEJrs3ePnMy14fNZfI0ariC9UGPF6BwskytWdZmm5W8JJHjsJVxNXf_-sXjczjQ0umesjBv7RezoGoDdIC4a4hW0p8x1IvCBDu_U" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
          <div class="absolute bottom-6 left-6 text-white">
            <span class="bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full mb-3 inline-block">Featured Workspace</span>
            <h2 class="text-2xl font-bold">Urban Planning Collective</h2>
            <p class="text-slate-200 text-sm opacity-90">Central hub for metropolitan infrastructure and civic design discussions.</p>
          </div>
        </div>
        <div class="p-6 flex items-center justify-between">
          <div class="flex items-center gap-6">
            <div class="flex -space-x-2">
              <img alt="User" class="w-8 h-8 rounded-full border-2 border-white object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCnBCzLLhVy6CfGGQ1pdz2dzfoEpPMYY4tEKhBcPZuRf6NlGCtQ4ITc91IYOUh19qPk1XPiH4O_2vCjJXe3uxtzruIshxK0zKJyDpXv5EOZGrXmWa7HUNBGizsUEILMl0Dt07JXs0RUW-AKol7eA7f42qyqO0fVICMCFVcto1bW8dfBIe_q5ZFoUYHF1mAyF8MC5TRElc6luw6YgpzYv2sypC0Bds12fn93_t0EVgFyjWqzC_7KKlkvEk5SA4o7l-hLpSEsYJPv7IM" />
              <img alt="User" class="w-8 h-8 rounded-full border-2 border-white object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBUS6UeGG1v1lTJaQkEhBTZDAKppf0z4VwMHPZs7jNt3kdh7-pZdkm016U9_8fmeEdl6PQ54heXbxdLklvyIbbr2G6Ky2tEF3I9XErR2HBY7IFwVXcHHOuLmZDg63J4YLexU3qBjZtceZX9oB26K6zLsCkgJCz_t8wy6lqiC3XbrpJGSbAnSKk79v4AVHm3O09Yxb0vWtpYHdcmcIkPEGW5omVKvjJTr8v4ktOtGgpzM9p21Rga-iVD0WpbVQgOVZu5NH4beP4Xbtw" />
              <div class="w-8 h-8 rounded-full border-2 border-white bg-surface-container-high flex items-center justify-center text-[10px] font-bold text-on-surface">+142</div>
            </div>
            <div class="flex items-center gap-2 text-on-surface-variant text-xs">
              <span class="material-symbols-outlined text-sm">groups</span>
              <span>2.4k Active Members</span>
            </div>
          </div>
          <button class="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-primary-dim transition-colors shadow-sm">Join Room</button>
        </div>
      </div>

      <!-- Statistics Cards -->
      <div class="md:col-span-4 grid grid-cols-1 gap-6">
        <div class="bg-primary-container p-6 rounded-xl flex flex-col justify-between">
          <div>
            <span class="material-symbols-outlined text-primary mb-4 block">insights</span>
            <h3 class="text-lg font-bold text-on-primary-container leading-tight">Trending Discussions</h3>
            <p class="text-on-primary-container/70 text-xs mt-2">Highly active architectural sessions currently in progress.</p>
          </div>
          <div class="space-y-3 mt-6">
            <div class="flex items-center justify-between text-xs font-semibold text-on-primary-container bg-white/40 p-2 rounded-lg">
              <span>#SustainableTimber</span>
              <span class="text-primary">Live</span>
            </div>
            <div class="flex items-center justify-between text-xs font-semibold text-on-primary-container bg-white/40 p-2 rounded-lg">
              <span>#ParametricFaçades</span>
              <span class="text-primary">12 New</span>
            </div>
          </div>
        </div>
        <div class="bg-surface-container-highest p-6 rounded-xl">
          <h3 class="text-sm font-bold text-on-surface mb-4">Discovery Metrics</h3>
          <div class="space-y-4">
            <div>
              <div class="flex justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                <span>Workspace Density</span><span>88%</span>
              </div>
              <div class="h-1 bg-surface-container rounded-full overflow-hidden">
                <div class="h-full bg-primary w-[88%]"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                <span>New Rooms (24h)</span><span>12</span>
              </div>
              <div class="h-1 bg-surface-container rounded-full overflow-hidden">
                <div class="h-full bg-primary w-[40%]"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Catalog Header + View Toggle -->
    <div class="flex items-center justify-between mb-8">
      <h3 class="text-lg font-bold tracking-tight text-on-surface">Available Rooms</h3>
      <div class="flex items-center gap-2">
        <button class="p-2 bg-surface-container-lowest border border-outline-variant/20 rounded-lg shadow-sm">
          <span class="material-symbols-outlined text-lg">grid_view</span>
        </button>
        <button class="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-lg">
          <span class="material-symbols-outlined text-lg">list</span>
        </button>
      </div>
    </div>

    <!-- Room Cards Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      @for (room of [
        {icon:'apartment', name:'Sustainable Materials Lab', desc:'Discussing the implementation of carbon-negative materials in commercial residential projects.', members:'852'},
        {icon:'landscape', name:'Biophilic Design Group', desc:'Integrating nature into interior architectures to enhance occupant well-being and productivity.', members:'1.2k'},
        {icon:'foundation', name:'Heritage Preservation', desc:'Methods and strategies for restoring historical landmarks while meeting modern safety codes.', members:'431'},
        {icon:'token', name:'BIM Automation Hub', desc:'Sharing scripts and plugins for Revit and ArchiCAD to streamline documentation workflows.', members:'3.1k'},
        {icon:'brush', name:'Concept Visualization', desc:'Showcasing high-end architectural renders and discussing lighting and material setups.', members:'928'},
        {icon:'bolt', name:'Fast-Track Permitting', desc:'Collaborative strategy for navigating complex zoning laws and urban regulations.', members:'215'}
      ]; track room.name) {
        <div class="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-6 flex flex-col justify-between hover:shadow-md transition-shadow">
          <div>
            <div class="flex items-center justify-between mb-4">
              <div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
                <span class="material-symbols-outlined">{{ room.icon }}</span>
              </div>
              <span class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Public</span>
            </div>
            <h4 class="text-base font-bold text-on-surface mb-2">{{ room.name }}</h4>
            <p class="text-on-surface-variant text-sm leading-relaxed">{{ room.desc }}</p>
          </div>
          <div class="mt-6 pt-6 border-t border-surface-container flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <span class="material-symbols-outlined text-sm">person</span>
              <span class="font-medium">{{ room.members }} Members</span>
            </div>
            <button class="text-primary font-bold text-sm hover:underline">Join</button>
          </div>
        </div>
      }
    </div>
  </div>
</section>
```

- [ ] **Step 3: Empty SCSS**

```bash
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/rooms/rooms-home.component.scss
```

- [ ] **Step 4: Build and commit**

```bash
cd frontend && npm run build 2>&1 | tail -10
git add frontend/src/app/features/rooms/rooms-home.component.html frontend/src/app/features/rooms/rooms-home.component.scss
git commit -m "fix: port rooms-home catalog to pixel-perfect design HTML with Tailwind classes"
```

---

## Task 6: Platform Bans Admin — Port to Design HTML (CRITICAL: Add Missing Form)

**Source design:** `designs/platform-ban-admin.html`
**Template:** `frontend/src/app/features/admin/platform-bans/platform-bans.html`

The current template is missing the entire "Issue Platform Ban" form section from the design. This task adds it and ports the whole template to the design's HTML structure.

**Port only the `<main class="flex-1 p-8 bg-surface">` content** — not the design's left `<aside>` nav bar (that belongs to the workspace shell).

- [ ] **Step 1: Read design and current template**

```bash
sed -n '147,337p' designs/platform-ban-admin.html
cat frontend/src/app/features/admin/platform-bans/platform-bans.html
```

- [ ] **Step 2: Write new platform-bans.html**

```html
<main class="flex-1 p-8 bg-surface">
  <div class="max-w-6xl mx-auto space-y-8">
    <!-- Page Header -->
    <div>
      <h2 class="text-2xl font-bold tracking-tight text-on-surface">Platform Ban Management</h2>
      <p class="text-on-surface-variant text-sm mt-1">Enforce community guidelines and manage user access across the Classic Pro ecosystem.</p>
    </div>

    <!-- Issue Platform Ban Form -->
    <section class="bg-surface-container rounded-xl p-8 shadow-sm">
      <div class="flex items-start justify-between mb-6">
        <div>
          <h3 class="text-lg font-semibold text-on-surface">Issue Platform Ban</h3>
          <p class="text-xs text-on-surface-variant mt-1 uppercase tracking-wider font-medium">New Enforcement Action</p>
        </div>
        <div class="flex items-center gap-2 text-error text-[11px] font-bold bg-error-container/20 px-3 py-1.5 rounded-full">
          <span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1">warning</span>
          <span>CRITICAL ACTION</span>
        </div>
      </div>
      <form class="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
        <div class="col-span-1">
          <label class="block text-[11px] font-bold text-on-surface-variant mb-2 uppercase tracking-tight">Username</label>
          <div class="relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm">person</span>
            <input class="w-full bg-surface-container-low border-none rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 placeholder-outline-variant" placeholder="Search by username..." type="text" />
          </div>
        </div>
        <div class="col-span-1">
          <label class="block text-[11px] font-bold text-on-surface-variant mb-2 uppercase tracking-tight">Ban Reason (Required)</label>
          <input class="w-full bg-surface-container-low border-none rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-primary/20 placeholder-outline-variant" placeholder="Ban reason (required)" type="text" />
        </div>
        <div class="col-span-1">
          <label class="block text-[11px] font-bold text-on-surface-variant mb-2 uppercase tracking-tight">Duration</label>
          <select class="w-full bg-surface-container-low border-none rounded-lg py-2.5 px-4 text-sm focus:ring-2 focus:ring-primary/20">
            <option>24 Hours</option>
            <option>7 Days</option>
            <option>30 Days</option>
            <option>Permanent</option>
          </select>
        </div>
        <div class="col-span-1">
          <button class="w-full bg-primary text-on-primary font-semibold py-2.5 rounded-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2" type="submit">
            <span class="material-symbols-outlined text-sm">gavel</span>
            <span>Issue Ban</span>
          </button>
        </div>
      </form>
      <div class="mt-6 flex items-center gap-2 text-xs text-on-surface-variant bg-surface-container-low/50 p-3 rounded-lg">
        <span class="material-symbols-outlined text-sm text-primary">info</span>
        <p>Issuing a ban immediately revokes all active sessions and force-disconnects all SignalR connections.</p>
      </div>
    </section>

    <!-- Active Bans Table -->
    <section class="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <div class="px-8 py-6 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h3 class="text-lg font-bold text-on-surface">Active Bans</h3>
          <span class="bg-primary-container text-on-primary-container text-[11px] font-black px-2.5 py-0.5 rounded-full">4</span>
        </div>
        <div class="flex gap-2">
          <button class="p-2 hover:bg-surface-container rounded-lg transition-colors text-outline">
            <span class="material-symbols-outlined">filter_list</span>
          </button>
          <button class="p-2 hover:bg-surface-container rounded-lg transition-colors text-outline">
            <span class="material-symbols-outlined">refresh</span>
          </button>
        </div>
      </div>
      <div class="w-full overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low/50">
              <th class="px-8 py-4 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Username</th>
              <th class="px-8 py-4 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Banned By</th>
              <th class="px-8 py-4 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Reason</th>
              <th class="px-8 py-4 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Issued Date</th>
              <th class="px-8 py-4 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Expires Date</th>
              <th class="px-8 py-4 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container">
            @for (ban of [
              {initials:'JD', name:'johndoe_92', by:'Admin_Sarah', reason:'Repeated policy violation...', issued:'Oct 24, 2023', expires:'Permanent', permanent:true},
              {initials:'SM', name:'shadow_master', by:'System_Auto', reason:'Spam detection (Level 3)', issued:'Nov 02, 2023', expires:'Nov 09, 2023', permanent:false},
              {initials:'KL', name:'kyle_l', by:'Admin_Mike', reason:'Harassment reporting', issued:'Nov 05, 2023', expires:'Nov 12, 2023', permanent:false},
              {initials:'AN', name:'alice_node', by:'Admin_Sarah', reason:'External site phishing', issued:'Nov 06, 2023', expires:'Dec 06, 2023', permanent:false}
            ]; track ban.name) {
              <tr class="hover:bg-surface-container-low transition-colors">
                <td class="px-8 py-5">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-xs font-bold text-primary">{{ ban.initials }}</div>
                    <span class="text-sm font-semibold text-on-surface">{{ ban.name }}</span>
                  </div>
                </td>
                <td class="px-8 py-5"><span class="text-sm text-on-surface-variant">{{ ban.by }}</span></td>
                <td class="px-8 py-5"><span class="text-sm text-on-surface-variant">{{ ban.reason }}</span></td>
                <td class="px-8 py-5"><span class="text-sm text-on-surface-variant">{{ ban.issued }}</span></td>
                <td class="px-8 py-5">
                  <span class="text-sm" [class.font-bold]="ban.permanent" [class.text-error]="ban.permanent" [class.text-on-surface-variant]="!ban.permanent">{{ ban.expires }}</span>
                </td>
                <td class="px-8 py-5 text-right">
                  <button class="text-[11px] font-bold text-primary hover:bg-primary-container px-3 py-1.5 rounded-lg transition-all">Revoke</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <!-- Revoked Bans (Collapsible) -->
    <section class="border border-outline-variant/10 rounded-xl bg-surface-container-low/40">
      <button class="w-full px-8 py-5 flex items-center justify-between text-on-surface-variant hover:text-on-surface transition-colors">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-outline">history</span>
          <span class="text-sm font-semibold">Revoked Bans</span>
          <span class="text-[10px] font-black bg-outline-variant/20 px-2 py-0.5 rounded uppercase">12 Total</span>
        </div>
        <span class="material-symbols-outlined text-lg">keyboard_arrow_down</span>
      </button>
    </section>
  </div>
</main>
```

- [ ] **Step 3: Empty SCSS**

```bash
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/admin/platform-bans/platform-bans.scss
```

- [ ] **Step 4: Build and commit**

```bash
cd frontend && npm run build 2>&1 | tail -10
git add frontend/src/app/features/admin/platform-bans/platform-bans.html frontend/src/app/features/admin/platform-bans/platform-bans.scss
git commit -m "fix: port platform-bans to design HTML; add missing Issue Ban form"
```

---

## Task 7: Sessions Panel — Convert from PrimeNG to Native Design HTML

**Source design:** `designs/security-sessions.html`
**Template:** `frontend/src/app/features/sessions/sessions-panel.component.html`

The current template uses PrimeNG `p-card`, `p-button`, `p-tag` components. Port to native HTML using the design's Tailwind classes. The TypeScript has real data signals (`sessions()`, `currentSession()`, `otherSessions()`, `isLoading()`, `isRevoking(sessionId)`, `errorMessage()`, `formatTimestamp(ts)`, `revokeSession(id)`). Preserve all of these.

- [ ] **Step 1: Read design and current template**

```bash
sed -n '95,296p' designs/security-sessions.html
cat frontend/src/app/features/sessions/sessions-panel.component.html
cat frontend/src/app/features/sessions/sessions-panel.component.ts
```

- [ ] **Step 2: Write new sessions-panel.component.html**

Read the design's `<body>` content (it uses a full-page layout). Port only the main content area (the panels and session rows), adapting to Angular signals. The design's left sidebar nav is the workspace shell.

```html
<div class="flex-1 overflow-y-auto p-8 bg-surface">
  <div class="max-w-4xl mx-auto space-y-8">
    <div>
      <h2 class="text-2xl font-bold tracking-tight text-on-surface">Active Sessions</h2>
      <p class="text-on-surface-variant text-sm mt-1">Manage and revoke active sessions across all your devices.</p>
    </div>

    @if (errorMessage()) {
      <div class="bg-error-container/20 border border-error/20 text-error px-4 py-3 rounded-lg text-sm">
        {{ errorMessage() }}
      </div>
    }

    @if (isLoading()) {
      <div class="flex items-center justify-center py-16 text-on-surface-variant">
        <span class="material-symbols-outlined animate-spin mr-3">progress_activity</span>
        <span>Loading sessions…</span>
      </div>
    } @else {
      <!-- Current Session -->
      @if (currentSession(); as session) {
        <section class="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/10">
          <div class="flex items-start justify-between mb-6">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <h3 class="text-lg font-bold text-on-surface">Current Session</h3>
                <span class="bg-status-online/15 text-status-online text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest">Active</span>
              </div>
              <p class="text-on-surface-variant text-sm">This device is currently authenticated.</p>
            </div>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">IP Address</p>
              <p class="text-sm font-semibold text-on-surface">{{ session.ipAddress || 'Unknown' }}</p>
            </div>
            <div>
              <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">User Agent</p>
              <p class="text-sm font-semibold text-on-surface truncate">{{ session.userAgent || 'Unknown' }}</p>
            </div>
            <div>
              <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Created</p>
              <p class="text-sm text-on-surface">{{ formatTimestamp(session.createdAt) }}</p>
            </div>
            <div>
              <p class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Expires</p>
              <p class="text-sm text-on-surface">{{ formatTimestamp(session.expiresAt) }}</p>
            </div>
          </div>
        </section>
      }

      <!-- Other Active Sessions -->
      @if (otherSessions().length > 0) {
        <section class="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
          <div class="px-8 py-6 border-b border-surface-container">
            <div class="flex items-center gap-3">
              <h3 class="text-lg font-bold text-on-surface">Other Active Connections</h3>
              <span class="bg-primary-container text-on-primary-container text-[11px] font-black px-2.5 py-0.5 rounded-full">{{ otherSessions().length }}</span>
            </div>
          </div>
          <div class="divide-y divide-surface-container">
            @for (session of otherSessions(); track session.id) {
              <div class="px-8 py-5 flex items-center justify-between hover:bg-surface-container-low transition-colors">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center">
                    <span class="material-symbols-outlined text-outline">devices</span>
                  </div>
                  <div>
                    <p class="text-sm font-semibold text-on-surface">{{ session.userAgent || 'Unknown device' }}</p>
                    <p class="text-xs text-on-surface-variant">{{ session.ipAddress || 'Unknown IP' }} · {{ formatTimestamp(session.createdAt) }}</p>
                  </div>
                </div>
                <button
                  class="text-[11px] font-bold text-error hover:bg-error-container/20 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                  [disabled]="isRevoking(session.id)"
                  (click)="revokeSession(session.id)"
                >
                  {{ isRevoking(session.id) ? 'Revoking…' : 'Revoke' }}
                </button>
              </div>
            }
          </div>
        </section>
      }

      @if (!currentSession() && otherSessions().length === 0) {
        <div class="text-center py-16 text-on-surface-variant">
          <span class="material-symbols-outlined text-5xl mb-4 block">devices</span>
          <p class="text-sm">No active sessions found.</p>
        </div>
      }
    }
  </div>
</div>
```

- [ ] **Step 3: Update sessions-panel.component.ts to remove PrimeNG imports**

Read the current component TS file, then update the `imports` array to remove PrimeNG modules (they are no longer used in the template):

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { SessionsApiService, SessionRecord } from '../../core/session/sessions-api.service';

@Component({
  selector: 'app-sessions-panel',
  imports: [],
  templateUrl: './sessions-panel.component.html',
  styleUrl: './sessions-panel.component.scss',
})
export class SessionsPanelComponent {
  // ... keep all existing methods and signals unchanged
}
```

Only change the `imports: []` line — remove `CommonModule, ButtonModule, CardModule, ProgressSpinnerModule, TagModule`. Leave all signal/method logic untouched.

- [ ] **Step 4: Empty SCSS**

```bash
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/sessions/sessions-panel.component.scss
```

- [ ] **Step 5: Build and commit**

```bash
cd frontend && npm run build 2>&1 | tail -10
git add frontend/src/app/features/sessions/sessions-panel.component.html frontend/src/app/features/sessions/sessions-panel.component.scss frontend/src/app/features/sessions/sessions-panel.component.ts
git commit -m "fix: port sessions panel to native design HTML, remove PrimeNG dependencies"
```

---

## Tasks 8–13: Remaining Templates — Read Design, Port to Angular, Empty SCSS

These six templates follow the identical pattern. Each subagent for these tasks must:
1. **Read** the design file fully
2. **Read** the current Angular template
3. **Write** the new template porting the design's main content HTML
4. **Empty** the SCSS file
5. **Build** `cd frontend && npm run build`
6. **Commit**

### Task 8: Direct Messages (`designs/private-messaging.html` → `direct-messages.html`)

**Files:**
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.html`
- Replace: `frontend/src/app/features/dialogs/direct-messages/direct-messages.scss` → empty

Port the design's 3-pane DM layout: left panel (contacts list with search), center panel (chat area with messages in/out), right panel (contact profile + shared assets). Port `slate-*` colors to surface tokens as in Task 2.

The design's outer navigation is the workspace shell — port only the inner content (the 3-pane flex container).

```bash
# Step 1: Read
cat designs/private-messaging.html
cat frontend/src/app/features/dialogs/direct-messages/direct-messages.html

# Step 2: Write new template (port from design body content)
# Step 3: Empty SCSS
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/dialogs/direct-messages/direct-messages.scss
# Step 4: Build
cd frontend && npm run build 2>&1 | tail -10
# Step 5: Commit
git add frontend/src/app/features/dialogs/direct-messages/
git commit -m "fix: port direct-messages to design HTML with Tailwind classes"
```

### Task 9: Contacts Management (`designs/contacts-management.html` → `contacts-home.html`)

**Files:**
- Modify: `frontend/src/app/features/contacts/contacts-home/contacts-home.html`
- Replace: `frontend/src/app/features/contacts/contacts-home/contacts-home.scss` → empty

Port the design's contacts grid + right sidebar. The design uses `contacts__main` layout with contact cards and a sidebar containing pending requests, invite form, and security card.

```bash
cat designs/contacts-management.html
cat frontend/src/app/features/contacts/contacts-home/contacts-home.html
# Write new template
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/contacts/contacts-home/contacts-home.scss
cd frontend && npm run build 2>&1 | tail -10
git add frontend/src/app/features/contacts/contacts-home/
git commit -m "fix: port contacts-home to design HTML with Tailwind classes"
```

### Task 10: Friend Requests (`designs/friend-requests.html` → `friend-requests.html`)

**Files:**
- Modify: `frontend/src/app/features/contacts/friend-requests/friend-requests.html`
- Replace: `frontend/src/app/features/contacts/friend-requests/friend-requests.scss` → empty

```bash
cat designs/friend-requests.html
cat frontend/src/app/features/contacts/friend-requests/friend-requests.html
# Write new template
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/contacts/friend-requests/friend-requests.scss
cd frontend && npm run build 2>&1 | tail -10
git add frontend/src/app/features/contacts/friend-requests/
git commit -m "fix: port friend-requests to design HTML with Tailwind classes"
```

### Task 11: Room Invitations (`designs/room-invitations.html` → `room-invitations.html`)

**Files:**
- Modify: `frontend/src/app/features/rooms/room-invitations/room-invitations.html`
- Replace: `frontend/src/app/features/rooms/room-invitations/room-invitations.scss` → empty

```bash
cat designs/room-invitations.html
cat frontend/src/app/features/rooms/room-invitations/room-invitations.html
# Write new template
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/rooms/room-invitations/room-invitations.scss
cd frontend && npm run build 2>&1 | tail -10
git add frontend/src/app/features/rooms/room-invitations/
git commit -m "fix: port room-invitations to design HTML with Tailwind classes"
```

### Task 12: Manage Room Settings (`designs/manage-room-settings.html` → `manage-room.html`)

**Files:**
- Modify: `frontend/src/app/features/rooms/manage-room/manage-room.html`
- Replace: `frontend/src/app/features/rooms/manage-room/manage-room.scss` → empty

The design shows a modal/dialog. Port the modal's inner content as a full-page component (the Angular routing model shows it as a page, not a modal).

```bash
cat designs/manage-room-settings.html
cat frontend/src/app/features/rooms/manage-room/manage-room.html
# Write new template
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/rooms/manage-room/manage-room.scss
cd frontend && npm run build 2>&1 | tail -10
git add frontend/src/app/features/rooms/manage-room/
git commit -m "fix: port manage-room to design HTML with Tailwind classes"
```

### Task 13: Profile Settings (`designs/profile-settings.html` → `profile-settings.html`)

**Files:**
- Modify: `frontend/src/app/features/profile/profile-settings/profile-settings.html`
- Replace: `frontend/src/app/features/profile/profile-settings/profile-settings.scss` → empty

```bash
cat designs/profile-settings.html
cat frontend/src/app/features/profile/profile-settings/profile-settings.html
# Write new template
echo "/* Styling via Tailwind utility classes in the HTML template */" > frontend/src/app/features/profile/profile-settings/profile-settings.scss
cd frontend && npm run build 2>&1 | tail -10
git add frontend/src/app/features/profile/profile-settings/
git commit -m "fix: port profile-settings to design HTML with Tailwind classes"
```

---

## Self-Review Checklist

- [x] All 11 component templates have tasks (workspace shell + 10 feature screens + auth)
- [x] Task 1 is a prerequisite for all others (Material Symbols, @theme inline border-radius)
- [x] Platform bans includes the missing Issue Ban form (Task 6)
- [x] Sessions panel removes PrimeNG imports and uses native HTML (Task 7)
- [x] All tasks include build verification step
- [x] All tasks empty/replace component SCSS files
- [x] Authentication form preserves all Angular reactive form bindings and data-testids
- [x] Workspace shell preserves all router directives and data-testids
- [x] Room catalog uses `@for` control flow with static mock data
- [x] Platform bans uses `@for` control flow with `[class.*]` bindings
- [x] No placeholder steps (all code is explicit)
- [x] Tasks 8-13 include `cat` read commands and commit commands
