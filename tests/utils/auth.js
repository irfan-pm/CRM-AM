const { expect } = require('@playwright/test');

const VALID_EMAIL = 'cms@gmail.com';
const VALID_PASSWORD = '11111111';

async function login(page) {
  await page.goto('/login');
  await expect(page.getByPlaceholder('Enter Email')).toBeVisible();
  await page.locator('input[name="email"]').fill(VALID_EMAIL);
  await page.locator('input[name="password"]').fill(VALID_PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}

module.exports = { login, VALID_EMAIL, VALID_PASSWORD };
