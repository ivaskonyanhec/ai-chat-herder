import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { RoomChatComponent } from './room-chat';
import { serializeToMarkdown } from '../../../shared/utils/inline-markdown';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';
import { ReactionsApiService } from '../../../core/reactions/reactions-api.service';
import type { RoomDto } from '../../../core/rooms/rooms.models';
import type { MessageDto, RoomChatEvent, RoomMembersSnapshotEvent } from '../../../core/signalr/hub.models';

const mockRoom: RoomDto = {
  id: 'room-1',
  name: 'Test Room',
  description: null,
  visibility: 'Public',
  ownerId: 'user-1',
  createdAt: new Date().toISOString(),
  memberCount: 3,
  callerRole: 'Member',
};

const mockSnapshot: RoomMembersSnapshotEvent = {
  roomId: 'room-1',
  members: [
    { userId: 'user-1', username: 'alice', avatarUrl: null, role: 'Owner', joinedAt: new Date().toISOString(), presenceStatus: 'online' },
    { userId: 'user-2', username: 'bob',   avatarUrl: null, role: 'Member', joinedAt: new Date().toISOString(), presenceStatus: 'offline' },
  ],
};

function buildMessage(id: string, sequenceNumber: number, content: string, senderId = 'user-2'): MessageDto {
  return {
    id,
    sequenceNumber,
    content,
    sender: { id: senderId, username: senderId === 'user-1' ? 'me' : 'bob', avatarUrl: null },
    sentAt: new Date(Date.UTC(2026, 0, 1, 12, sequenceNumber)).toISOString(),
    editedAt: null,
    isDeleted: false,
    replyTo: null,
    attachment: null,
    reactions: [],
  };
}

function buildProviders(
  snapshotOverride?: RoomMembersSnapshotEvent | null,
  options: { messages?: MessageDto[]; userId?: string } = {},
) {
  const snapshotSignal = signal<RoomMembersSnapshotEvent | null>(snapshotOverride ?? null);
  const routeParamMap = new BehaviorSubject(convertToParamMap({ id: 'room-1' }));
  const getRoom = vi.fn((id: string) => of({ ...mockRoom, id, name: id === 'room-2' ? 'Second Room' : 'Test Room' }));
  const getMessages = vi.fn(() => of(options.messages ?? []));
  const joinRoom = vi.fn().mockResolvedValue(undefined);
  const leaveRoom = vi.fn().mockResolvedValue(undefined);
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  const presenceJoinRoom = vi.fn().mockResolvedValue(undefined);
  const presenceLeaveRoom = vi.fn().mockResolvedValue(undefined);
  return {
    snapshotSignal,
    routeParamMap,
    getRoom,
    getMessages,
    joinRoom,
    leaveRoom,
    sendMessage,
    presenceJoinRoom,
    presenceLeaveRoom,
    providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'room-1' } }, paramMap: routeParamMap.asObservable() } },
      {
        provide: AuthSessionService,
        useValue: {
          user: signal(options.userId ? { id: options.userId, username: 'me', email: 'me@test.local', avatarUrl: null } : null),
          accessToken: signal(null),
        },
      },
      {
        provide: RoomsApiService,
        useValue: { getRoom, getMessages },
      },
      {
        provide: ChatService,
        useValue: { lastRoomEvent: signal(null), sendMessage, joinRoom, leaveRoom, deleteMessage: vi.fn().mockResolvedValue(undefined) },
      },
      {
        provide: PresenceService,
        useValue: {
          joinRoom: presenceJoinRoom,
          leaveRoom: presenceLeaveRoom,
          roomMembersSnapshot: snapshotSignal.asReadonly(),
          memberJoined: signal(null).asReadonly(),
          memberLeft: signal(null).asReadonly(),
          removedFromRoom: signal(null).asReadonly(),
          presenceMap: signal(new Map<string, 'online' | 'afk' | 'offline'>()).asReadonly(),
        },
      },
      {
        provide: FilesApiService,
        useValue: { uploadFile: () => of(), downloadFile: () => {}, getFileUrl: () => '' },
      },
      {
        provide: NotificationsApiService,
        useValue: { markRoomRead: () => of(void 0) },
      },
      {
        provide: UnreadService,
        useValue: { setCount: vi.fn(), getCount: vi.fn().mockReturnValue(0), clearAll: vi.fn() },
      },
      {
        provide: ReactionsApiService,
        useValue: { toggleReaction: () => of(void 0) },
      },
    ],
  };
}

