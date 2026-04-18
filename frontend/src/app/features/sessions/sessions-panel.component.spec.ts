import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SessionsPanelComponent } from './sessions-panel.component';
import { SessionsApiService, SessionRecord } from '../../core/session/sessions-api.service';

describe('SessionsPanelComponent', () => {
  let fixture: ComponentFixture<SessionsPanelComponent>;
  let api: {
    getSessions: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      getSessions: vi.fn(),
      revokeSession: vi.fn(),
    };

    const sessions: SessionRecord[] = [
      {
        id: 'current-session',
        userAgent: 'Google Chrome on MacOS',
        ipAddress: '192.168.1.142',
        keepSignedIn: true,
        createdAt: '2026-04-18T09:00:00Z',
        expiresAt: '2026-04-25T09:00:00Z',
        isCurrent: true,
      },
      {
        id: 'secondary-session',
        userAgent: 'Safari on iPhone 15 Pro',
        ipAddress: '72.14.213.98',
        keepSignedIn: false,
        createdAt: '2026-04-18T05:00:00Z',
        expiresAt: '2026-04-19T05:00:00Z',
        isCurrent: false,
      },
    ];

    api.getSessions.mockReturnValue(of(sessions));
    api.revokeSession.mockReturnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [SessionsPanelComponent],
      providers: [{ provide: SessionsApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(SessionsPanelComponent);
    fixture.detectChanges();
  });

  it('renders the current and other active sessions', () => {
    const compiled = fixture.nativeElement;

    expect(compiled.querySelector('[data-testid="sessions-title"]')?.textContent).toContain(
      'Active Sessions',
    );
    expect(compiled.querySelector('[data-testid="current-session-card"]')?.textContent).toContain(
      'Google Chrome on MacOS',
    );
    expect(compiled.querySelector('[data-testid="session-row-secondary-session"]')?.textContent).toContain(
      'Safari on iPhone 15 Pro',
    );
  });

  it('revokes a non-current session from its action button', () => {
    const revokeButton = fixture.nativeElement.querySelector(
      '[data-testid="revoke-session-secondary-session"]',
    );

    revokeButton?.dispatchEvent(new MouseEvent('click'));

    expect(api.revokeSession).toHaveBeenCalledWith('secondary-session');
  });
});
