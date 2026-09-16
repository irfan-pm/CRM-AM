const { test, expect } = require('@playwright/test');
const { login } = require('./utils/auth');

// New feature (2026-09-16): a product's Measurement Group defines named units
// (e.g. Picese | Box | Carton, no conversion factors of their own). The
// PRODUCT itself then picks one of those as its Base/stock unit, and via its
// 3-dot "Pack Units" menu can define the other units as "packs" - each
// relative to the base unit OR to another already-defined pack - with a
// quantity that yields a computed base-unit equivalent. That hierarchy then
// drives an "Add Pack" / "+ Pack" button that appears throughout Shipment,
// Sale (POS Invoicing) and Return screens: entering a quantity in any pack
// unit there auto-computes the real line quantity in base units.
//
// This suite uses the pre-existing "Measurement Unit" group (Picese | Box |
// Carton, confirmed live via Products > Measurement Units) and builds:
//   Base unit = Picese
//   1 Box    = 12 Picese  (relative to base)
//   1 Carton = 10 Box     (relative to Box)  = 120 Picese
//
// The dedicated test product uses a FIXED (non-timestamped) name and every
// test looks it up / (re)creates it idempotently, rather than relying on a
// shared JS variable set by an earlier test - a prior failing test in this
// suite was observed to lose shared module state for the tests after it.
// This keeps every test independently runnable (e.g. via `-g`) in any order.

const KNOWN_SUPPLIER = 'Allah Ditta';
const KNOWN_CUSTOMER = 'Co-work';
const MEASUREMENT_GROUP = 'Measurement Unit';
const BASE_UNIT = 'Picese';
const BOX_QTY_PER_BASE = 12;
const CARTON_QTY_PER_BOX = 10;
const CARTON_QTY_PER_BASE = BOX_QTY_PER_BASE * CARTON_QTY_PER_BOX; // 120
const PACK_PRODUCT_NAME = 'QA_PackUnit_Fixture';

async function productExists(page, productName) {
  await page.goto('/products');
  await page.getByPlaceholder('Search product, code, barcode...').fill(productName);
  await page.waitForTimeout(1_200);
  return (await page.locator('tbody tr', { hasText: productName }).count()) > 0;
}

// Ensures PACK_PRODUCT_NAME exists with Measurement Group + Base Unit set,
// and its Pack Units (Box, Carton) configured - creating/configuring
// whatever is missing so any test can call this and rely on the fixture
// being fully ready, regardless of what earlier tests did.
async function ensurePackProductReady(page) {
  const exists = await productExists(page, PACK_PRODUCT_NAME);
  if (!exists) {
    await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
    await expect(page.getByRole('heading', { name: 'Add Product' })).toBeVisible({ timeout: 10_000 });
    await page.locator('input[name="product_name"]').fill(PACK_PRODUCT_NAME);
    await page.locator('input[name="incl_tax"]').fill('100');
    await page.getByRole('combobox', { name: 'Measurement Group' }).click();
    await page.getByText(MEASUREMENT_GROUP, { exact: true }).click();
    await page.getByRole('combobox', { name: 'Unit' }).click();
    await page.getByText(BASE_UNIT, { exact: true }).click();
    await page.getByRole('button', { name: 'SUBMIT' }).click();
    // Tolerate a duplicate-name rejection (the fixture may already exist but
    // was missed by the productExists() check due to search/render timing) -
    // either outcome leaves the product present, which is all this needs.
    await Promise.race([
      page.getByText('Product added successfully').waitFor({ state: 'visible', timeout: 10_000 }),
      page.getByRole('heading', { name: 'Add Product' }).waitFor({ state: 'hidden', timeout: 10_000 }),
    ]).catch(() => {});
  }

  await openProductPackUnits(page, PACK_PRODUCT_NAME);
  await page.waitForTimeout(500);
  const hasBox = await page.getByText('1 Box = ', { exact: false }).isVisible().catch(() => false);
  if (!hasBox) {
    await page.getByRole('button', { name: '+ ADD PACK UNIT' }).click();
    await page.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: 'Box', exact: true }).click();
    await page.locator('input[type="number"]').first().fill(String(BOX_QTY_PER_BASE));
  }
  const hasCarton = await page.getByText('1 Carton = ', { exact: false }).isVisible().catch(() => false);
  if (!hasCarton) {
    await page.getByRole('button', { name: '+ ADD PACK UNIT' }).click();
    await page.getByRole('combobox').nth(2).click();
    await page.getByRole('option', { name: 'Carton', exact: true }).click();
    await page.getByRole('combobox').nth(3).click();
    await page.getByRole('option', { name: 'Box', exact: true }).click();
    await page.locator('input[type="number"]').nth(1).fill(String(CARTON_QTY_PER_BOX));
  }
  if (!hasBox || !hasCarton) {
    await page.getByRole('button', { name: 'SAVE' }).click();
    await expect(page.getByText('Pack units updated successfully')).toBeVisible({ timeout: 10_000 });
  } else {
    await page.getByRole('button', { name: 'CANCEL' }).click();
  }
}

