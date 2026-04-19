import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();

await ctx.addInitScript(() => {
  window.localStorage.setItem('chat-herder.session.persistent', JSON.stringify({
    accessToken: 'test-token-12345',
    user: { id: 'test-id', username: 'testuser', email: 'test@test.com', avatarUrl: null }
  }));
  window.localStorage.setItem('access_token', 'test-token-12345');
});

const page = await ctx.newPage();
await page.goto('http://localhost/app/rooms/some-room-id');

const ls = await page.evaluate(() => ({
  persistent: window.localStorage.getItem('chat-herder.session.persistent'),
  accessToken: window.localStorage.getItem('access_token'),
  url: window.location.href
}));

console.log('URL after nav:', ls.url);
console.log('persistent set:', ls.persistent ? 'YES' : 'NO');
console.log('accessToken set:', ls.accessToken ? 'YES' : 'NO');

await browser.close();
