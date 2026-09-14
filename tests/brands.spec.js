const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

test.describe('Hisab Kitab 360 - Brands', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/brand');
    await expect(page.getByRole('heading', { name: 'Brand' })).toBeVisible();
  });

  test.describe('Positive', () => {
    test('adds a new brand with only the required name', async ({ page }) => {
      const name = `QA_Brand_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD BRAND' }).click();
      await page.locator('input[name="title"]').fill(name);
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByText('Brand added successfully')).toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search brands...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('adds a new brand with name and description', async ({ page }) => {
      const name = `QA_Brand_Desc_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD BRAND' }).click();
      await page.locator('input[name="title"]').fill(name);
      await page.locator('textarea[name="description"]').fill('Created by automated test');
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByText('Brand added successfully')).toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search brands...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('edits an existing brand name', async ({ page }) => {
      const original = `QA_Brand_Edit_${Date.now()}`;
      const updated = `${original}_Updated`;

      await page.getByRole('button', { name: 'ADD BRAND' }).click();
      await page.locator('input[name="title"]').fill(original);
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByText('Brand added successfully')).toBeVisible({ timeout: 10_000 });

      await page.getByPlaceholder('Search brands...').fill(original);
      const row = page.locator('tbody tr', { hasText: original }).first();
      await row.locator('.table-menu-more-option').click();
      await page.getByText('Edit', { exact: true }).click();

      const nameInput = page.locator('input[name="title"]');
      await nameInput.fill(updated);
      await page.getByRole('button', { name: 'Update' }).click();

      await expect(page.getByText('updated successfully', { exact: false })).toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search brands...').fill(updated);
      await expect(page.getByText(updated, { exact: true })).toBeVisible();
    });

    test('searches for an existing brand by name', async ({ page }) => {
      await page.getByPlaceholder('Search brands...').fill('Samsung');
      await expect(page.getByText('Samsung', { exact: true })).toBeVisible();
    });

    test('shows no results for a search term that does not match any brand', async ({ page }) => {
      await page.getByPlaceholder('Search brands...').fill('ZZZ_NoSuchBrand_XYZ');
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });

    test('cancel button closes the Add Brand dialog without saving', async ({ page }) => {
      const name = `QA_Brand_Cancelled_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD BRAND' }).click();
      await page.locator('input[name="title"]').fill(name);
      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(page.getByRole('heading', { name: 'Add Brand' })).not.toBeVisible();
      await page.getByPlaceholder('Search brands...').fill(name);
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });
  });

  test.describe('Negative', () => {
    test('blocks submission with an empty brand name', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD BRAND' }).click();
      await page.getByRole('button', { name: 'Submit' }).click();

      const validationMessage = await page.locator('input[name="title"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page.getByRole('heading', { name: 'Add Brand' })).toBeVisible();
    });

    test('blocks submission of a brand name that already exists', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD BRAND' }).click();
      await page.locator('input[name="title"]').fill('Samsung');
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByText('Brand already exists with this name')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('heading', { name: 'Add Brand' })).toBeVisible();
    });
  });
});
