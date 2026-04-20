# DM UX Fix + Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken DM browser UX (wrong testid, contenteditable incompatible with `toHaveValue()`), wire the route param for auto-selection, and add comprehensive DM unit/e2e/UAT tests.

**Architecture:** The backend is complete (DialogsEndpoints + ChatHub `SendDirectMessage`). The frontend `DirectMessagesComponent` has two bugs: the composer testid is `message-input` (test expects `dm-message-input`) and it uses `contenteditable` which breaks `toHaveValue()`. Fix is to switch the DM composer to a `<textarea>`, fix the testid, consume the `:id` route param for auto-dialog-selection, and add a `/app/messages` route without ID.

**Tech Stack:** Angular 21 signals, Playwright e2e, xUnit unit tests (.NET 10)

---

### Task 1: Fix DM composer — textarea + testid + route param

**Files:**
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.html`
- Modify: `frontend/src/app/features/dialogs/direct-messages/direct-messages.ts`
- Modify: `frontend/src/app/app.routes.ts`

Root causes:
1. `data-testid="message-input"` → must be `dm-message-input`
2. `contenteditable` div → must be `<textarea>` (UAT test uses `toHaveValue()`)
3. Component ignores `:id` route param → must auto-select dialog on load
4. No `/app/messages` route without ID

- [ ] **Step 1: Update `app.routes.ts` — add bare messages route**

```ts
// add BEFORE the messages/:id route
{ path: 'messages', component: DirectMessagesComponent },
{ path: 'messages/:id', component: DirectMessagesComponent },
```

- [ ] **Step 2: Update `direct-messages.ts` — inject ActivatedRoute + textarea + param-based auto-select**

Replace the full file content with:

```ts
import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';
import { parseInlineMarkdown } from '../../../shared/utils/inline-markdown';
import type { DialogDto } from '../../../core/dialogs/dialogs.models';
import type { DialogMessageDto } from '../../../core/signalr/hub.models';
import type { AttachmentDto } from '../../../core/files/files.models';

