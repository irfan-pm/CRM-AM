const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

test.describe('Hisab Kitab 360 - Products Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('expands the Products menu and lists all sub-items', async ({ page }) => {
    const productsMenuItem = page.locator('.menus-list', { hasText: 'Products' }).first();
    await productsMenuItem.hover();
    await productsMenuItem.click();

    await expect(page.getByRole('link', { name: 'Products', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Categories' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Measurement Units' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Brands' })).toBeVisible();
  });

  test('navigates to Products page', async ({ page }) => {
    await page.goto('/products');
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ADD PRODUCT' })).toBeVisible();
  });

  test('navigates to Categories page', async ({ page }) => {
    await page.goto('/products-category');
    await expect(page).toHaveURL(/\/products-category$/);
    await expect(page.getByRole('heading', { name: 'Products Categories' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ADD PRODUCT CATEGORY' })).toBeVisible();
  });

  test('navigates to Measurement Units page', async ({ page }) => {
    await page.goto('/measurements_units');
    await expect(page).toHaveURL(/\/measurements_units$/);
    await expect(page.getByRole('heading', { name: 'Units' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ADD UNIT' })).toBeVisible();
  });

  test('navigates to Brands page', async ({ page }) => {
    await page.goto('/brand');
    await expect(page).toHaveURL(/\/brand$/);
    await expect(page.getByRole('heading', { name: 'Brand' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ADD BRAND' })).toBeVisible();
  });

});

test.describe('Hisab Kitab 360 - Products Sidebar Navigation (unauthenticated)', () => {
  test('redirects to login when visiting a Products page while unauthenticated', async ({ page }) => {
    await page.goto('/products');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
