const { test, expect } = require('@playwright/test');

const VALID_EMAIL = 'cms@gmail.com';
const VALID_PASSWORD = '11111111';

test.describe('Hisab Kitab 360 - Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByPlaceholder('Enter Email')).toBeVisible();
  });

  test.describe('Positive', () => {
    test('logs in successfully with valid credentials', async ({ page }) => {
      await page.locator('input[name="email"]').fill(VALID_EMAIL);
      await page.locator('input[name="password"]').fill(VALID_PASSWORD);

      await page.getByRole('button', { name: 'Login' }).click();

      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });

      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test.describe('Negative', () => {
    test('shows an error with valid email and wrong password', async ({ page }) => {
      await page.locator('input[name="email"]').fill(VALID_EMAIL);
      await page.locator('input[name="password"]').fill('wrongpassword');

      await page.getByRole('button', { name: 'Login' }).click();

      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
      await expect(page.getByText(/error|invalid|incorrect/i)).toBeVisible({ timeout: 10_000 });
    });

    test('shows an error with unregistered email and wrong password', async ({ page }) => {
      await page.locator('input[name="email"]').fill('wrong@example.com');
      await page.locator('input[name="password"]').fill('wrongpassword');

      await page.getByRole('button', { name: 'Login' }).click();

      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });

    test('blocks submission with empty email and empty password', async ({ page }) => {
      await page.getByRole('button', { name: 'Login' }).click();

      const validationMessage = await page.locator('input[name="email"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page).toHaveURL(/\/login/);
    });

    test('blocks submission with empty email and valid password', async ({ page }) => {
      await page.locator('input[name="password"]').fill(VALID_PASSWORD);
      await page.getByRole('button', { name: 'Login' }).click();

      const validationMessage = await page.locator('input[name="email"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page).toHaveURL(/\/login/);
    });

    test('blocks submission with valid email and empty password', async ({ page }) => {
      await page.locator('input[name="email"]').fill(VALID_EMAIL);
      await page.getByRole('button', { name: 'Login' }).click();

      await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
    });

    test('blocks submission with invalid email format', async ({ page }) => {
      await page.locator('input[name="email"]').fill('notanemail');
      await page.locator('input[name="password"]').fill(VALID_PASSWORD);
      await page.getByRole('button', { name: 'Login' }).click();

      const validationMessage = await page.locator('input[name="email"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
