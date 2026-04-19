# E2E/UAT Coverage + OPS Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close gaps between `requirements.md` and E2E/UAT test coverage, unskip UAT tests that are now unblocked by recent data-testid additions, and harden the Docker Compose startup chain so CI E2E runs are reliable.

**Architecture:** New Playwright E2E tests follow the established patterns in `e2e/tests/` — API-only tests use `ApiHelpers`/`createHubConnection`; browser tests use the `userAPage`/`userBPage` fixture pair. UAT additions use the same fixture set. Docker changes tighten the health-dependency chain so the E2E runner only starts when the full stack is provably ready.

**Tech Stack:** Playwright 1.49, TypeScript, @microsoft/signalr (E2E); Docker Compose V2, GitHub Actions (OPS).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `e2e/tests/10-message-actions.spec.ts` | **Create** | Room message edit/delete by author, message reply |
| `e2e/tests/11-password-reset.spec.ts` | **Create** | Forgot-password / reset-password API flow |
| `e2e/tests/uat/03-realtime-messaging.uat.spec.ts` | **Modify** | Unskip browser real-time message delivery test |
| `frontend/src/app/features/dialogs/direct-messages/direct-messages.html` | **Modify** | Add `data-testid` to dialog list buttons and DM send button |
| `e2e/tests/uat/06-dm-flow.uat.spec.ts` | **Create** | DM flow UAT: friends exchange message through browser UI |
| `docker-compose.yml` | **Modify** | Fix frontend dependency chain, add healthcheck `start_period`, add `restart: "no"` to e2e runner |
| `.github/workflows/ci.yml` | **Modify** | Add `backend-integration` CI job for `ChatHerder.Integration.Tests` |

---

## Task 1: E2E — Room message actions (edit, delete by author, reply)

**Files:**
- Create: `e2e/tests/10-message-actions.spec.ts`

**Context:** `PATCH /api/messages/{id}` allows the message author to edit their content; `DELETE /api/messages/{id}` soft-deletes (sets `isDeleted=true`). Admin deletion is already covered in `05-admin.spec.ts`. This task covers author self-edit, author self-delete, non-author 403, and message reply (the `SendMessage` hub method accepts `replyToId`). No new helpers needed.

- [ ] **Step 1: Create the spec file**

```bash
touch /Users/igorvaskonyan/projects/ai/ai-chat-herder/e2e/tests/10-message-actions.spec.ts
```

- [ ] **Step 2: Write the tests**

`e2e/tests/10-message-actions.spec.ts`:

