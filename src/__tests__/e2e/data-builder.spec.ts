/**
 * data-builder.spec.ts — Colorplas parity #9 (lead score formula), #175–179
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { TEST_EMAIL, TEST_PASSWORD, TEST_APP_ID } from './helpers/setup';

test.describe('Data / Schema Builder', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('create a new table from builder', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/data`);
    await page.getByRole('button', { name: /new table|add table|\+ table/i }).click();
    await page.getByPlaceholder(/table name/i).fill('e2e_test_table');
    await page.getByRole('button', { name: /create|save/i }).click();
    await expect(page.getByText('e2e_test_table')).toBeVisible({ timeout: 8_000 });
  });

  test('add a text field to a table', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/data/leads`);
    await page.getByRole('button', { name: /add field|\+ field/i }).click();
    await page.getByPlaceholder(/field name/i).fill('e2e_text_field');
    await page.getByRole('combobox', { name: /type/i }).selectOption('text');
    await page.getByRole('button', { name: /save|add/i }).click();
    await expect(page.getByText('e2e_text_field')).toBeVisible({ timeout: 5_000 });
  });

  test('add a number field to a table', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/data/leads`);
    await page.getByRole('button', { name: /add field|\+ field/i }).click();
    await page.getByPlaceholder(/field name/i).fill('e2e_number_field');
    await page.getByRole('combobox', { name: /type/i }).selectOption('number');
    await page.getByRole('button', { name: /save|add/i }).click();
    await expect(page.getByText('e2e_number_field')).toBeVisible({ timeout: 5_000 });
  });

  test('add a dropdown / select field', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/data/leads`);
    await page.getByRole('button', { name: /add field|\+ field/i }).click();
    await page.getByPlaceholder(/field name/i).fill('e2e_status_field');
    await page.getByRole('combobox', { name: /type/i }).selectOption('select');
    await page.getByRole('button', { name: /add option/i }).click();
    await page.getByPlaceholder(/option/i).last().fill('New');
    await page.getByRole('button', { name: /save|add/i }).click();
    await expect(page.getByText('e2e_status_field')).toBeVisible({ timeout: 5_000 });
  });

  test('add a formula field — lead score', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/data/leads`);
    await page.getByRole('button', { name: /add field|\+ field/i }).click();
    await page.getByPlaceholder(/field name/i).fill('lead_score');
    await page.getByRole('combobox', { name: /type/i }).selectOption('formula');
    const exprEditor = page.getByRole('textbox', { name: /formula|expression/i });
    await expect(exprEditor).toBeVisible({ timeout: 3_000 });
    await exprEditor.fill('IF(budget > 100000, 10, 5)');
    await page.getByRole('button', { name: /save|add/i }).click();
    await expect(page.getByText('lead_score')).toBeVisible({ timeout: 5_000 });
  });

  test('save schema — API called (network intercept)', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    const [request] = await Promise.all([
      page.waitForRequest(
        (req) => req.url().includes('/api/builder/apps') && req.method() === 'POST',
      ),
      (async () => {
        await page.goto(`/apps/${TEST_APP_ID}/data`);
        await page.getByRole('button', { name: /new table|\+ table/i }).click();
        await page.getByPlaceholder(/table name/i).fill('api_test_table');
        await page.getByRole('button', { name: /create|save/i }).click();
      })(),
    ]);
    expect(request.url()).toContain('/api/builder/apps');
  });

  test('add a relation field to another table', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/data/leads`);
    await page.getByRole('button', { name: /add field|\+ field/i }).click();
    await page.getByPlaceholder(/field name/i).fill('customer_id');
    await page.getByRole('combobox', { name: /type/i }).selectOption('relation');
    await page.getByRole('combobox', { name: /related table/i }).selectOption('customers');
    await page.getByRole('button', { name: /save|add/i }).click();
    await expect(page.getByText('customer_id')).toBeVisible({ timeout: 5_000 });
  });
});