@Component({
  selector: 'app-direct-messages',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './direct-messages.html',
  styleUrl: './direct-messages.scss',
})
export class DirectMessagesComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly authSession = inject(AuthSessionService);
  private readonly dialogsApi = inject(DialogsApiService);
  private readonly chat = inject(ChatService);
  private readonly filesApi = inject(FilesApiService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly unread = inject(UnreadService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly user = this.authSession.user;
  readonly isLoadingDialogs = signal(true);
  readonly isLoadingMessages = signal(false);
  readonly errorMessage = signal('');
  readonly dialogs = signal<DialogDto[]>([]);
  readonly selectedDialog = signal<DialogDto | null>(null);
  readonly messages = signal<DialogMessageDto[]>([]);
  readonly isSending = signal(false);
  readonly isUploading = signal(false);
  readonly pendingAttachment = signal<AttachmentDto | null>(null);
  readonly composerValue = signal('');
  readonly replyingTo = signal<DialogMessageDto | null>(null);

  readonly fileInputEl = viewChild<ElementRef<HTMLInputElement>>('dmFileInput');

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe(params => {
        const id = params.get('id');
        this.loadDialogs(id ?? null);
      });

    effect(() => {
      const event = this.chat.lastDmEvent();
      if (!event) return;

      if (event.type === 'DirectMessageReceived') {
        this.messages.update(msgs => [...msgs, event.payload]);
      } else if (event.type === 'DirectMessageEdited') {
        this.messages.update(msgs =>
          msgs.map(m => m.id === event.payload.id ? event.payload : m));
      } else if (event.type === 'DirectMessageDeleted') {
        this.messages.update(msgs =>
          msgs.map(m => m.id === event.payload.messageId
            ? { ...m, isDeleted: true, content: null } : m));
      }
    });
  }

  selectDialog(dialog: DialogDto): void {
    const prev = this.selectedDialog();
    if (prev?.id === dialog.id) return;
    if (prev) {
      void this.chat.leaveDialog(prev.id);
    }
    this.selectedDialog.set(dialog);
    void this.chat.joinDialog(dialog.id);
    this.replyingTo.set(null);
    this.composerValue.set('');
    this.loadMessages(dialog.id);
  }

  canSendMessage(): boolean {
    const dialog = this.selectedDialog();
    return !!this.composerValue().trim() && !this.isSending() && !!dialog && !dialog.isFrozen;
  }

  sendMessage(): void {
    const content = this.composerValue().trim();
    const attachment = this.pendingAttachment();
    const dialog = this.selectedDialog();
    if ((!content && !attachment) || !dialog || this.isSending()) return;

    this.isSending.set(true);
    void this.chat.sendDirectMessage(dialog.id, content, this.replyingTo()?.id ?? null, attachment?.id ?? null)
      .then(() => {
        this.composerValue.set('');
        this.replyingTo.set(null);
        this.pendingAttachment.set(null);
      })
      .finally(() => { this.isSending.set(false); });
  }

  handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  startReply(msg: DialogMessageDto): void {
    this.replyingTo.set(msg);
  }

  cancelReply(): void { this.replyingTo.set(null); }

  renderContent(content: string | null): SafeHtml {
    if (!content) return this.sanitizer.bypassSecurityTrustHtml('');
    return this.sanitizer.bypassSecurityTrustHtml(parseInlineMarkdown(content));
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.uploadFile(file);
    input.value = '';
  }

  clearAttachment(): void { this.pendingAttachment.set(null); }

  downloadFile(attachmentId: string, fileName: string): void {
    this.filesApi.downloadFile(attachmentId, fileName);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  private uploadFile(file: File): void {
    if (this.isUploading()) return;
    this.isUploading.set(true);
    this.filesApi.uploadFile(file)
      .pipe(finalize(() => this.isUploading.set(false)))
      .subscribe({
        next: dto => this.pendingAttachment.set(dto),
        error: () => this.errorMessage.set('File upload failed.'),
      });
  }

  private loadDialogs(autoSelectId: string | null): void {
    this.isLoadingDialogs.set(true);
    this.dialogsApi.getDialogs()
      .pipe(finalize(() => this.isLoadingDialogs.set(false)))
      .subscribe({
        next: dialogs => {
          this.dialogs.set(dialogs);
          if (autoSelectId) {
            const target = dialogs.find(d => d.id === autoSelectId);
            if (target) this.selectDialog(target);
          }
        },
        error: () => this.errorMessage.set('Unable to load conversations.'),
      });
  }

  private loadMessages(dialogId: string): void {
    this.isLoadingMessages.set(true);
    this.dialogsApi.getMessages(dialogId)
      .pipe(finalize(() => this.isLoadingMessages.set(false)))
      .subscribe({
        next: messages => {
          this.messages.set([...messages].reverse());
          this.notificationsApi.markDialogRead(dialogId).subscribe();
          this.unread.setCount('dialog', dialogId, 0);
        },
        error: () => this.errorMessage.set('Unable to load messages.'),
      });
  }
}
```

- [ ] **Step 3: Update `direct-messages.html` — replace contenteditable with `<textarea>` + fix testid**

Key changes:
- Replace the `<div #composerEl contenteditable ...>` with `<textarea data-testid="dm-message-input">`
- Bind `[(ngModel)]="composerValue"` on the textarea
- Remove Bold/Italic/Code format buttons (no execCommand on textarea)
- Keep reply banner, attachment chip, send button
- Keep `data-testid="dm-send-btn"` on send button
- Keep `data-testid="dm-messages"` on message list container

```html
<div class="flex h-full overflow-hidden bg-surface">
  <!-- Pane 1: Dialog List -->
  <section class="w-80 flex flex-col bg-surface-container shrink-0">
    <div class="p-6 bg-surface-container-high">
      <h2 class="text-lg font-bold text-on-surface mb-4">Messages</h2>
    </div>

    <div class="flex-1 overflow-y-auto">
      @if (isLoadingDialogs()) {
        <div class="flex justify-center py-8">
          <span class="material-symbols-outlined text-xl text-outline animate-spin">progress_activity</span>
        </div>
      } @else if (dialogs().length === 0) {
        <div class="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
          <span class="material-symbols-outlined text-3xl text-outline">chat_bubble</span>
          <p class="text-xs text-on-surface-variant">No conversations yet.</p>
        </div>
      } @else {
        @for (dialog of dialogs(); track dialog.id) {
          <button
            class="w-full flex items-center gap-3 p-4 hover:bg-surface-container-lowest transition-colors text-left"
            [class.bg-surface-container-lowest]="selectedDialog()?.id === dialog.id"
            [class.shadow-sm]="selectedDialog()?.id === dialog.id"
            [attr.data-testid]="'dialog-item-' + dialog.id"
            (click)="selectDialog(dialog)"
          >
            <div class="w-10 h-10 rounded-full bg-surface-container-high overflow-hidden shrink-0 flex items-center justify-center">
              @if (dialog.otherAvatarUrl) {
                <img [src]="dialog.otherAvatarUrl" class="w-full h-full object-cover" alt="" />
              } @else {
                <span class="material-symbols-outlined text-on-surface-variant" style="font-size:1.25rem">person</span>
              }
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-on-surface truncate">{{ dialog.otherUsername }}</p>
              @if (dialog.isFrozen) {
                <p class="text-[10px] text-error">Conversation frozen</p>
              }
            </div>
          </button>
        }
      }
    </div>
  </section>

  <!-- Pane 2: Message Thread -->
  <section class="flex-1 flex flex-col overflow-hidden">
    @if (!selectedDialog()) {
      <div class="flex-1 flex items-center justify-center text-on-surface-variant">
        <div class="text-center">
          <span class="material-symbols-outlined text-4xl text-outline block mb-2">chat</span>
          <p class="text-sm">Select a conversation to start chatting</p>
        </div>
      </div>
    } @else {
      <!-- Header -->
      <div class="h-16 bg-surface-container flex items-center px-6 gap-3 shrink-0">
        <div class="w-8 h-8 rounded-full bg-surface-container-high overflow-hidden flex items-center justify-center">
          @if (selectedDialog()!.otherAvatarUrl) {
            <img [src]="selectedDialog()!.otherAvatarUrl" class="w-full h-full object-cover" alt="" />
          } @else {
            <span class="material-symbols-outlined text-on-surface-variant" style="font-size:1rem">person</span>
          }
        </div>
        <h3 class="font-bold text-on-surface text-sm">{{ selectedDialog()!.otherUsername }}</h3>
        @if (selectedDialog()!.isFrozen) {
          <span class="ml-auto text-[10px] font-bold uppercase tracking-widest text-error bg-error-container/30 px-2 py-1 rounded-full">Frozen</span>
        }
      </div>

      <!-- Messages -->
      <div class="flex-1 overflow-y-auto p-6 space-y-3" data-testid="dm-messages">
        @if (isLoadingMessages()) {
          <div class="flex justify-center py-8">
            <span class="material-symbols-outlined text-xl text-outline animate-spin">progress_activity</span>
          </div>
        } @else if (messages().length === 0) {
          <div class="text-center py-12 text-on-surface-variant text-sm">No messages yet. Say hello!</div>
        } @else {
          @for (msg of messages(); track msg.id) {
            @if (!msg.isDeleted) {
              <div class="group relative flex" [class.justify-end]="msg.sender.id === user()?.id">
                <div
                  class="max-w-xs lg:max-w-sm px-4 py-2.5 rounded-xl text-sm"
                  [class.bg-primary]="msg.sender.id === user()?.id"
                  [class.text-on-primary]="msg.sender.id === user()?.id"
                  [class.rounded-br-sm]="msg.sender.id === user()?.id"
                  [class.bg-surface-container-lowest]="msg.sender.id !== user()?.id"
                  [class.text-on-surface]="msg.sender.id !== user()?.id"
                  [class.rounded-bl-sm]="msg.sender.id !== user()?.id"
                >
                  @if (msg.replyTo) {
                    <div class="border-l-2 border-current/30 pl-2 mb-1 opacity-70"
                         data-testid="reply-quote">
                      <p class="text-[10px] font-bold">{{ msg.replyTo.sender.username }}</p>
                      <p class="text-xs truncate max-w-[14rem]" [innerHTML]="renderContent(msg.replyTo.content)"></p>
                    </div>
                  }
                  <p data-testid="dm-message-text" [innerHTML]="renderContent(msg.content)"></p>
                  @if (msg.attachment) {
                    <div class="flex items-center gap-3 mt-2 px-3 py-2 bg-surface-container rounded-lg max-w-xs">
                      <span class="material-symbols-outlined text-on-surface-variant shrink-0">
                        {{ msg.attachment.contentType.startsWith('image/') ? 'image' : 'attach_file' }}
                      </span>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-on-surface truncate">{{ msg.attachment.fileName }}</p>
                        <p class="text-xs text-on-surface-variant">{{ formatSize(msg.attachment.sizeBytes) }}</p>
                      </div>
                      <button type="button"
                              class="p-1 rounded hover:bg-surface-container-high text-on-surface-variant"
                              (click)="downloadFile(msg.attachment.id, msg.attachment.fileName)">
                        <span class="material-symbols-outlined text-sm">download</span>
                      </button>
                    </div>
                  }
                  @if (msg.editedAt) {
                    <p class="text-[9px] opacity-60 mt-0.5">edited</p>
                  }
                </div>
                <div class="absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-surface-container-high rounded-lg px-1 py-0.5 shadow-sm"
                     [class.right-full]="msg.sender.id === user()?.id"
                     [class.left-full]="msg.sender.id !== user()?.id"
                     [class.mr-1]="msg.sender.id === user()?.id"
                     [class.ml-1]="msg.sender.id !== user()?.id">
                  <button type="button"
                          class="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                          title="Reply"
                          (click)="startReply(msg)">
                    <span class="material-symbols-outlined text-sm">reply</span>
                  </button>
                </div>
              </div>
            } @else {
              <div class="flex" [class.justify-end]="msg.sender.id === user()?.id">
                <div class="px-4 py-2 rounded-xl text-xs text-on-surface-variant italic bg-surface-container">
                  Message deleted
                </div>
              </div>
            }
          }
        }
      </div>

      <!-- Compose -->
      <div class="p-4 bg-surface-container-low shrink-0">
        @if (errorMessage()) {
          <p class="text-error text-xs mb-2">{{ errorMessage() }}</p>
        }
        <input type="file" #dmFileInput hidden (change)="onFileSelected($event)" />
        @if (pendingAttachment()) {
          <div class="flex items-center gap-2 px-4 py-2 bg-primary-container/30 rounded-lg mb-2 text-sm">
            <span class="material-symbols-outlined text-sm text-primary">attach_file</span>
            <span class="flex-1 truncate font-medium">{{ pendingAttachment()!.fileName }}</span>
            <span class="text-xs text-on-surface-variant">{{ formatSize(pendingAttachment()!.sizeBytes) }}</span>
            <button class="hover:text-error" type="button" (click)="clearAttachment()">
              <span class="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        }
        <div class="rounded-xl bg-surface-container-low border border-outline-variant/30 focus-within:ring-1 focus-within:ring-primary/30">
          @if (replyingTo()) {
            <div class="flex items-center justify-between px-4 py-2 bg-primary-container/40 border-l-2 border-primary rounded-t-xl"
                 data-testid="reply-banner">
              <div class="min-w-0">
                <p class="text-xs font-bold text-primary flex items-center gap-1">
                  <span class="material-symbols-outlined text-sm">reply</span>
                  Replying to {{ replyingTo()!.sender.username }}
                </p>
                <p class="text-xs text-on-surface-variant truncate max-w-xs">{{ replyingTo()!.content }}</p>
              </div>
              <button type="button"
                      class="ml-2 shrink-0 text-on-surface-variant hover:text-on-surface"
                      data-testid="reply-banner-dismiss"
                      (click)="cancelReply()">
                <span class="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          }
          <textarea
            class="block w-full resize-none bg-transparent px-4 py-3 text-sm text-on-surface outline-none min-h-[72px] max-h-40 overflow-y-auto"
            data-testid="dm-message-input"
            placeholder="Message..."
            rows="1"
            [(ngModel)]="composerValue"
            (keydown)="handleComposerKeydown($event)"
          ></textarea>
          <div class="flex items-center gap-1 px-3 py-2 border-t border-outline-variant/20">
            <button type="button"
                    class="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant disabled:opacity-50"
                    [disabled]="isUploading()"
                    title="Attach file"
                    (click)="dmFileInput.click()">
              <span class="material-symbols-outlined">attach_file</span>
            </button>
            <div class="flex-1"></div>
            <button
              class="px-4 py-2 bg-primary text-on-primary text-sm font-bold rounded-lg hover:bg-primary-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="dm-send-btn"
              type="button"
              [disabled]="!canSendMessage()"
              (click)="sendMessage()"
            >
              <span class="material-symbols-outlined" style="font-size:1.25rem">send</span>
            </button>
          </div>
        </div>
      </div>
    }
  </section>

  <!-- Pane 3: Contact Info -->
  @if (selectedDialog()) {
    <section class="w-72 flex flex-col bg-surface-container shrink-0 overflow-y-auto p-6">
      <div class="flex flex-col items-center gap-4 text-center">
        <div class="w-20 h-20 rounded-full bg-surface-container-high overflow-hidden flex items-center justify-center">
          @if (selectedDialog()!.otherAvatarUrl) {
            <img [src]="selectedDialog()!.otherAvatarUrl" class="w-full h-full object-cover" alt="" />
          } @else {
            <span class="material-symbols-outlined text-on-surface-variant text-4xl">person</span>
          }
        </div>
        <div>
          <h3 class="font-bold text-on-surface">{{ selectedDialog()!.otherUsername }}</h3>
          @if (selectedDialog()!.isFrozen) {
            <p class="text-xs text-error mt-1">Conversation frozen</p>
          }
        </div>
      </div>
    </section>
  }
</div>
```

- [ ] **Step 4: Build check**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder/frontend
npx ng build --configuration development 2>&1 | tail -20
```

Expected: no errors

---

### Task 2: New unit tests for DialogsEndpoints

**Files:**
- Modify: `tests/ChatHerder.Unit.Tests/Endpoints/DialogsEndpointsTests.cs`

- [ ] **Step 1: Add missing test cases**

Append these facts to the test class (before the closing `}`):

```csharp
[Fact]
public async Task CreateDialog_Returns403_WhenNotFriends()
{
    await using var db = BuildContext();
    var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
    db.Users.AddRange(user1, user2);
    await db.SaveChangesAsync();

    var result = await DialogsEndpointsHelper.CreateDialog(
        new CreateDialogRequest(user2.Id), MakePrincipal(user1.Id), db, CancellationToken.None);

    Assert.Equal(403, GetStatusCode(result));
}

