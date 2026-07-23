import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const artifactRoot = path.resolve(
  process.cwd(),
  '..',
  'artifacts',
  'ephemeral-staging'
);
const screenshotRoot = path.join(artifactRoot, 'screenshots');
const consoleEntries = [];

test.beforeEach(async ({ page }) => {
  page.on('console', (message) => {
    consoleEntries.push({
      type: message.type(),
      text: message.text(),
      url: page.url(),
    });
  });
});

test.afterAll(async () => {
  await fs.mkdir(artifactRoot, { recursive: true });
  await fs.writeFile(
    path.join(artifactRoot, 'browser-console.json'),
    `${JSON.stringify(consoleEntries, null, 2)}\n`
  );
});

test('public home renders without an uncaught page error', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByLabel('Trang chủ GreenHome Kitchen')).toBeVisible();
  await fs.mkdir(screenshotRoot, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotRoot, 'home.png'),
    fullPage: true,
  });

  expect(pageErrors).toEqual([]);
});

test('Customer can sign in and open order history', async ({ page }) => {
  const password = process.env.CI_STAGING_PASSWORD;
  expect(password?.length).toBeGreaterThanOrEqual(12);

  await page.goto('/login');
  await page.locator('#login-email').fill('khachhang@greenhome.test');
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole('heading', { name: 'Lịch sử mua hàng' })).toBeVisible();
  await fs.mkdir(screenshotRoot, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotRoot, 'customer-orders.png'),
    fullPage: true,
  });
});
