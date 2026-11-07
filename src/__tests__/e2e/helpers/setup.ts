import { test as base } from '@playwright/test';
import { loginAs } from './auth';

export const TEST_EMAIL = process.env.TEST_EMAIL ?? 'admin@colorplas.test';
export const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'Test@1234';
export const TEST_APP_ID = process.env.TEST_APP_ID ?? 'colorplas';

export const test = base.extend<{ authenticatedPage: typeof base.prototype['page'] }>({
  authenticatedPage: async ({ page }, use) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
    await use(page);
  },
});

export { expect } from '@playwright/test';
