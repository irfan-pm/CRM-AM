const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

const KNOWN_CUSTOMER = 'Co-work';

async function openKnownCustomerDetails(page) {
  await page.goto('/customers');
  await page.getByPlaceholder('Search customer...').fill(KNOWN_CUSTOMER);
  await page.waitForTimeout(500);
  const row = page.locator('tbody tr', { hasText: KNOWN_CUSTOMER }).first();
  await row.locator('.table-menu-more-option').click();
  await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText('Details', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Customer Details' })).toBeVisible({ timeout: 10_000 });
}

// A successful Add/Edit Payment submit automatically opens a "Receipt Preview"
// dialog on top of the page. It has to be closed before the underlying list
// can be interacted with again.
async function closeReceiptPreview(page) {
  // Whether the Receipt Preview dialog appears seems inconsistent between
  // submissions, and it ignores Escape (disableEscapeKeyDown). Scope to the
  // dialog that actually contains this heading and click its first button -
  // in every screenshot seen so far that is the "x" close button, before the
  // Select Paper Size dropdown and print/download/WhatsApp icons.
  const heading = page.getByRole('heading', { name: 'Receipt Preview' });
  if (await heading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // The X close icon is a plain clickable element (not a <button>) sitting
    // right next to the heading - the dialog's actual <button> elements are
    // the Print/Download/WhatsApp icons further down, and clicking Print by
    // mistake opens a real OS print dialog that hangs the whole test.
    await heading.locator('xpath=following-sibling::*[1]').click();
    await expect(heading).not.toBeVisible({ timeout: 10_000 });
  }
  // Whether or not a receipt showed, saving reloads the customer details page -
  // wait for that to finish before touching the list again.
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page.getByRole('button', { name: 'ADD PAYMENT' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Hisab Kitab 360 - Customer Payments', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openKnownCustomerDetails(page);
    await page.getByRole('tab', { name: 'Payments' }).click();
  });

  test.describe('Positive', () => {
    test('adds a payment from the customer details page', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PAYMENT' }).click();
      await expect(page.getByRole('heading', { name: 'Add Payment' })).toBeVisible({ timeout: 10_000 });

      await page.locator('input[name="current_deposit"]').fill('250');
      await page.locator('textarea[name="note"]').fill('QA automated payment');
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByRole('heading', { name: 'Add Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);
      await expect(page.getByText('250.00', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    });

    test('adds a payment for a customer directly from the customers list shortcut', async ({ page }) => {
      await page.goto('/customers');
      await page.getByPlaceholder('Search customer...').fill(KNOWN_CUSTOMER);
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: KNOWN_CUSTOMER }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Add Payment', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Add Payment', { exact: true }).click();

      await expect(page.getByRole('heading', { name: 'Add Payment' })).toBeVisible({ timeout: 10_000 });
      // The customer should already be pre-selected since we came from their row.
      await expect(page.getByRole('combobox', { name: 'Select Customer For Payment' })).toHaveValue(KNOWN_CUSTOMER);

      await page.locator('input[name="current_deposit"]').fill('75');
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);
    });

    test('edits an existing payment amount', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PAYMENT' }).click();
      await page.locator('input[name="current_deposit"]').fill('321');
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);

      const row = page.locator('tbody tr', { hasText: '321.00' }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Edit Payment' })).toBeVisible({ timeout: 10_000 });

      await page.locator('input[name="current_deposit"]').fill('654');
      await page.getByRole('button', { name: 'Update' }).click();

      await expect(page.getByRole('heading', { name: 'Edit Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);
      await expect(page.getByText('654.00', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    });

    test('deletes a payment', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PAYMENT' }).click();
      await page.locator('input[name="current_deposit"]').fill('999');
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);

      const row = page.locator('tbody tr', { hasText: '999.00' }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      // Confirmation dialog reads "Are you sure you want to delete this payment?"
      // with Cancel/Delete buttons (verified live).
      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this payment?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();

      await expect(page.locator('tbody tr', { hasText: '999.00' })).toHaveCount(0);
    });
  });

  test.describe('Negative', () => {
    test('blocks submission with an empty amount', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PAYMENT' }).click();
      await page.getByRole('button', { name: 'Submit' }).click();

      const validationMessage = await page.locator('input[name="current_deposit"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
      await expect(page.getByRole('heading', { name: 'Add Payment' })).toBeVisible();
    });

    test('keeps a payment when its delete confirmation is cancelled', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PAYMENT' }).click();
      await page.locator('input[name="current_deposit"]').fill('777');
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);

      const row = page.locator('tbody tr', { hasText: '777.00' }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this payment?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

      await expect(confirmDialog).not.toBeVisible({ timeout: 10_000 });
      await expect(page.locator('tbody tr', { hasText: '777.00' })).toHaveCount(1);
    });
  });
});
