import { currentWorkspaceFixture, fixturePrincipal, fixtureBranch } from "./current-workspace-fixture";
import { expect, test, type Page } from "@playwright/test";
import { expectOrderWorkspaceBounds } from "./order-layout-assert";

test.setTimeout(120_000);
const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const vendorId = "33333333-3333-4333-8333-333333333333";
const orderId = "44444444-4444-4444-8444-444444444444";
const firstLineId = "55555555-5555-4555-8555-555555555555";
const secondLineId = "66666666-6666-4666-8666-666666666666";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "orderDraft", "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff",
  "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "vendorDraft" || key === "orderDraft"]));

async function mockErp(page: Page, canEdit = true) {
  let order: Record<string, unknown> | null = null;
  await page.addInitScript((entityId) => {
    localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId }));
  }, companyId);
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status,
      contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/core/v1/workspace-context") return json(currentWorkspaceFixture("amizo", fixturePrincipal, [{ companyId, branchId: fixtureBranch, code: "AMIZO", name: "Amizo Power" }]));
    if (path === "/api/hrm/auth/me") return json({ authenticated: true,
      user: { id: fixturePrincipal, isActive: true, displayName: "Buyer", email: "buyer@example.test",
        roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId,
      code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo",
      legalEntityId: companyId, workerId,
      permissions: canEdit ? ["procurement-access", "procurement-vendor-read",
        "procurement-po-read", "procurement-po-create", "procurement-po-edit"]
        : ["procurement-access", "procurement-po-read"],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo",
      legalEntityId: companyId, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/vendors") return json({ items: [{ id: vendorId,
      number: "VEN-001", displayName: "Office Supplier", legalName: "Office Supplier Ltd",
      countryCode: "ZM", status: "Active", isOrderable: true, version: 1,
      createdAt: "2026-10-20T00:00:00Z" }], total: 1, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/orders") {
      if (request.method() === "GET") return json({ items: order ? [order] : [],
        total: order ? 1 : 0, page: 1, pageSize: 25 });
      const draft = request.postDataJSON();
      order = { ...draft, id: orderId, number: "PO-001", supplierName: "Office Supplier",
        buyerSubjectId: workerId, status: "Draft", currencyCode: draft.currencyCode || "ZMW",
        version: 1, createdAt: "2026-10-20T00:00:00Z", closureReason: null,
        lines: draft.lines.map((line: Record<string, unknown>, at: number) => ({
          ...line, id: at === 0 ? firstLineId : secondLineId, lineNumber: at + 1,
        })), nextStep: "Approval and issue require an approved source, Finance commitment and delegated authority." };
      order.total = draft.lines.reduce((sum: number, line: { quantity: number; unitPrice: number; taxAmount: number }) =>
        sum + line.quantity * line.unitPrice + line.taxAmount, 0);
      return json(order, 201);
    }
    if (path === `/api/procurement/v1/orders/${orderId}` && order) {
      if (request.method() === "GET") return json(order);
      const { version, reason, draft } = request.postDataJSON();
      if (version !== order.version) return json({ message: "Refresh this order before saving." }, 409);
      if (draft.lines.some((line: { id?: string }) => line.id !== firstLineId) && !reason)
        return json({ message: "Give a reason for removing a saved line." }, 422);
      order = { ...order, ...draft, supplierName: "Office Supplier", version: Number(version) + 1,
        lines: draft.lines.map((line: Record<string, unknown>, at: number) => ({
          ...line, id: line.id || secondLineId, lineNumber: at + 2,
        })) };
      order.total = draft.lines.reduce((sum: number, line: { quantity: number; unitPrice: number; taxAmount: number }) =>
        sum + line.quantity * line.unitPrice + line.taxAmount, 0);
      return json(order);
    }
    if (path === `/api/procurement/v1/orders/${orderId}/cancel` && order) {
      const input = request.postDataJSON();
      order = { ...order, status: "Cancelled", closureReason: input.reason,
        version: Number(order.version) + 1 };
      return json(order);
    }
    return json({ title: `Unexpected route: ${path}` }, 404);
  });
}

test("buyer creates, revises and cancels an internal order draft", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/purchase-orders");
  await expect(page.getByText("No purchase orders yet")).toBeVisible();
  await page.getByRole("button", { name: "New order draft" }).first().click();
  await page.getByRole("combobox", { name: "Vendor" }).click();
  await page.getByRole("option", { name: "Office Supplier" }).click();
  await page.getByLabel("Description 1").fill("Laptop");
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Unit price").fill("500");
  await page.getByLabel("Tax amount").fill("100");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "PO-001" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await page.getByRole("tab", { name: "Items (1)" }).click();
  await expect(page.getByText("Estimated total ZMW 1,100.00")).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByText("Approval and issue require an approved source")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: /issue|approve|send/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit draft" }).click();
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Description 2").fill("Monitor");
  await page.getByLabel("Unit price").last().fill("250");
  await page.getByRole("button", { name: "Remove line" }).first().click();
  await page.getByLabel("Reason for removing a saved line").fill("Need changed");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("tab", { name: "Items (1)" }).click();
  await expect(page.getByText("Estimated total ZMW 250.00")).toBeVisible();
  await expect(page.getByText("Monitor")).toBeVisible();
  await expect(page.getByText("Laptop")).toHaveCount(0);
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByLabel("Cancellation reason").fill("Request withdrawn");
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(page.getByText("Request withdrawn")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit draft" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "PO-001" })).toBeVisible();
});

