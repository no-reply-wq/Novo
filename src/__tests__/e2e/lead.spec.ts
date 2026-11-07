/**
 * lead.spec.ts — Colorplas parity #1–11 (Lead Management)
 * Wave 1 Agent A — leads table, fields, relations, activity log
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { TEST_EMAIL, TEST_PASSWORD, TEST_APP_ID } from './helpers/setup';

const LEADS_URL = `/apps/${TEST_APP_ID}/leads`;

test.describe('Lead Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('create lead with company, contact, and source', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    await page.getByRole('button', { name: /new lead|\+ lead|add lead/i }).click();
    await page.getByPlaceholder(/company/i).fill('Test Polymers Ltd');
    await page.getByPlaceholder(/contact|name/i).fill('Priya Sharma');
    await page.getByRole('combobox', { name: /source/i }).selectOption('web');
    await page.getByRole('button', { name: /save|create/i }).click();
    await expect(page.getByText('Test Polymers Ltd')).toBeVisible({ timeout: 8_000 });
  });

  test('assign lead to a sales rep', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    await page.locator('table tbody tr').first().click();
    await page.getByRole('combobox', { name: /assigned to|sales rep/i }).selectOption({ index: 1 });
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText(/saved|updated/i)).toBeVisible({ timeout: 5_000 });
  });

  test('change lead status through pipeline', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    await page.locator('table tbody tr').first().click();
    await page.getByRole('combobox', { name: /status/i }).selectOption('Qualified');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText('Qualified')).toBeVisible({ timeout: 5_000 });
  });

  test('lead source tracking — source column visible', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    await expect(page.getByRole('columnheader', { name: /source/i })).toBeVisible();
  });

  test('lead activity log shows call entry', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    await page.locator('table tbody tr').first().click();
    await page.getByRole('tab', { name: /activity|timeline|log/i }).click();
    await page.getByRole('button', { name: /add activity|log call/i }).click();
    await page.getByRole('combobox', { name: /type/i }).selectOption('call');
    await page.getByPlaceholder(/note|description/i).fill('Called to discuss requirement');
    await page.getByRole('button', { name: /save|add/i }).click();
    await expect(page.getByText('Called to discuss requirement')).toBeVisible({ timeout: 5_000 });
  });

  test('lead scoring formula field visible in list', async ({ page }) => {
    test.skip(!process.env.LIVE_DB, 'Requires live Supabase — set LIVE_DB=1');
    await page.goto(LEADS_URL);
    await expect(page.getByRole('columnheader', { name: /score/i })).toBeVisible();
  });
});
