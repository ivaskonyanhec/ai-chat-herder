import { Component, DestroyRef, OnInit, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, filter, finalize, map } from 'rxjs';
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
import type { MessageDto, RoomMemberPresence } from '../../../core/signalr/hub.models';
import type { AttachmentDto } from '../../../core/files/files.models';

@Component({
  selector: 'app-room-chat',
  standalone: true,
  imports: [Textarea, FormsModule, RouterLink],
  templateUrl: './room-chat.html',
  styleUrl: './room-chat.scss',
})
export class RoomChatComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authSession = inject(AuthSessionService);
  private readonly roomsApi = inject(RoomsApiService);
  private readonly chat = inject(ChatService);
  private readonly presence = inject(PresenceService);
  private readonly filesApi = inject(FilesApiService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly unread = inject(UnreadService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = this.authSession.user;
  readonly roomId = signal(this.route.snapshot.params['id'] as string);

  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly room = signal<RoomDto | null>(null);
  readonly messages = signal<MessageDto[]>([]);
  readonly messageText = signal('');
  readonly isSending = signal(false);
  readonly isUploading = signal(false);
  readonly pendingAttachment = signal<AttachmentDto | null>(null);
  readonly emojiPickerOpen = signal(false);
  readonly quickEmojis = ['😀', '😂', '👍', '🙏', '❤️', '🎉', '🔥', '👀'];
  readonly members = signal<RoomMemberPresence[]>([]);
  readonly presenceMap = this.presence.presenceMap;
  private joinedRoomId: string | null = null;

  constructor() {
    effect(() => {
      const event = this.chat.lastRoomEvent();
      if (!event) return;

      if (event.type === 'MessageReceived') {
        this.messages.update(msgs => this.sortMessages([
          ...msgs.filter(msg => msg.id !== event.payload.id),
          event.payload,
        ]));
      } else if (event.type === 'MessageEdited') {
        this.messages.update(msgs =>
          this.sortMessages(msgs.map(m => m.id === event.payload.id ? event.payload : m))
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

    effect(() => {
      const snap = this.presence.roomMembersSnapshot();
      if (!snap || snap.roomId !== this.roomId()) return;
      this.members.set(snap.members);
    });

    effect(() => {
      const event = this.presence.memberJoined();
      if (!event || event.roomId !== this.roomId()) return;
      const status = untracked(() => this.presence.presenceMap().get(event.user.userId)) ?? 'online';
      this.members.update(list => [
        ...list.filter(m => m.userId !== event.user.userId),
        {
          userId:         event.user.userId,
          username:       event.user.username,
          avatarUrl:      event.user.avatarUrl,
          role:           'Member' as const,
          joinedAt:       new Date().toISOString(),
          presenceStatus: status,
        },
      ]);
    });

    effect(() => {
      const event = this.presence.memberLeft();
      if (!event || event.roomId !== this.roomId()) return;
      this.members.update(list => list.filter(m => m.userId !== event.userId));
    });

    effect(() => {
      const event = this.presence.removedFromRoom();
      if (!event || event.roomId !== this.roomId()) return;
      void this.router.navigate(['/app']);
    });
  }

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map(params => params.get('id')),
        filter((id): id is string => !!id),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(id => this.switchRoom(id));
  }

  ngOnDestroy(): void {
    if (!this.joinedRoomId) return;
    void this.presence.leaveRoom(this.joinedRoomId);
    void this.chat.leaveRoom(this.joinedRoomId);
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

  toggleEmojiPicker(): void {
    this.emojiPickerOpen.update(open => !open);
  }

  insertEmoji(emoji: string): void {
    this.messageText.update(text => `${text}${emoji}`);
    this.emojiPickerOpen.set(false);
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

  canSendMessage(): boolean {
    return (!!this.messageText().trim() || !!this.pendingAttachment()) && !this.isSending() && !this.isUploading();
  }

  handleComposerEnter(event: KeyboardEvent): void {
    if (event.shiftKey) return;
    event.preventDefault();
    this.sendMessage();
  }

  resizeComposer(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
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

  isOwnMessage(msg: MessageDto): boolean {
    return msg.sender.id === this.user()?.id;
  }

  private switchRoom(id: string): void {
    if (this.joinedRoomId && this.joinedRoomId !== id) {
      void this.presence.leaveRoom(this.joinedRoomId);
      void this.chat.leaveRoom(this.joinedRoomId);
    }

    this.joinedRoomId = id;
    this.roomId.set(id);
    this.room.set(null);
    this.messages.set([]);
    this.members.set([]);
    this.pendingAttachment.set(null);
    this.messageText.set('');
    this.emojiPickerOpen.set(false);
    void this.presence.joinRoom(id);
    void this.chat.joinRoom(id);
    this.loadRoom(id);
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
        if (this.roomId() !== id) return;
        this.room.set(room);
        this.roomsApi.getMessages(id)
          .pipe(finalize(() => {
            if (this.roomId() === id) this.isLoading.set(false);
          }))
          .subscribe({
            next: msgs => {
              if (this.roomId() !== id) return;
              this.messages.set(this.sortMessages(msgs));
              this.notificationsApi.markRoomRead(id).subscribe();
              this.unread.setCount('room', id, 0);
            },
            error: () => {
              if (this.roomId() !== id) return;
              this.errorMessage.set('Unable to load messages.');
            },
          });
      },
      error: () => {
        if (this.roomId() !== id) return;
        this.isLoading.set(false);
        this.errorMessage.set('Room not found or access denied.');
      },
    });
  }

  private sortMessages(messages: MessageDto[]): MessageDto[] {
    return [...messages].sort((a, b) =>
      a.sequenceNumber - b.sequenceNumber ||
      new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime() ||
      a.id.localeCompare(b.id)
    );
  }
}
