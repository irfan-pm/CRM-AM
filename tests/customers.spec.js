const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

async function selectDropdownOption(page, input, optionText) {
  await input.click();
  await input.fill(optionText);
  await page.getByText(optionText, { exact: true }).first().click();
}

// Phone numbers appear to need to be unique per customer - a hardcoded number
// reused across runs eventually collides with one already saved and silently
// blocks the form from submitting. Derive a fresh number each time, keeping
// the "300" prefix fixed - other digit patterns can make the masked phone
// input misdetect the country (seen switching to +31 instead of +92).
let phoneCounter = 0;
function uniquePhone() {
  phoneCounter += 1;
  return '300' + String(Date.now() + phoneCounter).slice(-7);
}

test.describe('Hisab Kitab 360 - Customers', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Customer' })).toBeVisible();
  });

  test.describe('Positive', () => {
    test('adds a new customer with only the required fields', async ({ page }) => {
      const name = `QA_Customer_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD CUSTOMER' }).click();
      await page.locator('input[name="name"]').fill(name);
      await page.locator('input[name="phoneNumber"]').fill(uniquePhone());
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByRole('heading', { name: 'Add Customer' })).not.toBeVisible({ timeout: 20_000 });
      await page.getByPlaceholder('Search customer...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('adds a new customer with full details filled in', async ({ page }) => {
      const name = `QA_Customer_Full_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD CUSTOMER' }).click();
      await page.locator('input[name="name"]').fill(name);
      await page.locator('input[name="phoneNumber"]').fill(uniquePhone());
      await page.locator('input[name="email"]').fill(`${name}@example.com`);
      await page.locator('input[name="ntn_cnic"]').fill(String(Date.now()).slice(-13).padStart(13, '1'));
      await page.locator('input[name="address"]').fill('123 Test Street');
      await page.locator('input[name="opening_balance"]').fill('500');
      await page.locator('textarea[name="notes"]').fill('Created by automated test');
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByRole('heading', { name: 'Add Customer' })).not.toBeVisible({ timeout: 20_000 });
      await page.getByPlaceholder('Search customer...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('edits an existing customer name', async ({ page }) => {
      const original = `QA_Customer_Edit_${Date.now()}`;
      const updated = `${original}_Updated`;

      await page.getByRole('button', { name: 'ADD CUSTOMER' }).click();
      await page.locator('input[name="name"]').fill(original);
      await page.locator('input[name="phoneNumber"]').fill(uniquePhone());
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Customer' })).not.toBeVisible({ timeout: 20_000 });

      await page.getByPlaceholder('Search customer...').fill(original);
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: original }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();

      await page.locator('input[name="name"]').fill(updated);
      await page.getByRole('button', { name: 'Update' }).click();

      await expect(page.getByRole('heading', { name: 'Edit Customer' })).not.toBeVisible({ timeout: 20_000 });
      await page.getByPlaceholder('Search customer...').fill(updated);
      await expect(page.getByText(updated, { exact: true })).toBeVisible();
    });

    test('deletes a customer', async ({ page }) => {
      const name = `QA_Customer_Delete_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD CUSTOMER' }).click();
      await page.locator('input[name="name"]').fill(name);
      await page.locator('input[name="phoneNumber"]').fill(uniquePhone());
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Customer' })).not.toBeVisible({ timeout: 20_000 });

      await page.getByPlaceholder('Search customer...').fill(name);
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: name }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      // Confirmation dialog reads "Are you sure you want to delete this customer?"
      // with Cancel/Delete buttons (verified live).
      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this customer?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();

      await page.getByPlaceholder('Search customer...').fill(name);
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });

    test('keeps a customer when its delete confirmation is cancelled', async ({ page }) => {
      const name = `QA_Customer_CancelDelete_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD CUSTOMER' }).click();
      await page.locator('input[name="name"]').fill(name);
      await page.locator('input[name="phoneNumber"]').fill(uniquePhone());
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Customer' })).not.toBeVisible({ timeout: 20_000 });

      await page.getByPlaceholder('Search customer...').fill(name);
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: name }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this customer?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

      await expect(confirmDialog).not.toBeVisible({ timeout: 10_000 });
      await page.getByPlaceholder('Search customer...').fill(name);
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    });

    test('searches for an existing customer by name', async ({ page }) => {
      await page.getByPlaceholder('Search customer...').fill('Co-work');
      await expect(page.getByText('Co-work', { exact: true })).toBeVisible();
    });

    test('shows no results for a search term that does not match any customer', async ({ page }) => {
      await page.getByPlaceholder('Search customer...').fill('ZZZ_NoSuchCustomer_XYZ');
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });

    test('filters customers by Province', async ({ page }) => {
      await selectDropdownOption(page, page.getByRole('combobox', { name: 'Province' }), 'Punjab');
      await expect(page.getByText('Province: Punjab', { exact: false }).first()).toBeVisible();
    });

    // Known bug (to be reported to Trello with a screenshot): the City filter
    // stays disabled even after a Province is chosen, even though the same
    // Province -> City relationship correctly enables City on the Add/Edit
    // Customer form. This test encodes the CORRECT expected behavior (City
    // becomes usable once a Province is selected) and will fail until the list
    // filter's City field is wired up the same way as the form's.
    test('enables the City filter once a Province is chosen [KNOWN BUG]', async ({ page }) => {
      await selectDropdownOption(page, page.getByRole('combobox', { name: 'Province' }), 'Punjab');
      await expect(page.getByRole('combobox', { name: 'City' })).toBeEnabled({ timeout: 10_000 });

      await selectDropdownOption(page, page.getByRole('combobox', { name: 'City' }), 'Sahiwal');
      await expect(page.getByText('City: Sahiwal', { exact: false }).first()).toBeVisible();
    });

    test('cancel button closes the Add Customer dialog without saving', async ({ page }) => {
      const name = `QA_Customer_Cancelled_${Date.now()}`;
      await page.getByRole('button', { name: 'ADD CUSTOMER' }).click();
      await page.locator('input[name="name"]').fill(name);
      await page.getByRole('button', { name: 'Cancel' }).click();

      await expect(page.getByRole('heading', { name: 'Add Customer' })).not.toBeVisible();
      await page.getByPlaceholder('Search customer...').fill(name);
      await expect(page.getByText('No Data Exist')).toBeVisible();
    });

    test('prints the customer list without errors', async ({ page }) => {
      // The button calls window.print(), which opens the OS-native print dialog -
      // something Playwright cannot see or close. Stub it out so the click is
      // still exercised without hanging the test on a real dialog.
      await page.evaluate(() => { window.print = () => {}; });

      // Each toolbar button is wrapped in its own <span>, so the print button
      // is the button inside the span immediately preceding "ADD CUSTOMER"'s
      // own wrapping span - not a direct preceding-sibling of the button itself.
      const printButton = page.getByRole('button', { name: 'ADD CUSTOMER' })
        .locator('xpath=ancestor::span[1]/preceding-sibling::span[1]//button');
      await printButton.click();
      await expect(page.getByText(/error/i)).not.toBeVisible();
    });

    test('opens the Add New Sale form directly from the customers list shortcut', async ({ page }) => {
      await page.getByPlaceholder('Search customer...').fill('Co-work');
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: 'Co-work' }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Add New Sale', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Add New Sale', { exact: true }).click();

      await expect(page.getByRole('heading', { name: 'Add Sale' })).toBeVisible({ timeout: 10_000 });
      // The customer should already be pre-selected since we came from their row.
      await expect(page.getByRole('combobox', { name: 'Customer' })).toHaveValue('Co-work');
    });
  });

  test.describe('Negative', () => {
    test('blocks submission with an empty name', async ({ page }) => {
      // Phone Number is left empty here too - it uses a masked/formatted input
      // that does not reliably accept a plain .fill(), and Name is native-
      // required so the browser blocks the form on it regardless.
      await page.getByRole('button', { name: 'ADD CUSTOMER' }).click();
      await page.getByRole('button', { name: 'Submit' }).click();

      const validationMessage = await page.locator('input[name="name"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page.getByRole('heading', { name: 'Add Customer' })).toBeVisible();
    });

    test('blocks submission with an empty phone number', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD CUSTOMER' }).click();
      await page.locator('input[name="name"]').fill('QA_Customer_NoPhone');
      await page.getByRole('button', { name: 'Submit' }).click();

      // Phone Number is marked required in the UI but is not a native
      // "required" input, so we assert on the dialog staying open rather than
      // a validationMessage.
      await expect(page.getByRole('heading', { name: 'Add Customer' })).toBeVisible();
    });
  });
});
