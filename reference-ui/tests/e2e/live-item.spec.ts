import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const itemId = "66666666-6666-4666-8666-666666666666";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "itemDraft"]));
type Item = Record<string, unknown> & { id: string; version: number; name: string; status: string };

async function mockErp(page: Page, options: { denyList?: boolean; staleUpdate?: boolean; activeItem?: boolean } = {}) {
  let item: Item | null = options.activeItem ? {
    id: itemId, code: "LAPTOP", name: "Business laptop", kind: "Goods", categoryCode: "IT",
    unitCode: "each", status: "Active", isPurchasable: true, isStockItem: false,
    isAsset: true, inspectionRequired: true, version: 1,
  } : null;
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
    if (path === "/api/procurement/v1/context") return json({ tenantId: "amizo", legalEntityId: companyId, workerId, company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: companyId, schemaReady: true, capabilities });
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