[Fact]
public async Task CreateDialog_ReturnsBadRequest_WhenSelf()
{
    await using var db = BuildContext();
    var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    db.Users.Add(user1);
    await db.SaveChangesAsync();

    var result = await DialogsEndpointsHelper.CreateDialog(
        new CreateDialogRequest(user1.Id), MakePrincipal(user1.Id), db, CancellationToken.None);

    Assert.Equal(400, GetStatusCode(result));
}

[Fact]
public async Task EditDmMessage_Returns403_WhenNotSender()
{
    await using var db = BuildContext();
    var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
    db.Users.AddRange(user1, user2);
    var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
    var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
    db.PersonalDialogs.Add(dialog);
    var msg = new PersonalDialogMessage
        { DialogId = dialog.Id, AuthorId = user1.Id, Content = "original", SequenceNumber = 1 };
    db.PersonalDialogMessages.Add(msg);
    await db.SaveChangesAsync();

    var result = await DialogsEndpointsHelper.EditDmMessage(
        msg.Id, new EditDmMessageRequest("hijack"), MakePrincipal(user2.Id), db, CancellationToken.None);

    Assert.Equal(403, GetStatusCode(result));
}

[Fact]
public async Task DeleteDmMessage_Returns403_WhenNotSender()
{
    await using var db = BuildContext();
    var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
    db.Users.AddRange(user1, user2);
    var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
    var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
    db.PersonalDialogs.Add(dialog);
    var msg = new PersonalDialogMessage
        { DialogId = dialog.Id, AuthorId = user1.Id, Content = "original", SequenceNumber = 1 };
    db.PersonalDialogMessages.Add(msg);
    await db.SaveChangesAsync();

    var result = await DialogsEndpointsHelper.DeleteDmMessage(
        msg.Id, MakePrincipal(user2.Id), db, CancellationToken.None);

    Assert.Equal(403, GetStatusCode(result));
}

