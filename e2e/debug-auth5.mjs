import { chromium } from '@playwright/test';

const accessTokenStorageKey = 'access_token';
const persistentStorageKey = 'chat-herder.session.persistent';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();

// Simulate what bootstrapAuthenticatedContext does  
await ctx.addInitScript(
  ({ accessToken, persistedSession }) => {
    // What is accessTokenStorageKey and persistentStorageKey in browser context?
    window.__atsk = typeof accessTokenStorageKey;
    window.__psk = typeof persistentStorageKey;
    window.localStorage.setItem(accessTokenStorageKey, accessToken);
    window.localStorage.setItem(persistentStorageKey, JSON.stringify(persistedSession));
  },
  {
    accessToken: 'test-token-xyz',
    persistedSession: { accessToken: 'test-token-xyz', user: { id: 'id1', username: 'user1', email: 'user1@test.com', avatarUrl: null } }
  }
);

const page = await ctx.newPage();
await page.goto('http://localhost/');

const result = await page.evaluate(() => {
  const keys = Object.keys(window.localStorage);
  const result = {
    atskType: window.__atsk,
    pskType: window.__psk,
    keys
  };
  for (const key of keys.slice(0, 5)) {
    result[key] = window.localStorage.getItem(key)?.slice(0, 50);
  }
  return result;
});

console.log('Result:', JSON.stringify(result, null, 2));
await browser.close();
