/**
 * pdf.spec.ts — Colorplas parity #33, #45, #70, #98, #105, #128, #141, #195
 * Wave 4 Agent P — PDF template designer, GST layouts, label printer
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { TEST_EMAIL, TEST_PASSWORD, TEST_APP_ID } from './helpers/setup';

test.describe('PDF Template Designer & Export', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('open PDF template designer', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/pdf-templates`);
    await expect(page.getByText(/template|designer/i)).toBeVisible({ timeout: 5_000 });
    const newBtn = page.getByRole('button', { name: /new template|\+ template/i });
    if (await newBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await newBtn.click();
      await page.getByPlaceholder(/template name/i).fill('E2E Test Template');
      await page.getByRole('button', { name: /create|save/i }).click();
    } else {
      await page.locator('table tbody tr').first().click();
    }
    await expect(
      page.locator('[data-testid="pdf-canvas"], .pdf-designer, [aria-label*="PDF"]'),
    ).toBeVisible({ timeout: 6_000 });
  });

  test('add a text block to PDF template', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/pdf-templates`);
    await page.locator('table tbody tr').first().click();
    await page.getByRole('button', { name: /text block|add text/i }).click();
    const textBlock = page.locator('[data-type="text"], .pdf-text-block').last();
    await expect(textBlock).toBeVisible({ timeout: 5_000 });
    await textBlock.click();
    await page.keyboard.type('Test heading');
  });

  test('preview a PDF template', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/pdf-templates`);
    await page.locator('table tbody tr').first().click();
    await page.getByRole('button', { name: /preview/i }).click();
    const preview = page.locator(
      'iframe[src*="pdf"], [data-testid="pdf-preview"], .pdf-preview',
    );
    await expect(preview).toBeVisible({ timeout: 10_000 });
  });

  test('download a quotation PDF', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(`/apps/${TEST_APP_ID}/quotations`);
    await page.locator('table tbody tr').first().click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /download.*pdf|export.*pdf|print/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});
