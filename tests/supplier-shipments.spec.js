const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

const KNOWN_SUPPLIER = 'Allah Ditta';
const KNOWN_PRODUCT = 'Johathan Bauch';

async function selectAutocompleteOption(page, input, optionText) {
  await input.click();
  await input.fill(optionText);
  await page.getByText(optionText, { exact: true }).first().click();
}

// Unlike Sales (which needs an existing stock batch), Add Shipment adds new
// stock and does not require selecting a batch first - the product can be
// used immediately after being chosen.
async function addProductToShipment(page, { product = KNOWN_PRODUCT, qty = 1, rate = 100, discountPercent, discountAmount, taxPercent } = {}) {
  const productInput = page.getByRole('combobox', { name: 'Product Name' });
  await productInput.click();
  await productInput.fill(product);
  await page.getByText(product, { exact: true }).first().click();

  await page.locator('input[name="quantity"]').fill(String(qty));
  await page.locator('input[name="selling_price_excluding_tax"]').fill(String(rate));
  if (discountPercent != null) await page.locator('input[name="discount_percentage"]').fill(String(discountPercent));
  if (discountAmount != null) await page.locator('input[name="discount_amount"]').fill(String(discountAmount));
  if (taxPercent != null) await page.locator('input[name="tax_percentage"]').fill(String(taxPercent));

  await page.getByRole('button', { name: 'ADD ITEM' }).click();
  await expect(page.getByText('No Item found')).not.toBeVisible();
}

function amountInputNear(page, labelText) {
  return page.locator(`text=${labelText}`).locator('xpath=following::input[1]');
}

async function closeReceiptPreviewIfOpen(page) {
  const heading = page.getByRole('heading', { name: 'Receipt Preview' });
  if (await heading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // The X close icon is a plain clickable element (not a <button>) sitting
    // right next to the heading - the dialog's actual <button> elements are
    // the Print/Download/WhatsApp icons further down, and clicking Print by
    // mistake opens a real OS print dialog that hangs the whole test.
    await heading.locator('xpath=following-sibling::*[1]').click();
    await expect(heading).not.toBeVisible({ timeout: 10_000 });
  }
}

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

