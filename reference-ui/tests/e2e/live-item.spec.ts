import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const itemId = "66666666-6666-4666-8666-666666666666";
const priceId = "77777777-7777-4777-8777-777777777777";
const vendorId = "88888888-8888-4888-8888-888888888888";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "itemDraft"]));
type Item = Record<string, unknown> & { id: string; version: number; name: string; status: string };

async function mockErp(page: Page, options: { denyList?: boolean; staleUpdate?: boolean; activeItem?: boolean; canApprove?: boolean } = {}) {
  let item: Item | null = options.activeItem ? {
    id: itemId, code: "LAPTOP", name: "Business laptop", kind: "Goods", categoryCode: "IT",
    unitCode: "each", status: "Active", isPurchasable: true, isStockItem: false,
    isAsset: true, inspectionRequired: true, version: 1,
  } : null;
  let price: Record<string, unknown> | null = null;
  await page.addInitScript((entityId) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), companyId);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Buyer", email: "buyer@example.test", roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: companyId, workerId,
      permissions: options.canApprove ? ["procurement-access", "procurement-item-approve", "procurement-item-manage", "procurement-catalog-approve"] : ["procurement-access", "procurement-item-manage"],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: companyId, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/vendors") return json({ items: [{ id: vendorId, number: "SUP-1", displayName: "Office Supply", legalName: "Office Supply Ltd", countryCode: "ZM", status: "Active", isOrderable: true, version: 2, createdAt: "2026-10-19T00:00:00Z" }], total: 1, page: 1, pageSize: 100 });
    if (path === "/api/procurement/v1/items") {
      if (request.method() === "GET") return options.denyList ? json({ message: "Forbidden" }, 403) : json({ items: item ? [item] : [], total: item ? 1 : 0, page: 1, pageSize: 25 });
      if (request.method() === "POST") {
        const draft = request.postDataJSON();
        item = { ...draft, id: itemId, status: "Inactive", isPurchasable: false, version: 1 };
        return json(item, 201);
      }
    }
    if (path === `/api/procurement/v1/items/${itemId}` && item) {
      if (request.method() === "GET") return json(item);
      if (request.method() === "PUT") {
        if (options.staleUpdate) return json({ message: "This item changed since you opened it. Refresh and try again." }, 409);
        const { version, item: draft } = request.postDataJSON();
        if (version !== item.version) return json({ message: "Stale version" }, 409);
        item = { ...item, ...draft, version: version + 1 };
        return json(item);
      }
    }
    if (path === `/api/procurement/v1/items/${itemId}/deactivate` && item) {
      const { version } = request.postDataJSON();
      item = { ...item, status: "Inactive", isPurchasable: false, version: version + 1 };
      return json(item);
    }
    if (path === `/api/procurement/v1/items/${itemId}/activate` && item) {
      const { version, reason } = request.postDataJSON();
      if (version !== item.version || !reason) return json({ message: "Refresh or add a review reason." }, 409);
      item = { ...item, status: "Active", isPurchasable: true, version: version + 1 };
      return json(item);
    }
    if (path === `/api/procurement/v1/items/${itemId}/catalog-entries` && item) {
      if (request.method() === "GET") return json({ items: price ? [price] : [] });
      if (request.method() === "POST") {
        price = { ...request.postDataJSON(), id: priceId, catalogItemId: itemId,
          status: "Draft", version: 1 };
        return json(price, 201);
      }
    }
    if (path === `/api/procurement/v1/items/${itemId}/catalog-entries/${priceId}/publish` && price) {
      price = { ...price, status: "Published", version: 2 };
      return json(price);
    }
    if (path === `/api/procurement/v1/items/${itemId}/catalog-entries/${priceId}/withdraw` && price) {
      const { version, reason } = request.postDataJSON();
      if (version !== price.version || !reason) return json({ message: "Refresh or add a withdrawal reason." }, 409);
      price = { ...price, status: "Withdrawn", version: version + 1 };
      return json(price);
    }
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
}

