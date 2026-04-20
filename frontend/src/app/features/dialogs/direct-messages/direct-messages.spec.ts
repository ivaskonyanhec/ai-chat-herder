import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { BrowserModule } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { DirectMessagesComponent } from './direct-messages';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { DialogsApiService } from '../../../core/dialogs/dialogs-api.service';
import { ChatService } from '../../../core/signalr/chat.service';
import { FilesApiService } from '../../../core/files/files-api.service';
import { NotificationsApiService } from '../../../core/notifications/notifications-api.service';
import { UnreadService } from '../../../core/signalr/unread.service';
import type { DialogDto } from '../../../core/dialogs/dialogs.models';

const mockDialog = (id: string): DialogDto => ({
  id,
  otherUserId: 'other-1',
  otherUsername: 'Alice',
  otherAvatarUrl: null,
  isFrozen: false,
  createdAt: new Date().toISOString(),
});

function buildTestBed(chatOverride?: Partial<{ joinDialog: ReturnType<typeof vi.fn>; leaveDialog: ReturnType<typeof vi.fn> }>) {
  const joinDialog  = chatOverride?.joinDialog  ?? vi.fn().mockResolvedValue(undefined);
  const leaveDialog = chatOverride?.leaveDialog ?? vi.fn().mockResolvedValue(undefined);

  TestBed.configureTestingModule({
    imports: [BrowserModule, DirectMessagesComponent],
    providers: [
      { provide: AuthSessionService,      useValue: { user: signal(null) } },
      { provide: DialogsApiService,       useValue: { getDialogs: () => of([]), getMessages: () => of([]) } },
      { provide: ChatService,             useValue: { lastDmEvent: signal(null), joinDialog, leaveDialog } },
      { provide: FilesApiService,         useValue: { uploadFile: () => of(), downloadFile: () => {} } },
      { provide: NotificationsApiService, useValue: { markDialogRead: () => of(void 0) } },
      { provide: UnreadService,           useValue: { setCount: vi.fn() } },
      { provide: ActivatedRoute,          useValue: { paramMap: of(convertToParamMap({})) } },
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

  it('calls ChatService.joinDialog when selecting a dialog', () => {
    const { joinDialog } = buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    fixture.detectChanges();

    fixture.componentInstance.selectDialog(mockDialog('dialog-1'));

    expect(joinDialog).toHaveBeenCalledWith('dialog-1');
  });

  it('calls ChatService.leaveDialog on previous dialog when switching', () => {
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

  it('canSendMessage returns false when composer is empty', () => {
    buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    fixture.componentInstance.selectDialog(mockDialog('dialog-1'));
    fixture.componentInstance.composerValue.set('');
    expect(fixture.componentInstance.canSendMessage()).toBe(false);
  });

  it('canSendMessage returns false when dialog is frozen', () => {
    buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    const frozen: DialogDto = { ...mockDialog('dialog-frozen'), isFrozen: true };
    fixture.componentInstance.selectDialog(frozen);
    fixture.componentInstance.composerValue.set('hello');
    expect(fixture.componentInstance.canSendMessage()).toBe(false);
  });

  it('canSendMessage returns true when composer has text and dialog is not frozen', () => {
    buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    fixture.componentInstance.selectDialog(mockDialog('dialog-1'));
    fixture.componentInstance.composerValue.set('hello');
    expect(fixture.componentInstance.canSendMessage()).toBe(true);
  });

  it('canSendMessage returns true when attachment is pending and composer is empty', () => {
    buildTestBed();
    const fixture = TestBed.createComponent(DirectMessagesComponent);
    fixture.componentInstance.selectDialog(mockDialog('dialog-1'));
    fixture.componentInstance.composerValue.set('');
    fixture.componentInstance.pendingAttachment.set({ id: 'att-1', fileName: 'file.png', contentType: 'image/png', sizeBytes: 1024, comment: null });
    expect(fixture.componentInstance.canSendMessage()).toBe(true);
  });
});
