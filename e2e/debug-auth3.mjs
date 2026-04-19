import { chromium } from '@playwright/test';

const accessTokenStorageKey = 'access_token';
const persistentStorageKey = 'chat-herder.session.persistent';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();

// This is what bootstrapAuthenticatedContext does
await ctx.addInitScript(
  ({ accessToken, persistedSession }) => {
    // These references to outer variables won't work in browser context
    window.localStorage.setItem(accessTokenStorageKey, accessToken);
    window.localStorage.setItem(persistentStorageKey, JSON.stringify(persistedSession));
    console.log('Keys being set:', accessTokenStorageKey, persistentStorageKey);
  },
  {
    accessToken: 'test-token-xyz',
    persistedSession: { accessToken: 'test-token-xyz', user: { id: 'id1', username: 'user1', email: 'user1@test.com', avatarUrl: null } }
  }
);

const page = await ctx.newPage();
await page.goto('http://localhost/');

const ls = await page.evaluate(() => {
  const keys = Object.keys(window.localStorage);
  const result = {};
  for (const key of keys) {
    result[key] = window.localStorage.getItem(key)?.slice(0, 30);
  }
  return result;
});

console.log('localStorage contents:', JSON.stringify(ls, null, 2));
await browser.close();
