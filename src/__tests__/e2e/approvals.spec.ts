/**
 * approvals.spec.ts — Colorplas parity #31, #41, #55, #94, #118, #136
 * Wave 2 Agent G — multi-level approval engine
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { TEST_EMAIL, TEST_PASSWORD, TEST_APP_ID } from './helpers/setup';

test.describe('Approvals', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('submit record for approval', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/quotations`);
    await page.locator('table tbody tr').first().click();
    await page.getByRole('button', { name: /submit.*approval|send.*approval/i }).click();
    await expect(
      page.getByText(/submitted|pending.*approval|waiting/i),
    ).toBeVisible({ timeout: 6_000 });
  });

  test('approve a pending record', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/approvals`);
    const pendingRow = page.locator('[data-status="pending"]').first();
    await expect(pendingRow).toBeVisible({ timeout: 5_000 });
    await pendingRow.getByRole('button', { name: /approve/i }).click();
    await expect(page.getByText(/approved/i)).toBeVisible({ timeout: 5_000 });
  });

  test('reject a pending record with comment', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/approvals`);
    const pendingRow = page.locator('[data-status="pending"]').first();
    await expect(pendingRow).toBeVisible({ timeout: 5_000 });
    await pendingRow.getByRole('button', { name: /reject/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await dialog.getByPlaceholder(/comment|reason/i).fill('Price too high — please revise');
    await dialog.getByRole('button', { name: /confirm|reject/i }).click();
    await expect(page.getByText(/rejected/i)).toBeVisible({ timeout: 5_000 });
  });

  test('approval chain displays correctly', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/quotations`);
    await page.locator('table tbody tr').first().click();
    const chainPanel = page.locator(
      '[data-testid="approval-chain"], .approval-chain, [aria-label*="approval"]',
    );
    await expect(chainPanel).toBeVisible({ timeout: 5_000 });
    const approverItems = chainPanel.locator('li, [data-testid="approver-step"]');
    expect(await approverItems.count()).toBeGreaterThan(0);
  });
});
