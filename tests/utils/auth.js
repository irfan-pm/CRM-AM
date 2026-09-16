const { expect } = require('@playwright/test');

const VALID_EMAIL = 'cms@gmail.com';
const VALID_PASSWORD = '11111111';

// The dev environment intermittently throws transient network errors
// (ERR_QUIC_PROTOCOL_ERROR, connection resets) purely on the initial
// navigation/login handshake - retrying the whole sequence a few times
// clears it without needing any change to the app or the rest of a test.
async function login(page) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await page.goto('/login', { timeout: 20_000 });
      await expect(page.getByPlaceholder('Enter Email')).toBeVisible({ timeout: 10_000 });
      await page.locator('input[name="email"]').fill(VALID_EMAIL);
      await page.locator('input[name="password"]').fill(VALID_PASSWORD);
      await page.getByRole('button', { name: 'Login' }).click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
      return;
    } catch (e) {
      lastError = e;
      await page.waitForTimeout(1_500);
    }
  }
  throw lastError;
}

module.exports = { login, VALID_EMAIL, VALID_PASSWORD };
