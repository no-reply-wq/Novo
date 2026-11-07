import { Page } from '@playwright/test';

export async function loginAs(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|home|apps)/, { timeout: 10_000 });
}

export async function logout(page: Page): Promise<void> {
  const userMenu = page.getByRole('button', { name: /user menu|account|avatar/i });
  if (await userMenu.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await userMenu.click();
    await page.getByRole('menuitem', { name: /log ?out|sign ?out/i }).click();
  } else {
    await page.goto('/api/auth/logout');
  }
  await page.waitForURL(/\/login/, { timeout: 10_000 });
}
