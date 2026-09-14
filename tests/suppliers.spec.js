const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

async function selectDropdownOption(page, input, optionText) {
  await input.click();
  await input.fill(optionText);
  await page.getByText(optionText, { exact: true }).first().click();
}

// Phone numbers need to be unique per supplier - a hardcoded number reused
// across runs eventually collides with one already saved and silently blocks
// the form from submitting. The "300" prefix is kept fixed since other digit
// patterns can make the masked phone input misdetect the country.
let phoneCounter = 0;
function uniquePhone() {
  phoneCounter += 1;
  return '300' + String(Date.now() + phoneCounter).slice(-7);
}

test.describe('Hisab Kitab 360 - Suppliers', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/suppliers');
    await expect(page.getByRole('heading', { name: 'Suppliers' })).toBeVisible();
  });

  test.describe('Positive', () => {
    test('adds a new supplier with only the required fields', async ({ page }) => {
      const name = `QA_Supplier_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD SUPPLIER' }).click();
      await page.locator('input[name="supplier_name"]').fill(name);
      await page.locator('input[name="phoneNumber"]').fill(uniquePhone());
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByRole('heading', { name: 'Add Supplier' })).not.toBeVisible({ timeout: 20_000 });
      await page.getByPlaceholder('Search supplier...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('adds a new supplier with full details filled in', async ({ page }) => {
      const name = `QA_Supplier_Full_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD SUPPLIER' }).click();
      await page.locator('input[name="supplier_name"]').fill(name);
      await page.locator('input[name="phoneNumber"]').fill(uniquePhone());
      await page.locator('input[name="supplier_email"]').fill(`${name}@example.com`);
      await page.locator('input[name="supplier_ntn_cnic"]').fill(String(Date.now()).slice(-13).padStart(13, '2'));
      await page.locator('input[name="address"]').fill('456 Supplier Street');
      await page.locator('input[name="opening_balance"]').fill('300');
      await page.locator('textarea[name="note"]').fill('Created by automated test');
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByRole('heading', { name: 'Add Supplier' })).not.toBeVisible({ timeout: 20_000 });
      await page.getByPlaceholder('Search supplier...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('edits an existing supplier name', async ({ page }) => {
      const original = `QA_Supplier_Edit_${Date.now()}`;
      const updated = `${original}_Updated`;

      await page.getByRole('button', { name: 'ADD SUPPLIER' }).click();
      await page.locator('input[name="supplier_name"]').fill(original);
      await page.locator('input[name="phoneNumber"]').fill(uniquePhone());
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Supplier' })).not.toBeVisible({ timeout: 20_000 });

      await page.getByPlaceholder('Search supplier...').fill(original);
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: original }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();

      await page.locator('input[name="supplier_name"]').fill(updated);
      await page.getByRole('button', { name: 'Update' }).click();

      await expect(page.getByRole('heading', { name: 'Edit Supplier' })).not.toBeVisible({ timeout: 20_000 });
      await page.getByPlaceholder('Search supplier...').fill(updated);
      await expect(page.getByText(updated, { exact: true })).toBeVisible();
    });

    test('deletes a supplier', async ({ page }) => {
      const name = `QA_Supplier_Delete_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD SUPPLIER' }).click();
      await page.locator('input[name="supplier_name"]').fill(name);
      await page.locator('input[name="phoneNumber"]').fill(uniquePhone());
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Supplier' })).not.toBeVisible({ timeout: 20_000 });

      await page.getByPlaceholder('Search supplier...').fill(name);
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: name }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      // Confirmation dialog reads "Are you sure you want to delete this Supplier?"
      // with Cancel/Delete buttons (verified live - note the capital "S", unlike
      // the lowercase "customer"/"sale"/"shipment"/"payment" dialogs elsewhere).
      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this Supplier?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();

      await page.getByPlaceholder('Search supplier...').fill(name);
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });

    test('keeps a supplier when its delete confirmation is cancelled', async ({ page }) => {
      const name = `QA_Supplier_CancelDelete_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD SUPPLIER' }).click();
      await page.locator('input[name="supplier_name"]').fill(name);
      await page.locator('input[name="phoneNumber"]').fill(uniquePhone());
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Supplier' })).not.toBeVisible({ timeout: 20_000 });

      await page.getByPlaceholder('Search supplier...').fill(name);
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: name }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this Supplier?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

      await expect(confirmDialog).not.toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search supplier...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('searches for an existing supplier by name', async ({ page }) => {
      await page.getByPlaceholder('Search supplier...').fill('Allah Ditta');
      await expect(page.getByText('Allah Ditta', { exact: true })).toBeVisible();
    });

    test('shows no results for a search term that does not match any supplier', async ({ page }) => {
      await page.getByPlaceholder('Search supplier...').fill('ZZZ_NoSuchSupplier_XYZ');
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });

    test('filters suppliers by Province', async ({ page }) => {
      await selectDropdownOption(page, page.getByRole('combobox', { name: 'Province' }), 'Punjab');
      await expect(page.getByText('Province: Punjab', { exact: false }).first()).toBeVisible();
    });

    test('cancel button closes the Add Supplier dialog without saving', async ({ page }) => {
      const name = `QA_Supplier_Cancelled_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD SUPPLIER' }).click();
      await page.locator('input[name="supplier_name"]').fill(name);
      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(page.getByRole('heading', { name: 'Add Supplier' })).not.toBeVisible();
      await page.getByPlaceholder('Search supplier...').fill(name);
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });

    test('prints the supplier list without errors', async ({ page }) => {
      // The button calls window.print(), which opens the OS-native print dialog -
      // something Playwright cannot see or close. Stub it out so the click is
      // still exercised without hanging the test on a real dialog.
      await page.evaluate(() => { window.print = () => {}; });

      // Each toolbar button is wrapped in its own <span>, so the print button
      // is the button inside the span immediately preceding "ADD SUPPLIER"'s
      // own wrapping span - not a direct preceding-sibling of the button itself.
      const printButton = page.getByRole('button', { name: 'ADD SUPPLIER' })
        .locator('xpath=ancestor::span[1]/preceding-sibling::span[1]//button');
      await printButton.click();
      await expect(page.getByText(/error/i)).not.toBeVisible();
    });

    test('opens the Add Shipment form directly from the suppliers list shortcut', async ({ page }) => {
      await page.getByPlaceholder('Search supplier...').fill('Allah Ditta');
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: 'Allah Ditta' }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Add Shipment', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Add Shipment', { exact: true }).click();

      await expect(page.getByRole('heading', { name: 'Add Shipment' })).toBeVisible({ timeout: 10_000 });
      // The supplier should already be pre-selected since we came from their row.
      await expect(page.getByRole('combobox', { name: 'Supplier' })).toHaveValue('Allah Ditta');
    });
  });

  test.describe('Negative', () => {
    test('blocks submission with an empty name', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SUPPLIER' }).click();
      await page.getByRole('button', { name: 'Submit' }).click();

      const validationMessage = await page.locator('input[name="supplier_name"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page.getByRole('heading', { name: 'Add Supplier' })).toBeVisible();
    });

    test('blocks submission with an empty phone number', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SUPPLIER' }).click();
      await page.locator('input[name="supplier_name"]').fill('QA_Supplier_NoPhone');
      await page.getByRole('button', { name: 'Submit' }).click();

      // Unlike Customer's Phone Number, Supplier's phone input is natively
      // required, so a validationMessage check applies here.
      const validationMessage = await page.locator('input[name="phoneNumber"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page.getByRole('heading', { name: 'Add Supplier' })).toBeVisible();
    });

    // Known bug candidate (mirrors the same issue found on Customers): the
    // City filter stays disabled even after a Province is chosen. This test
    // encodes the CORRECT expected behavior and will fail until fixed.
    test('enables the City filter once a Province is chosen [KNOWN BUG]', async ({ page }) => {
      await selectDropdownOption(page, page.getByRole('combobox', { name: 'Province' }), 'Punjab');
      await expect(page.getByRole('combobox', { name: 'City' })).toBeEnabled({ timeout: 10_000 });
    });
  });
});