describe('RoomChatComponent', () => {
  it('should create', async () => {
    const { providers } = buildProviders();
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows manage room link when room is loaded', async () => {
    const ownerRoom: RoomDto = { ...mockRoom, callerRole: 'Owner' };
    const { providers } = buildProviders();
    const ownedProviders = providers.map(p =>
      'provide' in p && p.provide === RoomsApiService
        ? { provide: RoomsApiService, useValue: { getRoom: () => of(ownerRoom), getMessages: () => of([]) } }
        : p,
    );
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers: ownedProviders }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="manage-room-link"]')).not.toBeNull();
  });

  it('manage room link points to the manage route', async () => {
    const memberRoom: RoomDto = { ...mockRoom, callerRole: 'Member' };
    const { providers } = buildProviders();
    const memberProviders = providers.map(p =>
      'provide' in p && p.provide === RoomsApiService
        ? { provide: RoomsApiService, useValue: { getRoom: () => of(memberRoom), getMessages: () => of([]) } }
        : p,
    );
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers: memberProviders }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // In the new design the manage link is always visible (all members can navigate to room settings)
    expect(fixture.nativeElement.querySelector('[data-testid="manage-room-link"]')).not.toBeNull();
  });

  it('renders room header with a visibility icon instead of a hash prefix', async () => {
    const privateRoom: RoomDto = { ...mockRoom, name: 'Planning', visibility: 'Private' };
    const { providers } = buildProviders();
    const privateRoomProviders = providers.map(p =>
      'provide' in p && p.provide === RoomsApiService
        ? { provide: RoomsApiService, useValue: { getRoom: () => of(privateRoom), getMessages: () => of([]) } }
        : p,
    );
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers: privateRoomProviders }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('[data-testid="room-title"]') as HTMLElement;
    const icon = fixture.nativeElement.querySelector('[data-testid="room-title-icon"]') as HTMLElement;

    expect(title.textContent?.trim()).toBe('Planning');
    expect(title.textContent).not.toContain('#');
    expect(icon.textContent?.trim()).toBe('lock');
  });

  it('populates the members signal from roomMembersSnapshot', async () => {
    const { providers } = buildProviders(mockSnapshot);
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const members = fixture.componentInstance.members();
    expect(members.some(m => m.userId === 'user-1')).toBe(true);
    expect(members.some(m => m.userId === 'user-2')).toBe(true);
  });

  it('switches joined room and reloads data when route id changes without recreating the component', async () => {
    const { providers, routeParamMap, getRoom, getMessages, joinRoom, leaveRoom, presenceJoinRoom, presenceLeaveRoom } = buildProviders();
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    routeParamMap.next(convertToParamMap({ id: 'room-2' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(presenceLeaveRoom).toHaveBeenCalledWith('room-1');
    expect(leaveRoom).toHaveBeenCalledWith('room-1');
    expect(presenceJoinRoom).toHaveBeenCalledWith('room-2');
    expect(joinRoom).toHaveBeenCalledWith('room-2');
    expect(getRoom).toHaveBeenCalledWith('room-2');
    expect(getMessages).toHaveBeenCalledWith('room-2');
    expect(fixture.componentInstance.roomId()).toBe('room-2');
    expect(fixture.componentInstance.room()?.name).toBe('Second Room');
  });

  it('aligns current user messages to the right and other messages to the left', async () => {
    const messages: MessageDto[] = [
      buildMessage('msg-own', 1, 'from me', 'user-1'),
      buildMessage('msg-other', 2, 'from someone else'),
    ];
    const { providers } = buildProviders(null, { messages, userId: 'user-1' });
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const own = fixture.nativeElement.querySelector('[data-testid="message-msg-own"]') as HTMLElement;
    const other = fixture.nativeElement.querySelector('[data-testid="message-msg-other"]') as HTMLElement;

    expect(own.className).toContain('justify-end');
    expect(other.className).toContain('justify-start');
  });

  it('renders fetched room history with the earliest message on top', async () => {
    const messages = [
      buildMessage('msg-newer', 2, 'newer message'),
      buildMessage('msg-older', 1, 'older message'),
    ];
    const { providers } = buildProviders(null, { messages });
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const contents = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="message-text"]'),
      (el: Element) => el.textContent?.trim(),
    );

    expect(contents).toEqual(['older message', 'newer message']);
  });

  it('keeps realtime messages in chronological order when sequence numbers arrive out of order', async () => {
    const lastRoomEvent = signal<RoomChatEvent | null>(null);
    const { providers } = buildProviders(null, { messages: [buildMessage('msg-newer', 2, 'newer message')] });
    const chatProviders = providers.map(p =>
      'provide' in p && p.provide === ChatService
        ? {
            provide: ChatService,
            useValue: {
              lastRoomEvent: lastRoomEvent.asReadonly(),
              sendMessage: vi.fn().mockResolvedValue(undefined),
              joinRoom: vi.fn().mockResolvedValue(undefined),
              leaveRoom: vi.fn().mockResolvedValue(undefined),
            },
          }
        : p,
    );
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers: chatProviders }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    lastRoomEvent.set({ type: 'MessageReceived', payload: buildMessage('msg-older', 1, 'older message') });
    fixture.detectChanges();

    const contents = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="message-text"]'),
      (el: Element) => el.textContent?.trim(),
    );

    expect(contents).toEqual(['older message', 'newer message']);
  });

  it('renders a Slack-style composer with toolbar actions and disabled send while empty', async () => {
    const { providers } = buildProviders();
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const composer = fixture.nativeElement.querySelector('[data-testid="message-composer"]') as HTMLElement;
    const attachButton = fixture.nativeElement.querySelector('[data-testid="attach-file-btn"]') as HTMLButtonElement;
    const sendButton = fixture.nativeElement.querySelector('[data-testid="send-message-btn"]') as HTMLButtonElement;

    expect(composer).not.toBeNull();
    expect(composer.className).toContain('focus-within:ring-2');
    expect(attachButton).not.toBeNull();
    expect(sendButton.disabled).toBe(true);

    fixture.componentInstance.composerEmpty.set(false);
    fixture.detectChanges();

    expect(sendButton.disabled).toBe(false);
  });

  it('opens the emoji picker on button click and closes it after selecting an emoji', async () => {
    const { providers } = buildProviders();
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const emojiButton = fixture.nativeElement.querySelector('[data-testid="emoji-picker-btn"]') as HTMLButtonElement;
    expect(emojiButton).not.toBeNull();

    emojiButton.click();
    fixture.detectChanges();

    const picker = fixture.nativeElement.querySelector('[data-testid="emoji-picker"]') as HTMLElement;
    expect(picker).not.toBeNull();

    // Stub execCommand (not available in jsdom) and simulate insertEmoji
    if (!('execCommand' in document)) {
      Object.defineProperty(document, 'execCommand', {
        value: (_cmd: string) => false,
        writable: true,
        configurable: true,
      });
    }
    fixture.componentInstance.insertEmoji('😀');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="emoji-picker"]')).toBeNull();
  });

  it('sends on Enter but allows Shift+Enter to add a newline', async () => {
    const { providers, sendMessage } = buildProviders();
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    const preventEnter = vi.spyOn(enter, 'preventDefault');
    component.handleComposerKeydown(enter);

    expect(preventEnter).toHaveBeenCalled();

    const shiftEnter = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
    const preventShiftEnter = vi.spyOn(shiftEnter, 'preventDefault');
    component.handleComposerKeydown(shiftEnter);

    expect(preventShiftEnter).not.toHaveBeenCalled();
  });
});

