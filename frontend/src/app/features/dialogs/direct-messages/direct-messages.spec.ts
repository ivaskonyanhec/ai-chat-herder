import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { DirectMessagesComponent } from './direct-messages';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';
import { PresenceService } from '../../../core/signalr/presence.service';
import type { DialogDto } from '../../../core/dialogs/dialogs.models';

const mockDialog = (id: string): DialogDto => ({
  id,
  otherUserId: 'other-1',
  otherUsername: 'Alice',
  otherAvatarUrl: null,
  isFrozen: false,
  createdAt: new Date().toISOString(),
});

function buildTestBed(presenceOverride?: Partial<{ joinDialog: ReturnType<typeof vi.fn>; leaveDialog: ReturnType<typeof vi.fn> }>) {
  const joinDialog  = presenceOverride?.joinDialog  ?? vi.fn().mockResolvedValue(undefined);
  const leaveDialog = presenceOverride?.leaveDialog ?? vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [DirectMessagesComponent],
    providers: [
      { provide: AuthSessionService,      useValue: { user: signal(null) } },
      { provide: DialogsApiService,       useValue: { getDialogs: () => of([]), getMessages: () => of([]) } },
      { provide: ChatService,             useValue: { lastDmEvent: signal(null) } },
      { provide: FilesApiService,         useValue: { uploadFile: () => of(), downloadFile: () => {} } },
      { provide: NotificationsApiService, useValue: { markDialogRead: () => of(void 0) } },
      { provide: UnreadService,           useValue: { setCount: vi.fn() } },
      { provide: PresenceService,         useValue: { joinDialog, leaveDialog } },
    ],
  });
  return { joinDialog, leaveDialog };
}

describe('DirectMessagesComponent', () => {
  it('should create', () => {
    buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('calls joinDialog when selecting a dialog', () => {
    const { joinDialog } = buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    fixture.detectChanges();

    fixture.componentInstance.selectDialog(mockDialog('dialog-1'));

    expect(joinDialog).toHaveBeenCalledWith('dialog-1');
  });

  it('calls leaveDialog on previous dialog when switching', () => {
    const { joinDialog, leaveDialog } = buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    fixture.detectChanges();

    fixture.componentInstance.selectDialog(mockDialog('dialog-1'));
    fixture.componentInstance.selectDialog(mockDialog('dialog-2'));

    expect(leaveDialog).toHaveBeenCalledWith('dialog-1');
    expect(joinDialog).toHaveBeenCalledWith('dialog-2');
  });

  it('starts with no selected dialog', () => {
    buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    expect(fixture.componentInstance.selectedDialog()).toBeNull();
  });

  it('finishes loading dialogs synchronously with of([])', () => {
    buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    expect(fixture.componentInstance.isLoadingDialogs()).toBe(false);
  });
});
