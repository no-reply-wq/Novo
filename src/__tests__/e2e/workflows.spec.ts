/**
 * workflows.spec.ts — Colorplas parity #4, #80, #155–162, #169
 * Wave 2 Agent F — workflow v2 engine
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { TEST_EMAIL, TEST_PASSWORD, TEST_APP_ID } from './helpers/setup';

const WF_URL = `/apps/${TEST_APP_ID}/workflows`;

test.describe('Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('create a workflow with a record-created trigger', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(WF_URL);
    await page.getByRole('button', { name: /new workflow|\+ workflow/i }).click();
    await page.getByPlaceholder(/workflow name/i).fill('E2E Test Workflow');
    await page.getByRole('combobox', { name: /trigger|when/i }).selectOption('record_created');
    await page.getByRole('combobox', { name: /table/i }).selectOption('leads');
    await page.getByRole('button', { name: /save|create/i }).click();
    await expect(page.getByText('E2E Test Workflow')).toBeVisible({ timeout: 6_000 });
  });

  test('add a send-email action step to a workflow', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(WF_URL);
    await page.locator('table tbody tr').first().click();
    await page.getByRole('button', { name: /add step|\+ action/i }).click();
    await page.getByRole('combobox', { name: /action type/i }).selectOption('send_email');
    await page.getByPlaceholder(/to|recipient/i).fill('{{record.email}}');
    await page.getByPlaceholder(/subject/i).fill('New lead created: {{record.company}}');
    await page.getByRole('button', { name: /save step|add/i }).click();
    await expect(page.getByText(/send.*email|email.*step/i)).toBeVisible({ timeout: 5_000 });
  });

  test('run workflow manually', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(WF_URL);
    await page.locator('table tbody tr').first().click();
    await page.getByRole('button', { name: /run now|manual run|test/i }).click();
    await expect(page.getByText(/run.*started|triggered|running/i)).toBeVisible({ timeout: 8_000 });
  });

  test('workflow run log shows result', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(WF_URL);
    await page.locator('table tbody tr').first().click();
    await page.getByRole('tab', { name: /runs|history|log/i }).click();
    const runRow = page.locator('[data-testid="run-row"], .run-row, table tbody tr').first();
    await expect(runRow).toBeVisible({ timeout: 10_000 });
    await expect(runRow.getByText(/success|failed|completed|error/i)).toBeVisible();
  });
});
