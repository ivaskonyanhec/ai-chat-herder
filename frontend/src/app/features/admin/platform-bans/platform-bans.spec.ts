import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PlatformBansComponent } from './platform-bans';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { signal } from '@angular/core';

describe('PlatformBansComponent', () => {
  let component: PlatformBansComponent;
  let fixture: ComponentFixture<PlatformBansComponent>;
  let http: HttpTestingController;

  const mockUser = { id: 'uid1', username: 'admin', email: 'a@x.com', avatarUrl: null };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformBansComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthSessionService,
          useValue: { user: signal(mockUser) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformBansComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create and load bans on init', async () => {
    fixture.detectChanges();
    const req = http.expectOne('/api/admin/bans');
    req.flush([]);
    await fixture.whenStable();
    expect(component).toBeTruthy();
    expect(component.bans().length).toBe(0);
  });

  it('activeBans() filters out revoked entries', () => {
    const now = new Date().toISOString();
    http.expectOne('/api/admin/bans').flush([]);
    component.bans.set([
      { id: '1', userId: 'u1', username: 'alice', issuedByAdminId: 'a', issuedByAdminUsername: 'admin',
        reason: 'spam', createdAt: now, expiresAt: null, revokedAt: null },
      { id: '2', userId: 'u2', username: 'bob', issuedByAdminId: 'a', issuedByAdminUsername: 'admin',
        reason: 'troll', createdAt: now, expiresAt: null, revokedAt: now },
    ]);
    expect(component.activeBans().length).toBe(1);
    expect(component.activeBans()[0].username).toBe('alice');
  });

  it('revokedBans() returns only revoked entries', () => {
    const now = new Date().toISOString();
    http.expectOne('/api/admin/bans').flush([]);
    component.bans.set([
      { id: '1', userId: 'u1', username: 'alice', issuedByAdminId: 'a', issuedByAdminUsername: 'admin',
        reason: 'spam', createdAt: now, expiresAt: null, revokedAt: null },
      { id: '2', userId: 'u2', username: 'bob', issuedByAdminId: 'a', issuedByAdminUsername: 'admin',
        reason: 'troll', createdAt: now, expiresAt: null, revokedAt: now },
    ]);
    expect(component.revokedBans().length).toBe(1);
    expect(component.revokedBans()[0].username).toBe('bob');
  });
});