// Deletes one row from the product-level Pack Units table (a real <table>
// with an aria-label="Remove pack unit" icon button per row) by the pack
// unit's own name, e.g. "Box" or "Carton".
async function deletePackUnitRow(dialog, page, unitName) {
  const row = dialog.locator('tbody tr').filter({ has: page.locator(`input[value="${unitName}"]`) });
  await row.getByRole('button', { name: 'Remove pack unit' }).click();
}

async function openProductPackUnits(page, productName) {
  await page.goto('/products');
  await page.getByPlaceholder('Search product, code, barcode...').fill(productName);
  await page.waitForTimeout(600);
  const row = page.locator('tbody tr', { hasText: productName }).first();
  await row.locator('[data-testid="MoreVertIcon"]').first().click();
  await expect(page.getByText('Pack Units', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText('Pack Units', { exact: true }).click();
  await expect(page.getByText(`Pack Units — ${productName}`)).toBeVisible({ timeout: 10_000 });
}

async function addShipmentForProduct(page, { product, title, qty, price }) {
  await page.goto('/suppliers');
  await page.getByPlaceholder('Search supplier...').fill(KNOWN_SUPPLIER);
  await page.waitForTimeout(500);
  const row = page.locator('tbody tr', { hasText: KNOWN_SUPPLIER }).first();
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
  await page.getByRole('button', { name: 'ADD ITEM' }).click();
  await expect(page.getByText('No Item found')).not.toBeVisible();
  await page.getByRole('button', { name: 'SUBMIT' }).click();
  await expect(page).toHaveURL(/\/suppliers/, { timeout: 15_000 });
}

// Gives the fixture product fresh stock and completes a disposable sale for
// it, landing on the Manage Return Products screen for that sale - used by
// every Return-related test so each one is fully self-contained.
async function createSaleAndOpenReturn(page, { qty = 100, price = 5 } = {}) {
  await addShipmentForProduct(page, {
    product: PACK_PRODUCT_NAME,
    title: `QA_PackReturnStock_${Date.now()}`,
    qty: 500,
    price,
  });

  await page.goto('/customers');
  await page.getByPlaceholder('Search customer...').fill(KNOWN_CUSTOMER);
  await page.waitForTimeout(500);
  const custRow = page.locator('tbody tr', { hasText: KNOWN_CUSTOMER }).first();
  await custRow.locator('.table-menu-more-option').click();
  await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText('Details', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Customer Details' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
  await expect(page.getByRole('heading', { name: 'Add Sale' })).toBeVisible({ timeout: 10_000 });
  const productInput = page.getByRole('combobox', { name: 'Product Name' });
  await productInput.click();
  await productInput.fill(PACK_PRODUCT_NAME);
  const option = page.getByText(PACK_PRODUCT_NAME, { exact: true }).last();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
  await page.locator('input[name="quantity"]').fill(String(qty));
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
}

test.describe('Hisab Kitab 360 - Pack Units (base-unit conversion)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.describe('Positive', () => {
    test('assigns a Measurement Group and Base Unit to a new product', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

      await page.goto('/products');
      await page.getByPlaceholder('Search product, code, barcode...').fill(PACK_PRODUCT_NAME);
      await page.waitForTimeout(600);
      const row = page.locator('tbody tr', { hasText: PACK_PRODUCT_NAME }).first();
      await expect(row.getByText(MEASUREMENT_GROUP, { exact: true })).toBeVisible();
      await expect(row.getByText(BASE_UNIT, { exact: true })).toBeVisible();
    });

    test('configures a pack unit relative to the base unit', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

      await openProductPackUnits(page, PACK_PRODUCT_NAME);
      await expect(page.getByText('Base / stock unit:')).toContainText(BASE_UNIT);
      await expect(page.getByText(`1 Box = ${BOX_QTY_PER_BASE} Picese`)).toBeVisible();
      await expect(page.getByText(`×${BOX_QTY_PER_BASE} Picese`).first()).toBeVisible();
    });

    test('configures a second pack unit relative to another pack unit, compounding the base equivalent', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

      await openProductPackUnits(page, PACK_PRODUCT_NAME);
      await expect(page.getByText(`1 Carton = ${CARTON_QTY_PER_BOX} Box`)).toBeVisible();
      // Compounded through Box (×12): 10 * 12 = 120 Picese.
      await expect(page.getByText(`×${CARTON_QTY_PER_BASE} Picese`)).toBeVisible();
    });

    test('Shipment "Add Pack" converts a Box quantity to the correct base-unit total', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

      await page.goto('/suppliers');
      await page.getByPlaceholder('Search supplier...').fill(KNOWN_SUPPLIER);
      await page.waitForTimeout(500);
      const row = page.locator('tbody tr', { hasText: KNOWN_SUPPLIER }).first();
      await row.locator('.table-menu-more-option').click();
      await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Details', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Supplier Details' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
      await expect(page.getByRole('heading', { name: 'Add Shipment' })).toBeVisible({ timeout: 10_000 });

      const productInput = page.getByRole('combobox', { name: 'Product Name' });
      await productInput.click();
      await productInput.fill(PACK_PRODUCT_NAME);
      const option = page.getByText(PACK_PRODUCT_NAME, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();

      await expect(page.getByText('Add Pack', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Add Pack', { exact: true }).click();
      const dialog = page.locator('[role="dialog"]', { hasText: 'Pack Units' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByRole('combobox', { name: 'Unit' }).click();
      await page.getByText(`Box (×${BOX_QTY_PER_BASE})`, { exact: true }).click();
      await dialog.locator('input[type="number"]').fill('40');
      await dialog.getByRole('button', { name: 'DONE' }).click();

      await expect(page.locator('input[name="quantity"]')).toHaveValue(String(40 * BOX_QTY_PER_BASE));
      await expect(page.getByText('Edit Pack', { exact: true })).toBeVisible();
    });

    test('Sale "Add Pack" converts a Carton quantity to the correct base-unit total and recalculates Net Amount', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

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
      await productInput.click();
      await productInput.fill(PACK_PRODUCT_NAME);
      const option = page.getByText(PACK_PRODUCT_NAME, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();

      await expect(page.getByText('Add Pack', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Add Pack', { exact: true }).click();
      const dialog = page.locator('[role="dialog"]', { hasText: 'Pack Units' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByRole('combobox', { name: 'Unit' }).click();
      await page.getByText(`Carton (×${CARTON_QTY_PER_BASE})`, { exact: true }).click();
      await dialog.locator('input[type="number"]').fill('3');
      await dialog.getByRole('button', { name: 'DONE' }).click();

      const expectedQty = 3 * CARTON_QTY_PER_BASE; // 360
      await expect(page.locator('input[name="quantity"]')).toHaveValue(String(expectedQty));
      // Rate defaults to the product's own Sale Price (100/Picese) since no
      // batch/price override was applied - Net Amount = Qty * Rate.
      await expect(page.getByRole('spinbutton', { name: 'Net Amount' })).toHaveValue(`${expectedQty * 100}.00`);
    });

    test('Return "+ Pack" converts a Box quantity to the correct Return Qty and Return Value', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);
      await createSaleAndOpenReturn(page, { qty: 100, price: 5 });

      await page.locator('input[type="checkbox"]').nth(1).check();
      await page.getByText('+ Pack', { exact: true }).click();
      const dialog = page.locator('[role="dialog"]', { hasText: 'Pack' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByRole('combobox', { name: 'Unit' }).click();
      await page.getByText(`Box (×${BOX_QTY_PER_BASE})`, { exact: true }).click();
      await dialog.locator('input[type="number"]').fill('2');
      await dialog.getByRole('button', { name: 'DONE' }).click();

      const expectedReturnQty = 2 * BOX_QTY_PER_BASE; // 24
      const row = page.locator('tbody tr', { hasText: PACK_PRODUCT_NAME }).first();
      await expect(row.locator('input[type="number"]')).toHaveValue(String(expectedReturnQty));
      // Return Value uses the product's own Sale Price (100/Picese), not the
      // Shipment cost passed above - same default-rate behavior confirmed in
      // the Sale "Add Pack" test. The "₨" symbol and number are separate
      // sibling spans, not one text node, so match the formatted number directly.
      const expectedReturnValue = (expectedReturnQty * 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
      await expect(row).toContainText(expectedReturnValue);
    });

    test('Sale "Add Pack" mix mode combines multiple units into one base-unit total', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

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
      await productInput.click();
      await productInput.fill(PACK_PRODUCT_NAME);
      const option = page.getByText(PACK_PRODUCT_NAME, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();

      await expect(page.getByText('Add Pack', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Add Pack', { exact: true }).click();
      const dialog = page.locator('[role="dialog"]', { hasText: 'Pack Units' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      const firstRow = dialog.locator('.shipment-pack-lines-modal__row').first();
      await firstRow.getByRole('combobox').click();
      await page.getByText(`Carton (×${CARTON_QTY_PER_BASE})`, { exact: true }).click();
      await firstRow.locator('input[type="number"]').fill('1');

      await dialog.getByRole('button', { name: 'Add line' }).click();
      const secondRow = dialog.locator('.shipment-pack-lines-modal__row').nth(1);
      await secondRow.getByRole('combobox').click();
      await page.getByText(`Box (×${BOX_QTY_PER_BASE})`, { exact: true }).click();
      await secondRow.locator('input[type="number"]').fill('2');

      await dialog.getByRole('button', { name: 'DONE' }).click();

      const expectedQty = 1 * CARTON_QTY_PER_BASE + 2 * BOX_QTY_PER_BASE; // 144
      await expect(page.locator('input[name="quantity"]')).toHaveValue(String(expectedQty));
    });

    test('Sale "Add Pack" mix mode recalculates the total after removing one line', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

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
      await productInput.click();
      await productInput.fill(PACK_PRODUCT_NAME);
      const option = page.getByText(PACK_PRODUCT_NAME, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();

      await expect(page.getByText('Add Pack', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Add Pack', { exact: true }).click();
      const dialog = page.locator('[role="dialog"]', { hasText: 'Pack Units' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      const firstRow = dialog.locator('.shipment-pack-lines-modal__row').first();
      await firstRow.getByRole('combobox').click();
      await page.getByText(`Carton (×${CARTON_QTY_PER_BASE})`, { exact: true }).click();
      await firstRow.locator('input[type="number"]').fill('1');

      await dialog.getByRole('button', { name: 'Add line' }).click();
      const secondRow = dialog.locator('.shipment-pack-lines-modal__row').nth(1);
      await secondRow.getByRole('combobox').click();
      await page.getByText(`Box (×${BOX_QTY_PER_BASE})`, { exact: true }).click();
      await secondRow.locator('input[type="number"]').fill('2');

      // Remove the Box line before confirming - only the Carton line should count.
      await secondRow.getByRole('button', { name: 'Remove line' }).click();
      await dialog.getByRole('button', { name: 'DONE' }).click();

      await expect(page.locator('input[name="quantity"]')).toHaveValue(String(CARTON_QTY_PER_BASE));
    });

    test('Edit Shipment "Add Pack" converts a Box quantity for a newly added line and saves', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

      // Any existing shipment works - Edit Shipment only allows ADDING a new
      // line (existing lines are read-only there), so we exercise Add Pack
      // through that new-line entry form.
      await page.goto('/suppliers');
      await page.getByPlaceholder('Search supplier...').fill(KNOWN_SUPPLIER);
      await page.waitForTimeout(500);
      const supRow = page.locator('tbody tr', { hasText: KNOWN_SUPPLIER }).first();
      await supRow.locator('.table-menu-more-option').click();
      await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Details', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Supplier Details' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('tab', { name: 'Shipment' }).click();
      await page.waitForTimeout(500);
      const shipRow = page.locator('tbody tr').first();
      await shipRow.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Edit Shipment' })).toBeVisible({ timeout: 10_000 });

      const productInput = page.getByRole('combobox', { name: 'Product Name' });
      await productInput.click();
      await productInput.fill(PACK_PRODUCT_NAME);
      const option = page.getByText(PACK_PRODUCT_NAME, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
      await expect(page.locator('input[name="quantity"]')).toBeEnabled({ timeout: 10_000 });

      await expect(page.getByText('Add Pack', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Add Pack', { exact: true }).click();
      const dialog = page.locator('[role="dialog"]', { hasText: 'Pack Units' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByRole('combobox', { name: 'Unit' }).click();
      await page.getByText(`Box (×${BOX_QTY_PER_BASE})`, { exact: true }).click();
      await dialog.locator('input[type="number"]').fill('3');
      await dialog.getByRole('button', { name: 'DONE' }).click();

      const expectedQty = 3 * BOX_QTY_PER_BASE; // 36
      await expect(page.locator('input[name="quantity"]')).toHaveValue(String(expectedQty));

      await page.locator('input[name="selling_price_excluding_tax"]').fill('50');
      await page.getByRole('button', { name: 'ADD ITEM' }).click();
      await expect(page.getByText('No Item found')).not.toBeVisible();
      await page.getByRole('button', { name: 'UPDATE' }).click();
      await expect(page).toHaveURL(/\/suppliers/, { timeout: 15_000 });
    });

    test('Edit Sale offers "Add Pack" for a newly added line', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

      // Same read-only-existing-line pattern as Edit Shipment - Edit Sale only
      // supports ADDING a new line, so Add Pack is exercised there.
      await page.goto('/customers');
      await page.getByPlaceholder('Search customer...').fill(KNOWN_CUSTOMER);
      await page.waitForTimeout(500);
      const custRow = page.locator('tbody tr', { hasText: KNOWN_CUSTOMER }).first();
      await custRow.locator('.table-menu-more-option').click();
      await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Details', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Customer Details' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('tab', { name: 'Sales' }).click();
      await page.waitForTimeout(500);
      const saleRow = page.locator('tbody tr').first();
      await saleRow.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Edit Sale' })).toBeVisible({ timeout: 10_000 });

      const productInput = page.getByRole('combobox', { name: 'Product Name' });
      await productInput.click();
      await productInput.fill(PACK_PRODUCT_NAME);
      const option = page.getByText(PACK_PRODUCT_NAME, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
      await expect(page.locator('input[name="quantity"]')).toBeEnabled({ timeout: 10_000 });

      await expect(page.getByText('Add Pack', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Add Pack', { exact: true }).click();
      const dialog = page.locator('[role="dialog"]', { hasText: 'Pack Units' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByRole('combobox', { name: 'Unit' }).click();
      await page.getByText(`Carton (×${CARTON_QTY_PER_BASE})`, { exact: true }).click();
      await dialog.locator('input[type="number"]').fill('1');
      await dialog.getByRole('button', { name: 'DONE' }).click();

      await expect(page.locator('input[name="quantity"]')).toHaveValue(String(CARTON_QTY_PER_BASE));
    });
  });

  test.describe('Negative', () => {
    test('cannot configure Pack Units for a product with no base unit', async ({ page }) => {
      const name = `QA_NoBaseUnit_${Date.now()}`;
      await page.goto('/products');
      await page.getByRole('button', { name: 'ADD PRODUCT' }).click();
      await expect(page.getByRole('heading', { name: 'Add Product' })).toBeVisible({ timeout: 10_000 });
      await page.locator('input[name="product_name"]').fill(name);
      await page.locator('input[name="incl_tax"]').fill('50');
      await page.getByRole('button', { name: 'SUBMIT' }).click();
      await expect(page.getByText('Product added successfully')).toBeVisible({ timeout: 10_000 });

      await openProductPackUnits(page, name);
      await expect(page.getByText('Product has no base unit')).toBeVisible();
      await expect(page.getByRole('button', { name: '+ ADD PACK UNIT' })).toBeDisabled();
    });

    test('Return "+ Pack" stays disabled until the product row is selected', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);
      await createSaleAndOpenReturn(page, { qty: 50, price: 5 });

      await expect(page.getByText('+ Pack', { exact: true })).toBeDisabled();
    });

    test('Return "+ Pack" quantity is clamped to the sale\'s order quantity, preventing an over-return', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);
      await createSaleAndOpenReturn(page, { qty: 50, price: 5 });

      const row = page.locator('tbody tr', { hasText: PACK_PRODUCT_NAME }).first();
      const orderQty = Number((await row.locator('td').nth(2).innerText()).trim());
      await page.locator('input[type="checkbox"]').nth(1).check();
      await page.getByText('+ Pack', { exact: true }).click();
      const dialog = page.locator('[role="dialog"]', { hasText: 'Pack' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.getByRole('combobox', { name: 'Unit' }).click();
      await page.getByText(`Box (×${BOX_QTY_PER_BASE})`, { exact: true }).click();
      // 20 boxes = 240 base units, deliberately far beyond the order quantity.
      await dialog.locator('input[type="number"]').fill('20');
      await dialog.getByRole('button', { name: 'DONE' }).click();

      await expect(row.locator('input[type="number"]')).toHaveValue(String(orderQty));
    });

    // [KNOWN BUG] Deleting a Pack Unit that another pack depends on ("relative
    // to" it) does not block the deletion or recompute the dependent pack -
    // it silently re-points the dependent's "Relative To" at the base unit
    // while KEEPING its old raw quantity number, corrupting its true value by
    // the deleted unit's own multiplier (here Carton's real ×120 becomes
    // ×10 once Box, its ×12 dependency, is removed). Filed as a critical bug;
    // this test documents the actual (buggy) behavior and then repairs the
    // shared QA_PackUnit_Fixture back to its correct hierarchy so every other
    // test in this suite keeps running against a valid Box/Carton chain.
    test('[KNOWN BUG] deleting a Pack Unit silently corrupts a pack that depends on it', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);
      await openProductPackUnits(page, PACK_PRODUCT_NAME);
      const dialog = page.locator('[role="dialog"]', { hasText: 'Pack Units' });

      await expect(page.getByText(`×${CARTON_QTY_PER_BASE} Picese`)).toBeVisible();

      await deletePackUnitRow(dialog, page, 'Box');

      const cartonRow = dialog.locator('tbody tr').filter({ has: page.locator('input[value="Carton"]') });
      await expect(cartonRow.locator('.pack-units-modal__hint')).toHaveText(`1 Carton = ${CARTON_QTY_PER_BOX} Picese`);
      await expect(cartonRow.locator('.pack-units-modal__eq')).toHaveText(`×${CARTON_QTY_PER_BOX} Picese`);

      // Repair the fixture: drop the now-corrupted Carton row and rebuild
      // Box + Carton from scratch using the same sequence ensurePackProductReady
      // uses, so later tests see a correct ×120 Picese Carton again.
      await deletePackUnitRow(dialog, page, 'Carton');
      await page.getByRole('button', { name: '+ ADD PACK UNIT' }).click();
      await page.getByRole('combobox').nth(0).click();
      await page.getByRole('option', { name: 'Box', exact: true }).click();
      await page.locator('input[type="number"]').first().fill(String(BOX_QTY_PER_BASE));
      await page.getByRole('button', { name: '+ ADD PACK UNIT' }).click();
      await page.getByRole('combobox').nth(2).click();
      await page.getByRole('option', { name: 'Carton', exact: true }).click();
      await page.getByRole('combobox').nth(3).click();
      await page.getByRole('option', { name: 'Box', exact: true }).click();
      await page.locator('input[type="number"]').nth(1).fill(String(CARTON_QTY_PER_BOX));
      await page.getByRole('button', { name: 'SAVE' }).click();
      await expect(page.getByText('Pack units updated successfully')).toBeVisible({ timeout: 10_000 });
    });

    // Not necessarily a bug (may be intentional live-binding), but confirmed
    // surprising to a non-technical user: the dialog's only affordances are
    // "CLEAR" and "DONE" plus an × icon in the header - there is no distinct
    // "Cancel". Closing via that × icon does NOT discard a pending pack line;
    // whatever was last entered is still applied to the main Qty field, same
    // as clicking DONE would have done.
    test('closing "Add Pack" via the × icon does not discard the entered pack line', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

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
      await productInput.click();
      await productInput.fill(PACK_PRODUCT_NAME);
      const option = page.getByText(PACK_PRODUCT_NAME, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();

      await expect(page.getByText('Add Pack', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Add Pack', { exact: true }).click();
      const dialog = page.locator('[role="dialog"]', { hasText: 'Pack Units' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });

      const firstRow = dialog.locator('.shipment-pack-lines-modal__row').first();
      await firstRow.getByRole('combobox').click();
      await page.getByText(`Box (×${BOX_QTY_PER_BASE})`, { exact: true }).click();
      await firstRow.locator('input[type="number"]').fill('5');
      await dialog.getByRole('button', { name: 'Close' }).click();

      const expectedQty = 5 * BOX_QTY_PER_BASE; // 60
      await expect(page.locator('input[name="quantity"]')).toHaveValue(String(expectedQty));
      await expect(page.getByText('Edit Pack', { exact: true })).toBeVisible();
    });

    // Edit Shipment already shows existing line items read-only (confirmed in
    // supplier-shipments.spec.js); Edit Sale follows the same pattern - an
    // already-saved line has no per-line controls at all, Pack included, so
    // there is no way to view or change its pack breakdown after the fact.
    test('Edit Sale\'s existing line item has no Add Pack / Edit Pack control', async ({ page }) => {
      await page.goto('/products');
      await ensurePackProductReady(page);

      await page.goto('/customers');
      await page.getByPlaceholder('Search customer...').fill(KNOWN_CUSTOMER);
      await page.waitForTimeout(500);
      const custRow = page.locator('tbody tr', { hasText: KNOWN_CUSTOMER }).first();
      await custRow.locator('.table-menu-more-option').click();
      await expect(page.getByText('Details', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Details', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Customer Details' })).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: 'ADD NEW SALE' }).click();
      await expect(page.getByRole('heading', { name: 'Add Sale' })).toBeVisible({ timeout: 10_000 });

      const productInput = page.getByRole('combobox', { name: 'Product Name' });
      await productInput.click();
      await productInput.fill(PACK_PRODUCT_NAME);
      const option = page.getByText(PACK_PRODUCT_NAME, { exact: true }).last();
      await expect(option).toBeVisible({ timeout: 15_000 });
      await option.click();
      await page.locator('input[name="quantity"]').fill('10');
      await page.getByRole('button', { name: 'ADD ITEM' }).click();
      await expect(page.getByText('No Item found')).not.toBeVisible();
      await page.getByRole('button', { name: 'SAVE & EXIT' }).click();
      await expect(page).toHaveURL(/\/customers/, { timeout: 15_000 });

      await page.getByRole('tab', { name: 'Sales' }).click();
      await page.waitForTimeout(800);
      const saleRow = page.locator('tbody tr').first();
      await saleRow.locator('.table-menu-more-option').click();
      await expect(page.getByText('Edit', { exact: true })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Edit', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Edit Sale' })).toBeVisible({ timeout: 10_000 });

      await expect(page.getByText('Add Pack', { exact: true })).not.toBeVisible();
      await expect(page.getByText('Edit Pack', { exact: true })).not.toBeVisible();
    });
  });
});