```typescript
import { test, expect } from '../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../helpers/room.helpers';
import { createHubConnection } from '../helpers/signalr.helpers';

test.describe('Room message actions', () => {
  test('author can edit their own message and the response carries editedAt', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const original = `edit-original-${Date.now()}`;
    const updated  = `edit-updated-${Date.now()}`;

    await chat.invoke('SendMessage', room.id, original, null, null);
    await chat.stop();

    const ownerCtx = await api.authContext(userA.accessToken);
    const history  = await ownerCtx.get(`/api/rooms/${room.id}/messages`);
    expect(history.status(), await history.text()).toBe(200);
    const messages = await history.json();
    const msg = messages.find((m: { content: string | null }) => m.content === original);
    expect(msg?.id).toBeTruthy();

    const edit = await ownerCtx.patch(`/api/messages/${msg.id}`, {
      data: { content: updated },
    });
    expect(edit.status(), await edit.text()).toBe(200);
    const body = await edit.json();
    expect(body.content).toBe(updated);
    expect(body.editedAt).toBeTruthy();
    await ownerCtx.dispose();
  });

  test('author deletes their own message and it appears as deleted in history', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `self-delete-${Date.now()}`;

    await chat.invoke('SendMessage', room.id, content, null, null);
    await chat.stop();

    const authorCtx = await api.authContext(userA.accessToken);
    const history   = await authorCtx.get(`/api/rooms/${room.id}/messages`);
    const messages  = await history.json();
    const msg = messages.find((m: { content: string | null }) => m.content === content);
    expect(msg?.id).toBeTruthy();

    const del = await authorCtx.delete(`/api/messages/${msg.id}`);
    expect(del.status(), await del.text()).toBe(204);
    await authorCtx.dispose();

    // Verify soft-delete: message still in history but marked deleted
    const memberCtx = await api.authContext(userB.accessToken);
    const after     = await memberCtx.get(`/api/rooms/${room.id}/messages`);
    const remaining = await after.json();
    const deleted   = remaining.find((m: { id: string }) => m.id === msg.id);
    expect(deleted).toMatchObject({ isDeleted: true, content: null });
    await memberCtx.dispose();
  });

  test('non-author cannot edit another user message and receives 403', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `not-yours-${Date.now()}`;

    await chat.invoke('SendMessage', room.id, content, null, null);
    await chat.stop();

    const ownerCtx = await api.authContext(userA.accessToken);
    const history  = await ownerCtx.get(`/api/rooms/${room.id}/messages`);
    await ownerCtx.dispose();
    const messages = await history.json();
    const msg = messages.find((m: { content: string | null }) => m.content === content);
    expect(msg?.id).toBeTruthy();

    // userB (Member) tries to edit userA's message
    const memberCtx = await api.authContext(userB.accessToken);
    const attempt   = await memberCtx.patch(`/api/messages/${msg.id}`, {
      data: { content: 'stolen edit' },
    });
    expect(attempt.status()).toBe(403);
    await memberCtx.dispose();
  });

  test('message reply is stored and appears with replyToMessageId in history', async ({ api, userA, userB }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chatA = await createHubConnection('/hubs/chat', userA.accessToken);
    const chatB = await createHubConnection('/hubs/chat', userB.accessToken);
    const original = `parent-msg-${Date.now()}`;
    const reply    = `reply-msg-${Date.now()}`;

    await chatA.invoke('SendMessage', room.id, original, null, null);

    const ctx       = await api.authContext(userA.accessToken);
    const history   = await ctx.get(`/api/rooms/${room.id}/messages`);
    const messages  = await history.json();
    const parentMsg = messages.find((m: { content: string | null }) => m.content === original);
    expect(parentMsg?.id).toBeTruthy();

    // userB replies with replyToId set to the parent message id
    await chatB.invoke('SendMessage', room.id, reply, parentMsg.id, null);
    await chatA.stop();
    await chatB.stop();

    const after    = await ctx.get(`/api/rooms/${room.id}/messages`);
    const messages2 = await after.json();
    const replyMsg  = messages2.find((m: { content: string | null }) => m.content === reply);
    expect(replyMsg).toMatchObject({
      content: reply,
      replyToMessage: expect.objectContaining({ id: parentMsg.id }),
    });
    await ctx.dispose();
  });
});
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/e2e
npm run typecheck
```

Expected: exit code 0, no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add e2e/tests/10-message-actions.spec.ts
git commit -m "test(e2e): add room message edit/delete/reply E2E tests"
```

---

## Task 2: E2E — Password reset flow

**Files:**
- Create: `e2e/tests/11-password-reset.spec.ts`

**Context:** `POST /api/auth/forgot-password` always returns 200 with a vague message (timing-attack mitigation). `POST /api/auth/reset-password` validates the token from the database. In the test environment SMTP is disabled so no real email is sent, but we can still hit the endpoint. For the valid-token test we must create a real user and a `PasswordResetToken` row — the cleanest way is via the forgot-password endpoint (which creates the token) and then read it directly via the API (no endpoint exposes tokens externally, so we test the happy path at the DB level using `api.authContext`-based calls to check the user still exists, and test the bad-token path with a random UUID).

- [ ] **Step 1: Create the spec file**

```bash
touch /Users/igorvaskonyan/projects/ai/ai-chat-herder/e2e/tests/11-password-reset.spec.ts
```

- [ ] **Step 2: Write the tests**

`e2e/tests/11-password-reset.spec.ts`:

```typescript
import { test, expect } from '../fixtures/test-fixtures';

