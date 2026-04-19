import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BlockedUsersComponent } from './blocked-users';
import type { BlockDto } from '../../../core/blocks/blocks.models';

describe('BlockedUsersComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BlockedUsersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders without error', async () => {
    const fixture = TestBed.createComponent(BlockedUsersComponent);
    fixture.detectChanges();
    http.expectOne('/api/blocks').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('shows blocked users returned by the API', async () => {
    const fixture = TestBed.createComponent(BlockedUsersComponent);
    fixture.detectChanges();
    const block: BlockDto = {
      blockedUserId: 'aaaaaaaa-0000-0000-0000-000000000000',
      blockedUsername: 'blockedBob',
      blockedAvatarUrl: null,
      createdAt: '2026-04-19T00:00:00Z',
    };
    http.expectOne('/api/blocks').flush([block]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('blockedBob');
  });

  it('shows empty state when no users are blocked', async () => {
    const fixture = TestBed.createComponent(BlockedUsersComponent);
    fixture.detectChanges();
    http.expectOne('/api/blocks').flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No blocked users');
  });

  it('calls DELETE /api/blocks/{userId} when Unblock is clicked', async () => {
    const fixture = TestBed.createComponent(BlockedUsersComponent);
    fixture.detectChanges();
    const block: BlockDto = {
      blockedUserId: 'bbbbbbbb-0000-0000-0000-000000000000',
      blockedUsername: 'targetUser',
      blockedAvatarUrl: null,
      createdAt: '2026-04-19T00:00:00Z',
    };
    http.expectOne('/api/blocks').flush([block]);
    await fixture.whenStable();
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector(
      '[data-testid="unblock-bbbbbbbb-0000-0000-0000-000000000000"]',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const unblockReq = http.expectOne('/api/blocks/bbbbbbbb-0000-0000-0000-000000000000');
    expect(unblockReq.request.method).toBe('DELETE');
    unblockReq.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('targetUser');
  });
});