test("item draft persists through create, refresh and edit without publishing", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/items");
  await expect(page.getByText("Add your first item")).toBeVisible();
  await expect(page.getByText("Office chair")).toHaveCount(0);
  await page.getByRole("link", { name: "Add item" }).first().click();
  await page.getByLabel("Item name").fill("Office chair");
  await page.getByLabel("Item code").fill("chair-1");
  await page.getByLabel("Category code").fill("OFFICE");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Office chair" })).toBeVisible();
  await expect(page.getByText("No — approval required")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Office chair" })).toBeVisible();
  await page.getByRole("link", { name: "Edit item" }).click();
  await page.getByLabel("Item name").fill("Office chair deluxe");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Office chair deluxe" })).toBeVisible();
});

test("item editor retains grouped fields and guards deliberate discard", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/items/new");
  await expect(page.getByRole("heading", { name: "Item details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Purchase information" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales information" })).toBeVisible();
  await page.getByLabel("Item name").fill("Unsaved chair");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Discard item changes?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Item name")).toHaveValue("Unsaved chair");
});

test("item detail keeps profile and tabs while leaving unsupported sections honest", async ({ page }) => {
  await mockErp(page, { activeItem: true });
  await page.goto(`/procurement/workspace/items/${itemId}`);
  await expect(page.getByRole("heading", { name: "Item Details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Purchase Information" })).toBeVisible();
  await page.getByRole("tab", { name: "Transactions" }).click();
  await expect(page.getByText("Related purchase orders, receipts and bills are not available", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: /Catalog prices/ }).click();
  await expect(page.getByRole("button", { name: "Add draft price" })).toBeVisible();
});

test("authorized reviewer activates an item after checking its category", async ({ page }) => {
  await mockErp(page, { canApprove: true });
  await page.goto("/procurement/workspace/items/new");
  await page.getByLabel("Item name").fill("Office chair");
  await page.getByLabel("Item code").fill("CHAIR-1");
  await page.getByLabel("Category code").fill("OFFICE");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByLabel("Review reason").fill("Checked category and item details");
  await page.getByRole("button", { name: "Activate item" }).click();
  await expect(page.getByText("Available for buying")).toBeVisible();
  await expect(page.getByText("Yes", { exact: true })).toBeVisible();
});

test("authorized reviewer publishes an approved vendor price", async ({ page }) => {
  await mockErp(page, { activeItem: true, canApprove: true });
  await page.goto(`/procurement/workspace/items/${itemId}`);
  await page.getByRole("tab", { name: /Catalog prices/ }).click();
  await page.getByRole("combobox", { name: "Vendor" }).click();
  await page.getByRole("option", { name: "Office Supply" }).click();
  await page.getByLabel("Unit price (ZMW)").fill("250");
  await page.getByRole("button", { name: "Add draft price" }).click();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review price" }).click();
  await page.getByLabel("Price review reason").fill("Checked approved vendor and price");
  await page.getByRole("button", { name: "Publish price" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Withdraw price" }).click();
  await page.getByLabel("Withdrawal reason").fill("Superseded by a new vendor price");
  await page.getByRole("button", { name: "Confirm withdrawal" }).click();
  await expect(page.getByText("Withdrawn", { exact: true })).toBeVisible();
});

test("item list denial does not show demo items", async ({ page }) => {
  await mockErp(page, { denyList: true });
  await page.goto("/procurement/workspace/items");
  await expect(page.getByRole("alert")).toContainText("do not have access");
  await expect(page.getByText("Business laptop")).toHaveCount(0);
});

test("stale item edit keeps the entered form and active item can be deactivated", async ({ page }) => {
  await mockErp(page, { staleUpdate: true, activeItem: true });
  await page.goto(`/procurement/workspace/items/${itemId}`);
  await expect(page.getByRole("heading", { name: "Business laptop" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Make inactive" }).click();
  await expect(page.getByRole("link", { name: "Edit item" })).toBeVisible();
  await page.getByRole("link", { name: "Edit item" }).click();
  await page.getByLabel("Item name").fill("Unsaved laptop");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(page.getByLabel("Item name")).toHaveValue("Unsaved laptop");
});
