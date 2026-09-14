const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

async function selectAutocompleteOption(page, input, optionText) {
  await input.click();
  await input.fill(optionText);
  await page.getByText(optionText, { exact: true }).first().click();
}

// Brand / Category / Sub Category / Measurement Group are MUI Autocomplete fields.
// Once a value is picked, MUI renders its built-in clear ("x") button with the
// default accessible name "Clear" inside the same field wrapper as the input.
async function clearAutocompleteField(input) {
  const fieldWrapper = input.locator('xpath=ancestor::*[contains(@class, "MuiFormControl-root")][1]');
  await fieldWrapper.getByRole('button', { name: 'Clear' }).click();
}

test.describe('Hisab Kitab 360 - Products', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/products');
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
  });

  test.describe('Positive', () => {
    test('adds a new product with only the required fields', async ({ page }) => {
      const name = `QA_Product_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await page.locator('input[name="product_name"]').fill(name);
      await page.locator('input[name="incl_tax"]').fill('150');
      await page.getByRole('button', { name: 'SUBMIT' }).click();

      await expect(page.getByText('Product added successfully')).toBeVisible({ timeout: 10_000 });
      await expect(page).toHaveURL(/\/products$/, { timeout: 10_000 });
      await page.getByPlaceholder('Search product, code, barcode...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('adds a new product with brand, category, sub-category, measurement unit, pricing and description', async ({ page }) => {
      const name = `QA_Product_Full_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await page.locator('input[name="product_name"]').fill(name);

      await selectAutocompleteOption(page, page.getByPlaceholder('search here for more...'), 'Samsung');
      await selectAutocompleteOption(page, page.getByPlaceholder('Select Category'), 'Parent');
      await selectAutocompleteOption(page, page.getByPlaceholder('Select sub category'), 'Child');
      await selectAutocompleteOption(page, page.getByRole('combobox', { name: 'Measurement Group' }), 'Unit');

      await page.locator('input[name="incl_tax"]').fill('250');
      await page.locator('input[name="purchasing_price"]').fill('100');
      await page.locator('input[name="initial_stock"]').fill('20');
      await page.locator('textarea[name="description"]').fill('Created by automated test');
      await page.getByRole('button', { name: 'SUBMIT' }).click();

      await expect(page.getByText('Product added successfully')).toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search product, code, barcode...').fill(name);
      const row = page.locator('tbody tr', { hasText: name }).first();
      await expect(row).toBeVisible();
      await expect(row.getByText('Samsung', { exact: true })).toBeVisible();
      await expect(row.getByText('Child', { exact: true })).toBeVisible();
      await expect(row.getByText('Unit', { exact: true })).toBeVisible();
    });

    test('edits an existing product name, brand and category', async ({ page }) => {
      const original = `QA_Product_Edit_${Date.now()}`;
      const updated = `${original}_Updated`;

      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await page.locator('input[name="product_name"]').fill(original);
      await page.locator('input[name="incl_tax"]').fill('80');
      await page.getByRole('button', { name: 'SUBMIT' }).click();
      await expect(page.getByText('Product added successfully')).toBeVisible({ timeout: 10_000 });

      await page.getByPlaceholder('Search product, code, barcode...').fill(original);
      const row = page.locator('tbody tr', { hasText: original }).first();
      await row.locator('.table-menu-more-option').click();
      await page.getByText('Edit', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Update Product' })).toBeVisible({ timeout: 10_000 });

      await page.locator('input[name="product_name"]').fill(updated);
      await selectAutocompleteOption(page, page.getByPlaceholder('search here for more...'), 'Samsung');
      await selectAutocompleteOption(page, page.getByPlaceholder('Select Category'), 'Parent');
      await page.getByRole('button', { name: 'Update' }).click();

      await expect(page.getByText('updated successfully', { exact: false })).toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search product, code, barcode...').fill(updated);
      const updatedRow = page.locator('tbody tr', { hasText: updated }).first();
      await expect(updatedRow).toBeVisible();
      await expect(updatedRow.getByText('Samsung', { exact: true })).toBeVisible();
      await expect(updatedRow.getByText('Parent', { exact: true })).toBeVisible();
    });

    test('selects brand and category, then clears each one before submitting', async ({ page }) => {
      const name = `QA_Product_Cleared_${Date.now()}`;
      const brandInput = page.getByPlaceholder('search here for more...');
      const categoryInput = page.getByPlaceholder('Select Category');

      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await page.locator('input[name="product_name"]').fill(name);
      await page.locator('input[name="incl_tax"]').fill('120');

      // Select, confirm, then unselect - Measurement Group has no "Clear" control
      // in this UI (unlike Brand/Category), so it is intentionally left out here.
      await selectAutocompleteOption(page, brandInput, 'Samsung');
      await expect(brandInput).toHaveValue('Samsung');
      await selectAutocompleteOption(page, categoryInput, 'Parent');
      await expect(categoryInput).toHaveValue('Parent');

      await clearAutocompleteField(brandInput);
      await expect(brandInput).toHaveValue('');
      await clearAutocompleteField(categoryInput);
      await expect(categoryInput).toHaveValue('');

      await page.getByRole('button', { name: 'SUBMIT' }).click();
      await expect(page.getByText('Product added successfully')).toBeVisible({ timeout: 10_000 });

      await page.getByPlaceholder('Search product, code, barcode...').fill(name);
      const row = page.locator('tbody tr', { hasText: name }).first();
      await expect(row).toBeVisible();
      // With brand/category cleared before the first save (never persisted with a
      // value), the list correctly shows "N/A" for both.
      await expect(row.getByText('N/A').first()).toBeVisible();
    });

    test('searches for an existing product by name', async ({ page }) => {
      await page.getByPlaceholder('Search product, code, barcode...').fill('Meta Brown');
      await expect(page.getByText('Meta Brown', { exact: true })).toBeVisible();
    });

    test('shows no results for a search term that does not match any product', async ({ page }) => {
      await page.getByPlaceholder('Search product, code, barcode...').fill('ZZZ_NoSuchProduct_XYZ');
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });
  });

  test.describe('Negative', () => {
    test('keeps submit disabled when the form is empty', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await expect(page.getByRole('button', { name: 'SUBMIT' })).toBeDisabled();
    });

    test('keeps submit disabled when only the product name is filled', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await page.locator('input[name="product_name"]').fill('QA_Incomplete_Product');
      await expect(page.getByRole('button', { name: 'SUBMIT' })).toBeDisabled();
    });

    test('keeps submit disabled when only the sale price is filled', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await page.locator('input[name="incl_tax"]').fill('100');
      await expect(page.getByRole('button', { name: 'SUBMIT' })).toBeDisabled();
    });

    test('blocks submission of a product name that already exists', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await page.locator('input[name="product_name"]').fill('Meta Brown');
      await page.locator('input[name="incl_tax"]').fill('50');
      await page.getByRole('button', { name: 'SUBMIT' }).click();

      await expect(page.getByText('Product already exist with this name')).toBeVisible({ timeout: 10_000 });
      await expect(page).toHaveURL(/\/products\/add-product$/);
    });

    test('keeps sub-category disabled until a parent category is chosen', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await expect(page.getByPlaceholder('Select sub category')).toBeDisabled();

      await selectAutocompleteOption(page, page.getByPlaceholder('Select Category'), 'Parent');
      await expect(page.getByPlaceholder('Select sub category')).toBeEnabled();
    });

    // Known bug (to be reported to Trello with a screenshot): clearing the parent
    // Category with its "x" button does not reset a sub-category that was already
    // chosen - the stale sub-category value is left selected with no parent category
    // behind it. This test encodes the CORRECT expected behavior and will fail until
    // the app resets Sub Category whenever Category is cleared.
    test('resets the sub-category when the parent category is cleared [KNOWN BUG]', async ({ page }) => {
      const categoryInput = page.getByPlaceholder('Select Category');
      const subCategoryInput = page.getByPlaceholder('Select sub category');

      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await selectAutocompleteOption(page, categoryInput, 'Parent');
      await selectAutocompleteOption(page, subCategoryInput, 'Child');
      await expect(subCategoryInput).toHaveValue('Child');

      await clearAutocompleteField(categoryInput);
      await expect(categoryInput).toHaveValue('');

      await expect(subCategoryInput).toHaveValue('');
    });

    // Known bug (to be reported to Trello with a screenshot): clearing Brand/Category
    // with their "x" button during Edit visually empties the field, but the removal
    // is not actually persisted - clicking Update saves the product with the original
    // brand/category still attached. This test encodes the CORRECT expected behavior
    // and will fail until Update actually clears these relationships.
    test('persists a cleared brand and category after updating a product [KNOWN BUG]', async ({ page }) => {
      const name = `QA_Product_EditClear_${Date.now()}`;

      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await page.locator('input[name="product_name"]').fill(name);
      await page.locator('input[name="incl_tax"]').fill('90');
      await selectAutocompleteOption(page, page.getByPlaceholder('search here for more...'), 'Samsung');
      await selectAutocompleteOption(page, page.getByPlaceholder('Select Category'), 'Parent');
      await page.getByRole('button', { name: 'SUBMIT' }).click();
      await expect(page.getByText('Product added successfully')).toBeVisible({ timeout: 10_000 });

      await page.getByPlaceholder('Search product, code, barcode...').fill(name);
      const row = page.locator('tbody tr', { hasText: name }).first();
      await expect(row.getByText('Samsung', { exact: true })).toBeVisible();
      await expect(row.getByText('Parent', { exact: true })).toBeVisible();

      await row.locator('.table-menu-more-option').click();
      await page.getByText('Edit', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Update Product' })).toBeVisible({ timeout: 10_000 });

      const brandInput = page.getByPlaceholder('search here for more...');
      const categoryInput = page.getByPlaceholder('Select Category');
      await expect(brandInput).toHaveValue('Samsung');
      await expect(categoryInput).toHaveValue('Parent');

      await clearAutocompleteField(brandInput);
      await clearAutocompleteField(categoryInput);
      await expect(brandInput).toHaveValue('');
      await expect(categoryInput).toHaveValue('');

      await page.getByRole('button', { name: 'Update' }).click();
      await expect(page.getByText('updated successfully', { exact: false })).toBeVisible({ timeout: 10_000 });

      await page.getByPlaceholder('Search product, code, barcode...').fill(name);
      const updatedRow = page.locator('tbody tr', { hasText: name }).first();
      await expect(updatedRow.getByText('Samsung', { exact: true })).not.toBeVisible();
      await expect(updatedRow.getByText('Parent', { exact: true })).not.toBeVisible();
      await expect(updatedRow.getByText('N/A').first()).toBeVisible();
    });
  });
});
