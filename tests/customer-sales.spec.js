const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

// These tests assume the admin-portal Costing Method is set to "Average"
// (confirmed with the user 2026-09-14). Under Average, picking a batch in
// Sale is mandatory - the Select Batch dialog must appear and there is no
// way to add a line item without choosing one. Costing Method lives in a
// separate admin portal, not this business portal, and changes its Sale
// batch-selection behavior (FIFO/LIFO/FEFO auto-pick a batch instead) - if
// these tests start failing, confirm the current Costing Method first
// rather than assuming a regression.
const KNOWN_CUSTOMER = 'Co-work';
// Has an existing batch (created via a Shipment) so it can actually be added
// to a sale - a product with no batch reports "No batches available" and
// cannot be sold at all (see the negative test below).
const KNOWN_PRODUCT = 'Johathan Bauch';

async function selectAutocompleteOption(page, input, optionText) {
  await input.click();
  await input.fill(optionText);
  await page.getByText(optionText, { exact: true }).first().click();
}

// The Rs input for Delivery/Service/Additional Charges and Received Amount
// has no distinct name attribute - it is the input immediately following its
// label text in the DOM.
function amountInputNear(page, labelText) {
  return page.locator(`text=${labelText}`).locator('xpath=following::input[1]');
}

// Selecting a product opens a "Select Batch" dialog (a product with no stock
// batch shows "No batches available" and cannot be sold at all - see the
// negative test below). Picks the first available batch, then fills in the
// line-item fields and adds it.
async function addProductToSale(page, { product = KNOWN_PRODUCT, qty = 1, discountPercent, discountAmount, taxPercent } = {}) {
  const productInput = page.getByRole('combobox', { name: 'Product Name' });
  const batchOption = page.locator('.batch-select-option').first();

  // The dropdown is rendered in a portal, so once the product is already in
  // the cart its "Selected Products" row (identical exact text) can sit
  // earlier in the DOM than the freshly-opened dropdown option - .last()
  // reliably picks the option instead of the static cart row. The whole
  // selection is retried a few times since the "Select Batch" dialog
  // occasionally fails to open on the first click (app-side timing).
  let opened = false;
  for (let attempt = 1; attempt <= 3 && !opened; attempt++) {
    await productInput.click();
    await productInput.fill(product);
    const option = page.getByText(product, { exact: true }).last();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
    opened = await batchOption.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
  }
  if (!opened) throw new Error(`Select Batch dialog never opened for "${product}" after 3 attempts`);
  await batchOption.click();

  await page.locator('input[name="quantity"]').fill(String(qty));
  if (discountPercent != null) await page.locator('input[name="discount_percentage"]').fill(String(discountPercent));
  if (discountAmount != null) await page.locator('input[name="discount_amount"]').fill(String(discountAmount));
  if (taxPercent != null) await page.locator('input[name="tax_percentage"]').fill(String(taxPercent));

  await page.getByRole('button', { name: 'ADD ITEM' }).click();
  await expect(page.getByText('No Item found')).not.toBeVisible();
}

// A successful save can automatically open a "Receipt Preview" dialog on top
// of the page - close it if present before continuing.
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

