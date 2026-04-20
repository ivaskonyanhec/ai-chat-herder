import { Component, DestroyRef, ElementRef, OnInit, OnDestroy, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { distinctUntilChanged, filter, finalize, map } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';
import { ReactionsApiService } from '../../../core/reactions/reactions-api.service';
import { AvatarComponent } from '../../../shared/avatar/avatar.component';
import { parseInlineMarkdown, serializeToMarkdown } from '../../../shared/utils/inline-markdown';
import type { RoomDto } from '../../../core/rooms/rooms.models';
import type { MessageDto, RoomMemberPresence } from '../../../core/signalr/hub.models';
import type { AttachmentDto } from '../../../core/files/files.models';

@Component({
  selector: 'app-room-chat',
  standalone: true,
  imports: [FormsModule, RouterLink, AvatarComponent],
  templateUrl: './room-chat.html',
  styleUrl: './room-chat.scss',
  host: { class: 'block flex-1 min-h-0 overflow-hidden' },
})
export class RoomChatComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authSession = inject(AuthSessionService);
  private readonly roomsApi = inject(RoomsApiService);
  readonly chat = inject(ChatService);
  private readonly presence = inject(PresenceService);
  private readonly filesApi = inject(FilesApiService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly unread = inject(UnreadService);
  private readonly reactionsApi = inject(ReactionsApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  readonly composerEl = viewChild<ElementRef<HTMLDivElement>>('composerEl');

  readonly user = this.authSession.user;
  readonly roomId = signal(this.route.snapshot.params['id'] as string);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly room = signal<RoomDto | null>(null);
  readonly messages = signal<MessageDto[]>([]);
  readonly composerEmpty = signal(true);
  readonly isSending = signal(false);
  readonly isUploading = signal(false);
  readonly pendingAttachment = signal<AttachmentDto | null>(null);
  readonly emojiPickerOpen = signal(false);
  readonly reactionPickerMsgId = signal<string | null>(null);
  readonly replyingTo = signal<MessageDto | null>(null);
  readonly members = signal<RoomMemberPresence[]>([]);
  readonly presenceMap = this.presence.presenceMap;

  readonly quickEmojis = ['😀', '😂', '👍', '🙏', '❤️', '🎉', '🔥', '👀'];
  readonly reactionEmojis = ['👍','👎','❤️','😂','😮','😢','🎉','🔥','🚀','👀','💯','✅','❌','⭐','🙏','👏'];

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
      } else if (event.type === 'ReactionToggled') {
        const { messageId, emoji, count, userIds } = event.payload;
        this.messages.update(msgs => msgs.map(m => {
          if (m.id !== messageId) return m;
          const others = m.reactions.filter(r => r.emoji !== emoji);
          return { ...m, reactions: count > 0 ? [...others, { emoji, count, userIds }] : others };
        }));
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
        { userId: event.user.userId, username: event.user.username, avatarUrl: event.user.avatarUrl,
          role: 'Member' as const, joinedAt: new Date().toISOString(), presenceStatus: status },
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

  // ── Composer ──────────────────────────────────────────────────────────────

  onComposerInput(event: Event): void {
    const el = event.target as HTMLDivElement;
    this.composerEmpty.set(!el.textContent?.trim());
  }

  applyBold(): void { document.execCommand('bold'); }
  applyItalic(): void { document.execCommand('italic'); }

  applyCode(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const code = document.createElement('code');
    try { range.surroundContents(code); } catch { /* partial selection — skip */ }
  }

  handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (event.key === 'b') { event.preventDefault(); this.applyBold(); }
      if (event.key === 'i') { event.preventDefault(); this.applyItalic(); }
      if (event.key === '`') { event.preventDefault(); this.applyCode(); }
    }
  }

  clearComposer(): void {
    const el = this.composerEl()?.nativeElement;
    if (el) el.innerHTML = '';
    this.composerEmpty.set(true);
  }

  focusComposer(): void {
    this.composerEl()?.nativeElement.focus();
  }

  sendMessage(): void {
    const el = this.composerEl()?.nativeElement;
    if (!el) return;
    const content = serializeToMarkdown(el.innerHTML);
    const attachment = this.pendingAttachment();
    if ((!content && !attachment) || this.isSending()) return;
    const replyToId = this.replyingTo()?.id ?? null;
    this.isSending.set(true);
    void this.chat.sendMessage(this.roomId(), content, replyToId, attachment?.id ?? null)
      .then(() => {
        this.clearComposer();
        this.pendingAttachment.set(null);
        this.replyingTo.set(null);
      })
      .finally(() => this.isSending.set(false));
  }

  canSendMessage(): boolean {
    return (!this.composerEmpty() || !!this.pendingAttachment()) && !this.isSending() && !this.isUploading();
  }

  insertEmoji(emoji: string): void {
    document.execCommand('insertText', false, emoji);
    this.emojiPickerOpen.set(false);
    this.composerEmpty.set(false);
  }

  toggleEmojiPicker(): void { this.emojiPickerOpen.update(v => !v); }

  // ── Reply ─────────────────────────────────────────────────────────────────

  startReply(msg: MessageDto): void {
    this.replyingTo.set(msg);
    this.reactionPickerMsgId.set(null);
    setTimeout(() => this.focusComposer(), 0);
  }

  cancelReply(): void { this.replyingTo.set(null); }

  // ── Reactions ─────────────────────────────────────────────────────────────

  openReactionPicker(msgId: string): void {
    this.reactionPickerMsgId.update(id => id === msgId ? null : msgId);
  }

  closeReactionPicker(): void { this.reactionPickerMsgId.set(null); }

  toggleReaction(msg: MessageDto, emoji: string): void {
    const userId = this.user()?.id ?? '';
    const prev = msg.reactions;
    const existing = prev.find(r => r.emoji === emoji);
    const alreadyReacted = existing?.userIds.includes(userId) ?? false;
    let updated: typeof prev;
    if (alreadyReacted) {
      updated = prev.map(r => r.emoji !== emoji ? r : { ...r, count: r.count - 1, userIds: r.userIds.filter(id => id !== userId) })
                    .filter(r => r.count > 0);
    } else {
      const found = prev.find(r => r.emoji === emoji);
      updated = found
        ? prev.map(r => r.emoji !== emoji ? r : { ...r, count: r.count + 1, userIds: [...r.userIds, userId] })
        : [...prev, { emoji, count: 1, userIds: [userId] }];
    }
    this.messages.update(msgs => msgs.map(m => m.id === msg.id ? { ...m, reactions: updated } : m));

    this.reactionsApi.toggleReaction(msg.id, emoji).subscribe({
      error: () => {
        this.messages.update(msgs => msgs.map(m => m.id === msg.id ? { ...m, reactions: prev } : m));
      },
    });
    this.reactionPickerMsgId.set(null);
  }

  hasUserReacted(msg: MessageDto, emoji: string): boolean {
    return msg.reactions.find(r => r.emoji === emoji)?.userIds.includes(this.user()?.id ?? '') ?? false;
  }

  renderContent(content: string | null): SafeHtml {
    if (!content) return this.sanitizer.bypassSecurityTrustHtml('');
    return this.sanitizer.bypassSecurityTrustHtml(parseInlineMarkdown(content));
  }

  // ── File ──────────────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.uploadFile(file);
    input.value = '';
  }

  onPaste(event: ClipboardEvent): void {
    const file = event.clipboardData?.files[0];
    if (file) { event.preventDefault(); this.uploadFile(file); return; }
    const text = event.clipboardData?.getData('text/plain');
    if (text) { event.preventDefault(); document.execCommand('insertText', false, text); }
  }

  clearAttachment(): void { this.pendingAttachment.set(null); }

  downloadFile(attachmentId: string, fileName: string): void {
    this.filesApi.downloadFile(attachmentId, fileName);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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
    this.clearComposer();
    this.replyingTo.set(null);
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
        error: (err: { error?: { error?: string } }) =>
          this.errorMessage.set(err.error?.error ?? 'File upload failed.'),
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
          .pipe(finalize(() => { if (this.roomId() === id) this.isLoading.set(false); }))
          .subscribe({
            next: msgs => {
              if (this.roomId() !== id) return;
              this.messages.set(this.sortMessages(msgs));
              this.notificationsApi.markRoomRead(id).subscribe();
              this.unread.setCount('room', id, 0);
            },
            error: () => { if (this.roomId() !== id) return; this.errorMessage.set('Unable to load messages.'); },
          });
      },
      error: () => { if (this.roomId() !== id) return; this.isLoading.set(false); this.errorMessage.set('Room not found or access denied.'); },
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