[Fact]
public async Task GetMessages_Returns403_WhenNotParticipant()
{
    await using var db = BuildContext();
    var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
    var user3 = new User { Username = "carol", Email = "carol@test.com", PasswordHash = "x" };
    db.Users.AddRange(user1, user2, user3);
    var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
    var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
    db.PersonalDialogs.Add(dialog);
    await db.SaveChangesAsync();

    var result = await DialogsEndpointsHelper.GetMessages(
        dialog.Id, MakePrincipal(user3.Id), db, null, 50, CancellationToken.None);

    Assert.Equal(403, GetStatusCode(result));
}

[Fact]
public async Task GetMessages_ReturnsMessagesInDescendingOrder()
{
    await using var db = BuildContext();
    var user1 = new User { Username = "alice", Email = "alice@test.com", PasswordHash = "x" };
    var user2 = new User { Username = "bob",   Email = "bob@test.com",   PasswordHash = "x" };
    db.Users.AddRange(user1, user2);
    var (u1, u2) = user1.Id < user2.Id ? (user1.Id, user2.Id) : (user2.Id, user1.Id);
    var dialog = new PersonalDialog { User1Id = u1, User2Id = u2 };
    db.PersonalDialogs.Add(dialog);
    var base_ = DateTime.UtcNow.AddMinutes(-5);
    db.PersonalDialogMessages.AddRange(
        new PersonalDialogMessage { DialogId = dialog.Id, AuthorId = user1.Id, Content = "first",  SequenceNumber = 1, SentAt = base_ },
        new PersonalDialogMessage { DialogId = dialog.Id, AuthorId = user1.Id, Content = "second", SequenceNumber = 2, SentAt = base_.AddSeconds(1) });
    await db.SaveChangesAsync();

    var result = await DialogsEndpointsHelper.GetMessages(
        dialog.Id, MakePrincipal(user1.Id), db, null, 50, CancellationToken.None);

    // The endpoint returns descending (newest first); client reverses on load
    var prop = result.GetType().GetProperty("Value");
    var value = prop?.GetValue(result);
    var messages = (value as IEnumerable<object>)?.Cast<ChatHerder.Application.DTOs.DialogMessageDto>().ToList();
    Assert.NotNull(messages);
    Assert.Equal(2, messages!.Count);
    Assert.Equal("second", messages[0].Content); // newest first
    Assert.Equal("first",  messages[1].Content);
}
```

- [ ] **Step 2: Run unit tests — verify all pass**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
dotnet test tests/ChatHerder.Unit.Tests/ChatHerder.Unit.Tests.csproj --verbosity minimal 2>&1 | tail -20
```

