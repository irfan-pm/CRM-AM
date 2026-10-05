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
});
