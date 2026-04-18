import { test as base, BrowserContext, Page } from '@playwright/test';
import { ApiHelpers, TestUser } from '../helpers/api.helpers';
import { bootstrapAuthenticatedContext } from '../helpers/auth.helpers';

type E2EFixtures = {
  api:       ApiHelpers;
  userA:     TestUser;
  userB:     TestUser;
  ctxA:      BrowserContext;
  ctxB:      BrowserContext;
  userAPage: Page;
  userBPage: Page;
};

// All fixtures are test-scoped — fresh users and contexts per test, no shared state.
export const test = base.extend<E2EFixtures>({

  api: async ({}, use) => {
    await use(new ApiHelpers());
  },

  userA: async ({ api }, use) => {
    await use(await api.register());
  },

  userB: async ({ api }, use) => {
    await use(await api.register());
  },

  // Isolated browser context for User A — separate localStorage from User B,
  // equivalent to separate incognito windows.
  ctxA: async ({ browser, userA }, use) => {
    const ctx = await browser.newContext();
    await bootstrapAuthenticatedContext(ctx, userA);
    await use(ctx);
    await ctx.close();
  },

  ctxB: async ({ browser, userB }, use) => {
    const ctx = await browser.newContext();
    await bootstrapAuthenticatedContext(ctx, userB);
    await use(ctx);
    await ctx.close();
  },

  userAPage: async ({ ctxA }, use) => {
    const page = await ctxA.newPage();
    await use(page);
    await page.close();
  },

  userBPage: async ({ ctxB }, use) => {
    const page = await ctxB.newPage();
    await use(page);
    await page.close();
  },
});

export { expect, request } from '@playwright/test';
