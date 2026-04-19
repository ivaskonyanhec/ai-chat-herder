import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();

await ctx.addInitScript(
  ({ val }) => {
    // Simulate localStorage.setItem(undefined, val)
    try {
      window.localStorage.setItem(undefined, val);
      window.__setResult = 'success';
      window.__keys = Object.keys(window.localStorage);
    } catch(e) {
      window.__setResult = 'error: ' + e.message;
    }
  },
  { val: 'test-value' }
);

const page = await ctx.newPage();
await page.goto('http://localhost/');

const result = await page.evaluate(() => ({
  setResult: window.__setResult,
  keys: window.__keys,
  undefinedKey: window.localStorage.getItem('undefined')
}));

console.log('Result:', JSON.stringify(result));
await browser.close();
