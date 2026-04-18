import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HubConnection } from '@microsoft/signalr';
import { ChatService } from './chat.service';
import { HUB_CONNECTION_FACTORY } from './hub-connection.factory';
import { AuthSessionService } from '../auth/auth-session.service';
import { UnreadService } from './unread.service';

function buildMockConnection() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const conn = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    invoke: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onreconnected: vi.fn(),
    state: 'Connected',
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
  return conn as unknown as HubConnection & { _trigger: (event: string, ...args: unknown[]) => void };
}

describe('ChatService', () => {
  let service: ChatService;
  let mockConn: ReturnType<typeof buildMockConnection>;
  let unreadService: UnreadService;

  beforeEach(async () => {
    mockConn = buildMockConnection();
    const mockFactory = vi.fn().mockReturnValue(mockConn);
    const mockAuthSession = {
      accessToken: vi.fn().mockReturnValue('test-token'),
    };

    TestBed.configureTestingModule({
      providers: [
        ChatService,
        UnreadService,
        { provide: HUB_CONNECTION_FACTORY, useValue: mockFactory },
        { provide: AuthSessionService, useValue: mockAuthSession },
      ],
    });

    service = TestBed.inject(ChatService);
    unreadService = TestBed.inject(UnreadService);
    await service.connect();
  });

  afterEach(async () => {
    await service.disconnect();
  });

  it('connect starts the chat hub connection', () => {
    expect(mockConn.start).toHaveBeenCalledTimes(1);
  });

  it('sendMessage invokes SendMessage on the hub', async () => {
    await service.sendMessage('room-1', 'hello', null, null);
    expect(mockConn.invoke).toHaveBeenCalledWith('SendMessage', 'room-1', 'hello', null, null);
  });

  it('editMessage invokes EditMessage on the hub', async () => {
    await service.editMessage('msg-1', 'updated text');
    expect(mockConn.invoke).toHaveBeenCalledWith('EditMessage', 'msg-1', 'updated text');
  });

  it('deleteMessage invokes DeleteMessage on the hub', async () => {
    await service.deleteMessage('msg-1');
    expect(mockConn.invoke).toHaveBeenCalledWith('DeleteMessage', 'msg-1');
  });

  it('MessageReceived event updates lastRoomEvent signal', () => {
    const fakeDto = { id: 'msg-1', sequenceNumber: 1, content: 'hi', sender: { id: 'u1', username: 'alice', avatarUrl: null }, sentAt: '', editedAt: null, isDeleted: false, replyTo: null, attachment: null };
    mockConn._trigger('MessageReceived', fakeDto);
    expect(service.lastRoomEvent()?.type).toBe('MessageReceived');
    expect(service.lastRoomEvent()?.payload).toEqual(fakeDto);
  });

  it('UnreadCountChanged event calls UnreadService.setCount', () => {
    const spy = vi.spyOn(unreadService, 'setCount');
    mockConn._trigger('UnreadCountChanged', { contextType: 'room', contextId: 'r1', count: 3 });
    expect(spy).toHaveBeenCalledWith('room', 'r1', 3);
  });

  it('disconnect stops the hub connection', async () => {
    await service.disconnect();
    expect(mockConn.stop).toHaveBeenCalled();
  });
});
