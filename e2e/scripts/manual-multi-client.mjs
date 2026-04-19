import { chromium } from '@playwright/test';

/**
 * Manual Multi-Client Testing Helper
 * 
 * Opens 3 independent browser windows (using Playwright Contexts) 
 * pointing to http://localhost to simulate multiple users concurrently.
 * 
 * Usage: 
 * cd e2e && node scripts/manual-multi-client.mjs
 */
(async () => {
  console.log('Starting 3 independent client windows...');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--start-maximized'] 
  });

  // Create 3 independent contexts (no shared cookies/localStorage)
  const contexts = await Promise.all([
    browser.newContext({ viewport: null }),
    browser.newContext({ viewport: null }),
    browser.newContext({ viewport: null }),
  ]);

  const pages = await Promise.all(contexts.map(c => c.newPage()));

  const baseUrl = process.env.BASE_URL || 'http://localhost';

  await Promise.all(pages.map(p => p.goto(baseUrl)));

  console.log('Windows ready. Close the browser or press Ctrl+C here to exit.');
  
  // Keep the process alive
  process.on('SIGINT', async () => {
    await browser.close();
    process.exit(0);
  });
})();