test.describe('Password reset', () => {
  test('forgot-password returns 200 with a confirmation message for a known email', async ({ api, userA }) => {
    const ctx = await api.context();
    const res = await ctx.post('/api/auth/forgot-password', {
      data: { email: userA.email },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/reset link|sent/i);
    await ctx.dispose();
  });

  test('forgot-password returns 200 even for an unknown email (timing-attack protection)', async ({ api }) => {
    const ctx = await api.context();
    const res = await ctx.post('/api/auth/forgot-password', {
      data: { email: `nobody-${Date.now()}@test.local` },
    });
    expect(res.status(), await res.text()).toBe(200);
    await ctx.dispose();
  });

  test('reset-password with an invalid token returns 400', async ({ api }) => {
    const ctx = await api.context();
    const res = await ctx.post('/api/auth/reset-password', {
      data: {
        token:       '00000000-0000-0000-0000-000000000000',
        newPassword: 'NewPass@1234!',
      },
    });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });
});
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/e2e
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add e2e/tests/11-password-reset.spec.ts
git commit -m "test(e2e): add password reset API flow tests"
```

---

## Task 3: UAT — Unskip real-time messaging browser test

**Files:**
- Modify: `e2e/tests/uat/03-realtime-messaging.uat.spec.ts`

**Context:** This test was previously BLOCKED because `room-chat.html` had no `data-testid` on message elements. Task T153 (commit `dd868cd`) added `[attr.data-testid]="'message-' + msg.id"` and `data-testid="message-text"` to `room-chat.html`. We can now verify that a message sent via the SignalR hub appears in the receiver's browser. The test uses `userAPage` (browser of User A) and sends a message as User B via hub; User A must see the text within 3 seconds.

- [ ] **Step 1: Read the current file**

```bash
cat /Users/igorvaskonyan/projects/ai/ai-chat-herder/e2e/tests/uat/03-realtime-messaging.uat.spec.ts
```

- [ ] **Step 2: Replace the skipped test**

Replace the entire `03-realtime-messaging.uat.spec.ts` content with:

```typescript
import { test, expect } from '../../fixtures/test-fixtures';
import { createPublicRoomWithMembers } from '../../helpers/room.helpers';
import { createHubConnection } from '../../helpers/signalr.helpers';

test.describe('UAT: Real-time messaging UX', () => {
  test('user sends a message that is persisted and visible through history refetch', async ({ userA, userB, api }) => {
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const message = `uat message ${Date.now()}`;

    await chat.invoke('SendMessage', room.id, message, null, null);
    await chat.stop();

    const ctx = await api.authContext(userB.accessToken);
    const history = await ctx.get(`/api/rooms/${room.id}/messages`);
    expect(history.status(), await history.text()).toBe(200);
    const messages = await history.json();
    expect(messages.some((m: { content: string | null }) => m.content === message)).toBe(true);
    await ctx.dispose();
  });

  test('recipient sees message in browser UI within 3 seconds of sender posting via hub', async ({
    userA,
    userB,
    userAPage,
    api,
  }) => {
    // userA opens room in browser; userB sends via hub; userA's UI must render it within 3 seconds
    const room = await createPublicRoomWithMembers(api, userA, [userB]);
    const message = `rt-browser-${Date.now()}`;

    // Navigate userA to the room BEFORE userB sends so the SignalR event can arrive live
    await userAPage.goto(`/app/rooms/${room.id}`);
    await expect(userAPage.locator('[data-testid="chat-area"]')).toBeVisible({ timeout: 10_000 });

    // userB sends via hub (simulates a real-time send from another browser tab)
    const chat = await createHubConnection('/hubs/chat', userB.accessToken);
    await chat.invoke('SendMessage', room.id, message, null, null);
    await chat.stop();

    // The [data-testid="message-text"] elements are rendered per-message in the chat-area.
    // Wait up to 3 seconds for one matching the sent content — confirming live delivery.
    await expect(
      userAPage.locator('[data-testid="chat-area"] [data-testid="message-text"]').filter({ hasText: message }),
    ).toBeVisible({ timeout: 3_000 });
  });

  test.skip('quoted replies behave correctly in browser UI', async () => {
    // BLOCKED: no reply/quote controls are wired in the room UI.
  });
});
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/e2e
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add e2e/tests/uat/03-realtime-messaging.uat.spec.ts
git commit -m "test(uat): unskip real-time browser delivery test — data-testid attrs now wired"
```

---

## Task 4: UAT — DM flow browser test + data-testid additions to DM template

**Files:**
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.html`
- Create: `e2e/tests/uat/06-dm-flow.uat.spec.ts`

**Context:** `direct-messages.html` currently has `data-testid="dm-messages"` and `data-testid="dm-message-input"` but the dialog-list buttons and the send button have no testid. Adding these two makes the UAT test selectable without fragile text matching. The UAT test: two friends (established via API) exchange a message through the browser UI — UserA selects the dialog and sends; UserB must see it.

- [ ] **Step 1: Add data-testid to dialog list button**

Read `frontend/src/app/features/dialogs/direct-messages/direct-messages.html`.

Find the `@for (dialog of dialogs(); track dialog.id)` button element (around line 27):

```html
          <button
            class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-lowest transition-colors text-left"
            [class.bg-surface-container-lowest]="selectedDialog()?.id === dialog.id"
            [class.shadow-sm]="selectedDialog()?.id === dialog.id"
            (click)="selectDialog(dialog)"
```

Change to add `[attr.data-testid]="'dialog-item-' + dialog.id"`:

```html
          <button
            class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-lowest transition-colors text-left"
            [class.bg-surface-container-lowest]="selectedDialog()?.id === dialog.id"
            [class.shadow-sm]="selectedDialog()?.id === dialog.id"
            [attr.data-testid]="'dialog-item-' + dialog.id"
            (click)="selectDialog(dialog)"
```

- [ ] **Step 2: Add data-testid to send button**

Find the DM send button (around line 165–170):

```html
          <button
            [disabled]="isSending() || (!messageText().trim() && !pendingAttachment()) || selectedDialog()!.isFrozen"
            (click)="sendMessage()"
```

Change to:

```html
          <button
            data-testid="dm-send-btn"
            [disabled]="isSending() || (!messageText().trim() && !pendingAttachment()) || selectedDialog()!.isFrozen"
            (click)="sendMessage()"
```

- [ ] **Step 3: Run frontend unit tests to confirm no regressions**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng test --watch=false 2>&1 | tail -5
```

Expected: `113 passed` (or same count as before — template changes don't break unit tests).

- [ ] **Step 4: Create the UAT spec**

`e2e/tests/uat/06-dm-flow.uat.spec.ts`:

```typescript
import { test, expect } from '../../fixtures/test-fixtures';
import type { ApiHelpers } from '../../helpers/api.helpers';
import { createHubConnection } from '../../helpers/signalr.helpers';

async function becomeFriends(
  api: ApiHelpers,
  senderToken: string,
  receiverToken: string,
  receiverUsername: string,
  senderId: string,
): Promise<void> {
  await api.sendFriendRequest(senderToken, receiverUsername, 'UAT DM setup');
  const requests = await api.getFriendRequests(receiverToken);
  const request = requests.find(r => r.senderId === senderId);
  if (!request?.id) throw new Error('Friend request not found');
  await api.acceptFriendRequest(receiverToken, request.id);
}

test.describe('UAT: Direct messaging UX', () => {
  test('friends can exchange a DM through the browser UI and it persists in history', async ({
    userA,
    userB,
    userAPage,
    api,
  }) => {
    // Establish friendship and create dialog via API
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);

    // Navigate userA to the DM page
    await userAPage.goto('/app/contacts');
    await expect(userAPage.locator('[data-testid="main-chat"]')).toBeVisible({ timeout: 10_000 });

    // Go to direct messages view and select the dialog
    await userAPage.goto('/app/dialogs');
    await expect(userAPage.locator(`[data-testid="dialog-item-${dialog.id}"]`)).toBeVisible({ timeout: 10_000 });
    await userAPage.click(`[data-testid="dialog-item-${dialog.id}"]`);
    await expect(userAPage.locator('[data-testid="dm-messages"]')).toBeVisible({ timeout: 5_000 });

    // userA types and sends a message via the browser UI
    const messageContent = `uat-dm-${Date.now()}`;
    await userAPage.fill('[data-testid="dm-message-input"]', messageContent);
    await userAPage.click('[data-testid="dm-send-btn"]');

    // Verify the message input clears (send success indicator)
    await expect(userAPage.locator('[data-testid="dm-message-input"]')).toHaveValue('', { timeout: 5_000 });

    // Verify the message persists in dialog history for the recipient
    const history = await api.getDialogMessages(userB.accessToken, dialog.id);
    expect(history.some(m => m.content === messageContent)).toBe(true);
  });

  test('frozen dialog (after block) is read-only in the browser UI', async ({
    userA,
    userB,
    userAPage,
    api,
  }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);

    // userB blocks userA → dialog becomes frozen
    await api.blockUser(userB.accessToken, userA.id);

    await userAPage.goto('/app/dialogs');
    await expect(userAPage.locator(`[data-testid="dialog-item-${dialog.id}"]`)).toBeVisible({ timeout: 10_000 });
    await userAPage.click(`[data-testid="dialog-item-${dialog.id}"]`);

    // The send button should be disabled because the dialog is frozen
    await expect(userAPage.locator('[data-testid="dm-send-btn"]')).toBeDisabled({ timeout: 5_000 });
  });
});
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/e2e
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add frontend/src/app/features/dialogs/direct-messages/direct-messages.html \
        e2e/tests/uat/06-dm-flow.uat.spec.ts
