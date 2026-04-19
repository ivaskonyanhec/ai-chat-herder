import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { RoomChatComponent } from './room-chat';
import { RoomsApiService } from '../../../core/rooms/rooms-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import type { RoomDto } from '../../../core/rooms/rooms.models';

describe('RoomChatComponent', () => {
  let component: RoomChatComponent;
  let fixture: ComponentFixture<RoomChatComponent>;

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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomChatComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { params: { id: 'room-1' } } },
        },
        {
          provide: AuthSessionService,
          useValue: { user: signal(null), accessToken: signal(null) },
        },
        {
          provide: RoomsApiService,
          useValue: {
            getRoom: () => of(mockRoom),
            getMessages: () => of([]),
          },
        },
        {
          provide: ChatService,
          useValue: {
            lastRoomEvent: signal(null),
            sendMessage: () => Promise.resolve(),
          },
        },
        {
          provide: PresenceService,
          useValue: {
            joinRoom: () => Promise.resolve(),
            leaveRoom: () => Promise.resolve(),
          },
        },
        {
          provide: FilesApiService,
          useValue: {
            uploadFile: () => of(),
            downloadFile: () => {},
            getFileUrl: () => '',
          },
        },
        {
          provide: NotificationsApiService,
          useValue: {
            markRoomRead: () => of(void 0),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomChatComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
