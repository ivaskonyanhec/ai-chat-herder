import { Component, OnInit, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { FormsModule } from '@angular/forms';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';
import type { RoomDto } from '../../../core/rooms/rooms.models';
import type { MessageDto } from '../../../core/signalr/hub.models';
import type { AttachmentDto } from '../../../core/files/files.models';

@Component({
  selector: 'app-room-chat',
  standalone: true,
  imports: [Button, Textarea, FormsModule],
  templateUrl: './room-chat.html',
  styleUrl: './room-chat.scss',
})
export class RoomChatComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly authSession = inject(AuthSessionService);
  private readonly roomsApi = inject(RoomsApiService);
  private readonly chat = inject(ChatService);
  private readonly presence = inject(PresenceService);
  private readonly filesApi = inject(FilesApiService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly unread = inject(UnreadService);

  readonly user = this.authSession.user;
  readonly roomId = computed(() => this.route.snapshot.params['id'] as string);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly room = signal<RoomDto | null>(null);
  readonly messages = signal<MessageDto[]>([]);
  readonly messageText = signal('');
  readonly isSending = signal(false);
  readonly isUploading = signal(false);
  readonly pendingAttachment = signal<AttachmentDto | null>(null);

  constructor() {
    effect(() => {
      const event = this.chat.lastRoomEvent();
      if (!event) return;

      if (event.type === 'MessageReceived') {
        this.messages.update(msgs => [...msgs, event.payload]);
      } else if (event.type === 'MessageEdited') {
        this.messages.update(msgs =>
          msgs.map(m => m.id === event.payload.id ? event.payload : m)
        );
      } else if (event.type === 'MessageDeleted') {
        this.messages.update(msgs =>
          msgs.map(m => m.id === event.payload.messageId
            ? { ...m, isDeleted: true, content: null }
            : m
          )
        );
      }
    });
  }

  ngOnInit(): void {
    const id = this.roomId();
    void this.presence.joinRoom(id);
    this.loadRoom(id);
  }

  ngOnDestroy(): void {
    void this.presence.leaveRoom(this.roomId());
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

  sendMessage(): void {
    const content = this.messageText().trim();
    const attachment = this.pendingAttachment();
    if ((!content && !attachment) || this.isSending()) return;
    this.isSending.set(true);
    void this.chat.sendMessage(this.roomId(), content, null, attachment?.id ?? null)
      .then(() => {
        this.messageText.set('');
        this.pendingAttachment.set(null);
      })
      .finally(() => this.isSending.set(false));
  }

  downloadFile(attachmentId: string, fileName: string): void {
    this.filesApi.downloadFile(attachmentId, fileName);
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  private loadRoom(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.roomsApi.getRoom(id).subscribe({
      next: room => {
        this.room.set(room);
        this.roomsApi.getMessages(id)
          .pipe(finalize(() => this.isLoading.set(false)))
          .subscribe({
            next: msgs => {
              this.messages.set(msgs);
              this.notificationsApi.markRoomRead(id).subscribe();
              this.unread.setCount('room', id, 0);
            },
            error: () => this.errorMessage.set('Unable to load messages.'),
          });
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Room not found or access denied.');
      },
    });
  }
}
