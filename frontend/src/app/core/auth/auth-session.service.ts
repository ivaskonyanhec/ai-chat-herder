import { Injectable, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PersistedSession, StoredSession } from './auth.models';

const persistentStorageKey = 'chat-herder.session.persistent';
const sessionStorageKey = 'chat-herder.session.temporary';
const accessTokenStorageKey = 'access_token';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly document = inject(DOCUMENT);
  private readonly sessionState = signal<StoredSession | null>(this.readInitialSession());

  readonly session = this.sessionState.asReadonly();
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly accessToken = computed(() => this.sessionState()?.accessToken ?? null);
  readonly isAuthenticated = computed(() => this.sessionState() !== null);

  setSession(session: StoredSession): void {
    this.sessionState.set(session);
    this.persistSession(session, session.keepSignedIn ?? false);
  }

  clearSession(): void {
    this.sessionState.set(null);
    this.windowStorage('localStorage')?.removeItem(persistentStorageKey);
    this.windowStorage('localStorage')?.removeItem(accessTokenStorageKey);
    this.windowStorage('sessionStorage')?.removeItem(sessionStorageKey);
    this.windowStorage('sessionStorage')?.removeItem(accessTokenStorageKey);
  }

  updateAvatarUrl(avatarUrl: string | null): void {
    this.sessionState.update(s => {
      if (!s?.user) return s;
      return { ...s, user: { ...s.user, avatarUrl } };
    });
    const current = this.sessionState();
    if (current) this.persistSession(current, current.keepSignedIn ?? false);
  }

  isAccessTokenExpired(skewMs = 30_000): boolean {
    const token = this.accessToken();
    if (!token) {
      return true;
    }

    const expiresAt = this.readJwtExpirationMs(token);
    return expiresAt === null || expiresAt <= Date.now() + skewMs;
  }

  private readInitialSession(): StoredSession | null {
    return this.readStoredSession('localStorage', persistentStorageKey, true)
      ?? this.readStoredSession('sessionStorage', sessionStorageKey, false)
      ?? this.readAccessTokenBootstrap();
  }

  private persistSession(session: StoredSession, keepSignedIn: boolean): void {
    const storageKind = keepSignedIn ? 'localStorage' : 'sessionStorage';
    const storageKey = keepSignedIn ? persistentStorageKey : sessionStorageKey;
    const payload: PersistedSession = {
      accessToken: session.accessToken,
    };
    if (session.user) {
      payload.user = session.user;
    }

    this.clearSession();
    this.sessionState.set(session);
    this.windowStorage(storageKind)?.setItem(storageKey, JSON.stringify(payload));
    this.windowStorage(storageKind)?.setItem(accessTokenStorageKey, session.accessToken);
  }

  private readStoredSession(
    storageKind: 'localStorage' | 'sessionStorage',
    storageKey: string,
    keepSignedIn: boolean,
  ): StoredSession | null {
    const raw = this.windowStorage(storageKind)?.getItem(storageKey);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);

      if (!this.isPersistedSession(parsed)) {
        this.windowStorage(storageKind)?.removeItem(storageKey);
        return null;
      }

      return {
        accessToken: parsed.accessToken,
        user: parsed.user,
        keepSignedIn,
      };
    } catch {
      this.windowStorage(storageKind)?.removeItem(storageKey);
      return null;
    }
  }

  private isPersistedSession(value: unknown): value is PersistedSession {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Record<string, unknown>; // justification: narrowed from parsed JSON object
    if (typeof candidate['accessToken'] !== 'string') {
      return false;
    }

    const user = candidate['user'];
    if (user === undefined) {
      return true; // user is optional on PersistedSession
    }

    if (typeof user !== 'object' || user === null) {
      return false;
    }

    const userCandidate = user as Record<string, unknown>; // justification: narrowed from parsed JSON object
    return typeof userCandidate['id'] === 'string'
      && typeof userCandidate['username'] === 'string'
      && typeof userCandidate['email'] === 'string'
      && (typeof userCandidate['avatarUrl'] === 'string' || userCandidate['avatarUrl'] === null);
  }

  private readAccessTokenBootstrap(): StoredSession | null {
    const localToken = this.windowStorage('localStorage')?.getItem(accessTokenStorageKey);
    const sessionToken = this.windowStorage('sessionStorage')?.getItem(accessTokenStorageKey);
    const token = localToken ?? sessionToken;

    if (!token) {
      return null;
    }

    return {
      accessToken: token,
      keepSignedIn: localToken !== null,
    };
  }

  private windowStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
    const defaultView = this.document.defaultView;
    return defaultView ? defaultView[kind] : null;
  }

  private readJwtExpirationMs(token: string): number | null {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }

    try {
      const normalized = parts[1].replaceAll('-', '+').replaceAll('_', '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const rawPayload = this.document.defaultView?.atob(padded);
      if (!rawPayload) {
        return null;
      }

      const payload = JSON.parse(rawPayload) as Record<string, unknown>; // justification: decoded JWT payload
      return typeof payload['exp'] === 'number' ? payload['exp'] * 1000 : null;
    } catch {
      return null;
    }
  }
}
