import { Injectable, inject, signal } from '@angular/core';
import { HubConnection } from '@microsoft/signalr';
import { HUB_CONNECTION_FACTORY } from './hub-connection.factory';
import { AuthSessionService } from '../auth/auth-session.service';
import { UnreadService } from './unread.service';
import type {
  MessageDto,
  DialogMessageDto,
  MessageDeletedEvent,
  DirectMessageDeletedEvent,
  UserTypingEvent,
  UserTypingInDialogEvent,
  UnreadCountChangedEvent,
  RoomChatEvent,
  DmChatEvent,
  TypingEvent,
} from './hub.models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly factory = inject(HUB_CONNECTION_FACTORY);
  private readonly authSession = inject(AuthSessionService);
  private readonly unread = inject(UnreadService);

  private connection: HubConnection | null = null;

  private readonly _lastRoomEvent = signal<RoomChatEvent | null>(null);
  private readonly _lastDmEvent = signal<DmChatEvent | null>(null);
  private readonly _lastTypingEvent = signal<TypingEvent | null>(null);

  readonly lastRoomEvent = this._lastRoomEvent.asReadonly();
  readonly lastDmEvent = this._lastDmEvent.asReadonly();
  readonly lastTypingEvent = this._lastTypingEvent.asReadonly();

  async connect(): Promise<void> {
    const token = this.authSession.accessToken();
    if (!token || this.connection) return;

    this.connection = this.factory('/hubs/chat', () => this.authSession.accessToken() ?? '');
    this.registerHandlers(this.connection);
    await this.connection.start();
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }
  }

  async sendMessage(
    roomId: string,
    content: string,
    replyToId: string | null,
    attachmentId: string | null,
  ): Promise<void> {
    await this.connection?.invoke('SendMessage', roomId, content, replyToId, attachmentId);
  }

  async editMessage(messageId: string, newContent: string): Promise<void> {
    await this.connection?.invoke('EditMessage', messageId, newContent);
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.connection?.invoke('DeleteMessage', messageId);
  }

  async startTyping(roomId: string): Promise<void> {
    await this.connection?.invoke('StartTyping', roomId);
  }

  async stopTyping(roomId: string): Promise<void> {
    await this.connection?.invoke('StopTyping', roomId);
  }

  async sendDirectMessage(
    dialogId: string,
    content: string,
    replyToId: string | null,
    attachmentId: string | null,
  ): Promise<void> {
    await this.connection?.invoke('SendDirectMessage', dialogId, content, replyToId, attachmentId);
  }

  async editDirectMessage(messageId: string, newContent: string): Promise<void> {
    await this.connection?.invoke('EditDirectMessage', messageId, newContent);
  }

  async deleteDirectMessage(messageId: string): Promise<void> {
    await this.connection?.invoke('DeleteDirectMessage', messageId);
  }

  async startTypingDM(dialogId: string): Promise<void> {
    await this.connection?.invoke('StartTypingDM', dialogId);
  }

  async stopTypingDM(dialogId: string): Promise<void> {
    await this.connection?.invoke('StopTypingDM', dialogId);
  }

  private registerHandlers(conn: HubConnection): void {
    conn.on('MessageReceived', (payload: MessageDto) => {
      this._lastRoomEvent.set({ type: 'MessageReceived', payload });
    });
    conn.on('MessageEdited', (payload: MessageDto) => {
      this._lastRoomEvent.set({ type: 'MessageEdited', payload });
    });
    conn.on('MessageDeleted', (payload: MessageDeletedEvent) => {
      this._lastRoomEvent.set({ type: 'MessageDeleted', payload });
    });

    conn.on('DirectMessageReceived', (payload: DialogMessageDto) => {
      this._lastDmEvent.set({ type: 'DirectMessageReceived', payload });
    });
    conn.on('DirectMessageEdited', (payload: DialogMessageDto) => {
      this._lastDmEvent.set({ type: 'DirectMessageEdited', payload });
    });
    conn.on('DirectMessageDeleted', (payload: DirectMessageDeletedEvent) => {
      this._lastDmEvent.set({ type: 'DirectMessageDeleted', payload });
    });

    conn.on('UserTyping', (payload: UserTypingEvent) => {
      this._lastTypingEvent.set({ type: 'UserTyping', payload });
    });
    conn.on('UserTypingInDialog', (payload: UserTypingInDialogEvent) => {
      this._lastTypingEvent.set({ type: 'UserTypingInDialog', payload });
    });

    conn.on('UnreadCountChanged', (e: UnreadCountChangedEvent) => {
      this.unread.setCount(e.contextType, e.contextId, e.count);
    });
  }
}
