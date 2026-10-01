const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

// Client-reported issue (2026-10-01): a product's first shipment correctly
// sets its average purchase price on Stock Report > Stock in Hand, but a
// second shipment at a different price doesn't recalculate it. Reproduced
// end-to-end: the screen's "Purchasing Avg Price" is overwritten with the
// newest shipment's price instead of computing a quantity-weighted average
// across all received stock, and "Purchasing Cost" is then derived from
// that wrong average, compounding the error.
//
// Also confirmed as a (working-as-intended) prerequisite: a shipment sits
// as "Pending" and is excluded from Stock In Hand entirely until it is
// explicitly confirmed via the shipment row's "Confirm Shipment Status"
// action - this is a real workflow step, not a bug.

const SUPPLIER = 'Allah Ditta';

async function createProduct(page, { name, salePrice, purchasePrice, initialStock }) {
  await page.goto('/products');
  await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
  await expect(page.getByRole('heading', { name: 'Add Product' })).toBeVisible({ timeout: 10_000 });
  await page.locator('input[name="product_name"]').fill(name);
  await page.locator('input[name="incl_tax"]').fill(String(salePrice));
  await page.locator('input[name="purchasing_price"]').fill(String(purchasePrice));
  await page.locator('input[name="initial_stock"]').fill(String(initialStock));
  await page.getByRole('button', { name: 'SUBMIT' }).click();
  await Promise.race([
    page.getByText('Product added successfully').waitFor({ state: 'visible', timeout: 10_000 }),
    page.getByRole('heading', { name: 'Add Product' }).waitFor({ state: 'hidden', timeout: 10_000 }),
  ]).catch(() => {});
}

// Stock In Hand occasionally renders "No Data Exist" on the first paint even
// when rows exist (observed live) - reload a few times before trusting it.
async function openStockInHandRow(page, productName) {
  await page.goto('/stock-in-hand');
  await page.waitForTimeout(1000);
  for (let i = 0; i < 3 && await page.getByText('No Data Exist').isVisible().catch(() => false); i++) {
    await page.reload();
    await page.waitForTimeout(1500);
  }
  await page.getByPlaceholder('Search stock...').fill(productName);
  await page.waitForTimeout(1000);
  const row = page.locator('tbody tr', { hasText: productName }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}

async function addShipment(page, { product, title, qty, price }) {
  await page.goto('/suppliers');
  await page.getByPlaceholder('Search supplier...').fill(SUPPLIER);
  await page.waitForTimeout(500);
  const row = page.locator('tbody tr', { hasText: SUPPLIER }).first();
  await row.locator('.table-menu-more-option').click();
  await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText('Details', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Supplier Details' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
  await expect(page.getByRole('heading', { name: 'Add Shipment' })).toBeVisible({ timeout: 10_000 });
  await page.locator('input[name="shipment_title"]').fill(title);

  const productInput = page.getByRole('combobox', { name: 'Product Name' });
  for (let i = 1; i <= 4; i++) {
    await productInput.click();
    await productInput.fill('');
    await productInput.fill(product);
    await page.waitForTimeout(600);
    const option = page.getByText(product, { exact: true }).last();
    const visible = await option.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
    if (!visible) { await page.waitForTimeout(800); continue; }
    await option.click();
    await page.waitForTimeout(500);
    if (await page.locator('input[name="quantity"]').isEnabled().catch(() => false)) break;
  }
  await page.locator('input[name="quantity"]').fill(String(qty));
  await page.locator('input[name="selling_price_excluding_tax"]').fill(String(price));
  await page.getByRole('button', { name: 'ADD ITEM' }).click();
  await expect(page.getByText('No Item found')).not.toBeVisible();
  await page.getByRole('button', { name: 'SUBMIT' }).click();
  await expect(page).toHaveURL(/\/suppliers/, { timeout: 15_000 });
}

// Confirms the most recently created shipment (sorted newest-first in the
// supplier's Shipment tab) via its row's "Confirm Shipment Status" action.
async function confirmLatestShipment(page) {
  await page.goto('/suppliers');
  await page.getByPlaceholder('Search supplier...').fill(SUPPLIER);
  await page.waitForTimeout(500);
  const row = page.locator('tbody tr', { hasText: SUPPLIER }).first();
  await row.locator('.table-menu-more-option').click();
  await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText('Details', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Supplier Details' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('tab', { name: 'Shipment' }).click();
  await page.waitForTimeout(800);
  const firstShipment = page.locator('tbody tr').first();
  await firstShipment.locator('.table-menu-more-option').click();
  await expect(page.getByText('Confirm Shipment Status', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText('Confirm Shipment Status', { exact: true }).click();
  await expect(page.getByText('Change Shipment Status?')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Yes, Confirm It', exact: true }).click();
  await page.waitForTimeout(1200);
}

test.describe('Hisab Kitab 360 - Stock In Hand average purchase price', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe('Positive', () => {
    test('a new product\'s initial stock sets the correct purchase price and quantity in Stock In Hand', async ({ page }) => {
      const name = `QA_StockAvg_${Date.now()}`;
      await createProduct(page, { name, salePrice: 600, purchasePrice: 500, initialStock: 5 });

      const row = await openStockInHandRow(page, name);
      await expect(row).toContainText('Purchasing Avg Price: ₨500.00');
      await expect(row).toContainText('Available: 5');
      await expect(row).toContainText('Total Received: 5');
      await expect(row).toContainText('Purchasing Cost: ₨2,500.00');
    });

    test('a Pending shipment does not affect Stock In Hand until it is confirmed', async ({ page }) => {
      const name = `QA_StockAvg_${Date.now()}`;
      await createProduct(page, { name, salePrice: 600, purchasePrice: 500, initialStock: 5 });
      await addShipment(page, { product: name, title: `QA_StockAvgShipment_${Date.now()}`, qty: 2, price: 1000 });

      const row = await openStockInHandRow(page, name);
      await expect(row).toContainText('Available: 5');
      await expect(row).toContainText('Total Received: 5');
      await expect(row).toContainText('Purchasing Avg Price: ₨500.00');
    });
  });

  test.describe('Negative', () => {
    // [KNOWN BUG] Confirmed critical bug (reported to Trello with evidence
    // screenshot): after a second shipment at a different price is
    // confirmed, "Purchasing Avg Price" on Stock In Hand does not recompute
    // a quantity-weighted average across both batches - it is simply
    // overwritten with the newest shipment's price (here Rs 1,000,
    // discarding the original 5 units' real cost of Rs 500 each).
    // "Purchasing Cost" is then derived from this wrong average, compounding
    // the error (Rs 7,000 shown vs. Rs 4,500 actually spent). This test
    // encodes the CORRECT expected values and will fail until fixed.
    test('Stock In Hand recalculates a weighted average purchase price after a second shipment at a different price [KNOWN BUG]', async ({ page }) => {
      const name = `QA_StockAvg_${Date.now()}`;
      await createProduct(page, { name, salePrice: 600, purchasePrice: 500, initialStock: 5 });
      await addShipment(page, { product: name, title: `QA_StockAvgShipment_${Date.now()}`, qty: 2, price: 1000 });
      await confirmLatestShipment(page);

      const row = await openStockInHandRow(page, name);
      await expect(row).toContainText('Available: 7');
      await expect(row).toContainText('Total Received: 7');
      // Weighted average: (5*500 + 2*1000) / 7 = 642.86
      await expect(row).toContainText('Purchasing Avg Price: ₨642.86');
      // Real total spend: (5*500) + (2*1000) = 4500
      await expect(row).toContainText('Purchasing Cost: ₨4,500.00');
    });
  });
});
