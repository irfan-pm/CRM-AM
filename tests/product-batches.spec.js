const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

const KNOWN_PRODUCT = 'Johathan Bauch';
const KNOWN_SUPPLIER = 'Allah Ditta';
const KNOWN_CUSTOMER = 'Co-work';

// These tests assume the admin-portal Costing Method is set to "Average"
// (confirmed with the user 2026-09-14) - Sale requires an explicit manual
// batch pick, which the Sale-related tests below rely on.

// Two shipments for the same product with the SAME purchase price get merged
// into a single logical batch (confirmed live) - a fixed/reused price would
// silently merge into a leftover batch from a previous run instead of
// creating a fresh, independently-trackable one, so every test that needs an
// isolated batch must use a price nothing else has ever used.
let priceCounter = 0;
function uniquePrice() {
  priceCounter += 1;
  return (Date.now() % 800) + 100 + priceCounter;
}

async function openProductDetails(page, productName) {
  await page.goto('/products');
  await page.waitForTimeout(500);
  await page.getByPlaceholder('Search product, code, barcode...').fill(productName);
  await page.waitForTimeout(800);
  const row = page.locator('tbody tr', { hasText: productName }).first();
  await row.locator('[data-testid="MoreVertIcon"]').first().click();
  await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText('Details', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Product Details' })).toBeVisible({ timeout: 10_000 });
}

async function openBatchesTab(page, productName) {
  await openProductDetails(page, productName);
  await page.getByRole('tab', { name: 'Batches' }).click();
  await expect(page.locator('thead', { hasText: 'Batch ID' })).toBeVisible({ timeout: 10_000 });
}

// Batch row for a given batch_no, matched by the visible Batch ID text.
function batchRow(page, batchNo) {
  return page.locator('tbody tr', { hasText: batchNo }).first();
}

async function addShipment(page, { supplier = KNOWN_SUPPLIER, product = KNOWN_PRODUCT, qty, price, title, manufacturerBatchNo, manufacturingDate, expiryDate } = {}) {
  await page.goto('/suppliers');
  await page.getByPlaceholder('Search supplier...').fill(supplier);
  await page.waitForTimeout(500);
  const row = page.locator('tbody tr', { hasText: supplier }).first();
  await row.locator('.table-menu-more-option').click();
  await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText('Details', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Supplier Details' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
  await expect(page.getByRole('heading', { name: 'Add Shipment' })).toBeVisible({ timeout: 10_000 });
  await page.locator('input[name="shipment_title"]').fill(title);
  const productInput = page.getByRole('combobox', { name: 'Product Name' });
  await productInput.click();
  await productInput.fill(product);
  const option = page.getByText(product, { exact: true }).last();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  await page.locator('input[name="quantity"]').fill(String(qty));
  await page.locator('input[name="selling_price_excluding_tax"]').fill(String(price));
  if (manufacturerBatchNo != null) await page.locator('input[name="manufacturer_batch_no"]').fill(manufacturerBatchNo);
  if (manufacturingDate != null) await page.locator('input[name="manufacturing_date"]').fill(manufacturingDate);
  if (expiryDate != null) await page.locator('input[name="expiry_date"]').fill(expiryDate);
  await page.getByRole('button', { name: 'ADD ITEM' }).click();
  await expect(page.getByText('No Item found')).not.toBeVisible();
  await page.getByRole('button', { name: 'SUBMIT' }).click();
  await expect(page).toHaveURL(/\/suppliers/, { timeout: 15_000 });
}

test.describe('Hisab Kitab 360 - Product Details Batches Tab', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe('Positive', () => {
    test('lists every batch for a product that has received shipments', async ({ page }) => {
      await openBatchesTab(page, KNOWN_PRODUCT);
      await expect(page.locator('tbody tr').first()).toBeVisible();
      // Every existing batch for this product was created via a Shipment -
      // none should be missing or show as an empty/placeholder row.
      await expect(page.getByText('No Data Exist')).not.toBeVisible();
    });

    test('each batch row shows Batch ID, Status, Supplier, Purchase Price and Stock Details', async ({ page }) => {
      await openBatchesTab(page, KNOWN_PRODUCT);
      const row = page.locator('tbody tr').first();
      await expect(row.getByText('Available', { exact: true })).toBeVisible();
      await expect(row.getByText(KNOWN_SUPPLIER, { exact: true })).toBeVisible();
      await expect(row.getByText(/Remaining:\s*[\d.]+/)).toBeVisible();
      await expect(row.getByText(/Received value:/)).toBeVisible();
    });

    test('a new shipment adds exactly one new batch row with the entered qty and price', async ({ page }) => {
      await openBatchesTab(page, KNOWN_PRODUCT);
      const countBefore = await page.locator('tbody tr').count();

      const title = `QA_BatchRow_${Date.now()}`;
      const qty = 9;
      const price = uniquePrice();
      await addShipment(page, { qty, price, title });

      await openBatchesTab(page, KNOWN_PRODUCT);
      const row = page.locator('tbody tr', { hasText: title }).first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('tbody tr')).toHaveCount(countBefore + 1, { timeout: 15_000 });
      const priceFormatted = price.toLocaleString('en-US', { minimumFractionDigits: 2 });
      await expect(row.getByText(`₨ ${priceFormatted}`, { exact: false })).toBeVisible();
      const receivedValue = (qty * price).toLocaleString('en-US', { minimumFractionDigits: 2 });
      // On a brand-new batch, Received value and Stock value are numerically
      // identical (nothing sold yet) - .first() picks either matching node.
      await expect(row.getByText(receivedValue, { exact: false }).first()).toBeVisible();
      await expect(row.getByText(`Remaining: ${qty}.00 / ${qty}.00`, { exact: false })).toBeVisible();
    });

    // Manufacturer Batch No., Manufacturing Date and Expiry Date entered at
    // Add Shipment now round-trip correctly and show up in the Batches tab -
    // confirmed fixed 2026-09-15 via network capture (was previously a
    // critical backend bug that silently discarded all three fields:
    // https://trello.com/c/TZTZHhXG).
    test('Mfg Batch, Mfg Date and Expiry entered on a shipment show up correctly', async ({ page }) => {
      const title = `QA_BatchExpiry_${Date.now()}`;
      await addShipment(page, {
        qty: 2,
        price: uniquePrice(),
        title,
        manufacturerBatchNo: 'BN-EXPIRY-TEST',
        manufacturingDate: '2026-01-01',
        expiryDate: '2027-01-01',
      });

      await openBatchesTab(page, KNOWN_PRODUCT);
      const row = page.locator('tbody tr', { hasText: title }).first();
      await expect(row.getByText('BN-EXPIRY-TEST').first()).toBeVisible({ timeout: 10_000 });
      const rowText = await row.innerText();
      expect(rowText).toContain('2026');
      expect(rowText).toContain('2027');
    });

    test('shows a merged-receipts badge for a batch formed from multiple shipments', async ({ page }) => {
      await openBatchesTab(page, KNOWN_PRODUCT);
      // At least one existing batch on this well-exercised product was formed
      // by merging several shipment receipts together - the UI marks it with
      // an "N receipts" badge instead of a plain "Shipment" source tag.
      await expect(page.getByText(/\d+ receipts/).first()).toBeVisible();
    });

    test('a Sale reduces the Remaining quantity of the exact batch it drew from', async ({ page }) => {
      const title = `QA_BatchSale_${Date.now()}`;
      await addShipment(page, { qty: 6, price: uniquePrice(), title });

      await openBatchesTab(page, KNOWN_PRODUCT);
      const row = page.locator('tbody tr', { hasText: title }).first();
      const batchNo = (await row.locator('td').nth(1).innerText()).split('\n')[0].trim();

      await page.goto('/customers');
      await page.getByPlaceholder('Search customer...').fill(KNOWN_CUSTOMER);
      await page.waitForTimeout(500);
      const custRow = page.locator('tbody tr', { hasText: KNOWN_CUSTOMER }).first();
      await custRow.locator('.table-menu-more-option').click();
      await page.getByText('Details', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Customer Details' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await expect(page.getByRole('heading', { name: 'Add Sale' })).toBeVisible({ timeout: 10_000 });

      const productInput = page.getByRole('combobox', { name: 'Product Name' });
      await productInput.click();
      await productInput.fill(KNOWN_PRODUCT);
      const option = page.getByText(KNOWN_PRODUCT, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
      await expect(page.getByText('Select Batch')).toBeVisible({ timeout: 10_000 });
      await page.locator('.batch-select-option', { hasText: batchNo }).click();
      await page.locator('input[name="quantity"]').fill('4');
      await page.getByRole('button', { name: 'ADD ITEM' }).click();
      await expect(page.getByText('No Item found')).not.toBeVisible();
      await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
      await expect(page).toHaveURL(/\/customers/, { timeout: 15_000 });

      await openBatchesTab(page, KNOWN_PRODUCT);
      await expect(batchRow(page, batchNo).getByText('Remaining: 2.00 / 6.00', { exact: false })).toBeVisible({ timeout: 10_000 });
    });

    test('returning sold units restores the Remaining quantity of that same batch', async ({ page }) => {
      const title = `QA_BatchReturn_${Date.now()}`;
      await addShipment(page, { qty: 6, price: uniquePrice(), title });

      await openBatchesTab(page, KNOWN_PRODUCT);
      const row = page.locator('tbody tr', { hasText: title }).first();
      const batchNo = (await row.locator('td').nth(1).innerText()).split('\n')[0].trim();

      await page.goto('/customers');
      await page.getByPlaceholder('Search customer...').fill(KNOWN_CUSTOMER);
      await page.waitForTimeout(500);
      const custRow = page.locator('tbody tr', { hasText: KNOWN_CUSTOMER }).first();
      await custRow.locator('.table-menu-more-option').click();
      await page.getByText('Details', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Customer Details' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await expect(page.getByRole('heading', { name: 'Add Sale' })).toBeVisible({ timeout: 10_000 });

      const productInput = page.getByRole('combobox', { name: 'Product Name' });
      await productInput.click();
      await productInput.fill(KNOWN_PRODUCT);
      const option = page.getByText(KNOWN_PRODUCT, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
      await expect(page.getByText('Select Batch')).toBeVisible({ timeout: 10_000 });
      await page.locator('.batch-select-option', { hasText: batchNo }).click();
      await page.locator('input[name="quantity"]').fill('5');
      await page.getByRole('button', { name: 'ADD ITEM' }).click();
      await expect(page.getByText('No Item found')).not.toBeVisible();
      await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
      await expect(page).toHaveURL(/\/customers/, { timeout: 15_000 });

      await page.getByRole('tab', { name: 'Sales' }).click();
      await page.waitForTimeout(800);
      const saleRow = page.locator('tbody tr').first();
      await saleRow.locator('.table-menu-more-option').click();
      await expect(page.getByText('Manage Return Products', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Manage Return Products', { exact: true }).click();
      await expect(page.getByRole('button', { name: 'PROCESS RETURNS' })).toBeVisible({ timeout: 10_000 });
      await page.locator('input[type="checkbox"]').nth(1).check();
      await page.locator('input[type="number"]').fill('3');
      await page.getByRole('button', { name: 'PROCESS RETURNS' }).click();
      await expect(page.getByText('Sale return processed successfully')).toBeVisible({ timeout: 10_000 });

      // Sold 5 of 6 (Remaining 1), returned 3 of those 5 -> Remaining 4.
      await openBatchesTab(page, KNOWN_PRODUCT);
      await expect(batchRow(page, batchNo).getByText('Remaining: 4.00 / 6.00', { exact: false })).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Negative', () => {
    test('shows "No Data Exist" for a product that has never received a shipment', async ({ page }) => {
      const name = `QA_NoBatchProduct_${Date.now()}`;
      await page.goto('/products');
      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await expect(page.getByRole('heading', { name: 'Add Product' })).toBeVisible({ timeout: 10_000 });
      await page.locator('input[name="product_name"]').fill(name);
      await page.locator('input[name="incl_tax"]').fill('150');
      await page.getByRole('button', { name: 'SUBMIT' }).click();
      await expect(page.getByText('Product added successfully')).toBeVisible({ timeout: 10_000 });

      await openBatchesTab(page, name);
      // The empty state itself renders as a single <tr><td>No Data Exist</td></tr>,
      // so the real assertion is the message text, not a literal row count of 0.
      await expect(page.getByText('No Data Exist')).toBeVisible({ timeout: 10_000 });
    });
  });
});
