import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { AuthenticationPageComponent } from './authentication-page.component';

function buildTestBed(queryParams: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [AuthenticationPageComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
      },
    ],
  });
}

describe('AuthenticationPageComponent', () => {
  beforeEach(async () => {
    buildTestBed();
    await TestBed.compileComponents();
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

  describe('Forgot password flow', () => {
    it('clicking the forgot-password button switches to forgot-password mode and shows the email form', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();

      const btn: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="forgot-password-link"]');
      expect(btn).not.toBeNull();
      btn.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.mode()).toBe('forgot-password');
      expect(fixture.nativeElement.querySelector('[data-testid="forgot-email"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="forgot-submit"]')).not.toBeNull();
    });

    it('forgot form is invalid with an empty email', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();
      const comp = fixture.componentInstance;
      comp.setMode('forgot-password');
      expect(comp.forgotForm.invalid).toBe(true);
    });

    it('forgot form is invalid with a malformed email', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();
      const comp = fixture.componentInstance;
      comp.setMode('forgot-password');
      comp.forgotForm.controls.email.setValue('not-an-email');
      expect(comp.forgotForm.invalid).toBe(true);
    });

    it('forgot form is valid with a proper email', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();
      const comp = fixture.componentInstance;
      comp.setMode('forgot-password');
      comp.forgotForm.controls.email.setValue('alice@example.com');
      expect(comp.forgotForm.valid).toBe(true);
    });

    it('submitting forgot form calls POST /api/auth/forgot-password and shows success message', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();
      const comp = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);

      comp.setMode('forgot-password');
      comp.forgotForm.controls.email.setValue('alice@example.com');
      fixture.detectChanges();

      comp.submitForgotPassword();

      const req = httpMock.expectOne('/api/auth/forgot-password');
      expect(req.request.body).toEqual({ email: 'alice@example.com' });
      req.flush({ message: 'If that email exists, a reset link has been sent.' });
      fixture.detectChanges();

      expect(comp.forgotSuccessMessage()).toContain('reset link');
      expect(fixture.nativeElement.querySelector('[data-testid="forgot-success"]')).not.toBeNull();
      httpMock.verify();
    });

    it('setMode to login from forgot-password clears errors and switches back', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();
      const comp = fixture.componentInstance;

      comp.setMode('forgot-password');
      expect(comp.mode()).toBe('forgot-password');
      comp.setMode('login');
      expect(comp.mode()).toBe('login');
      expect(comp.errorMessage()).toBe('');
    });
  });

  describe('Reset password flow — via setMode', () => {
    it('switching to reset-password mode shows the new-password form', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();
      const comp = fixture.componentInstance;

      comp.setMode('reset-password');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="reset-new-password"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="reset-confirm-password"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="reset-submit"]')).not.toBeNull();
    });

    it('reset form is invalid when passwords do not match', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();
      const comp = fixture.componentInstance;
      comp.setMode('reset-password');
      comp.resetForm.setValue({ newPassword: 'NewPass@1234', confirmPassword: 'Different@1234' });
      expect(comp.resetForm.invalid).toBe(true);
      expect(comp.resetForm.hasError('passwordMismatch')).toBe(true);
    });

    it('reset form is valid when passwords match and meet length requirement', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();
      const comp = fixture.componentInstance;
      comp.setMode('reset-password');
      comp.resetForm.setValue({ newPassword: 'NewPass@1234', confirmPassword: 'NewPass@1234' });
      expect(comp.resetForm.valid).toBe(true);
    });

    it('submitting reset form with a bad token shows error from API', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();
      const comp = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);

      comp.setMode('reset-password');
      comp.resetForm.setValue({ newPassword: 'NewPass@1234', confirmPassword: 'NewPass@1234' });
      fixture.detectChanges();

      comp.submitResetPassword();

      const req = httpMock.expectOne('/api/auth/reset-password');
      req.flush({ error: 'Token is invalid or has expired.' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();

      expect(comp.errorMessage()).toContain('invalid or has expired');
      httpMock.verify();
    });

    it('successful reset shows success message', () => {
      const fixture = TestBed.createComponent(AuthenticationPageComponent);
      fixture.detectChanges();
      const comp = fixture.componentInstance;
      const httpMock = TestBed.inject(HttpTestingController);

      comp.setMode('reset-password');
      comp.resetForm.setValue({ newPassword: 'NewPass@1234', confirmPassword: 'NewPass@1234' });
      fixture.detectChanges();

      comp.submitResetPassword();

      const req = httpMock.expectOne('/api/auth/reset-password');
      req.flush({ message: 'Password reset successfully.' });
      fixture.detectChanges();

      expect(comp.resetSuccessMessage()).toContain('reset successfully');
      expect(fixture.nativeElement.querySelector('[data-testid="reset-success"]')).not.toBeNull();
      httpMock.verify();
    });
  });
});

describe('AuthenticationPageComponent — token in URL', () => {
  beforeEach(async () => {
    buildTestBed({ token: 'test-reset-token-xyz' });
    await TestBed.compileComponents();
  });

  it('auto-switches to reset-password mode when ?token= is present in the URL', () => {
    const fixture = TestBed.createComponent(AuthenticationPageComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.mode()).toBe('reset-password');
    expect(fixture.nativeElement.querySelector('[data-testid="reset-new-password"]')).not.toBeNull();
  });
});
