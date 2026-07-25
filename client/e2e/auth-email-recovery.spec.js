import { expect, test } from '@playwright/test';

function apiHeaders(page) {
  return {
    'access-control-allow-credentials': 'true',
    'access-control-allow-origin': new URL(page.url()).origin,
    'content-type': 'application/json',
  };
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 375, height: 812 },
]) {
  test(`Guest completes two-step password recovery on ${viewport.name}`, async ({ page }) => {
    let forgotRequests = 0;
    let resetRequests = 0;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 401,
        headers: apiHeaders(page),
        body: JSON.stringify({
          success: false,
          errorCode: 'UNAUTHENTICATED',
          message: 'Chưa đăng nhập.',
        }),
      });
    });
    await page.route('**/api/auth/forgot-password', async (route) => {
      forgotRequests += 1;
      await route.fulfill({
        status: 200,
        headers: apiHeaders(page),
        body: JSON.stringify({
          success: true,
          data: null,
          message: 'Nếu email tồn tại, mã OTP đặt lại mật khẩu sẽ được gửi đến hộp thư của bạn.',
        }),
      });
    });
    await page.route('**/api/auth/reset-password', async (route) => {
      resetRequests += 1;
      await route.fulfill({
        status: 200,
        headers: apiHeaders(page),
        body: JSON.stringify({
          success: true,
          data: null,
          message: 'Đặt lại mật khẩu thành công.',
        }),
      });
    });

    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Quên mật khẩu?' })).toBeVisible();
    await page.getByRole('link', { name: 'Quên mật khẩu?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { name: 'Quên mật khẩu' })).toBeVisible();

    await page.locator('#forgot-password-email').fill('khong-hop-le');
    await page.getByRole('button', { name: 'Gửi mã OTP' }).click();
    await expect(page.getByText('Email không hợp lệ.')).toBeVisible();
    expect(forgotRequests).toBe(0);

    await page.locator('#forgot-password-email').fill('THANH@example.com');
    await page.getByRole('button', { name: 'Gửi mã OTP' }).click();
    await expect(page.locator('#forgot-password-otp')).toBeVisible();
    await expect(page.locator('#forgot-password-email')).toBeDisabled();
    await expect(page.getByRole('button', { name: /Gửi lại mã sau 60s/ })).toBeDisabled();
    expect(forgotRequests).toBe(1);

    await page.locator('#forgot-password-otp').fill('12ab');
    await page.locator('#forgot-password-new-password').fill('chimatkhau');
    await page.locator('#forgot-password-confirm-password').fill('khongkhop');
    await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    await expect(page.getByText('Mã OTP phải gồm đúng 6 chữ số.')).toBeVisible();
    await expect(page.getByText('Mật khẩu phải dài từ 8 đến 72 byte và có ít nhất một chữ cái, một chữ số.')).toBeVisible();
    await expect(page.getByText('Xác nhận mật khẩu không khớp.')).toBeVisible();
    expect(resetRequests).toBe(0);

    await page.locator('#forgot-password-otp').fill('123456');
    await page.locator('#forgot-password-new-password').fill('Matkhau456');
    await page.locator('#forgot-password-confirm-password').fill('Matkhau456');
    await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.')).toBeVisible();
    expect(resetRequests).toBe(1);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
}