describe('WYSIWYG composer serialization', () => {
  it('serializeToMarkdown converts bold HTML to markers', () => {
    expect(serializeToMarkdown('<strong>hello</strong>')).toBe('**hello**');
  });

  it('serializeToMarkdown converts italic HTML to markers', () => {
    expect(serializeToMarkdown('<em>world</em>')).toBe('_world_');
  });

  it('serializeToMarkdown converts code HTML to backtick markers', () => {
    expect(serializeToMarkdown('<code>npm</code>')).toBe('`npm`');
  });
});

describe('applyFormatting', () => {
  let component: RoomChatComponent;

  beforeEach(async () => {
    // execCommand is not defined in jsdom — stub it so spyOn can work
    if (!('execCommand' in document)) {
      Object.defineProperty(document, 'execCommand', {
        value: (_cmd: string) => false,
        writable: true,
        configurable: true,
      });
    }
    const { providers } = buildProviders();
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    await fixture.whenStable();
    component = fixture.componentInstance;
  });

  it('applyBold calls document.execCommand bold', () => {
    const spy = vi.spyOn(document, 'execCommand').mockReturnValue(true);
    component.applyBold();
    expect(spy).toHaveBeenCalledWith('bold');
    spy.mockRestore();
  });

  it('applyItalic calls document.execCommand italic', () => {
    const spy = vi.spyOn(document, 'execCommand').mockReturnValue(true);
    component.applyItalic();
    expect(spy).toHaveBeenCalledWith('italic');
    spy.mockRestore();
  });
});
