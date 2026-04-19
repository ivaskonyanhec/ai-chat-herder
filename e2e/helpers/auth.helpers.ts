import { BrowserContext } from '@playwright/test';
import { TestUser } from './api.helpers';

const persistentStorageKey = 'chat-herder.session.persistent';
const accessTokenStorageKey = 'access_token';
const refreshCookieName = 'chat_herder_refresh';

export async function bootstrapAuthenticatedContext(context: BrowserContext, user: TestUser): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost';
  await context.addCookies([
    {
      name: refreshCookieName,
      value: user.refreshToken,
      url: `${baseUrl}/api/auth/refresh`,
      httpOnly: true,
      sameSite: 'Lax',
      secure: baseUrl.startsWith('https://'),
      expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    },
  ]);

  await context.addInitScript(
    ({ accessToken, persistedSession, atKey, psKey }) => {
      window.localStorage.setItem(atKey, accessToken);
      window.localStorage.setItem(psKey, JSON.stringify(persistedSession));
      (window as any).__e2eHooks = true;
    },
    {
      atKey: accessTokenStorageKey,
      psKey: persistentStorageKey,
      accessToken: user.accessToken,
      persistedSession: {
        accessToken: user.accessToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatarUrl: null,
        },
      },
    },
  );
}

export function uniqueIdentity(prefix: string): { email: string; password: string; username: string } {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `${prefix}-${suffix}@test.local`,
    password: 'Test@1234!E2E',
    username: `${prefix}_${suffix}`,
  };
}
