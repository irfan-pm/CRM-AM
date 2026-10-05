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
});
