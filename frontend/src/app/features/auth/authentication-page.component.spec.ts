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
    expect(compiled.querySelector('[data-testid="register-confirm-password"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="register-submit"]')).not.toBeNull();
  });

  it('register form is invalid when passwords do not match', () => {
    const fixture = TestBed.createComponent(AuthenticationPageComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    comp.registerForm.setValue({ username: 'alice', email: 'a@b.com', password: 'pass1234', confirmPassword: 'different', keepSignedIn: true });
    expect(comp.registerForm.invalid).toBe(true);
    expect(comp.registerForm.hasError('passwordMismatch')).toBe(true);
  });

  it('register form is valid when passwords match', () => {
    const fixture = TestBed.createComponent(AuthenticationPageComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;
    comp.registerForm.setValue({ username: 'alice', email: 'a@b.com', password: 'pass1234', confirmPassword: 'pass1234', keepSignedIn: true });
    expect(comp.registerForm.valid).toBe(true);
    expect(comp.registerForm.hasError('passwordMismatch')).toBe(false);
  });
});
