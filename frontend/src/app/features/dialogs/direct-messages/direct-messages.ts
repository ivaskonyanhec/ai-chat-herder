import { Component, DestroyRef, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
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
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { parseInlineMarkdown } from '../../../shared/utils/inline-markdown';
import type { DialogDto } from '../../../core/dialogs/dialogs.models';
import type { DialogMessageDto } from '../../../core/signalr/hub.models';
import type { AttachmentDto } from '../../../core/files/files.models';

@Component({
  selector: 'app-direct-messages',
  standalone: true,
  imports: [FormsModule, AvatarComponent],
  templateUrl: './direct-messages.html',
  styleUrl: './direct-messages.scss',
  host: { class: 'block flex-1 min-h-0 overflow-hidden' },
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
  private readonly destroyRef = inject(DestroyRef);

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
    return (!!this.composerValue().trim() || !!this.pendingAttachment())
      && !this.isSending() && !!dialog && !dialog.isFrozen;
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
        error: (err: { error?: { error?: string } }) =>
          this.errorMessage.set(err.error?.error ?? 'File upload failed.'),
      });
  }

  private loadDialogs(autoSelectId: string | null): void {
    this.isLoadingDialogs.set(true);
    this.dialogsApi.getDialogs()
      .pipe(finalize(() => this.isLoadingDialogs.set(false)), takeUntilDestroyed(this.destroyRef))
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
      .pipe(finalize(() => this.isLoadingMessages.set(false)), takeUntilDestroyed(this.destroyRef))
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
