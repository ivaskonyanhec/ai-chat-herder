import { Component, effect, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import type { DialogDto } from '../../../core/dialogs/dialogs.models';
import type { DialogMessageDto } from '../../../core/signalr/hub.models';
import type { AttachmentDto } from '../../../core/files/files.models';

@Component({
  selector: 'app-direct-messages',
  standalone: true,
  imports: [],
  templateUrl: './direct-messages.html',
  styleUrl: './direct-messages.scss',
})
export class DirectMessagesComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly dialogsApi = inject(DialogsApiService);
  private readonly chat = inject(ChatService);
  private readonly filesApi = inject(FilesApiService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly unread = inject(UnreadService);
  private readonly presence = inject(PresenceService);

  readonly user = this.authSession.user;
  readonly isLoadingDialogs = signal(true);
  readonly isLoadingMessages = signal(false);
  readonly errorMessage = signal('');
  readonly dialogs = signal<DialogDto[]>([]);
  readonly selectedDialog = signal<DialogDto | null>(null);
  readonly messages = signal<DialogMessageDto[]>([]);
  readonly messageText = signal('');
  readonly isSending = signal(false);
  readonly isUploading = signal(false);
  readonly pendingAttachment = signal<AttachmentDto | null>(null);

  constructor() {
    this.loadDialogs();

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
    if (prev) void this.presence.leaveDialog(prev.id);
    this.selectedDialog.set(dialog);
    void this.presence.joinDialog(dialog.id);
    this.loadMessages(dialog.id);
  }

  sendMessage(): void {
    const content = this.messageText().trim();
    const attachment = this.pendingAttachment();
    const dialog = this.selectedDialog();
    if ((!content && !attachment) || !dialog || this.isSending()) return;

    this.isSending.set(true);
    void this.chat.sendDirectMessage(dialog.id, content, null, attachment?.id ?? null)
      .then(() => {
        this.messageText.set('');
        this.pendingAttachment.set(null);
      })
      .finally(() => { this.isSending.set(false); });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.uploadFile(file);
    input.value = '';
  }

  onPaste(event: ClipboardEvent): void {
    const file = event.clipboardData?.files[0];
    if (file) {
      event.preventDefault();
      this.uploadFile(file);
    }
  }

  clearAttachment(): void {
    this.pendingAttachment.set(null);
  }

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

  private loadDialogs(): void {
    this.isLoadingDialogs.set(true);
    this.dialogsApi.getDialogs()
      .pipe(finalize(() => this.isLoadingDialogs.set(false)))
      .subscribe({
        next: dialogs => this.dialogs.set(dialogs),
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
