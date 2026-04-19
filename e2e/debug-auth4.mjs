import { chromium } from '@playwright/test';

const accessTokenStorageKey = 'access_token';
const persistentStorageKey = 'chat-herder.session.persistent';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();

// Simulate what bootstrapAuthenticatedContext does  
await ctx.addInitScript(
  ({ accessToken, persistedSession }) => {
    window.localStorage.setItem(accessTokenStorageKey, accessToken);  // accessTokenStorageKey is undefined here!
    window.localStorage.setItem(persistentStorageKey, JSON.stringify(persistedSession));
    // After the call, what key was set?
    const keys = Object.keys(window.localStorage);
    // Can't console.log here easily, but let's store in a custom key
    window.localStorage.setItem('__debug_keys', JSON.stringify(keys));
  },
  {
    accessToken: 'test-token-xyz',
    persistedSession: { accessToken: 'test-token-xyz', user: { id: 'id1', username: 'user1', email: 'user1@test.com', avatarUrl: null } }
  }
);

const page = await ctx.newPage();
// Navigate to a page that doesn't clear localStorage immediately
await page.goto('about:blank');

const ls = await page.evaluate(() => {
  // What keys were set?
  const keys = Object.keys(window.localStorage);
  const result = { keys };
  for (const key of keys) {
    result[key] = window.localStorage.getItem(key)?.slice(0, 40);
  }
  return result;
});

console.log('localStorage:', JSON.stringify(ls, null, 2));
await browser.close();
