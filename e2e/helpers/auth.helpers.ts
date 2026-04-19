import { BrowserContext } from '@playwright/test';
import { TestUser } from './api.helpers';

const persistentStorageKey = 'chat-herder.session.persistent';
const accessTokenStorageKey = 'access_token';

export async function bootstrapAuthenticatedContext(context: BrowserContext, user: TestUser): Promise<void> {
  await context.addInitScript(
    ({ accessToken, persistedSession, atKey, psKey }) => {
      window.localStorage.setItem(atKey, accessToken);
      window.localStorage.setItem(psKey, JSON.stringify(persistedSession));
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