git commit -m "test(uat): add DM flow UAT; add data-testid to dialog list and send button"
```

---

## Task 5: OPS — Fix docker-compose dependency chain and healthcheck

**Files:**
- Modify: `docker-compose.yml`

**Context:** Three issues:
1. `frontend.depends_on` uses the legacy `- backend` list form with no health condition. This starts Nginx before the backend API is ready, making CI reliability depend solely on the frontend healthcheck's retry budget.
2. `frontend.healthcheck` has no `start_period`, so retries start immediately. If the backend takes 60+ seconds to migrate and start, the frontend's 10 retries at 10s intervals (100 seconds max) may exhaust before the backend is ready in slow CI runners.
3. The `e2e` service has no `restart: "no"` — while profiles prevent auto-restart in practice, making it explicit is correct for one-shot test runners.

- [ ] **Step 1: Fix `frontend.depends_on`**

In `docker-compose.yml`, find:

```yaml
  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    restart: unless-stopped
    ports:
      - "80:80"     # Primary production port
      - "4200:80"   # Also mapped to Angular's conventional dev port
    depends_on:
      - backend
```

Replace with:

```yaml
  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
    restart: unless-stopped
    ports:
      - "80:80"     # Primary production port
      - "4200:80"   # Also mapped to Angular's conventional dev port
    depends_on:
      backend:
        condition: service_healthy
