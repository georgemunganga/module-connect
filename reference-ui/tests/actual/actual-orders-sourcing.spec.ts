import { expect, test } from "@playwright/test";
import { actualCrudEnabled, actualShell, actualMutation, actualId, actualOwner, approvedSupplier, actualOrderTotalIsTwelve } from "./actual-crud-helpers";
test.skip(!actualCrudEnabled, "Opt-in actual private CRUD fixture/socket required");
// Legacy internal drafts only. No sourcing dispatch, bids, demand allocation, approval or issued PO claim.
test("actual internal RFQ draft create, edit and cancel preserve the retained source", async ({ page }) => {
  await actualShell(page); const title = `BROWSER-RFQ-${Date.now()}`;
  await page.goto("/procurement/workspace/rfqs/new"); await page.getByLabel("What are you buying?", { exact: true }).fill(title); await page.getByLabel("Item or service 1", { exact: true }).fill("Actual draft quoted supply"); await page.getByLabel("Quantity", { exact: true }).fill("2");
  const created = await actualMutation(page, "POST", "/sourcing", () => page.getByRole("button", { name: "Save draft", exact: true }).click()); const id = actualId(created);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible(); await page.reload(); await page.getByRole("link", { name: "Edit draft", exact: true }).click(); await page.getByLabel("Quantity", { exact: true }).fill("3");
  await actualMutation(page, "PUT", `/sourcing/${id}`, () => page.getByRole("button", { name: "Save draft", exact: true }).click()); await expect(page.getByRole("cell", { name: "3", exact: true })).toBeVisible(); await page.reload();
  await page.getByLabel("Reason", { exact: true }).fill("Actual internal quote draft withdrawn"); await actualMutation(page, "POST", `/sourcing/${id}/cancel`, () => page.getByRole("button", { name: "Cancel draft", exact: true }).click());
  const retained = actualOwner("rfq", id); expect(retained.status).toBe("Cancelled"); expect(retained.title).toBe(title);
});

test("actual internal PO draft create, edit and cancel retain amounts without issuance", async ({ page }) => {
  await actualShell(page); await page.goto("/procurement/workspace/purchase-orders/new"); const supplier = await approvedSupplier(page);
  await page.getByRole("combobox", { name: "Vendor", exact: true }).click(); await page.getByRole("option", { name: supplier.displayName, exact: true }).click(); await page.getByLabel("Description 1", { exact: true }).fill("Actual internal PO draft supplies"); await page.getByLabel("Unit price", { exact: true }).fill("10");
  const created = await actualMutation(page, "POST", "/orders", () => page.getByRole("button", { name: "Save draft", exact: true }).click()); const id = actualId(created);
  await expect(page.getByRole("button", { name: "Edit draft", exact: true })).toBeVisible(); await page.reload(); await page.getByRole("button", { name: "Edit draft", exact: true }).click(); await page.getByLabel("Unit price", { exact: true }).fill("12");
  await actualMutation(page, "PUT", `/orders/${id}`, () => page.getByRole("button", { name: "Save draft", exact: true }).click()); await expect(page.getByRole("button", { name: "Edit draft", exact: true })).toBeVisible(); await page.reload();
  actualOrderTotalIsTwelve(id);
  await page.getByLabel("Cancellation reason", { exact: true }).fill("Actual internal PO draft withdrawn"); await actualMutation(page, "POST", `/orders/${id}/cancel`, () => page.getByRole("button", { name: "Cancel draft", exact: true }).click());
  await expect(page.getByRole("button", { name: "Edit draft", exact: true })).toHaveCount(0); await page.reload(); expect(actualOwner("order", id).status).toBe("Cancelled");
});
