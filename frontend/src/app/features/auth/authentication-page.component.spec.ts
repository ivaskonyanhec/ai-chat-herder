import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { AuthenticationPageComponent } from './authentication-page.component';

describe('AuthenticationPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthenticationPageComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('renders the login form selectors required by e2e auth tests', () => {
    const fixture = TestBed.createComponent(AuthenticationPageComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement;

    expect(compiled.querySelector('[data-testid="login-email"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="login-password"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="login-submit"]')).not.toBeNull();
  });

  it('shows registration selectors when register mode is selected', () => {
    const fixture = TestBed.createComponent(AuthenticationPageComponent);
    fixture.detectChanges();

    fixture.componentInstance.setMode('register');
    fixture.detectChanges();

    const compiled = fixture.nativeElement;

    expect(compiled.querySelector('[data-testid="register-username"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="register-email"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="register-password"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="register-submit"]')).not.toBeNull();
  });
});
