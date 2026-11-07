/**
 * records.spec.ts — Colorplas parity #1–7, #13–21, #168
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { TEST_EMAIL, TEST_PASSWORD, TEST_APP_ID } from './helpers/setup';

const LEADS_URL = `/apps/${TEST_APP_ID}/leads`;

test.describe('Records — CRUD & list operations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('create a record in list view', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    await page.getByRole('button', { name: /new|add|create|\+ lead/i }).click();
    await page.getByPlaceholder(/company/i).fill('Acme Plastics');
    await page.getByPlaceholder(/contact|name/i).fill('Ravi Kumar');
    await page.getByRole('combobox', { name: /source/i }).selectOption('web');
    await page.getByRole('button', { name: /save|create/i }).click();
    await expect(page.getByText('Acme Plastics')).toBeVisible({ timeout: 8_000 });
  });

  test('edit a record inline', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.getByRole('cell').first().dblclick();
    const input = firstRow.locator('input[type="text"]').first();
    await input.fill('Edited Company Name');
    await input.press('Enter');
    await expect(page.getByText('Edited Company Name')).toBeVisible({ timeout: 5_000 });
  });

  test('delete a record (with reason)', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.hover();
    await firstRow.getByRole('button', { name: /delete|remove/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    const reasonInput = dialog.getByPlaceholder(/reason/i);
    if (await reasonInput.isVisible()) {
      await reasonInput.fill('Test cleanup');
    }
    await dialog.getByRole('button', { name: /confirm|yes|delete/i }).click();
    await expect(
      page.getByText(/deleted|removed/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('filter records by field value', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    await page.getByRole('button', { name: /filter/i }).click();
    await page.getByRole('combobox', { name: /field/i }).selectOption('source');
    await page.getByRole('combobox', { name: /operator/i }).selectOption('equals');
    await page.getByRole('combobox', { name: /value/i }).selectOption('web');
    await page.getByRole('button', { name: /apply/i }).click();
    const sourceCells = page.locator('[data-col="source"]');
    const count = await sourceCells.count();
    for (let i = 0; i < count; i++) {
      await expect(sourceCells.nth(i)).toContainText('web');
    }
  });

  test('sort records by column', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    await page.getByRole('columnheader', { name: /company/i }).click();
    await expect(page.getByRole('columnheader', { name: /company/i })).toHaveAttribute(
      'aria-sort',
      /ascending|descending/,
    );
  });

  test('export records to CSV', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /export|download|csv/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);
  });
});
