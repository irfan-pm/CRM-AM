const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

test.describe('Hisab Kitab 360 - Measurement Units', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/measurements_units');
    await expect(page.getByRole('heading', { name: 'Units' })).toBeVisible();
  });

  test.describe('Positive', () => {
    test('adds a new unit with a unique group and unit name', async ({ page }) => {
      const group = `QA_Group_${Date.now()}`;
      const unitName = 'Litre';

      await page.getByRole('button', { name: 'ADD UNIT' }).click();
      await page.locator('input[name="group"]').fill(group);
      await page.getByPlaceholder('e.g. Kilogram').fill(unitName);
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByText('Measurement unit added successfully')).toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search units...').fill(group);
      await expect(page.getByText(group, { exact: true })).toBeVisible();
    });

    test('edits an existing unit name', async ({ page }) => {
      const group = `QA_Group_Edit_${Date.now()}`;
      const unitName = 'Box';
      const updatedUnitName = 'Carton';

      await page.getByRole('button', { name: 'ADD UNIT' }).click();
      await page.locator('input[name="group"]').fill(group);
      await page.getByPlaceholder('e.g. Kilogram').fill(unitName);
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByText('Measurement unit added successfully')).toBeVisible({ timeout: 10_000 });

      await page.getByPlaceholder('Search units...').fill(group);
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: group }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();

      await page.getByPlaceholder('e.g. Kilogram').fill(updatedUnitName);
      await page.getByRole('button', { name: 'Update' }).click();

      await expect(page.getByText('updated successfully', { exact: false })).toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search units...').fill(group);
      await expect(page.getByText(updatedUnitName, { exact: true })).toBeVisible();
    });

    test('searches for an existing unit by group name', async ({ page }) => {
      await page.getByPlaceholder('Search units...').fill('Unit');
      await expect(page.getByText('Unit', { exact: true }).first()).toBeVisible();
    });

    test('shows no results for a search term that does not match any unit', async ({ page }) => {
      await page.getByPlaceholder('Search units...').fill('ZZZ_NoSuchUnit_XYZ');
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });

    test('cancel button closes the Add Unit dialog without saving', async ({ page }) => {
      const group = `QA_Group_Cancelled_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD UNIT' }).click();
      await page.locator('input[name="group"]').fill(group);
      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(page.getByRole('heading', { name: 'Add Unit' })).not.toBeVisible();
      await page.getByPlaceholder('Search units...').fill(group);
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });
  });

  test.describe('Negative', () => {
    test('blocks submission with an empty group name', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD UNIT' }).click();
      await page.getByPlaceholder('e.g. Kilogram').fill('Dozen');
      await page.getByRole('button', { name: 'Submit' }).click();

      const validationMessage = await page.locator('input[name="group"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page.getByRole('heading', { name: 'Add Unit' })).toBeVisible();
    });

    test('blocks submission with an empty unit name', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD UNIT' }).click();
      await page.locator('input[name="group"]').fill('QA_Group_NoUnitName');
      await page.getByRole('button', { name: 'Submit' }).click();

      const validationMessage = await page.getByPlaceholder('e.g. Kilogram').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page.getByRole('heading', { name: 'Add Unit' })).toBeVisible();
    });

    // Known bug (reported to Trello with a screenshot): unlike Brands/Categories/Products,
    // Measurement Units does not reject a duplicate unit name within the same group.
    // This test encodes the CORRECT expected behavior and will fail until the backend
    // adds the same duplicate check used for the other three modules.
    test('blocks a duplicate unit name within the same group [KNOWN BUG]', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD UNIT' }).click();
      await page.locator('input[name="group"]').fill('Unit');
      await page.getByPlaceholder('e.g. Kilogram').fill('KG');
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 10_000 });
    });
  });
});
