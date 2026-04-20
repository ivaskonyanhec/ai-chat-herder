import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, ReactiveFormsModule, NonNullableFormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { InputText } from 'primeng/inputtext';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AuthResponse } from '../../core/auth/auth.models';

type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value as string;
  const confirm = control.get('confirmPassword')?.value as string;
  return password === confirm ? null : { passwordMismatch: true };
}

function newPasswordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('newPassword')?.value as string;
  const confirm = control.get('confirmPassword')?.value as string;
  return password === confirm ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-authentication-page',
  imports: [ReactiveFormsModule, InputText],
  templateUrl: './authentication-page.component.html',
  styleUrl: './authentication-page.component.scss',
})
export class AuthenticationPageComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly mode = signal<AuthMode>('login');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly forgotSuccessMessage = signal('');
  readonly resetSuccessMessage = signal('');
  private resetToken = '';

  readonly loginForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    keepSignedIn: [true],
  });
  readonly registerForm = this.formBuilder.group({
    username: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(32)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
    keepSignedIn: [true],
  }, { validators: passwordMatchValidator });
  readonly forgotForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
  });
  readonly resetForm = this.formBuilder.group({
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  }, { validators: newPasswordMatchValidator });
  readonly eyebrowLabel = computed(() =>
    this.mode() === 'login' ? 'Operational Access' : 'New Workspace Access',
  );
  readonly title = computed(() =>
    this.mode() === 'login' ? 'Structured entry for focused collaboration.' : 'Register your workspace identity.',
  );
  readonly supportingCopy = computed(() =>
    this.mode() === 'login'
      ? 'Sign in to your chat workspace with the same quiet, durable visual language defined in the approved slate protocol.'
      : 'Create a persistent account for room access, messaging, and session-controlled presence.',
  );

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.resetToken = token;
      this.mode.set('reset-password');
    }
  }

  submitLogin(): void {
    if (this.loginForm.invalid || this.isSubmitting()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    this.authApi
      .login(this.loginForm.getRawValue())
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (response) => this.completeAuthentication(response),
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Unable to sign in right now.');
        },
      });
  }

  submitRegister(): void {
    if (this.registerForm.invalid || this.isSubmitting()) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    const { confirmPassword: _ignored, ...payload } = this.registerForm.getRawValue();
    this.authApi
      .register(payload)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (response) => this.completeAuthentication(response),
        error: (error: { error?: { error?: string } }) => {
          this.errorMessage.set(error.error?.error ?? 'Unable to create an account right now.');
        },
      });
  }

  submitForgotPassword(): void {
    if (this.forgotForm.invalid || this.isSubmitting()) {
      this.forgotForm.markAllAsTouched();
      return;
    }
    this.errorMessage.set('');
    this.isSubmitting.set(true);
    this.authApi
      .forgotPassword(this.forgotForm.controls.email.value)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (res) => this.forgotSuccessMessage.set(res.message),
        error: () => this.errorMessage.set('Unable to process request. Please try again.'),
      });
  }

  submitResetPassword(): void {
    if (this.resetForm.invalid || this.isSubmitting()) {
      this.resetForm.markAllAsTouched();
      return;
    }
    this.errorMessage.set('');
    this.isSubmitting.set(true);
    this.authApi
      .resetPassword(this.resetToken, this.resetForm.controls.newPassword.value)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (res) => this.resetSuccessMessage.set(res.message),
        error: (err: { error?: { error?: string } }) =>
          this.errorMessage.set(err.error?.error ?? 'Unable to reset password. The link may have expired.'),
      });
  }

  resetFieldHasError(controlName: 'newPassword' | 'confirmPassword'): boolean {
    const control = this.resetForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  resetPasswordMismatch(): boolean {
    const confirm = this.resetForm.controls.confirmPassword;
    return this.resetForm.hasError('passwordMismatch') && (confirm.dirty || confirm.touched);
  }

  setMode(mode: AuthMode): void {
    if (this.mode() === mode) return;
    this.errorMessage.set('');
    this.forgotSuccessMessage.set('');
    this.resetSuccessMessage.set('');
    this.mode.set(mode);
  }

  loginFieldHasError(controlName: 'email' | 'password'): boolean {
    const control = this.loginForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  registerFieldHasError(controlName: 'username' | 'email' | 'password' | 'confirmPassword'): boolean {
    const control = this.registerForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  registerPasswordMismatch(): boolean {
    const confirm = this.registerForm.controls.confirmPassword;
    return this.registerForm.hasError('passwordMismatch') && (confirm.dirty || confirm.touched);
  }

  private completeAuthentication(response: AuthResponse): void {
    this.authSession.setSession({
      ...response,
      keepSignedIn: this.mode() === 'login'
        ? this.loginForm.controls.keepSignedIn.value
        : this.registerForm.controls.keepSignedIn.value,
    });
    void this.router.navigateByUrl('/app');
  }
}
