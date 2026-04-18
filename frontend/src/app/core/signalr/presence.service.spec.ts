import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HubConnection } from '@microsoft/signalr';
import { PresenceService } from './presence.service';
import { HUB_CONNECTION_FACTORY } from './hub-connection.factory';
import { AuthSessionService } from '../auth/auth-session.service';

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

describe('PresenceService', () => {
  let service: PresenceService;
  let mockConn: ReturnType<typeof buildMockConnection>;

  beforeEach(async () => {
    mockConn = buildMockConnection();
    const mockFactory = vi.fn().mockReturnValue(mockConn);
    const mockAuthSession = {
      accessToken: vi.fn().mockReturnValue('test-token'),
      clearSession: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        PresenceService,
        { provide: HUB_CONNECTION_FACTORY, useValue: mockFactory },
        { provide: AuthSessionService, useValue: mockAuthSession },
      ],
    });

    service = TestBed.inject(PresenceService);
    await service.connect();
  });

  afterEach(async () => {
    await service.disconnect();
  });

  it('connect starts the hub connection', () => {
    expect(mockConn.start).toHaveBeenCalledTimes(1);
  });

  it('connected signal is true after connect()', () => {
    expect(service.connected()).toBe(true);
  });

  it('UserStatusChanged updates presenceMap', () => {
    mockConn._trigger('UserStatusChanged', { userId: 'u1', status: 'afk' });
    expect(service.presenceMap().get('u1')).toBe('afk');
  });

  it('MemberLeft preserves user in presenceMap', () => {
    mockConn._trigger('UserStatusChanged', { userId: 'u1', status: 'online' });
    mockConn._trigger('MemberLeft', { roomId: 'r1', userId: 'u1' });
    expect(service.presenceMap().has('u1')).toBe(true);
  });

  it('disconnect stops the hub connection and sets connected false', async () => {
    await service.disconnect();
    expect(mockConn.stop).toHaveBeenCalled();
    expect(service.connected()).toBe(false);
  });

  it('joinRoom invokes JoinRoom on the hub', async () => {
    await service.joinRoom('room-123');
    expect(mockConn.invoke).toHaveBeenCalledWith('JoinRoom', 'room-123');
  });

  it('leaveRoom invokes LeaveRoom on the hub', async () => {
    await service.leaveRoom('room-123');
    expect(mockConn.invoke).toHaveBeenCalledWith('LeaveRoom', 'room-123');
  });
});
