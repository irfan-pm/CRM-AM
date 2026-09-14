const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

const KNOWN_SUPPLIER = 'Allah Ditta';

async function openKnownSupplierDetails(page) {
  await page.goto('/suppliers');
  await page.getByPlaceholder('Search supplier...').fill(KNOWN_SUPPLIER);
  await page.waitForTimeout(500);
  const row = page.locator('tbody tr', { hasText: KNOWN_SUPPLIER }).first();
  await row.locator('.table-menu-more-option').click();
  await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText('Details', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Supplier Details' })).toBeVisible({ timeout: 10_000 });
}

// A successful Add/Edit Payment submit can automatically open a "Receipt
// Preview" dialog on top of the page (confirmed for Customer payments) -
// close it if present before continuing.
async function closeReceiptPreview(page) {
  const heading = page.getByRole('heading', { name: 'Receipt Preview' });
  if (await heading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // The X close icon is a plain clickable element (not a <button>) sitting
    // right next to the heading - the dialog's actual <button> elements are
    // the Print/Download/WhatsApp icons further down, and clicking Print by
    // mistake opens a real OS print dialog that hangs the whole test.
    await heading.locator('xpath=following-sibling::*[1]').click();
    await expect(heading).not.toBeVisible({ timeout: 10_000 });
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page.getByRole('button', { name: 'ADD PAYMENT' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Hisab Kitab 360 - Supplier Payments', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openKnownSupplierDetails(page);
    await page.getByRole('tab', { name: 'Payments' }).click();
  });

  test.describe('Positive', () => {
    test('adds a payment from the supplier details page', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PAYMENT' }).click();
      await expect(page.getByRole('heading', { name: 'Add Payment' })).toBeVisible({ timeout: 10_000 });

      await page.locator('input[name="current_deposit"]').fill('150');
      await page.getByRole('button', { name: 'Submit' }).click();

      await expect(page.getByRole('heading', { name: 'Add Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);
      await expect(page.getByText('150.00', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    });

    test('edits an existing payment amount', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PAYMENT' }).click();
      await page.locator('input[name="current_deposit"]').fill('221');
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);

      const row = page.locator('tbody tr', { hasText: '221.00' }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Edit Payment' })).toBeVisible({ timeout: 10_000 });

      await page.locator('input[name="current_deposit"]').fill('442');
      await page.getByRole('button', { name: 'Update' }).click();

      await expect(page.getByRole('heading', { name: 'Edit Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);
      await expect(page.getByText('442.00', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    });

    test('deletes a payment', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD PAYMENT' }).click();
      await page.locator('input[name="current_deposit"]').fill('887');
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);

      const row = page.locator('tbody tr', { hasText: '887.00' }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      // Confirmation dialog reads "Are you sure you want to delete this payment?"
      // with Cancel/Delete buttons (verified live, same wording as Customer Payments).
      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this payment?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();

      await expect(page.locator('tbody tr', { hasText: '887.00' })).toHaveCount(0);
    });

    test('searches within the payments list', async ({ page }) => {
      await page.getByPlaceholder('Search...').fill('09-');
      await expect(page.locator('tbody tr').first()).toBeVisible();
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
      await page.locator('input[name="current_deposit"]').fill('555');
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(page.getByRole('heading', { name: 'Add Payment' })).not.toBeVisible({ timeout: 10_000 });
      await closeReceiptPreview(page);

      const row = page.locator('tbody tr', { hasText: '555.00' }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this payment?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

      await expect(confirmDialog).not.toBeVisible({ timeout: 10_000 });
      await expect(page.locator('tbody tr', { hasText: '555.00' })).toHaveCount(1);
    });
  });
});
