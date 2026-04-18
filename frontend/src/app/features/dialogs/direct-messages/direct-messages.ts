import { Component, effect, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import type { DialogDto } from '../../../core/dialogs/dialogs.models';
import type { DialogMessageDto } from '../../../core/signalr/hub.models';

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

  readonly user = this.authSession.user;
  readonly isLoadingDialogs = signal(true);
  readonly isLoadingMessages = signal(false);
  readonly errorMessage = signal('');
  readonly dialogs = signal<DialogDto[]>([]);
  readonly selectedDialog = signal<DialogDto | null>(null);
  readonly messages = signal<DialogMessageDto[]>([]);
  readonly messageText = signal('');
  readonly isSending = signal(false);

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
    this.selectedDialog.set(dialog);
    this.loadMessages(dialog.id);
  }

  sendMessage(): void {
    const content = this.messageText().trim();
    const dialog  = this.selectedDialog();
    if (!content || !dialog || this.isSending()) return;

    this.isSending.set(true);
    void this.chat.sendDirectMessage(dialog.id, content, null, null)
      .then(() => { this.messageText.set(''); })
      .finally(() => { this.isSending.set(false); });
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
        next: messages => this.messages.set([...messages].reverse()),
        error: () => this.errorMessage.set('Unable to load messages.'),
      });
  }
}
