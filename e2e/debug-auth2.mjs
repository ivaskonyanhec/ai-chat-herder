import { chromium } from '@playwright/test';

// Register a real user first
const response = await fetch('http://localhost/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'debugtest99',
    email: 'debugtest99@test.local',
    password: 'Test@1234!E2E',
    keepSignedIn: true
  })
});
const data = await response.json();
console.log('Register status:', response.status);
console.log('User:', data.user?.id, data.user?.username);
console.log('Token:', data.accessToken?.slice(0, 30) + '...');

const user = {
  id: data.user.id,
  username: data.user.username,
  email: 'debugtest99@test.local',
  accessToken: data.accessToken
};

// Now create a browser with that user's session
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();

await ctx.addInitScript(
  ({ accessToken, persistedSession }) => {
    window.localStorage.setItem('access_token', accessToken);
    window.localStorage.setItem('chat-herder.session.persistent', JSON.stringify(persistedSession));
  },
  {
    accessToken: user.accessToken,
    persistedSession: {
      accessToken: user.accessToken,
      user: { id: user.id, username: user.username, email: user.email, avatarUrl: null }
    }
  }
);

// Create room first
const roomRes = await fetch('http://localhost/api/rooms', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${user.accessToken}`
  },
  body: JSON.stringify({ name: 'debugroom' + Date.now(), visibility: 'Public' })
});
const room = await roomRes.json();
console.log('Room:', room.id, room.name);

const page = await ctx.newPage();
await page.goto(`http://localhost/app/rooms/${room.id}`);
await page.waitForTimeout(3000);

const url = page.url();
const title = await page.title();
const localStorage = await page.evaluate(() => ({
  at: window.localStorage.getItem('access_token'),
  ps: window.localStorage.getItem('chat-herder.session.persistent')?.slice(0, 50)
}));

console.log('Current URL:', url);
console.log('Title:', title);
console.log('localStorage.access_token:', localStorage.at?.slice(0, 20));
console.log('localStorage.persistent:', localStorage.ps);

// Check if we see auth page or chat page
const authPage = await page.locator('[data-testid="go-to-register"]').isVisible();
const chatArea = await page.locator('[data-testid="chat-area"]').isVisible();
console.log('Shows auth page:', authPage);
console.log('Shows chat area:', chatArea);

await browser.close();
