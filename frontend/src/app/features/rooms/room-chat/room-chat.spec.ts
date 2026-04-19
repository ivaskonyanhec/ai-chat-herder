import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { RoomChatComponent } from './room-chat';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import type { RoomDto } from '../../../core/rooms/rooms.models';
import type { RoomMembersSnapshotEvent } from '../../../core/signalr/hub.models';

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

function buildProviders(snapshotOverride?: RoomMembersSnapshotEvent | null) {
  const snapshotSignal = signal<RoomMembersSnapshotEvent | null>(snapshotOverride ?? null);
  return {
    snapshotSignal,
    providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'room-1' } } } },
      { provide: AuthSessionService, useValue: { user: signal(null), accessToken: signal(null) } },
      {
        provide: RoomsApiService,
        useValue: { getRoom: () => of(mockRoom), getMessages: () => of([]) },
      },
      {
        provide: ChatService,
        useValue: { lastRoomEvent: signal(null), sendMessage: () => Promise.resolve() },
      },
      {
        provide: PresenceService,
        useValue: {
          joinRoom: vi.fn().mockResolvedValue(undefined),
          leaveRoom: vi.fn().mockResolvedValue(undefined),
          roomMembersSnapshot: snapshotSignal.asReadonly(),
          memberJoined: signal(null).asReadonly(),
          memberLeft: signal(null).asReadonly(),
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

  it('renders member sidebar with status dots from roomMembersSnapshot', async () => {
    const { providers } = buildProviders(mockSnapshot);
    await TestBed.configureTestingModule({ imports: [RoomChatComponent], providers }).compileComponents();
    const fixture = TestBed.createComponent(RoomChatComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="member-status-user-1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="member-status-user-2"]')).not.toBeNull();
  });
});