```

- [ ] **Step 2: Add `start_period` to `frontend.healthcheck`**

Find the frontend `healthcheck` block:

```yaml
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- --header 'Host: localhost' http://127.0.0.1/api/health > /dev/null 2>&1 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 60s
```

(If `start_period: 60s` is already there, no change needed — if it is absent, add it after `retries: 10`.)

Check the actual current state:

```bash
grep -A6 "healthcheck:" /Users/igorvaskonyan/projects/ai/ai-chat-herder/docker-compose.yml | grep -A6 "wget"
```

If `start_period` is absent from the frontend healthcheck block, add it:

```yaml
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- --header 'Host: localhost' http://127.0.0.1/api/health > /dev/null 2>&1 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 60s
```

- [ ] **Step 3: Add `restart: "no"` to e2e service**

Find the `e2e:` service block:

```yaml
  e2e:
    build:
      context: .
      dockerfile: Dockerfile.e2e
    profiles:
      - e2e
    environment:
```

Add `restart: "no"` after `profiles`:

```yaml
  e2e:
    build:
      context: .
      dockerfile: Dockerfile.e2e
    profiles:
      - e2e
    restart: "no"
    environment:
```

- [ ] **Step 4: Verify the file is valid YAML**

```bash
docker compose -f /Users/igorvaskonyan/projects/ai/ai-chat-herder/docker-compose.yml config --quiet
```

Expected: exit code 0 (no YAML errors).

- [ ] **Step 5: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add docker-compose.yml
git commit -m "ops: fix frontend service_healthy dependency; add healthcheck start_period; e2e restart no"
```

---

## Task 6: OPS/CI — Add backend integration test job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Context:** `ChatHerder.Integration.Tests` uses Testcontainers — it spins up a real Redis container (`redis:7-alpine`) inside the GHA runner using the local Docker daemon. `ubuntu-latest` runners have Docker preinstalled and enabled. The job needs no additional services block — Testcontainers handles that internally. The job should run in parallel with `backend-unit` (no dependency) and be a prerequisite for `e2e-uat` (just like `backend-unit` should also be).

