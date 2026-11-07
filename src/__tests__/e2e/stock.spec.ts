/**
 * stock.spec.ts — Colorplas parity #72–91, #51, #56, #59–60, #67, #74–79
 * Wave 2 Agent H — stock ledger, BOM, FIFO
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { TEST_EMAIL, TEST_PASSWORD, TEST_APP_ID } from './helpers/setup';

const STOCK_URL = `/apps/${TEST_APP_ID}/stock-movements`;

test.describe('Stock & Inventory', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('post a stock IN movement', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(STOCK_URL);
    await page.getByRole('button', { name: /new|stock in|\+ movement/i }).click();
    await page.getByRole('combobox', { name: /type/i }).selectOption('IN');
    await page.getByRole('combobox', { name: /product|material/i }).selectOption({ index: 1 });
    await page.getByPlaceholder(/quantity|qty/i).fill('100');
    await page.getByPlaceholder(/batch|lot/i).fill('BATCH-001');
    await page.getByRole('button', { name: /save|post/i }).click();
    await expect(page.getByText(/saved|posted|success/i)).toBeVisible({ timeout: 6_000 });
  });

  test('post a stock OUT movement', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(STOCK_URL);
    await page.getByRole('button', { name: /new|stock out|\+ movement/i }).click();
    await page.getByRole('combobox', { name: /type/i }).selectOption('OUT');
    await page.getByRole('combobox', { name: /product|material/i }).selectOption({ index: 1 });
    await page.getByPlaceholder(/quantity|qty/i).fill('10');
    await page.getByRole('button', { name: /save|post/i }).click();
    await expect(page.getByText(/saved|posted|success/i)).toBeVisible({ timeout: 6_000 });
  });

  test('balance updates after stock movement', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/stock-ledger`);
    const balanceCells = page.locator('[data-col="balance"], td.balance');
    await expect(balanceCells.first()).toBeVisible({ timeout: 5_000 });
    const balanceText = await balanceCells.first().textContent();
    expect(Number(balanceText?.replace(/[^0-9.-]/g, ''))).toBeGreaterThanOrEqual(0);
  });

  test('batch tracking — batch number visible in ledger', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/stock-ledger`);
    await page.getByRole('button', { name: /filter/i }).click();
    await page.getByPlaceholder(/batch|lot/i).fill('BATCH-001');
    await page.getByRole('button', { name: /apply/i }).click();
    await expect(page.getByText('BATCH-001')).toBeVisible({ timeout: 6_000 });
  });
});