Expected: all tests pass

---

### Task 3: New e2e tests for DM functionality

**Files:**
- Create: `e2e/tests/04-dm.spec.ts`

- [ ] **Step 1: Create `e2e/tests/04-dm.spec.ts`**

```typescript
import { test, expect } from '../fixtures/test-fixtures';
import { createHubConnection } from '../helpers/signalr.helpers';

async function becomeFriends(
  api: import('../helpers/api.helpers').ApiHelpers,
  senderToken: string,
  receiverToken: string,
  receiverUsername: string,
  senderId: string,
): Promise<void> {
  await api.sendFriendRequest(senderToken, receiverUsername, 'E2E DM setup');
  const requests = await api.getFriendRequests(receiverToken);
  const request = requests.find(r => r.senderId === senderId);
  if (!request?.id) throw new Error('Friend request not found');
  await api.acceptFriendRequest(receiverToken, request.id);
}

test.describe('Direct messages', () => {
  test('DM message sent via SignalR appears in history for both participants', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `dm-api-${Date.now()}`;

    await chat.invoke('SendDirectMessage', dialog.id, content, null, null);
    await chat.stop();

    const historyA = await api.getDialogMessages(userA.accessToken, dialog.id);
    expect(historyA.some(m => m.content === content)).toBe(true);

    const historyB = await api.getDialogMessages(userB.accessToken, dialog.id);
    expect(historyB.some(m => m.content === content)).toBe(true);
  });

  test('recipient receives DM in real-time within 3 seconds', async ({ userA, userB, userBPage, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const content = `dm-realtime-${Date.now()}`;

    // userB navigates to the DM page and selects the dialog
    await userBPage.goto(`/app/messages/${dialog.id}`);
    await expect(userBPage.locator(`[data-testid="dialog-item-${dialog.id}"]`)).toBeVisible({ timeout: 10_000 });
    await userBPage.click(`[data-testid="dialog-item-${dialog.id}"]`);
    await expect(userBPage.locator('[data-testid="dm-messages"]')).toBeVisible({ timeout: 5_000 });

    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    await chat.invoke('SendDirectMessage', dialog.id, content, null, null);
    await chat.stop();

    await expect(
      userBPage.locator('[data-testid="dm-message-text"]').filter({ hasText: content }),
    ).toBeVisible({ timeout: 3_000 });
  });

  test('frozen dialog rejects SendDirectMessage via SignalR', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);

    // userB blocks userA → dialog frozen
    await api.blockUser(userB.accessToken, userA.id);

    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    await expect(
      chat.invoke('SendDirectMessage', dialog.id, 'blocked content', null, null),
    ).rejects.toThrow();
    await chat.stop();
  });

  test('DM message author can edit their message via API', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const original = `dm-edit-before-${Date.now()}`;
    await chat.invoke('SendDirectMessage', dialog.id, original, null, null);
    await chat.stop();

    const history = await api.getDialogMessages(userA.accessToken, dialog.id);
    const msg = history.find(m => m.content === original);
    if (!msg) throw new Error('Message not found in history');

    const ctx = await api.authContext(userA.accessToken);
    const edit = await ctx.patch(`/api/dm-messages/${msg.id}`, { data: { content: 'dm-edit-after' } });
    expect(edit.status(), await edit.text()).toBe(200);
    const body = await edit.json();
    expect(body.content).toBe('dm-edit-after');
    expect(body.editedAt).toBeTruthy();
    await ctx.dispose();
  });

  test('non-author cannot edit another participant DM via API', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `dm-403-${Date.now()}`;
    await chat.invoke('SendDirectMessage', dialog.id, content, null, null);
    await chat.stop();

    const history = await api.getDialogMessages(userA.accessToken, dialog.id);
    const msg = history.find(m => m.content === content);
    if (!msg) throw new Error('Message not found');

    const ctx = await api.authContext(userB.accessToken);
    const edit = await ctx.patch(`/api/dm-messages/${msg.id}`, { data: { content: 'hijack' } });
    expect(edit.status()).toBe(403);
    await ctx.dispose();
  });

  test('DM message author can soft-delete their message', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const content = `dm-delete-${Date.now()}`;
    await chat.invoke('SendDirectMessage', dialog.id, content, null, null);
    await chat.stop();

    const history = await api.getDialogMessages(userA.accessToken, dialog.id);
    const msg = history.find(m => m.content === content);
    if (!msg) throw new Error('Message not found');

    const ctx = await api.authContext(userA.accessToken);
    const del = await ctx.delete(`/api/dm-messages/${msg.id}`);
    expect(del.status()).toBe(204);

    const after = await api.getDialogMessages(userA.accessToken, dialog.id);
    const deleted = after.find(m => m.id === msg.id);
    expect(deleted).toMatchObject({ isDeleted: true, content: null });
    await ctx.dispose();
  });

  test('DM history preserves send order — oldest last in API response, reversed in UI', async ({ userA, userB, api }) => {
    await becomeFriends(api, userA.accessToken, userB.accessToken, userB.username, userA.id);
    const dialog = await api.createDialog(userA.accessToken, userB.id);
    const chat = await createHubConnection('/hubs/chat', userA.accessToken);
    const suffix = Date.now();
    await chat.invoke('SendDirectMessage', dialog.id, `dm-order-first-${suffix}`, null, null);
    await chat.invoke('SendDirectMessage', dialog.id, `dm-order-second-${suffix}`, null, null);
    await chat.stop();

    const history = await api.getDialogMessages(userA.accessToken, dialog.id);
    const contents = history.map(m => m.content);
    // API returns newest first
    expect(contents.indexOf(`dm-order-second-${suffix}`)).toBeLessThan(
      contents.indexOf(`dm-order-first-${suffix}`),
    );
  });
});
```