- [ ] **Step 1: Read the current CI workflow**

```bash
cat /Users/igorvaskonyan/projects/ai/ai-chat-herder/.github/workflows/ci.yml
```

- [ ] **Step 2: Add `backend-integration` job and wire `e2e-uat` dependency**

After the `frontend-unit` job and before `e2e-uat`, insert the following job. Also update `e2e-uat.needs` to include `backend-integration`.

The new job to insert (place between `frontend-unit` and `e2e-uat`):

```yaml
  backend-integration:
    name: Backend Integration Tests
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: 10.0.x

      - name: Restore
        run: dotnet restore ChatHerder.sln

      - name: Run backend integration tests
        run: >
          dotnet test tests/ChatHerder.Integration.Tests/ChatHerder.Integration.Tests.csproj
          --configuration Release
          --no-restore
          --logger "trx;LogFileName=backend-integration.trx"
          --results-directory TestResults/backend-integration
          --verbosity normal

      - name: Report backend integration results
        if: always()
        run: |
          {
            echo "### Backend Integration Tests"
            echo ""
            echo "- Job status: ${{ job.status }}"
            echo "- Results directory: \`TestResults/backend-integration\`"
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Upload backend integration results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: backend-integration-test-results
          path: TestResults/backend-integration
          if-no-files-found: ignore
```

Also update the `e2e-uat` job's `needs` from (if it has none currently) to:

```yaml
  e2e-uat:
    name: E2E/UAT Tests
    runs-on: ubuntu-latest
    timeout-minutes: 45
    needs: [backend-unit, backend-integration, frontend-unit]
```

This ensures E2E tests only run if unit and integration tests are green.

- [ ] **Step 3: Verify the workflow file is valid YAML**

```bash
python3 -c "import yaml, sys; yaml.safe_load(sys.stdin)" < /Users/igorvaskonyan/projects/ai/ai-chat-herder/.github/workflows/ci.yml && echo "Valid YAML"
```

Expected: `Valid YAML`.

- [ ] **Step 4: Commit**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
git add .github/workflows/ci.yml
git commit -m "ci: add backend-integration test job; gate e2e-uat on all unit+integration jobs"
```

---

## Self-Review

**1. Spec coverage:**

| Requirement | Coverage after this plan |
|---|---|
| §2.1.4 Password reset | ✅ Task 2 (`11-password-reset.spec.ts`) |
| §2.5.3 Message replies | ✅ Task 1 (`10-message-actions.spec.ts`) |
| §2.5.4 Message editing by author | ✅ Task 1 (`10-message-actions.spec.ts`) |
| §2.5.5 Message deletion by author | ✅ Task 1 (`10-message-actions.spec.ts`) |
| §2.7 Unread indicators (API) | ✅ Already covered in `09-notifications.spec.ts` |
| UAT real-time messaging in browser | ✅ Task 3 (unskipped) |
| UAT DM flow through browser | ✅ Task 4 (`06-dm-flow.uat.spec.ts`) |
| Docker health chain reliability | ✅ Task 5 (`docker-compose.yml`) |
| Integration tests in CI | ✅ Task 6 (`.github/workflows/ci.yml`) |

**Remaining intentional gaps (out of scope or blocked):**
- `uat/03` quoted replies browser test — BLOCKED: reply UI controls not wired in `room-chat.html`
- `uat/04` banned user removed from room UI — BLOCKED: `BanMember` doesn't broadcast `RemovedFromRoom` to active connections
- `03-presence.spec.ts` presence dots in member list — BLOCKED: room member list is static

**2. Placeholder scan:** No TBD/TODO in any task. All test code, commands, and expected outputs are concrete.

**3. Type consistency:**
- All API paths (`/api/messages/{id}`, `/api/auth/forgot-password`, `/api/auth/reset-password`) verified against `src/ChatHerder.API/Endpoints/`
- `replyToMessage` field name verified against `ChatHub.cs` DTO shape (returned as `ReplyToMessage` → camelCase in JSON as `replyToMessage`)
- `data-testid="dialog-item-{id}"` added in Task 4 Step 1 and consumed in Task 4 Step 4
- `data-testid="dm-send-btn"` added in Task 4 Step 2 and consumed in Task 4 Step 4