test.describe('Hisab Kitab 360 - Customer Sales', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openKnownCustomerDetails(page);
  });

  test.describe('Positive', () => {
    test('adds a new sale with one product and saves with Save & Exit', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await expect(page.getByRole('heading', { name: 'Add Sale' })).toBeVisible({ timeout: 10_000 });

      await addProductToSale(page, { qty: 2 });
      await expect(page.locator('table', { hasText: 'Product Name' }).getByText(KNOWN_PRODUCT)).toBeVisible();

      await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
      await closeReceiptPreviewIfOpen(page);
      await expect(page).toHaveURL(/\/customers/, { timeout: 15_000 });
      await expect(page.getByText('Sale added successfully')).toBeVisible({ timeout: 10_000 });
    });

    test('adds a new sale and saves with Save & Print', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await expect(page.getByRole('heading', { name: 'Add Sale' })).toBeVisible({ timeout: 10_000 });
      await addProductToSale(page, { qty: 1 });

      // Save & Print does not open a popup - it saves like Save & Exit and then
      // shows the same in-page "Receipt Preview" dialog. Stub window.print so a
      // click inside that dialog cannot hang the test on an OS-native dialog.
      await page.evaluate(() => { window.print = () => {}; });
      await page.getByRole('button', { name: 'SAVE & PRINT' }).click();
      await closeReceiptPreviewIfOpen(page);
      await expect(page.getByText(/error/i)).not.toBeVisible();
    });

    test('adds a sale with a percentage discount on the product line', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await addProductToSale(page, { qty: 2, discountPercent: 10 });

      // The app does not print the discount % itself on the line - only the
      // resulting Dis Amount column reflects it (476 * 10% = 47.60 here).
      const row = page.locator('table', { hasText: 'Product Name' }).locator('tr.cart__row').first();
      const disAmountCell = row.locator('td').nth(7);
      await expect(disAmountCell).not.toHaveText('₨0.00');
    });

    test('adds a sale with a fixed (Rs) discount on the product line', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await addProductToSale(page, { qty: 2, discountAmount: 20 });

      const row = page.locator('table', { hasText: 'Product Name' }).locator('tr.cart__row').first();
      await expect(row.getByText('20.00', { exact: false })).toBeVisible();
    });

    test('adds a sale with extra sales tax (%) on the product line', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await addProductToSale(page, { qty: 1, taxPercent: 5 });

      const row = page.locator('table', { hasText: 'Product Name' }).locator('tr.cart__row').first();
      await expect(row.getByText('5%')).toBeVisible();
    });

    test('adds a sale with invoice-level extra charges', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await addProductToSale(page, { qty: 1 });

      await amountInputNear(page, 'Delivery Charges').fill('50');
      await amountInputNear(page, 'Service Charges').fill('30');
      await amountInputNear(page, 'Additional Charges').fill('20');

      // Extra Charges total (50 + 30 + 20 = 100) should roll into Net Bill
      // Amount (238 base + 100 = 338). The amount is rendered as a "₨" glyph
      // and the number in separate sibling spans (not literal "Rs " text),
      // so match against the heading's own value container rather than a
      // hardcoded currency string.
      const netBillValue = page.getByRole('heading', { name: /Net Bill Amount/ }).locator('xpath=following-sibling::*[1]');
      await expect(netBillValue).toHaveText(/338\.00/);
    });

    test('adds a sale with multiple products', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await addProductToSale(page, { qty: 1 });
      await addProductToSale(page, { qty: 2 });

      const table = page.locator('table', { hasText: 'Product Name' });
      await expect(table.locator('tr.cart__row')).toHaveCount(2);
    });

    test('removes a product line item before saving', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await addProductToSale(page, { qty: 1 });

      await page.getByTitle('Remove Product').click();
      await expect(page.getByText('No Item found')).toBeVisible();
    });

    // Light-touch check only - clicking "Edit Product" is confirmed to bring
    // the line item's values back into the entry form (Qty shown here), but
    // the full re-save flow for an edited line has not been explored further.
    test('loads a product line item back into the form for editing', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await addProductToSale(page, { qty: 3 });

      await page.getByTitle('Edit Product').click();
      await expect(page.locator('input[name="quantity"]')).toHaveValue('3');
    });

    test('opens the read-only Details view for a sale', async ({ page }) => {
      await page.getByRole('tab', { name: 'Sales' }).click();
      const row = page.locator('tbody tr').first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Details', { exact: true }).click();

      await expect(page.getByRole('heading', { name: 'Sale Details' })).toBeVisible({ timeout: 10_000 });
    });

    test('deletes a sale', async ({ page }) => {
      // Create a disposable sale first so the delete does not remove seed data.
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await addProductToSale(page, { qty: 1 });
      await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
      await closeReceiptPreviewIfOpen(page);
      await expect(page.getByText('Sale added successfully')).toBeVisible({ timeout: 10_000 });

      await openKnownCustomerDetails(page);
      await page.getByRole('tab', { name: 'Sales' }).click();
      const row = page.locator('tbody tr').first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      // Confirmation dialog reads "Are you sure you want to delete this sale?"
      // with Cancel/Delete buttons (verified live).
      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this sale?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByText('deleted successfully', { exact: false })).toBeVisible({ timeout: 10_000 });
    });

    test('searches within the sales list', async ({ page }) => {
      await page.getByRole('tab', { name: 'Sales' }).click();
      await page.getByPlaceholder('Search...').fill('09-26');
      await expect(page.locator('tbody tr').first()).toBeVisible();
    });

    // Smoke test only - the Manage Return Products flow (selecting quantities
    // to return, refund handling, etc.) has not been explored in depth yet.
    test('opens Manage Return Products for a sale', async ({ page }) => {
      await page.getByRole('tab', { name: 'Sales' }).click();
      const row = page.locator('tbody tr').first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Manage Return Products', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Manage Return Products', { exact: true }).click();

      await expect(page.getByText(/return/i).first()).toBeVisible({ timeout: 10_000 });
    });

    // Smoke test only - the report's own content/filters have not been explored.
    test('opens the sale report', async ({ page }) => {
      await page.getByRole('button', { name: 'VIEW SALE REPORT' }).click();
      await expect(page.getByText(/sale report/i).first()).toBeVisible({ timeout: 10_000 });
    });

    test('prints from the customer details page without errors', async ({ page }) => {
      // The button calls window.print(), which opens the OS-native print dialog -
      // something Playwright cannot see or close. Stub it out so the click is
      // still exercised without hanging the test on a real dialog.
      await page.evaluate(() => { window.print = () => {}; });

      // Each toolbar button is wrapped in its own <span>, so the print button
      // is the button inside the span immediately preceding "VIEW SALE REPORT"'s
      // own wrapping span - not a direct preceding-sibling of the button itself.
      const printButton = page.getByRole('button', { name: 'VIEW SALE REPORT' })
        .locator('xpath=ancestor::span[1]/preceding-sibling::span[1]//button');
      await printButton.click();
      await expect(page.getByText(/error/i)).not.toBeVisible();
    });
  });

  test.describe('Negative', () => {
    // Critical known bug (reported to Trello with a screenshot): opening any
    // existing sale for edit and clicking UPDATE & EXIT - without changing
    // anything - fails with "Please select a batch for <product>", because the
    // Edit Sale screen never hydrates the line item's already-saved batch into
    // its state. There is no batch picker anywhere in Edit Sale (not even via
    // the line's own "Edit Product" icon) to satisfy this, so no existing sale
    // can currently be re-saved at all. This test encodes the CORRECT expected
    // behavior (the update actually saves) and will fail until fixed.
    test('edits an existing sale [KNOWN BUG]', async ({ page }) => {
      await page.getByRole('tab', { name: 'Sales' }).click();
      const row = page.locator('tbody tr').first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Edit Sale' })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('combobox', { name: 'Customer' })).toHaveValue(KNOWN_CUSTOMER);

      await page.getByRole('button', { name: 'UPDATE & EXIT' }).click();
      await closeReceiptPreviewIfOpen(page);
      await expect(page).toHaveURL(/\/customers\/customer-details\//, { timeout: 15_000 });
    });

    test('keeps quantity disabled until a product is selected', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await expect(page.getByRole('heading', { name: 'Add Sale' })).toBeVisible({ timeout: 10_000 });

      await expect(page.locator('input[name="quantity"]')).toBeDisabled();
      await expect(page.getByText('No Item found')).toBeVisible();
    });

    test('keeps a sale when its delete confirmation is cancelled', async ({ page }) => {
      // Create a disposable sale first so we have something safe to cancel-delete.
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await addProductToSale(page, { qty: 1 });
      await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
      await closeReceiptPreviewIfOpen(page);
      await expect(page.getByText('Sale added successfully')).toBeVisible({ timeout: 10_000 });

      await openKnownCustomerDetails(page);
      await page.getByRole('tab', { name: 'Sales' }).click();
      const row = page.locator('tbody tr').first();
      const invoiceNo = (await row.innerText()).split('\n')[0];
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Delete', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Delete', { exact: true }).click();

      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this sale?' });
      await expect(confirmDialog).toBeVisible({ timeout: 10_000 });
      await confirmDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

      await expect(confirmDialog).not.toBeVisible({ timeout: 10_000 });
      await expect(page.locator('tbody tr', { hasText: invoiceNo }).first()).toBeVisible();
    });

    test('keeps quantity disabled until a batch is chosen for the selected product', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      const productInput = page.getByRole('combobox', { name: 'Product Name' });
      await productInput.click();
      await productInput.fill(KNOWN_PRODUCT);
      await page.getByText(KNOWN_PRODUCT, { exact: true }).first().click();

      await expect(page.locator('.batch-select-option').first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('input[name="quantity"]')).toBeDisabled();
    });

    // Confirmed correct behavior under Costing Method = Average: closing the
    // Select Batch dialog without picking one (or force-clicking a disabled
    // ADD ITEM) must not let the line item be added anyway - batch selection
    // has no bypass.
    test('cannot bypass mandatory batch selection by closing the dialog', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      const productInput = page.getByRole('combobox', { name: 'Product Name' });
      await productInput.click();
      await productInput.fill(KNOWN_PRODUCT);
      await page.getByText(KNOWN_PRODUCT, { exact: true }).first().click();

      const heading = page.getByRole('heading', { name: 'Select Batch' });
      await expect(heading).toBeVisible({ timeout: 10_000 });
      // Unlike Receipt Preview's plain-div "x", this dialog's close icon is a
      // real <button> - and the only one inside the dialog itself (Save &
      // Exit / Save & Print belong to the page underneath, not this modal).
      await page.locator('[role="dialog"]', { has: heading }).getByRole('button').first().click();
      await expect(heading).not.toBeVisible({ timeout: 5_000 });

      await expect(page.locator('input[name="quantity"]')).toBeDisabled();
      await expect(page.getByRole('button', { name: 'ADD ITEM' })).toBeDisabled();
      await page.getByRole('button', { name: 'ADD ITEM' }).click({ force: true }).catch(() => {});
      await expect(page.getByText('No Item found')).toBeVisible();
    });

    // Confirmed correct behavior: typing a quantity higher than the selected
    // batch's remaining stock is silently clamped back down to the max
    // available (no error shown, but overselling is prevented either way).
    test('clamps quantity to the selected batch\'s available stock', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      const productInput = page.getByRole('combobox', { name: 'Product Name' });
      await productInput.click();
      await productInput.fill(KNOWN_PRODUCT);
      await page.getByText(KNOWN_PRODUCT, { exact: true }).first().click();

      const batchOption = page.locator('.batch-select-option').first();
      await expect(batchOption).toBeVisible({ timeout: 10_000 });
      const batchText = await batchOption.innerText();
      const maxAvailable = Number(batchText.match(/Qty\s*(\d+)/)?.[1] ?? '0');
      await batchOption.click();

      const qtyInput = page.locator('input[name="quantity"]');
      await qtyInput.fill(String(maxAvailable + 500));
      await expect(qtyInput).toHaveValue(String(maxAvailable));
    });

    // Known limitation (worth reporting): a product with no existing stock
    // batch cannot be sold at all - the "Select Batch" dialog shows "No
    // batches available" and there is no way to proceed. A batch first has to
    // be created for that product via Suppliers > Add Shipment.
    test('cannot add a product that has no stock batch [KNOWN LIMITATION]', async ({ page }) => {
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      const productInput = page.getByRole('combobox', { name: 'Product Name' });
      await productInput.click();
      await productInput.fill('Meta Brown');
      await page.getByText('Meta Brown', { exact: true }).first().click();

      await expect(page.getByText('No batches available')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('input[name="quantity"]')).toBeDisabled();
    });
  });
});