test.describe('Hisab Kitab 360 - Supplier Shipments', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openKnownSupplierDetails(page);
  });

  test.describe('Positive', () => {
    test('adds a new shipment with one product', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await expect(page.getByRole('heading', { name: 'Add Shipment' })).toBeVisible({ timeout: 10_000 });

      const title = `QA_Shipment_${Date.now()}`;
      await page.locator('input[name="shipment_title"]').fill(title);
      await addProductToShipment(page, { qty: 2, rate: 100 });

      await page.getByRole('button', { name: 'SUBMIT' }).click();
      await closeReceiptPreviewIfOpen(page);
      await expect(page).toHaveURL(/\/suppliers/, { timeout: 15_000 });

      await openKnownSupplierDetails(page);
      await page.getByRole('tab', { name: 'Shipment' }).click();
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    });

    test('adds a shipment with a percentage discount on the product line', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await page.locator('input[name="shipment_title"]').fill(`QA_Shipment_Disc_${Date.now()}`);
      await addProductToShipment(page, { qty: 2, rate: 100, discountPercent: 10 });

      // The app does not print the discount % itself on the line - only the
      // resulting Dis Amount column reflects it (200 * 10% = 20.00 here).
      const row = page.locator('table', { hasText: 'Product Name' }).locator('tr.cart__row').first();
      const disAmountCell = row.locator('td').nth(7);
      await expect(disAmountCell).not.toHaveText('₨0.00');
    });

    test('adds a shipment with a fixed (Rs) discount on the product line', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await page.locator('input[name="shipment_title"]').fill(`QA_Shipment_DiscRs_${Date.now()}`);
      await addProductToShipment(page, { qty: 2, rate: 100, discountAmount: 25 });

      const row = page.locator('table', { hasText: 'Product Name' }).locator('tr.cart__row').first();
      await expect(row.getByText('25.00', { exact: false })).toBeVisible();
    });

    test('adds a shipment with extra sales tax (%) on the product line', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await page.locator('input[name="shipment_title"]').fill(`QA_Shipment_Tax_${Date.now()}`);
      await addProductToShipment(page, { qty: 1, rate: 100, taxPercent: 5 });

      const row = page.locator('table', { hasText: 'Product Name' }).locator('tr.cart__row').first();
      await expect(row.getByText('5%')).toBeVisible();
    });

    test('adds a shipment with an invoice-level discount and additional tax', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await page.locator('input[name="shipment_title"]').fill(`QA_Shipment_Invoice_${Date.now()}`);
      await addProductToShipment(page, { qty: 1, rate: 200 });

      await amountInputNear(page, 'Invoice Discount Amount').fill('20');
      await amountInputNear(page, 'Invoice Additional Tax Amount').fill('15');

      // Net Bill Amount should reflect 200 - 20 + 15 = 195. The amount is
      // rendered as a "₨" glyph and the number in separate sibling spans (not
      // literal "Rs " text), so match the heading's own value container.
      const netBillValue = page.getByRole('heading', { name: /Net Bill Amount/ }).locator('xpath=following-sibling::*[1]');
      await expect(netBillValue).toHaveText(/195\.00/);
    });

    test('adds a shipment with multiple products', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await page.locator('input[name="shipment_title"]').fill(`QA_Shipment_Multi_${Date.now()}`);
      await addProductToShipment(page, { product: KNOWN_PRODUCT, qty: 1, rate: 50 });
      await addProductToShipment(page, { product: 'Meta Brown', qty: 1, rate: 50 });

      const table = page.locator('table', { hasText: 'Product Name' });
      await expect(table.locator('tr.cart__row')).toHaveCount(2);
    });

    test('removes a product line item before saving', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await page.locator('input[name="shipment_title"]').fill(`QA_Shipment_Remove_${Date.now()}`);
      await addProductToShipment(page, { qty: 1, rate: 100 });

      await page.getByTitle('Remove Product').click();
      await expect(page.getByText('No Item found')).toBeVisible();
    });

    // Light-touch check only - clicking "Edit Product" is confirmed to bring
    // the line item's values back into the entry form (Qty shown here), but
    // the full re-save flow for an edited line has not been explored further.
    test('loads a product line item back into the form for editing', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await page.locator('input[name="shipment_title"]').fill(`QA_Shipment_EditLine_${Date.now()}`);
      await addProductToShipment(page, { qty: 4, rate: 100 });

      await page.getByTitle('Edit Product').click();
      await expect(page.locator('input[name="quantity"]')).toHaveValue('4');
    });

    test('edits an existing shipment title', async ({ page }) => {
      await page.getByRole('tab', { name: 'Shipment' }).click();
      const row = page.locator('tbody tr').first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Edit Shipment' })).toBeVisible({ timeout: 10_000 });

      // The existing line item(s) are shown read-only here (no per-line Edit/
      // Remove icons like Add Shipment has) - only the shipment's own fields
      // and adding an extra new line are supported from this screen.
      const updatedTitle = `QA_Shipment_Renamed_${Date.now()}`;
      await page.locator('input[name="shipment_title"]').fill(updatedTitle);
      await page.getByRole('button', { name: 'UPDATE' }).click();
      await closeReceiptPreviewIfOpen(page);

      await expect(page).toHaveURL(/\/suppliers/, { timeout: 15_000 });
    });

    test('opens the read-only Details view for a shipment', async ({ page }) => {
      await page.getByRole('tab', { name: 'Shipment' }).click();
      const row = page.locator('tbody tr').first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Details', { exact: true }).click();

      await expect(page.getByRole('heading', { name: 'Shipment Details' })).toBeVisible({ timeout: 10_000 });
    });

    // Smoke test only - the return flow (quantities to return, refund
    // handling, etc.) has not been explored in depth yet.
    test('opens Manage Return Products for a shipment', async ({ page }) => {
      await page.getByRole('tab', { name: 'Shipment' }).click();
      const row = page.locator('tbody tr').first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Manage Return Products', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Manage Return Products', { exact: true }).click();

      await expect(page.getByText(/return/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test('deletes a shipment', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await page.locator('input[name="shipment_title"]').fill(`QA_Shipment_Delete_${Date.now()}`);
      await addProductToShipment(page, { qty: 1, rate: 100 });
      await page.getByRole('button', { name: 'SUBMIT' }).click();
      await closeReceiptPreviewIfOpen(page);
      await expect(page).toHaveURL(/\/suppliers/, { timeout: 15_000 });

      await openKnownSupplierDetails(page);
      await page.getByRole('tab', { name: 'Shipment' }).click();
      const row = page.locator('tbody tr').first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      // Confirmation dialog reads "Are you sure you want to delete this shipment?"
      // with Cancel/Delete buttons (verified live).
      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this shipment?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByText('deleted successfully', { exact: false })).toBeVisible({ timeout: 10_000 });
    });

    test('searches within the shipment list', async ({ page }) => {
      await page.getByRole('tab', { name: 'Shipment' }).click();
      await page.getByPlaceholder('Search...').fill('09-');
      await expect(page.locator('tbody tr').first()).toBeVisible();
    });

    // Smoke test only - the report's own content/filters have not been explored.
    test('opens the purchase report', async ({ page }) => {
      await page.getByRole('button', { name: 'VIEW PURCHASE REPORT' }).click();
      await expect(page.getByText(/purchase report/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test('prints from the supplier details page without errors', async ({ page }) => {
      await page.evaluate(() => { window.print = () => {}; });

      const printButton = page.getByRole('button', { name: 'VIEW PURCHASE REPORT' })
        .locator('xpath=preceding::button[1]');
      await printButton.click();
      await expect(page.getByText(/error/i)).not.toBeVisible();
    });
  });

  test.describe('Negative', () => {
    test('blocks submission with an empty shipment title', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();

      const validationMessage = await page.locator('input[name="shipment_title"]').evaluate((el) => el.validationMessage);
      expect(validationMessage).not.toBe('');
    });

    test('does not add a line item when no product is selected', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await page.locator('input[name="shipment_title"]').fill(`QA_Shipment_NoProduct_${Date.now()}`);

      await expect(page.locator('input[name="quantity"]')).toBeDisabled();
      await expect(page.getByText('No Item found')).toBeVisible();
    });

    test('keeps a shipment when its delete confirmation is cancelled', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      const title = `QA_Shipment_CancelDelete_${Date.now()}`;
      await page.locator('input[name="shipment_title"]').fill(title);
      await addProductToShipment(page, { qty: 1, rate: 100 });
      await page.getByRole('button', { name: 'SUBMIT' }).click();
      await closeReceiptPreviewIfOpen(page);
      await expect(page).toHaveURL(/\/suppliers/, { timeout: 15_000 });

      await openKnownSupplierDetails(page);
      await page.getByRole('tab', { name: 'Shipment' }).click();
      const row = page.locator('tbody tr', { hasText: title }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this shipment?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

      await expect(confirmDialog).not.toBeVisible({ timeout: 10_000 });
      await expect(page.locator('tbody tr', { hasText: title }).first()).toBeVisible();
    });
  });
});
