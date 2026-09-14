const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

test.describe('Hisab Kitab 360 - Product Categories', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/products-category');
    await expect(page.getByRole('heading', { name: 'Products Categories' })).toBeVisible();
  });

  test.describe('Positive', () => {
    test('adds a new category with only the required name', async ({ page }) => {
      const name = `QA_Category_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD PRODUCT CATEGORY' }).click();
      await page.locator('input[name="title"]').fill(name);
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByRole('heading', { name: 'Add Product Category' })).not.toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search categories...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('adds a new category with a description', async ({ page }) => {
      const name = `QA_Category_Desc_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD PRODUCT CATEGORY' }).click();
      await page.locator('input[name="title"]').fill(name);
      await page.locator('textarea[name="description"]').fill('Created by automated test');
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByRole('heading', { name: 'Add Product Category' })).not.toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search categories...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('edits an existing category name', async ({ page }) => {
      const original = `QA_Category_Edit_${Date.now()}`;
      const updated = `${original}_Updated`;

      await page.getByRole('button', { name: 'ADD PRODUCT CATEGORY' }).click();
      await page.locator('input[name="title"]').fill(original);
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Product Category' })).not.toBeVisible({ timeout: 10_000 });

      await page.getByPlaceholder('Search categories...').fill(original);
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: original }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();

      await page.locator('input[name="title"]').fill(updated);
      await page.getByRole('button', { name: 'Update' }).click();

      await expect(page.getByRole('heading', { name: 'Edit' })).not.toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search categories...').fill(updated);
      await expect(page.getByText(updated, { exact: true })).toBeVisible();
    });

    test('searches for an existing category by title', async ({ page }) => {
      await page.getByPlaceholder('Search categories...').fill('Parent');
      await expect(page.getByText('Parent', { exact: true }).first()).toBeVisible();
    });

    test('shows no results for a search term that does not match any category', async ({ page }) => {
      await page.getByPlaceholder('Search categories...').fill('ZZZ_NoSuchCategory_XYZ');
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });

    test('cancel button closes the Add Product Category dialog without saving', async ({ page }) => {
      const name = `QA_Category_Cancelled_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD PRODUCT CATEGORY' }).click();
      await page.locator('input[name="title"]').fill(name);
      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(page.getByRole('heading', { name: 'Add Product Category' })).not.toBeVisible();
      await page.getByPlaceholder('Search categories...').fill(name);
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });
  });

  test.describe('Negative', () => {
    test('blocks submission with an empty category name', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PRODUCT CATEGORY' }).click();
      await page.getByRole('button', { name: 'Submit' }).click();

      const validationMessage = await page.locator('input[name="title"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page.getByRole('heading', { name: 'Add Product Category' })).toBeVisible();
    });

    test('blocks submission of a category title that already exists', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PRODUCT CATEGORY' }).click();
      await page.locator('input[name="title"]').fill('Parent');
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByText('Category already exists with this title')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('heading', { name: 'Add Product Category' })).toBeVisible();
    });
  });
});