- [ ] **Step 2: Run the new e2e tests to verify they pass**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
npx playwright test e2e/tests/04-dm.spec.ts --reporter=list 2>&1 | tail -30
```

Expected: all 6 new tests pass

---

### Task 4: Run UAT failing test to confirm fix

- [ ] **Step 1: Run the original failing test**

```bash
cd /Users/igorvaskonyan/projects/ai/ai-chat-herder
npx playwright test e2e/tests/uat/06-dm-flow.uat.spec.ts --reporter=list 2>&1 | tail -20
```

Expected: both UAT tests pass

---

### Task 5: Update DEVELOPMENT_LOG.md

- [ ] Log entry for T204 documenting root causes and changes

---

## Self-Review Checklist

- [x] Spec coverage: UAT test 91 (testid + toHaveValue) ✓, frozen dialog test ✓, real-time DM ✓, edit/delete coverage ✓
- [x] No placeholders — all code blocks complete
- [x] Type consistency — `composerValue` signal used throughout, no `composerEl` HTMLDivElement reference
- [x] `[(ngModel)]` on textarea requires `FormsModule` in imports ✓ (already imported)
- [x] `data-testid="dm-message-text"` added to message `<p>` for the realtime test assertion
- [x] Route param `id` consumed via `ActivatedRoute.paramMap` — stream stays alive if route changes
