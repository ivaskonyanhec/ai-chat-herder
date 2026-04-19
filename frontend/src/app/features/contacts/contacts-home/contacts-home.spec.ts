import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ContactsHomeComponent } from './contacts-home';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import type { FriendDto, FriendRequestDto } from '../../../core/friends/friends.models';

describe('ContactsHomeComponent', () => {
  let component: ContactsHomeComponent;
  let fixture: ComponentFixture<ContactsHomeComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactsHomeComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthSessionService,
          useValue: {
            user: signal({
              id: 'current-user',
              username: 'me',
              email: 'me@example.com',
              avatarUrl: null,
            }).asReadonly(),
          },
        },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ContactsHomeComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  it('should create', () => {
    http.expectOne('/api/friends').flush([]);
    http.expectOne('/api/friends/requests').flush([]);
    expect(component).toBeTruthy();
  });

  it('should start in loading state', () => {
    expect(component.isLoading()).toBe(true);
    http.expectOne('/api/friends').flush([]);
    http.expectOne('/api/friends/requests').flush([]);
  });

  it('loads and renders pending incoming requests from the friends API', async () => {
    const request: FriendRequestDto = {
      id: '11111111-0000-0000-0000-000000000000',
      senderId: 'sender-1',
      senderUsername: 'diana',
      senderAvatarUrl: null,
      receiverId: 'current-user',
      receiverUsername: 'me',
      receiverAvatarUrl: null,
      status: 'Pending',
      message: 'Let us connect.',
      createdAt: '2026-04-19T12:00:00Z',
    };

    fixture.detectChanges();
    http.expectOne('/api/friends').flush([]);
    http.expectOne('/api/friends/requests').flush([request]);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('diana');
    expect(fixture.nativeElement.textContent).toContain('1 NEW');
    expect(fixture.nativeElement.textContent).not.toContain('Diana Prince');
  });

  it('accepts an incoming request through the friends API and removes it from the list', async () => {
    const request: FriendRequestDto = {
      id: '22222222-0000-0000-0000-000000000000',
      senderId: 'sender-2',
      senderUsername: 'kenji',
      senderAvatarUrl: null,
      receiverId: 'current-user',
      receiverUsername: 'me',
      receiverAvatarUrl: null,
      status: 'Pending',
      message: null,
      createdAt: '2026-04-19T12:00:00Z',
    };

    fixture.detectChanges();
    http.expectOne('/api/friends').flush([]);
    http.expectOne('/api/friends/requests').flush([request]);
    await fixture.whenStable();

    component.acceptRequest(request.id);
    const acceptReq = http.expectOne('/api/friends/requests/22222222-0000-0000-0000-000000000000/accept');
    expect(acceptReq.request.method).toBe('POST');
    acceptReq.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/friends').flush([]);
    await fixture.whenStable();

    expect(component.incomingRequests().length).toBe(0);
  });

  it('sends a friend request using the invitation form state', async () => {
    fixture.detectChanges();
    http.expectOne('/api/friends').flush([]);
    http.expectOne('/api/friends/requests').flush([]);
    await fixture.whenStable();

    component.newRequestUsername.set('@alice');
    component.newRequestMessage.set('hello');
    component.sendFriendRequest();

    const request = http.expectOne('/api/friends/requests');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ username: 'alice', message: 'hello' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(component.newRequestUsername()).toBe('');
    expect(component.newRequestMessage()).toBe('');
    expect(component.requestStatusMessage()).toBe('Friend request sent.');
  });

  it('filters friends by the search text', async () => {
    const friends: FriendDto[] = [
      {
        friendshipId: 'f1',
        userId: 'u1',
        username: 'alice',
        avatarUrl: null,
        friendSince: '2026-04-19T12:00:00Z',
      },
      {
        friendshipId: 'f2',
        userId: 'u2',
        username: 'bob',
        avatarUrl: null,
        friendSince: '2026-04-19T12:00:00Z',
      },
    ];

    fixture.detectChanges();
    http.expectOne('/api/friends').flush(friends);
    http.expectOne('/api/friends/requests').flush([]);
    await fixture.whenStable();

    component.searchText.set('ali');

    expect(component.filteredFriends().map(friend => friend.username)).toEqual(['alice']);
  });

  it('onUsernameInput with 2+ chars returns suggestions excluding existing friends', async () => {
    const friends: FriendDto[] = [
      { friendshipId: 'f1', userId: 'u1', username: 'alice', avatarUrl: null, friendSince: '' },
    ];

    fixture.detectChanges();
    http.expectOne('/api/friends').flush(friends);
    http.expectOne('/api/friends/requests').flush([]);
    await fixture.whenStable();

    component.onUsernameInput('al');

    const searchReq = http.expectOne(r => r.url.includes('/api/users/search'));
    searchReq.flush([
      { id: 'u1', username: 'alice', avatarUrl: null },
      { id: 'u2', username: 'albert', avatarUrl: null },
    ]);
    await fixture.whenStable();

    expect(component.userSuggestions()).toHaveLength(1);
    expect(component.userSuggestions()[0].username).toBe('albert');
  });

  it('selectSuggestion fills username input and clears dropdown', async () => {
    fixture.detectChanges();
    http.expectOne('/api/friends').flush([]);
    http.expectOne('/api/friends/requests').flush([]);
    await fixture.whenStable();

    component.userSuggestions.set([{ id: 'u2', username: 'bob', avatarUrl: null }]);
    component.selectSuggestion({ id: 'u2', username: 'bob', avatarUrl: null });

    expect(component.newRequestUsername()).toBe('bob');
    expect(component.userSuggestions()).toHaveLength(0);
  });

  it('onUsernameInput with < 2 chars clears suggestions without calling API', async () => {
    fixture.detectChanges();
    http.expectOne('/api/friends').flush([]);
    http.expectOne('/api/friends/requests').flush([]);
    await fixture.whenStable();

    component.userSuggestions.set([{ id: 'u2', username: 'bob', avatarUrl: null }]);
    component.onUsernameInput('a');

    http.expectNone(r => r.url.includes('/api/users/search'));
    expect(component.userSuggestions()).toHaveLength(0);
  });
});
