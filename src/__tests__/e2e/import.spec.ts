/**
 * import.spec.ts — Colorplas parity #12, #91
 * Wave 4 Agent O — CSV/Excel import connector
 */
import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { TEST_EMAIL, TEST_PASSWORD, TEST_APP_ID } from './helpers/setup';

function writeTempCsv(headers: string[], rows: string[][]): string {
  const filePath = path.join('/tmp', `e2e-import-${Date.now()}.csv`);
  const lines = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  fs.writeFileSync(filePath, lines, 'utf8');
  return filePath;
}

test.describe('CSV / Excel Import', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('upload CSV file and reach column-mapping step', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    const csvPath = writeTempCsv(
      ['company', 'contact', 'source'],
      [['Import Co 1', 'Alice', 'web'], ['Import Co 2', 'Bob', 'referral']],
    );
    await page.goto(`/apps/${TEST_APP_ID}/leads`);
    await page.getByRole('button', { name: /import|upload/i }).click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(csvPath);
    await expect(page.getByText(/map columns|column mapping|match fields/i)).toBeVisible({
      timeout: 8_000,
    });
    fs.unlinkSync(csvPath);
  });

  test('map columns to fields', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    const csvPath = writeTempCsv(
      ['company_name', 'contact_person', 'source_channel'],
      [['Mapped Co', 'Charlie', 'cold_call']],
    );
    await page.goto(`/apps/${TEST_APP_ID}/leads`);
    await page.getByRole('button', { name: /import|upload/i }).click();
    await page.locator('input[type="file"]').setInputFiles(csvPath);
    await expect(page.getByText(/map columns|column mapping/i)).toBeVisible({ timeout: 8_000 });
    const companyMapping = page.locator('[data-csv-col="company_name"]').locator('select');
    await companyMapping.selectOption('company');
    await expect(companyMapping).toHaveValue('company');
    fs.unlinkSync(csvPath);
  });

  test('confirm import and verify records created', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    const csvPath = writeTempCsv(
      ['company', 'contact', 'source'],
      [['E2E Import A', 'Dave', 'web'], ['E2E Import B', 'Eve', 'web']],
    );
    await page.goto(`/apps/${TEST_APP_ID}/leads`);
    await page.getByRole('button', { name: /import|upload/i }).click();
    await page.locator('input[type="file"]').setInputFiles(csvPath);
    await expect(page.getByText(/map columns|column mapping/i)).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: /next|confirm|import/i }).click();
    await expect(page.getByText(/import|confirm|proceed/i)).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /confirm|start import|yes/i }).click();
    await expect(page.getByText(/imported|2.*records|success/i)).toBeVisible({ timeout: 15_000 });
    await page.goto(`/apps/${TEST_APP_ID}/leads`);
    await expect(page.getByText('E2E Import A')).toBeVisible({ timeout: 8_000 });
    fs.unlinkSync(csvPath);
  });
});
