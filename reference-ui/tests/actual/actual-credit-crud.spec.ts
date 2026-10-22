import { expect, test } from "@playwright/test";
import { actualCrudEnabled, actualFixture, actualShell, actualMutation, actualId, actualOwner, approvedSupplier } from "./actual-crud-helpers";
test.skip(!actualCrudEnabled, "Opt-in actual private CRUD fixture/socket required");
// All /api responses and transitions are actual. No Playwright business-response mocks.
test("actual invoice-linked credit create, exact edit and cancellation retain owner evidence", async ({ page }) => {
  await actualShell(page); const prefix = `BROWSER-CREDIT-${Date.now()}`;
  await page.goto("/procurement/workspace/bills/new"); const supplier = await approvedSupplier(page);
  await page.getByRole("combobox", { name: "Vendor", exact: true }).click(); await page.getByRole("option", { name: supplier.displayName, exact: true }).click();
  await page.getByLabel("Invoice number", { exact: true }).fill(`${prefix}-BILL`); await page.getByLabel("Description 1", { exact: true }).fill("Actual credit source invoice"); await page.getByLabel("Unit price", { exact: true }).fill("100");
  const bill = await actualMutation(page, "POST", "/invoices", () => page.getByRole("button", { name: "Record as received", exact: true }).click()); const invoiceId = actualId(bill);
  await expect(page.getByRole("heading", { name: `Invoice ${prefix}-BILL`, exact: true })).toBeVisible(); await page.reload(); expect(actualOwner("invoice", invoiceId).gross_amount).toBe(100);
  await page.goto("/procurement/workspace/vendor-credits/new"); await page.getByRole("combobox", { name: "Source bill", exact: true }).click();
  await page.getByRole("option", { name: `${prefix}-BILL · ${supplier.displayName}`, exact: true }).click();
  await expect(page.getByText(`Vendor: ${supplier.displayName}`, { exact: false })).toBeVisible();
  await page.getByLabel("Vendor Credit #", { exact: true }).fill(prefix); await page.getByLabel("Credit amount", { exact: true }).fill("1.2345"); await page.getByLabel("Credit reason", { exact: true }).fill("Actual supplier price correction");
  const credit = await actualMutation(page, "POST", "/vendor-credits", () => page.getByRole("button", { name: "Save as Draft", exact: true }).click()); const id = actualId(credit);
  expect(credit.supplierInvoiceId).toBe(invoiceId); expect(credit.supplierId).toBe(actualFixture().approvedSupplierId); expect(credit.currencyCode).toBe("ZMW"); expect(credit.exactAmount).toBe("1.2345");
  await expect(page.getByRole("heading", { name: prefix, exact: true })).toBeVisible(); await page.reload(); await expect(page.getByText("ZMW 1.2345", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit draft", exact: true }).click(); await expect(page.getByRole("combobox", { name: "Source bill", exact: true })).toBeDisabled();
  await page.getByLabel("Credit amount", { exact: true }).fill("2.3456"); await page.getByLabel("Reason for change", { exact: true }).fill("Correct supplier credit amount");
  const revised = await actualMutation(page, "PUT", `/vendor-credits/${id}`, () => page.getByRole("button", { name: "Save as Draft", exact: true }).click()); expect(revised.exactAmount).toBe("2.3456"); expect(revised.supplierInvoiceId).toBe(invoiceId);
  await expect(page.getByText("ZMW 2.3456", { exact: true })).toBeVisible(); await page.reload(); const editedOwner = actualOwner("credit", id); expect(editedOwner.amount).toBe(2.3456); expect(editedOwner.supplier_invoice_id).toBe(invoiceId);
  await page.getByLabel("Cancellation reason", { exact: true }).fill("Actual documentary draft withdrawn"); page.once("dialog", dialog => dialog.accept());
  await actualMutation(page, "POST", `/vendor-credits/${id}/cancel`, () => page.getByRole("button", { name: "Cancel draft", exact: true }).click()); await expect(page.getByText("Cancelled", { exact: true })).toBeVisible(); await page.reload();
  const retained = actualOwner("credit", id); expect(retained.status).toBe("Cancelled"); expect(retained.amount).toBe(2.3456); expect(retained.finance_credit_ref).toBeNull(); expect(retained.supplier_return_id).toBeNull();
  const original = actualOwner("invoice", invoiceId); expect(original.gross_amount).toBe(100); expect(original.status).toBe("Received");
});
