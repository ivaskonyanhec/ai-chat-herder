import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { ManageRoomComponent } from './manage-room';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

describe('ManageRoomComponent', () => {
  let component: ManageRoomComponent;
  let fixture: ComponentFixture<ManageRoomComponent>;
  let http: HttpTestingController;

  const roomId = 'aaaaaaaa-0000-0000-0000-000000000001';
  const mockUser = { id: 'uid1', username: 'admin', email: 'a@x.com', avatarUrl: null };
  const mockRoom = { id: roomId, name: 'Test', description: null,
    visibility: 'Public', ownerId: 'uid1', createdAt: '', memberCount: 1, callerRole: 'Owner' };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageRoomComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSessionService, useValue: { user: signal(mockUser) } },
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id: roomId } } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManageRoomComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create with members tab active by default', async () => {
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}`).flush(mockRoom);
    http.expectOne(`/api/rooms/${roomId}/members`).flush([]);
    await fixture.whenStable();
    expect(component.activeTab()).toBe('members');
  });

  it('should load bans when switching to banned tab', async () => {
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}`).flush(mockRoom);
    http.expectOne(`/api/rooms/${roomId}/members`).flush([]);
    await fixture.whenStable();

    component.switchTab('banned');
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}/bans`).flush([]);
    await fixture.whenStable();
    expect(component.activeTab()).toBe('banned');
    expect(component.bans().length).toBe(0);
  });

  it('should load invitations when switching to invitations tab', async () => {
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}`).flush(mockRoom);
    http.expectOne(`/api/rooms/${roomId}/members`).flush([]);
    await fixture.whenStable();

    component.switchTab('invitations');
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}/invitations`).flush([]);
    await fixture.whenStable();
    expect(component.activeTab()).toBe('invitations');
  });

  it('admins() computed returns only Admin-role members', async () => {
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}`).flush({ ...mockRoom, memberCount: 2 });
    http.expectOne(`/api/rooms/${roomId}/members`).flush([
      { userId: 'u1', username: 'alice', avatarUrl: null, role: 'Admin', joinedAt: '', presenceStatus: 'online' },
      { userId: 'u2', username: 'bob',   avatarUrl: null, role: 'Member', joinedAt: '', presenceStatus: 'offline' },
    ]);
    await fixture.whenStable();
    expect(component.admins().length).toBe(1);
    expect(component.admins()[0].username).toBe('alice');
  });

  it('searches invitees as a typeahead and excludes current room members', async () => {
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}`).flush(mockRoom);
    http.expectOne(`/api/rooms/${roomId}/members`).flush([
      { userId: 'u1', username: 'alice', avatarUrl: null, role: 'Member', joinedAt: '', presenceStatus: 'online' },
    ]);
    await fixture.whenStable();

    component.switchTab('invitations');
    fixture.detectChanges();
    http.expectOne(`/api/rooms/${roomId}/invitations`).flush([]);
    await fixture.whenStable();

    component.onInviteUsernameInput('al');
    const search = http.expectOne('/api/users/search?q=al&limit=8');
    expect(search.request.method).toBe('GET');
    search.flush([
      { id: 'u1', username: 'alice', avatarUrl: null },
      { id: 'u2', username: 'alex', avatarUrl: null },
    ]);
    await fixture.whenStable();

    expect(component.inviteSuggestions().map(u => u.username)).toEqual(['alex']);

    component.selectInviteSuggestion({ id: 'u2', username: 'alex', avatarUrl: null });

    expect(component.inviteUsername).toBe('alex');
    expect(component.inviteSuggestions()).toEqual([]);
  });
});
