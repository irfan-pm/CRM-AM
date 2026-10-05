const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

// Verifying P1 defects from the external "Hisab Kitab 360 — Bug list
// (developer and QA)" handoff doc (@Sajjad Yousaf, 2026-10-04) against THIS
// account (cms@gmail.com / appdev.hisabkitab360.com), recreating each
// scenario fresh since that doc's exact record numbers (e.g. "Sale
// 10-26-0006") belong to a different "QA Test Store 03-10" account this
// suite does not have access to. Each test documents whatever this account
// ACTUALLY does - some defects may already be fixed here even if still open
// on the original account.

const KNOWN_PRODUCT = 'Test panadol';
const KNOWN_CUSTOMER = 'Co-work';
const KNOWN_SALE_PRODUCT = 'Johathan Bauch';
const KNOWN_SUPPLIER = 'Allah Ditta';

async function openStockInHandRow(page, productName) {
  await page.goto('/stock-in-hand');
  await page.waitForTimeout(1_000);
  for (let i = 0; i < 3 && await page.getByText('No Data Exist').isVisible().catch(() => false); i++) {
    await page.reload();
    await page.waitForTimeout(1_500);
  }
  await page.getByPlaceholder('Search stock...').fill(productName);
  await page.waitForTimeout(1_000);
  const row = page.locator('tbody tr', { hasText: productName }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}

function amountInputNear(page, labelText) {
  return page.locator(`text=${labelText}`).locator('xpath=following::input[1]');
}

async function addPosProduct(page, qty) {
  const productInput = page.getByRole('combobox', { name: 'Product Name' });
  for (let i = 1; i <= 4; i++) {
    await productInput.click();
    await productInput.fill('');
    await productInput.fill(KNOWN_PRODUCT);
    await page.waitForTimeout(700);
    const option = page.getByText(KNOWN_PRODUCT, { exact: true }).last();
    const visible = await option.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
    if (!visible) { await page.waitForTimeout(800); continue; }
    await option.click();
    await page.waitForTimeout(500);
    if (await page.locator('input[name="quantity"]').isEnabled().catch(() => false)) break;
  }
  await page.locator('input[name="quantity"]').fill(String(qty));
  await page.getByRole('button', { name: 'ADD ITEM' }).click();
  await page.waitForTimeout(800);
}

async function fillReceivedAmount(page, amount) {
  await page.locator('input:not([name]):not(.sidebar-search-input)').last().fill(String(amount));
}

test.describe('Hisab Kitab 360 - External bug-list verification (P1)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // DEF-01 (POS payment, walk-in): doc reports an underpaid walk-in receipt
  // silently shows "Return Back Amount Rs X" and loses the shortfall. NOT
  // REPRODUCIBLE on this account - the server correctly rejects the save
  // with a "Received amount is less than net bill amount" error, and the
  // sale is confirmed NOT created. This test documents that correct,
  // working behavior so a future regression would be caught.
  test('DEF-01: POS walk-in sale is blocked when Received Amount is less than Net Bill', async ({ page }) => {
    const name = `QA3_DEF01_${Date.now()}`;
    await page.goto('/pos_invoicing/add_pos_invoicing');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await addPosProduct(page, 2);

    const netBillRow = page.getByText('Net Bill Amount', { exact: false }).locator('xpath=..');
    await expect(netBillRow).toContainText('1001.00');

    await fillReceivedAmount(page, 100); // deliberately far below the Rs 1001 bill
    await page.getByRole('button', { name: 'SAVE & EXIT' }).click();

    await expect(page.getByText('Received amount is less than net bill amount')).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/add_pos_invoicing/); // save correctly blocked, stayed on the form

    // Confirm no partial/incorrect sale was silently created anyway.
    await page.goto('/pos_invoicing');
    await page.waitForTimeout(1_000);
    const searchBox = page.locator('input[type="text"]').first();
    await searchBox.fill(name).catch(() => {});
    await page.waitForTimeout(1_000);
    await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(0);
  });

  // DEF-02 (Sales return, partial) [KNOWN BUG]: a partial return should only
  // remove the value of the returned items - the sale's Delivery Charges
  // should remain. CONFIRMED on this account: returning 2 of 4 units from a
  // sale (4x Rs 238 = Rs 952 + Rs 200 Delivery = Rs 1,152 Net Bill) silently
  // drops the Rs 200 Delivery Charge entirely - the sale's Net Bill after
  // the return shows only the remaining item value (Rs 476), not Rs 676
  // (476 + the delivery charge that should still apply). This test encodes
  // the CORRECT expected Net Bill and will fail until fixed.
  test('DEF-02: a partial sales return keeps the Delivery Charge on the remaining bill [KNOWN BUG]', async ({ page }) => {
    await page.goto('/customers');
    await page.getByPlaceholder('Search customer...').fill(KNOWN_CUSTOMER);
    await page.waitForTimeout(500);
    const row = page.locator('tbody tr', { hasText: KNOWN_CUSTOMER }).first();
    await row.locator('.table-menu-more-option').click();
    await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText('Details', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Customer Details' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
    await expect(page.getByRole('heading', { name: 'Add Sale' })).toBeVisible({ timeout: 10_000 });

    const productInput = page.getByRole('combobox', { name: 'Product Name' });
    const batchOption = page.locator('.batch-select-option').first();
    await productInput.click();
    await productInput.fill(KNOWN_SALE_PRODUCT);
    const option = page.getByText(KNOWN_SALE_PRODUCT, { exact: true }).last();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
    // Costing Method currently does not force a batch pick for this product -
    // select one only if the dialog actually appears.
    const batchDialogOpen = await batchOption.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (batchDialogOpen) await batchOption.click();

    await page.locator('input[name="quantity"]').fill('4');
    await page.getByRole('button', { name: 'ADD ITEM' }).click();
    await expect(page.getByText('No Item found')).not.toBeVisible();

    await amountInputNear(page, 'Delivery Charges').fill('200');
    await page.waitForTimeout(500);

    const netBillRow = page.getByText('Net Bill Amount', { exact: false }).locator('xpath=..');
    await expect(netBillRow).toContainText('1152.00'); // (4 x 238) + 200 delivery

    await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
    await page.waitForTimeout(1_500);
    const receiptHeading = page.getByRole('heading', { name: 'Receipt Preview' });
    if (await receiptHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await receiptHeading.locator('xpath=following-sibling::*[1]').click();
    }

    await page.getByRole('tab', { name: 'Sales' }).click();
    await page.waitForTimeout(800);
    const saleRow = page.locator('tbody tr').first();
    await saleRow.locator('.table-menu-more-option').click();
    await expect(page.getByText('Manage Return Products', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText('Manage Return Products', { exact: true }).click();
    await page.waitForTimeout(1_000);

    const returnRow = page.locator('tbody tr', { hasText: KNOWN_SALE_PRODUCT }).first();
    await returnRow.locator('input[type="checkbox"]').check();
    await returnRow.locator('input[type="number"]').fill('2');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'SUBMIT' }).click();
    await page.waitForTimeout(1_500);

    await page.getByRole('tab', { name: 'Sales' }).click();
    await page.waitForTimeout(800);
    // Correct: (4-2) x 238 remaining item value + the Rs 200 Delivery Charge
    // that should still apply = Rs 676. Buggy actual: Rs 476 (delivery
    // dropped entirely).
    await expect(page.locator('tbody tr').first()).toContainText('676.00');
  });

  // DEF-03 (Purchase → stock cost) [KNOWN BUG]: a line-item discount % on a
  // Shipment is correctly calculated and shown on the shipment form itself
  // (Net Amount = Rate x Qty, minus the discount), but that discount is
  // silently ignored when the stock's Purchasing Avg Price / Purchasing
  // Cost is computed on Stock In Hand - it uses the full pre-discount rate
  // instead. This test encodes the CORRECT discounted values and will fail
  // until fixed.
  test('DEF-03: Stock In Hand reflects a Shipment line-item discount in the average purchase price [KNOWN BUG]', async ({ page }) => {
    const name = `QA3_DEF03_${Date.now()}`;
    await page.goto('/products');
    await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
    await expect(page.getByRole('heading', { name: 'Add Product' })).toBeVisible({ timeout: 10_000 });
    await page.locator('input[name="product_name"]').fill(name);
    await page.locator('input[name="incl_tax"]').fill('2000');
    await page.getByRole('button', { name: 'SUBMIT' }).click();
    await page.waitForTimeout(2_000);

    await page.goto('/suppliers');
    await page.getByPlaceholder('Search supplier...').fill(KNOWN_SUPPLIER);
    await page.waitForTimeout(500);
    const supRow = page.locator('tbody tr', { hasText: KNOWN_SUPPLIER }).first();
    await supRow.locator('.table-menu-more-option').click();
    await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText('Details', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Supplier Details' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
    await expect(page.getByRole('heading', { name: 'Add Shipment' })).toBeVisible({ timeout: 10_000 });
    await page.locator('input[name="shipment_title"]').fill(`QA3_DEF03_Shipment_${Date.now()}`);

    const productInput = page.getByRole('combobox', { name: 'Product Name' });
    for (let i = 1; i <= 4; i++) {
      await productInput.click();
      await productInput.fill('');
      await productInput.fill(name);
      await page.waitForTimeout(700);
      const option = page.getByText(name, { exact: true }).last();
      const visible = await option.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
      if (!visible) { await page.waitForTimeout(800); continue; }
      await option.click();
      await page.waitForTimeout(500);
      if (await page.locator('input[name="quantity"]').isEnabled().catch(() => false)) break;
    }
    await page.locator('input[name="quantity"]').fill('3');
    await page.locator('input[name="selling_price_excluding_tax"]').fill('1000');
    // Manufacturer Batch No is mandatory on this account's current settings.
    await page.locator('input[name="manufacturer_batch_no"]').fill(`BATCH_${Date.now()}`);
    await page.locator('input[name="discount_percentage"]').fill('2');
    await page.waitForTimeout(400);

    // The shipment line correctly computes the discount amount itself:
    // 2% of (3 x Rs 1000) = Rs 60.
    await expect(page.locator('input[name="discount_amount"]')).toHaveValue('60');

    await page.getByRole('button', { name: 'ADD ITEM' }).click();
    await expect(page.getByText('No Item found')).not.toBeVisible();
    await page.getByRole('button', { name: 'SUBMIT' }).click();
    await expect(page).toHaveURL(/\/suppliers/, { timeout: 15_000 });

    const stockRow = await openStockInHandRow(page, name);
    // Correct: average purchase price should reflect the 2% discount
    // (Rs 980/unit, Rs 2,940 total). Buggy actual: Rs 1,000/unit, Rs 3,000
    // total - the discount is dropped entirely in this calculation.
    await expect(stockRow).toContainText('Purchasing Avg Price: ₨980.00');
    await expect(stockRow).toContainText('Purchasing Cost: ₨2,940.00');
  });

  // DEF-04 (Purchase line, tax) [KNOWN BUG], part 1: typing a Tax % on a
  // Shipment line should compute tax ON TOP of the entered Rate, leaving
  // Rate unchanged. CONFIRMED: typing 18% after Rate 1200 instead REWRITES
  // Rate to 1016.95 (it back-calculates as if 1200 were tax-inclusive).
  test('DEF-04a: typing a Shipment line Tax % does not rewrite the entered Rate [KNOWN BUG]', async ({ page }) => {
    const name = `QA3_DEF04a_${Date.now()}`;
    await page.goto('/products');
    await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
    await expect(page.getByRole('heading', { name: 'Add Product' })).toBeVisible({ timeout: 10_000 });
    await page.locator('input[name="product_name"]').fill(name);
    await page.locator('input[name="incl_tax"]').fill('2000');
    await page.getByRole('button', { name: 'SUBMIT' }).click();
    await page.waitForTimeout(2_000);

    await page.goto('/suppliers');
    await page.getByPlaceholder('Search supplier...').fill(KNOWN_SUPPLIER);
    await page.waitForTimeout(500);
    const supRow = page.locator('tbody tr', { hasText: KNOWN_SUPPLIER }).first();
    await supRow.locator('.table-menu-more-option').click();
    await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText('Details', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Supplier Details' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
    await expect(page.getByRole('heading', { name: 'Add Shipment' })).toBeVisible({ timeout: 10_000 });
    await page.locator('input[name="shipment_title"]').fill(`QA3_DEF04a_Shipment_${Date.now()}`);

    const productInput = page.getByRole('combobox', { name: 'Product Name' });
    for (let i = 1; i <= 4; i++) {
      await productInput.click();
      await productInput.fill('');
      await productInput.fill(name);
      await page.waitForTimeout(700);
      const option = page.getByText(name, { exact: true }).last();
      const visible = await option.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
      if (!visible) { await page.waitForTimeout(800); continue; }
      await option.click();
      await page.waitForTimeout(500);
      if (await page.locator('input[name="quantity"]').isEnabled().catch(() => false)) break;
    }
    await page.locator('input[name="quantity"]').fill('1');
    await page.locator('input[name="manufacturer_batch_no"]').fill(`BATCH_${Date.now()}`);
    await page.locator('input[name="selling_price_excluding_tax"]').fill('1200');
    await page.waitForTimeout(400);

    await page.locator('input[name="tax_percentage"]').fill('18');
    await page.waitForTimeout(500);

    // Correct: Rate should stay 1200 regardless of tax entered. Buggy
    // actual: Rate is rewritten to 1016.95.
    await expect(page.locator('input[name="selling_price_excluding_tax"]')).toHaveValue('1200');
  });

  // DEF-04 (Purchase line, tax) [KNOWN BUG], part 2: Tax % should be limited
  // to 0-100. CONFIRMED: the field accepts an arbitrary huge number
  // (10,120,018%) with no validation at all.
  test('DEF-04b: Shipment line Tax % rejects values outside 0-100 [KNOWN BUG]', async ({ page }) => {
    const name = `QA3_DEF04b_${Date.now()}`;
    await page.goto('/products');
    await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
    await expect(page.getByRole('heading', { name: 'Add Product' })).toBeVisible({ timeout: 10_000 });
    await page.locator('input[name="product_name"]').fill(name);
    await page.locator('input[name="incl_tax"]').fill('2000');
    await page.getByRole('button', { name: 'SUBMIT' }).click();
    await page.waitForTimeout(2_000);

    await page.goto('/suppliers');
    await page.getByPlaceholder('Search supplier...').fill(KNOWN_SUPPLIER);
    await page.waitForTimeout(500);
    const supRow = page.locator('tbody tr', { hasText: KNOWN_SUPPLIER }).first();
    await supRow.locator('.table-menu-more-option').click();
    await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText('Details', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Supplier Details' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
    await expect(page.getByRole('heading', { name: 'Add Shipment' })).toBeVisible({ timeout: 10_000 });
    await page.locator('input[name="shipment_title"]').fill(`QA3_DEF04b_Shipment_${Date.now()}`);

    const productInput = page.getByRole('combobox', { name: 'Product Name' });
    for (let i = 1; i <= 4; i++) {
      await productInput.click();
      await productInput.fill('');
      await productInput.fill(name);
      await page.waitForTimeout(700);
      const option = page.getByText(name, { exact: true }).last();
      const visible = await option.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
      if (!visible) { await page.waitForTimeout(800); continue; }
      await option.click();
      await page.waitForTimeout(500);
      if (await page.locator('input[name="quantity"]').isEnabled().catch(() => false)) break;
    }
    await page.locator('input[name="quantity"]').fill('1');
    await page.locator('input[name="manufacturer_batch_no"]').fill(`BATCH_${Date.now()}`);
    await page.locator('input[name="selling_price_excluding_tax"]').fill('1200');
    await page.waitForTimeout(400);

    await page.locator('input[name="tax_percentage"]').fill('10120018');
    await page.waitForTimeout(400);

    // Correct: should be clamped/rejected to the 0-100 range. Buggy actual:
    // the absurd value is accepted verbatim.
    await expect(page.locator('input[name="tax_percentage"]')).not.toHaveValue('10120018');
  });

  // DEF-08 (POS Invoicing list): doc reports the list is always empty
  // because it queries pos_invoice while POS sales are stored as
  // digital_invoice. NOT REPRODUCIBLE on this account - a freshly saved POS
  // sale correctly appears in the POS Invoicing list, both via search and
  // on a fresh unfiltered page load.
  test('DEF-08: a saved POS Invoice appears in the POS Invoicing list', async ({ page }) => {
    const name = `QA3_DEF08_${Date.now()}`;
    await page.goto('/pos_invoicing/add_pos_invoicing');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await addPosProduct(page, 1);
    await fillReceivedAmount(page, 10_000);
    await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
    await expect(page).toHaveURL(/\/pos_invoicing$/, { timeout: 15_000 });

    await page.goto('/pos_invoicing');
    await page.waitForTimeout(1_500);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
    const searchBox = page.locator('input[type="text"]').first();
    await searchBox.fill(name);
    await page.waitForTimeout(1_000);
    await expect(page.locator('tbody tr', { hasText: name })).toBeVisible({ timeout: 10_000 });
  });

  // DEF-09 (POS payment) [KNOWN BUG]: true split-tender (paying one bill
  // across multiple payment methods/accounts, e.g. part cash + part card)
  // should be possible. CONFIRMED: Payment Mode does offer a "Mixed"
  // option, but selecting it only shows a single "Select Bank Account"
  // field - there is no way to enter more than one tender/account, so a
  // bill still cannot actually be split across two or more payments.
  test('DEF-09: "Mixed" Payment Mode allows entering more than one tender/account [KNOWN BUG]', async ({ page }) => {
    await page.goto('/pos_invoicing/add_pos_invoicing');
    await page.getByLabel('Name', { exact: true }).fill(`QA3_DEF09_${Date.now()}`);
    await addPosProduct(page, 1);
    await fillReceivedAmount(page, 500);

    const paymentModeDropdown = page.getByRole('combobox', { name: 'Payment Mode' });
    await paymentModeDropdown.scrollIntoViewIfNeeded();
    await paymentModeDropdown.click();
    await page.getByRole('option', { name: 'Mixed', exact: true }).click();
    await page.waitForTimeout(800);

    // Correct: a second tender/account entry (amount + account, so two
    // payments can sum to the bill) should be addable. Buggy actual: only
    // one "Select Account" combobox exists even in Mixed mode.
    const accountSelectors = page.getByRole('combobox', { name: /account/i });
    await expect(accountSelectors).toHaveCount(2); // would need 2+ to actually split a payment
  });

  // DEF-10 (Sales return, full) [KNOWN BUG]: a full return on a sale paid in
  // full should keep the original payment record and add a separate refund
  // entry - the money was genuinely received and then genuinely given back.
  // CONFIRMED: fully returning a sale instead DELETES its payment/receipt
  // row entirely from the customer's Payments tab, with no refund entry
  // created anywhere - the payment count drops by exactly 1.
  test('DEF-10: a full sales return does not delete the original payment receipt [KNOWN BUG]', async ({ page }) => {
    await page.goto('/customers');
    await page.getByPlaceholder('Search customer...').fill(KNOWN_CUSTOMER);
    await page.waitForTimeout(500);
    const row = page.locator('tbody tr', { hasText: KNOWN_CUSTOMER }).first();
    await row.locator('.table-menu-more-option').click();
    await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText('Details', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Customer Details' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
    await expect(page.getByRole('heading', { name: 'Add Sale' })).toBeVisible({ timeout: 10_000 });

    const productInput = page.getByRole('combobox', { name: 'Product Name' });
    const batchOption = page.locator('.batch-select-option').first();
    await productInput.click();
    await productInput.fill(KNOWN_SALE_PRODUCT);
    const option = page.getByText(KNOWN_SALE_PRODUCT, { exact: true }).last();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
    const batchDialogOpen = await batchOption.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (batchDialogOpen) await batchOption.click();

    await page.locator('input[name="quantity"]').fill('2');
    await page.getByRole('button', { name: 'ADD ITEM' }).click();
    await expect(page.getByText('No Item found')).not.toBeVisible();

    const netBillText = await page.getByText('Net Bill Amount', { exact: false }).locator('xpath=..').innerText();
    const netBill = netBillText.match(/([\d,]+\.\d{2})/)[1].replace(/,/g, '');
    const receivedInput = page.locator('text=Received Amount').locator('xpath=following::input[1]');
    await receivedInput.fill(netBill); // pay the full bill, so a real receipt exists to check

    await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
    await page.waitForTimeout(1_500);
    const receiptHeading = page.getByRole('heading', { name: 'Receipt Preview' });
    if (await receiptHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await receiptHeading.locator('xpath=following-sibling::*[1]').click();
    }

    await page.getByRole('tab', { name: 'Payments' }).click();
    await page.waitForTimeout(800);
    const paymentCountBefore = await page.locator('tbody tr').count();

    await page.getByRole('tab', { name: 'Sales' }).click();
    await page.waitForTimeout(800);
    const saleRow = page.locator('tbody tr').first();
    await saleRow.locator('.table-menu-more-option').click();
    await expect(page.getByText('Manage Return Products', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText('Manage Return Products', { exact: true }).click();
    await page.waitForTimeout(1_000);

    const returnRow = page.locator('tbody tr', { hasText: KNOWN_SALE_PRODUCT }).first();
    await returnRow.locator('input[type="checkbox"]').check();
    await returnRow.locator('input[type="number"]').fill('2'); // full return - all units
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'SUBMIT' }).click();
    await page.waitForTimeout(1_500);

    await page.getByRole('tab', { name: 'Payments' }).click();
    await page.waitForTimeout(800);
    const paymentCountAfter = await page.locator('tbody tr').count();

    // Correct: the original receipt stays (same count, or +1 if a refund
    // entry is also added). Buggy actual: count drops by 1 - the receipt
    // was deleted outright.
    expect(paymentCountAfter).toBeGreaterThanOrEqual(paymentCountBefore);
  });

  // DEF-12 (Security) [KNOWN BUG]: no secret should be shipped in client JS;
  // Groq (AI) calls should go through the server only. CONFIRMED: the main
  // JS bundle contains REACT_APP_API_KEY, REACT_APP_EDITOR_KEY,
  // REACT_APP_GOOGLE_MAPS_API_KEY and REACT_APP_GROQ_API_KEY in plain text
  // (a classic Create React App misconfiguration - any REACT_APP_* env var
  // is baked into the public bundle at build time, so these should never
  // have held real secrets). This test checks for the KEY PATTERNS, not the
  // literal captured secret values, to avoid persisting the real keys in
  // this repo.
  test('DEF-12: the shipped client JS bundle does not contain API secret keys [KNOWN BUG]', async ({ page, request }) => {
    await page.goto('/');
    const scriptSrc = await page.locator('script[src*="main"]').getAttribute('src');
    expect(scriptSrc).toBeTruthy();
    const bundleUrl = new URL(scriptSrc, page.url()).toString();

    const response = await request.get(bundleUrl);
    const bundleText = await response.text();

    // A Google Maps key (AIzaSy... prefix) and a Groq key (gsk_... prefix)
    // should never appear in client-shipped code. Check as booleans (not
    // raw toMatch/toContain on the multi-MB bundle) so a failure doesn't
    // dump the entire bundle into the test report.
    expect(/AIzaSy[A-Za-z0-9_-]{20,}/.test(bundleText), 'Google Maps API key found in bundle').toBe(false);
    expect(/gsk_[A-Za-z0-9]{20,}/.test(bundleText), 'Groq API key found in bundle').toBe(false);
    expect(bundleText.includes('REACT_APP_EDITOR_KEY'), 'REACT_APP_EDITOR_KEY found in bundle').toBe(false);
  });
});
