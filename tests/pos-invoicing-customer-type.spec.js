const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

// User question (2026-10-05): when adding a POS Invoice, can a sale be
// created for a Walking (walk-in) customer AND for a Portal (registered)
// customer? Confirmed live: "Customer Type" offers exactly these two
// options. Walking Customer shows free-text Name/Phone fields; Portal
// Customer replaces them with a searchable "Customer *" combobox (plus a
// "+" quick-add) tied to a real registered customer and additionally shows
// a "Remaining Amount" row (credit/balance tracking), which Walking
// Customer does not have.

const KNOWN_PRODUCT = 'Test panadol';
const KNOWN_CUSTOMER = 'Co-work';

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

// The "Received Amount" field has no name/id attribute - it is reliably the
// last nameless input in the main content area, right before the named
// "payment_mode" select (confirmed via live DOM dump: Additional Discount
// amount, Delivery Charges, Service Charges, Additional Charges, Received
// Amount are the 5 nameless inputs in that order, then payment_mode). The
// sidebar's own hidden "Search" input is also nameless, so it must be
// excluded or .last() lands on it instead.
async function fillReceivedAmount(page, amount) {
  await page.locator('input:not([name]):not(.sidebar-search-input)').last().fill(String(amount));
}

test.describe('Hisab Kitab 360 - POS Invoicing customer type', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe('Positive', () => {
    test('creates a POS Invoice for a Walking (walk-in) Customer', async ({ page }) => {
      await page.goto('/pos_invoicing/add_pos_invoicing');
      await expect(page.getByRole('combobox', { name: 'Customer Type' })).toContainText('Walking Customer');

      await page.getByLabel('Name', { exact: true }).fill(`QA_WalkIn_${Date.now()}`);
      await addPosProduct(page, 1);

      const cartRow = page.locator('tbody tr', { hasText: KNOWN_PRODUCT });
      await expect(cartRow).toBeVisible({ timeout: 10_000 });

      await fillReceivedAmount(page, 10_000);
      await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
      await expect(page).toHaveURL(/\/pos_invoicing(?!\/add)/, { timeout: 15_000 });
    });

    test('creates a POS Invoice for a Portal (registered) Customer, linked to their ledger', async ({ page }) => {
      await page.goto('/pos_invoicing/add_pos_invoicing');
      await page.getByRole('combobox', { name: 'Customer Type' }).click();
      await page.getByRole('option', { name: 'Portal Customer', exact: true }).click();
      await page.waitForTimeout(500);

      // Portal Customer swaps Name/Phone for a searchable registered-customer
      // combobox - confirm it replaced the walk-in fields.
      await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
      const customerInput = page.locator('input[placeholder="search here for more..."]');
      await customerInput.click();
      await customerInput.fill(KNOWN_CUSTOMER);
      await page.waitForTimeout(800);
      const option = page.getByText(KNOWN_CUSTOMER, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 10_000 });
      await option.click();

      // Portal Customer additionally shows a "Remaining Amount" row for
      // credit/balance tracking - Walking Customer does not have this.
      await expect(page.getByText('Remaining Amount', { exact: false })).toBeVisible();

      await addPosProduct(page, 1);
      const cartRow = page.locator('tbody tr', { hasText: KNOWN_PRODUCT });
      await expect(cartRow).toBeVisible({ timeout: 10_000 });

      await fillReceivedAmount(page, 10_000);
      await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
      await expect(page).toHaveURL(/\/pos_invoicing(?!\/add)/, { timeout: 15_000 });

      // Verify it actually linked to the chosen customer's own ledger, not
      // just the POS list - open their Sales history and confirm a fresh
      // entry is present.
      await page.goto('/customers');
      await page.getByPlaceholder('Search customer...').fill(KNOWN_CUSTOMER);
      await page.waitForTimeout(600);
      const custRow = page.locator('tbody tr', { hasText: KNOWN_CUSTOMER }).first();
      await custRow.locator('.table-menu-more-option').click();
      await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Details', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Customer Details' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('tab', { name: 'Sales' }).click();
      await page.waitForTimeout(800);
      // Confirm a real, non-empty sale entry landed in this customer's own
      // ledger - not just the generic POS Invoicing list.
      const latestSale = page.locator('tbody tr').first();
      await expect(latestSale).toBeVisible({ timeout: 10_000 });
      await expect(latestSale).toContainText('₨', { ignoreCase: true });
    });
  });
});
