import fs from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from '@playwright/test';

async function readE2EContext() {
  const contextPath = path.resolve(process.cwd(), '..', 'artifacts', 'phase1-e2e-context.json');
  const context = JSON.parse(await fs.readFile(contextPath, 'utf8'));
  if (!context.orderCode || !context.orderId || !context.trackingCode) {
    throw new Error(`Invalid Phase 1 E2E context: ${contextPath}`);
  }
  return context;
}

test('phase 1 customer order history survives refresh and shows manual shipping', async ({ page }) => {
  const context = await readE2EContext();
  const password = process.env.E2E_PASSWORD;
  if (!password) throw new Error('E2E_PASSWORD is required for the Phase 1 browser test');

  await page.goto('/login');
  await page.locator('#login-email').fill('customer@greenhome.test');
  await page.locator('#login-password').fill(password);
  await page.locator('button.auth-submit').click();
  await page.goto('/orders');

  const orderCard = page.locator('.order-card').filter({ hasText: context.orderCode });
  await expect(orderCard).toBeVisible();
  await expect(orderCard).toContainText(context.productName);
  await expect(orderCard).toContainText('Đã giao');
  await expect(orderCard).toContainText('Đã thanh toán');
  await expect(orderCard).toContainText('Đã giao thành công');
  await expect(orderCard).toContainText(context.trackingCode);
  await expect(orderCard).toContainText(new Intl.NumberFormat('vi-VN').format(Number(context.totalAmount)));

  await page.reload();
  const refreshedCard = page.locator('.order-card').filter({ hasText: context.orderCode });
  await expect(refreshedCard).toBeVisible();
  await expect(refreshedCard).toContainText(context.trackingCode);
  await expect(refreshedCard).toContainText('Đã thanh toán');

  await page.goto(`/orders/${context.orderId}`);
  await expect(page.locator('body')).toContainText(context.trackingCode);
  await expect(page.locator('body')).toContainText('Đã giao thành công');

  await page.goto('/orders/not-an-object-id');
  await expect(page.locator('[role="alert"]')).toBeVisible();
  await expect(page.locator('[role="alert"]')).toContainText(/không tìm thấy|not found/i);
});