test("draft order keeps imported detail sections and shows unavailable controls honestly", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/purchase-orders/new");
  await expect(page.getByRole("button", { name: "Close editor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notes and attachments" })).toBeVisible();
  await expect(page.getByText("Notes and attachments cannot be saved", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add attachment" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save and send" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Vendor" }).click();
  await page.getByRole("option", { name: "Office Supplier" }).click();
  await page.getByLabel("Description 1").fill("Laptop");
  await page.getByRole("button", { name: "Save draft" }).click();
  for (const tab of ["Overview", "Items (1)", "Related", "Comments", "History"])
    await expect(page.getByRole("tab", { name: tab, exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Related" }).click();
  await expect(page.getByText("Related receipts and bills are not connected", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Comments" }).click();
  await expect(page.getByText("Comments cannot be saved", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("Detailed order change history is not available", { exact: false })).toBeVisible();
});

for (const width of [1440, 390]) test(`legacy order editor and detail respect ERP navigation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await mockErp(page);
  await page.goto("/procurement/workspace/purchase-orders/new");
  await expectOrderWorkspaceBounds(page, width, page.getByRole("button", { name: "Close editor" }));
  await page.getByRole("combobox", { name: "Vendor" }).click();
  await page.getByRole("option", { name: "Office Supplier" }).click();
  await page.getByLabel("Description 1").fill("Laptop");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expectOrderWorkspaceBounds(page, width, page.getByRole("tab", { name: "Overview" }));
});

test("read-only buyer cannot start or edit an order draft", async ({ page }) => {
  await mockErp(page, false);
  await page.goto("/procurement/workspace/purchase-orders");
  await expect(page.getByRole("button", { name: "New order draft" })).toHaveCount(0);
  await page.goto("/procurement/workspace/purchase-orders/new");
  await expect(page.getByText("You do not have access to edit purchase orders")).toBeVisible();
});

const anotherOrderId = "77777777-7777-4777-8777-777777777777";
const editPath = (id: string) => `/procurement/workspace/purchase-orders/${id}/edit`;
const savedDraft = (id = orderId) => ({ id, number: "PO-SCOPED", supplierId: vendorId,
  supplierName: "Office Supplier", buyerSubjectId: workerId, status: "Draft", version: 1,
  currencyCode: "ZMW", shipToRef: "", billToRef: "", paymentTermRef: "",
  expectedDeliveryOn: null, createdAt: "2026-10-20T00:00:00Z", total: 10,
  lines: [{ id: firstLineId, lineNumber: 1, description: "First saved order", unitCode: "EA",
    quantity: 1, unitPrice: 10, taxAmount: 0 }], nextStep: "Internal draft only" });
async function switchEditor(page: Page, id: string) {
  await page.evaluate((path) => {
    history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, editPath(id));
}

test("failed edit load never falls back to creating a purchase order", async ({ page }) => {
  await mockErp(page);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/procurement/v1/orders") && request.method() !== "GET") writes.push(request.method());
  });
  await page.goto(editPath(orderId));
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("switching to an unavailable order removes the previous editable draft", async ({ page }) => {
  await mockErp(page);
  const writes: string[] = [];
  await page.route(`**/api/procurement/v1/orders/${orderId}`, (route) => {
    if (route.request().method() !== "GET") writes.push(route.request().method());
    return route.fulfill({ json: savedDraft() });
  });
  await page.goto(editPath(orderId));
  await expect(page.getByLabel("Description 1")).toHaveValue("First saved order");
  await switchEditor(page, anotherOrderId);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Description 1")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("late order save cannot navigate over a different editor context", async ({ page }) => {
  await mockErp(page);
  let releaseSave!: () => void;
  const savePending = new Promise<void>((resolve) => { releaseSave = resolve; });
  let writes = 0;
  await page.route(`**/api/procurement/v1/orders/${orderId}`, async (route) => {
    if (route.request().method() === "PUT") { writes++; await savePending; }
    await route.fulfill({ json: { ...savedDraft(), version: route.request().method() === "PUT" ? 2 : 1 } });
  });
  await page.route(`**/api/procurement/v1/orders/${anotherOrderId}`, (route) =>
    route.fulfill({ json: { ...savedDraft(anotherOrderId), lines: [{ ...savedDraft().lines[0], description: "Second saved order" }] } }));
  await page.goto(editPath(orderId));
  await expect(page.getByLabel("Description 1")).toHaveValue("First saved order");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect.poll(() => writes).toBe(1);
  await switchEditor(page, anotherOrderId);
  await expect(page.getByLabel("Description 1")).toHaveValue("Second saved order");
  const completed = page.waitForResponse((response) => response.url().endsWith(`/orders/${orderId}`) && response.request().method() === "PUT");
  releaseSave(); await completed;
  await expect(page).toHaveURL(new RegExp(`${anotherOrderId}/edit$`));
  await expect(page.getByLabel("Description 1")).toHaveValue("Second saved order");
  expect(writes).toBe(1);
});

test("unconfirmed order correction stays locked and reconciles with GET only", async ({ page }) => {
  await mockErp(page);
  let writes = 0;
  await page.route(`**/api/procurement/v1/orders/${orderId}`, (route) => {
    if (route.request().method() === "PUT") { writes++; return route.abort("failed"); }
    return route.fulfill({ json: savedDraft() });
  });
  await page.goto(editPath(orderId));
  await expect(page.getByLabel("Description 1")).toHaveValue("First saved order");
  await page.getByLabel("Description 1").fill("Unconfirmed correction");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("This save is unconfirmed.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(page.getByLabel("Description 1")).toHaveValue("Unconfirmed correction");
  await page.getByRole("link", { name: "Open purchase orders", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Purchase Orders", exact: true })).toBeVisible();
  expect(writes).toBe(1);
});
