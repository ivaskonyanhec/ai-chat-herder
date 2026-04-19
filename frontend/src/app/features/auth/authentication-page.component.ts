import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, ReactiveFormsModule, NonNullableFormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { InputText } from 'primeng/inputtext';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AuthResponse } from '../../core/auth/auth.models';

type AuthMode = 'login' | 'register';

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value as string;
  const confirm = control.get('confirmPassword')?.value as string;
  return password === confirm ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-authentication-page',
  imports: [ReactiveFormsModule, InputText],
  templateUrl: './authentication-page.component.html',
  styleUrl: './authentication-page.component.scss',
})
export class AuthenticationPageComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly mode = signal<AuthMode>('login');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
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

  setMode(mode: AuthMode): void {
    if (this.mode() === mode) {
      return;
    }

    this.errorMessage.set('');
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
