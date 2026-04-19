import { Injectable, inject, isDevMode, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HubConnection, HubConnectionState } from '@microsoft/signalr';
import { firstValueFrom } from 'rxjs';
import { HUB_CONNECTION_FACTORY } from './hub-connection.factory';
import { AuthRefreshService } from '../auth/auth-refresh.service';
import { AuthSessionService } from '../auth/auth-session.service';
import type {
  PresenceStatus,
  RoomMembersSnapshotEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  RemovedFromRoomEvent,
  UserStatusChangedEvent,
} from './hub.models';

const HEARTBEAT_INTERVAL_MS = 30_000;
const AFK_CHECK_INTERVAL_MS = 5_000;
const AFK_THRESHOLD_MS = 60_000;
const THROTTLE_MS = 1_000;

@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly factory = inject(HUB_CONNECTION_FACTORY);
  private readonly authSession = inject(AuthSessionService);
  private readonly authRefresh = inject(AuthRefreshService);
  private readonly document = inject(DOCUMENT);

  private connection: HubConnection | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private afkCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivityAt = Date.now();
  private lastThrottledAt = 0;
  private isAfk = false;
  private readonly joinedRooms = new Set<string>();
  private readonly joinedDialogs = new Set<string>();

  private readonly _connected = signal(false);
  private readonly _presenceMap = signal<Map<string, PresenceStatus>>(new Map());
  private readonly _roomMembersSnapshot = signal<RoomMembersSnapshotEvent | null>(null);
  private readonly _memberJoined = signal<MemberJoinedEvent | null>(null);
  private readonly _memberLeft = signal<MemberLeftEvent | null>(null);
  private readonly _removedFromRoom = signal<RemovedFromRoomEvent | null>(null);

  readonly connected = this._connected.asReadonly();
  readonly presenceMap = this._presenceMap.asReadonly();
  readonly roomMembersSnapshot = this._roomMembersSnapshot.asReadonly();
  readonly memberJoined = this._memberJoined.asReadonly();
  readonly memberLeft = this._memberLeft.asReadonly();
  readonly removedFromRoom = this._removedFromRoom.asReadonly();

  async connect(): Promise<void> {
    const token = this.authSession.accessToken();
    if (!token || this.connection) return;

    this.connection = this.factory('/hubs/presence', () => this.getAccessTokenForHub());
    this.registerHandlers(this.connection);

    this.connection.onreconnected(() => {
      this.rejoinAllRooms();
      this.rejoinAllDialogs();
    });

    this.connection.onclose(() => {
      this._connected.set(false);
    });

    if (isDevMode()) {
      (window as unknown as Record<string, unknown>)['__presenceHub'] = this.connection;
    }

    await this.connection.start();
    this._connected.set(true);
    this.startHeartbeat();
    this.startAfkTracking();
    this.rejoinAllRooms();
  }

  private async getAccessTokenForHub(): Promise<string> {
    if (this.authSession.isAccessTokenExpired()) {
      await firstValueFrom(this.authRefresh.refreshAccessToken());
    }

    return this.authSession.accessToken() ?? '';
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.stopAfkTracking();
    this.removeActivityListeners();
    this.joinedRooms.clear();
    this.joinedDialogs.clear();

    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }
    this._connected.set(false);
  }

  async joinRoom(roomId: string): Promise<void> {
    this.joinedRooms.add(roomId);
    if (this.connection?.state !== HubConnectionState.Connected) return;
    await this.connection.invoke('JoinRoom', roomId);
  }

  async leaveRoom(roomId: string): Promise<void> {
    if (!this.connection) return;
    await this.connection.invoke('LeaveRoom', roomId);
    this.joinedRooms.delete(roomId);
  }

  async joinDialog(dialogId: string): Promise<void> {
    if (!this.connection) return;
    if (this.joinedDialogs.has(dialogId)) return;
    await this.connection.invoke('JoinDialog', dialogId);
    this.joinedDialogs.add(dialogId);
  }

  async leaveDialog(dialogId: string): Promise<void> {
    if (!this.connection) return;
    if (!this.joinedDialogs.has(dialogId)) return;
    await this.connection.invoke('LeaveDialog', dialogId);
    this.joinedDialogs.delete(dialogId);
  }

  private registerHandlers(conn: HubConnection): void {
    conn.on('UserStatusChanged', (e: UserStatusChangedEvent) => {
      const updated = new Map(this._presenceMap());
      updated.set(e.userId, e.status);
      this._presenceMap.set(updated);
    });

    conn.on('RoomMembersSnapshot', (e: RoomMembersSnapshotEvent) => {
      const updated = new Map(this._presenceMap());
      for (const m of e.members) {
        updated.set(m.userId, m.presenceStatus);
      }
      this._presenceMap.set(updated);
      this._roomMembersSnapshot.set(e);
    });

    conn.on('MemberJoined', (e: MemberJoinedEvent) => {
      this._memberJoined.set(e);
    });

    conn.on('MemberLeft', (e: MemberLeftEvent) => {
      this._memberLeft.set(e);
    });

    conn.on('RemovedFromRoom', (e: RemovedFromRoomEvent) => {
      this.joinedRooms.delete(e.roomId);
      this._removedFromRoom.set(e);
    });

    conn.on('ForceDisconnect', () => {
      void this.disconnect();
      this.authSession.clearSession();
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      void this.connection?.invoke('Heartbeat');
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startAfkTracking(): void {
    this.lastActivityAt = Date.now();
    this.isAfk = false;
    this.addActivityListeners();

    this.afkCheckTimer = setInterval(() => {
      const idle = Date.now() - this.lastActivityAt;
      if (!this.isAfk && idle >= AFK_THRESHOLD_MS) {
        this.isAfk = true;
        void this.connection?.invoke('SetAfk');
      }
    }, AFK_CHECK_INTERVAL_MS);

    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private stopAfkTracking(): void {
    if (this.afkCheckTimer !== null) {
      clearInterval(this.afkCheckTimer);
      this.afkCheckTimer = null;
    }
    this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onActivity = (): void => {
    const now = Date.now();
    if (now - this.lastThrottledAt < THROTTLE_MS) return;
    this.lastThrottledAt = now;
    this.lastActivityAt = now;

    if (this.isAfk) {
      this.isAfk = false;
      void this.connection?.invoke('SetActive');
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (this.document.visibilityState === 'visible') {
      this.lastActivityAt = Date.now();
      if (this.isAfk) {
        this.isAfk = false;
        void this.connection?.invoke('SetActive');
      }
    }
  };

  private addActivityListeners(): void {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    for (const ev of events) {
      this.document.addEventListener(ev, this.onActivity, { passive: true });
    }
  }

  private removeActivityListeners(): void {
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    for (const ev of events) {
      this.document.removeEventListener(ev, this.onActivity);
    }
  }

  private rejoinAllRooms(): void {
    for (const roomId of this.joinedRooms) {
      void this.connection?.invoke('JoinRoom', roomId);
    }
  }

  private rejoinAllDialogs(): void {
    for (const dialogId of this.joinedDialogs) {
      void this.connection?.invoke('JoinDialog', dialogId);
    }
  }
}
