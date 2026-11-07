/**
 * auth.spec.ts — Colorplas parity #147–148
 */
import { test, expect } from '@playwright/test';
import { loginAs, logout } from './helpers/auth';
import { TEST_EMAIL, TEST_PASSWORD } from './helpers/setup';

test.describe('Authentication', () => {
  test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/(dashboard|home|apps)/);
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('login with wrong password shows error message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password/i).fill('wrong-password-xyz');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText(/invalid|incorrect|wrong|failed|unauthorized/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('logout redirects to login page', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test('password change flow', async ({ page }) => {
    test.skip(
      !process.env.ALLOW_PASSWORD_CHANGE_TEST,
      'Skipped by default — set ALLOW_PASSWORD_CHANGE_TEST=1 to run',
    );
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto('/settings/security');
    await page.getByLabel(/current password/i).fill(TEST_PASSWORD);
    await page.getByLabel(/new password/i).fill('NewTest@5678');
    await page.getByLabel(/confirm.*password/i).fill('NewTest@5678');
    await page.getByRole('button', { name: /update|save|change/i }).click();
    await expect(page.getByText(/password.*updated|success/i)).toBeVisible({ timeout: 5_000 });
  });
});
