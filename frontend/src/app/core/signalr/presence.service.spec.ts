import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { HubConnection } from '@microsoft/signalr';
import { PresenceService } from './presence.service';
import { HUB_CONNECTION_FACTORY } from './hub-connection.factory';
import { AuthRefreshService } from '../auth/auth-refresh.service';
import { AuthSessionService } from '../auth/auth-session.service';

function buildMockConnection(initialState = 'Connected') {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  let _state = initialState;
  const conn = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    invoke: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockImplementation(() => { _state = 'Connected'; return Promise.resolve(); }),
    stop: vi.fn().mockResolvedValue(undefined),
    onreconnected: vi.fn(),
    onclose: vi.fn(),
    get state() { return _state; },
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
      isAccessTokenExpired: vi.fn().mockReturnValue(false),
      clearSession: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        PresenceService,
        { provide: HUB_CONNECTION_FACTORY, useValue: mockFactory },
        { provide: AuthSessionService, useValue: mockAuthSession },
        { provide: AuthRefreshService, useValue: { refreshAccessToken: vi.fn() } },
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

  it('joinDialog invokes JoinDialog on the hub', async () => {
    await service.joinDialog('dialog-123');
    expect(mockConn.invoke).toHaveBeenCalledWith('JoinDialog', 'dialog-123');
  });

  it('leaveDialog invokes LeaveDialog on the hub', async () => {
    await service.joinDialog('dialog-123');
    await service.leaveDialog('dialog-123');
    expect(mockConn.invoke).toHaveBeenCalledWith('LeaveDialog', 'dialog-123');
  });
});

describe('PresenceService – startup race (joinRoom before connect)', () => {
  let svc: PresenceService;
  let conn: ReturnType<typeof buildMockConnection>;

  beforeEach(() => {
    conn = buildMockConnection('Disconnected');
    TestBed.configureTestingModule({
      providers: [
        PresenceService,
        { provide: HUB_CONNECTION_FACTORY, useValue: vi.fn().mockReturnValue(conn) },
        {
          provide: AuthSessionService,
          useValue: {
            accessToken: vi.fn().mockReturnValue('t'),
            isAccessTokenExpired: vi.fn().mockReturnValue(false),
            clearSession: vi.fn(),
          },
        },
        { provide: AuthRefreshService, useValue: { refreshAccessToken: vi.fn() } },
      ],
    });
    svc = TestBed.inject(PresenceService);
  });

  afterEach(async () => {
    await svc.disconnect();
  });

  it('JoinRoom is invoked after connect() when joinRoom was called before the connection started', async () => {
    // service has no connection yet — joinRoom should silently queue the room
    await svc.joinRoom('room-race');
    expect(conn.invoke).not.toHaveBeenCalledWith('JoinRoom', 'room-race');

    // connect() calls start() which sets state to Connected, then rejoinAllRooms() fires
    await svc.connect();

    expect(conn.invoke).toHaveBeenCalledWith('JoinRoom', 'room-race');
  });
});

describe('PresenceService – expired access token', () => {
  it('uses an async token factory that refreshes before SignalR negotiation when the stored token is expired', async () => {
    const conn = buildMockConnection();
    const refreshAccessToken = vi.fn().mockReturnValue(of('fresh-token'));
    const accessToken = vi.fn()
      .mockReturnValueOnce('expired-token')
      .mockReturnValue('fresh-token');
    TestBed.configureTestingModule({
      providers: [
        PresenceService,
        {
          provide: HUB_CONNECTION_FACTORY,
          useValue: vi.fn((_url: string, getToken: () => string | Promise<string>) => {
            conn.start = vi.fn(async () => {
              await getToken();
            });
            return conn;
          }),
        },
        {
          provide: AuthSessionService,
          useValue: {
            accessToken,
            isAccessTokenExpired: vi.fn().mockReturnValue(true),
            clearSession: vi.fn(),
          },
        },
        { provide: AuthRefreshService, useValue: { refreshAccessToken } },
      ],
    });

    const svc = TestBed.inject(PresenceService);
    await svc.connect();

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(conn.start).toHaveBeenCalledTimes(1);
    await svc.disconnect();
  });
});
