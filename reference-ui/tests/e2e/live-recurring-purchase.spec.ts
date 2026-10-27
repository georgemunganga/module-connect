import { currentWorkspaceFixture, fixturePrincipal } from "./current-workspace-fixture";
import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const principal = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const branch = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const supplier = "33333333-3333-4333-8333-333333333333";
const recordId = "44444444-4444-4444-8444-444444444444";
const capabilities = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts",
  "orders", "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "recurringPurchaseDraft", "sourcingDraft"].map(key => [key, key === "recurringPurchaseDraft"]));
const permissions = ["procurement-access", "procurement-vendor-read", "procurement-recurring-read", "procurement-recurring-create", "procurement-recurring-edit"];
type RecordValue = Record<string, unknown> & { id: string; version: number; status: string };

async function fixture(page: Page, opts: { permissions?: string[]; failedGet?: boolean; unknownCreate?: boolean; createStatus?: number; closed?: boolean; exactAmount?: string; wrongOwner?: boolean; wrongBranch?: boolean } = {}) {
  const writes: string[] = [];
  let record: RecordValue | null = opts.closed ? { id: recordId, number: "RPC-1", title: "Past service", supplierId: supplier,
    supplierContractId: null, ownerPrincipalId: principal, ownerWorkerId: null, workLocationId: branch, frequency: "Monthly",
    firstCycleOn: "2026-01-01", nextCycleOn: "2026-09-01", lastCycleOn: null,
    expectedAmount: 20, exactExpectedAmount: opts.exactAmount ?? "20", currencyCode: "ZMW",
    status: "Closed", version: 2, createdAt: "2026-01-01T00:00:00Z", closedAt: "2026-10-01T00:00:00Z",
    closedReason: "Completed" } : null;
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id, branch: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })), company);
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/core/v1/workspace-context") return json(currentWorkspaceFixture("amizo", fixturePrincipal, [{ companyId: company, branchId: branch, code: "AMIZO", name: "Amizo Power" }]));
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: fixturePrincipal, isActive: true, displayName: "Buyer", roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [{ id: branch, name: "Lusaka", legalEntityId: company }] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path.startsWith("/api/procurement/v1/")) {
      expect(route.request().headers()["x-shell-entity"]).toBe(company);
      expect(route.request().headers()["x-shell-location"]).toBe(branch);
    }
    if (path === "/api/procurement/v1/context") return json({ tenantId: "amizo", legalEntityId: company, principalId: principal, workerId: null,
      permissions: opts.permissions ?? permissions, company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/vendors") return json({ items: [{ id: supplier, number: "VEN-1", displayName: "Copper Services", legalName: "Copper Services", countryCode: "ZM", status: "Active", isOrderable: true, version: 1, createdAt: "2026-10-22T00:00:00Z" }], total: 1, page: 1, pageSize: 100 });
    if (path === "/api/procurement/v1/recurring-purchases") {
      if (method === "GET") return json({ items: record ? [record] : [], total: record ? 1 : 0, page: 1, pageSize: 25 });
      writes.push(path);
      if (opts.unknownCreate) return route.abort("failed");
      if (opts.createStatus) return json({ message: "The upstream result is unconfirmed." }, opts.createStatus);
      const input = route.request().postDataJSON();
      record = { ...input, id: recordId, number: "RPC-1", ownerPrincipalId: opts.wrongOwner ? supplier : principal, ownerWorkerId: null, workLocationId: opts.wrongBranch ? null : branch,
        exactExpectedAmount: input.expectedAmount, status: "Draft", version: 1,
        createdAt: "2026-10-22T00:00:00Z", closedAt: null, closedReason: null };
      return json(record, 201);
    }
    if (path === `/api/procurement/v1/recurring-purchases/${recordId}`) {
      if (method === "GET") return opts.failedGet ? json({ message: "Unavailable" }, 503) : record ? json(record) : json({ message: "Not found" }, 404);
      writes.push(path);
      const input = route.request().postDataJSON();
      record = { ...record!, ...input.draft, exactExpectedAmount: input.draft.expectedAmount, version: record!.version + 1 };
      return json(record);
    }
    if (path === `/api/procurement/v1/recurring-purchases/${recordId}/close`) {
      writes.push(path); record = { ...record!, status: "Closed", version: record!.version + 1, closedAt: "2026-10-22T00:00:00Z", closedReason: route.request().postDataJSON().reason };
      return json(record);
    }
    return json({ message: `Unexpected: ${path}` }, 404);
  });
  return { writes };
}

test("system user without an employee can create, edit and close recurring purchases without a Finance request", async ({ page }) => {
  test.setTimeout(90_000);
  const state = await fixture(page);
  await page.goto("/procurement/workspace/recurring-bills");
  await expect(page.getByText("No recurring purchases yet")).toBeVisible();
  await page.getByRole("link", { name: "New recurring purchase" }).first().click();
  await page.getByRole("combobox", { name: "Supplier", exact: true }).click();
  await page.getByRole("option", { name: "Copper Services (Active)", exact: true }).click();
  await page.getByLabel("Purchase name").fill("Monthly cleaning");
  await page.getByLabel("Expected each time").fill("12345678901234.5678");
  await page.getByLabel("First expected date").fill("2026-11-01");
  await page.getByLabel("Next expected date").fill("2026-11-01");
  await page.getByRole("button", { name: "Save recurring purchase" }).click();
  await expect(page.getByRole("heading", { name: "Monthly cleaning" })).toBeVisible();
  await expect(page.getByText("ZMW 12345678901234.5678")).toBeVisible();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByLabel("Expected each time").fill("5.1234");
  await page.getByRole("button", { name: "Save recurring purchase" }).click();
  await expect(page.getByText("ZMW 5.1234")).toBeVisible();
  await page.getByLabel("Reason").fill("Service ended");
  await page.getByRole("button", { name: "Close schedule" }).click();
  await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
  expect(state.writes).toHaveLength(3);
  expect(state.writes.every(path => path.startsWith("/api/procurement/v1/recurring-purchases"))).toBe(true);
});

test("failed edit GET never becomes create", async ({ page }) => {
  const state = await fixture(page, { failedGet: true });
  await page.goto(`/procurement/workspace/recurring-bills/${recordId}/edit`);
  await expect(page.getByRole("alert")).toContainText("Unavailable");
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test("read-only user cannot open a write action", async ({ page }) => {
  const state = await fixture(page, { permissions: ["procurement-access", "procurement-recurring-read"] });
  await page.goto("/procurement/workspace/recurring-bills/new");
  await expect(page.getByRole("alert")).toContainText("cannot create");
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test("direct edit URL for a closed purchase shows saved history, without a write form", async ({ page }) => {
  const state = await fixture(page, { closed: true });
  await page.goto(`/procurement/workspace/recurring-bills/${recordId}/edit`);
  await expect(page.getByText("This recurring purchase is closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test("imported directory and detail sections show saved exact schedule without payment actions", async ({ page }) => {
  const state = await fixture(page, { closed: true, exactAmount: "99999999999999.9999" });
  await page.goto("/procurement/workspace/recurring-bills");
  await expect(page.getByRole("heading", { name: "Recurring purchases", exact: true })).toBeVisible();
  await expect(page.getByLabel("Search recurring purchases on this page")).toBeVisible();
  await expect(page.getByText("99999999999999.9999")).toBeVisible();
  await page.getByLabel("Search recurring purchases on this page").fill("No matching plan");
  await expect(page.getByText("No matching recurring purchases on this page")).toBeVisible();
  await page.getByRole("button", { name: "Clear page filters" }).click();
  await expect(page.getByText("Past service")).toBeVisible();
  await page.getByRole("button", { name: "Preview RPC-1" }).click();
  await expect(page.getByRole("dialog")).toContainText("Past service");
  await page.getByRole("button", { name: "View full details" }).click();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("ZMW 99999999999999.9999")).toBeVisible();
  await page.getByRole("tab", { name: "Schedule" }).click();
  await expect(page.getByRole("heading", { name: "Repeat schedule" })).toBeVisible();
  await expect(page.getByText("No bill is generated automatically.")).toBeVisible();
  await page.getByRole("tab", { name: "Related" }).click();
  await expect(page.getByRole("heading", { name: "Related records" })).toBeVisible();
  await expect(page.getByText("Linked bills, payments, attachments and comments are not available")).toBeVisible();
  await page.getByRole("tab", { name: "Comments" }).click();
  await expect(page.getByText("Comments are not connected to saved recurring purchases yet.")).toBeVisible();
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("Detailed edit and approval history is not available")).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test("editor retains original grouped form and confirms discarding unsaved values", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/procurement/workspace/recurring-bills/new");
  for (const heading of ["Supplier and purchase", "Purchase schedule", "Items and charges", "Terms and notes"])
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.getByLabel("Payment terms")).toBeDisabled();
  await expect(page.getByLabel("Notes")).toBeDisabled();
  await page.getByLabel("Purchase name").fill("Unsaved subscription");
  await page.getByRole("button", { name: "Back to list" }).click();
  await expect(page.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Purchase name")).toHaveValue("Unsaved subscription");
  await page.getByRole("button", { name: "Back to list" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("heading", { name: "Recurring purchases", exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
});

test("reader keeps the list and saved detail tabs without create edit or close controls", async ({ page }) => {
  const state = await fixture(page, { closed: true, permissions: ["procurement-access", "procurement-recurring-read"] });
  await page.goto("/procurement/workspace/recurring-bills");
  await expect(page.getByRole("link", { name: /Past service/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "New recurring purchase" })).toHaveCount(0);
  await page.getByRole("link", { name: /Past service/ }).click();
  await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close schedule" })).toHaveCount(0);
  expect(state.writes).toHaveLength(0);
});

test("unconfirmed create locks repeat submission and retains entered values", async ({ page }) => {
  const state = await fixture(page, { unknownCreate: true });
  await page.goto("/procurement/workspace/recurring-bills/new");
  await page.getByRole("combobox", { name: "Supplier", exact: true }).click();
  await page.getByRole("option", { name: "Copper Services (Active)", exact: true }).click();
  await page.getByLabel("Purchase name").fill("Cloud subscription");
  await page.getByLabel("Expected each time").fill("10.0001");
  await page.getByLabel("First expected date").fill("2026-11-01");
  await page.getByLabel("Next expected date").fill("2026-11-01");
  await page.getByRole("button", { name: "Save recurring purchase" }).click();
  await expect(page.getByText("The save result was not confirmed.")).toBeVisible();
  await expect(page.getByLabel("Purchase name")).toHaveValue("Cloud subscription");
  await expect(page.getByLabel("Purchase name")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toBeDisabled();
  await page.getByRole("button", { name: "Back to list" }).click();
  const review = page.getByRole("dialog", { name: "Review saved recurring purchases" });
  await expect(review).toBeVisible();
  await expect(review).not.toContainText("changes have not been saved");
  await expect(page.getByRole("dialog", { name: "Discard unsaved changes?" })).toHaveCount(0);
  await review.getByRole("button", { name: "Stay on this page" }).click();
  await expect(page).toHaveURL(/\/recurring-bills\/new$/);
  expect(state.writes).toHaveLength(1);
  await page.reload();
  await expect(page.getByText("The save result was not confirmed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toBeDisabled();
  await page.getByRole("button", { name: "Recurring purchases", exact: true }).click();
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Review saved records" }).click();
  await expect(page).toHaveURL(/\/recurring-bills$/);
  expect(state.writes).toHaveLength(1);
});

test("stale create offers read-only review from Back without discarding or retrying", async ({ page }) => {
  const state = await fixture(page, { createStatus: 409 });
  await page.goto("/procurement/workspace/recurring-bills/new");
  await page.getByRole("combobox", { name: "Supplier", exact: true }).click();
  await page.getByRole("option", { name: "Copper Services (Active)", exact: true }).click();
  await page.getByLabel("Purchase name").fill("Cloud subscription");
  await page.getByLabel("Expected each time").fill("10.0001");
  await page.getByLabel("First expected date").fill("2026-11-01");
  await page.getByLabel("Next expected date").fill("2026-11-01");
  await page.getByRole("button", { name: "Save recurring purchase" }).click();
  await expect(page.getByText("This purchase changed.")).toBeVisible();
  await expect(page.getByLabel("Purchase name")).toBeDisabled();
  await page.getByRole("button", { name: "Recurring purchases", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review saved recurring purchases" });
  await expect(review).toBeVisible();
  await expect(review).toContainText("saved purchase changed");
  await expect(page.getByRole("dialog", { name: "Discard unsaved changes?" })).toHaveCount(0);
  await review.getByRole("button", { name: "Review saved records" }).click();
  await expect(page).toHaveURL(/\/recurring-bills$/);
  expect(state.writes).toHaveLength(1);
});

for (const status of [408, 429, 499]) {
  test(`HTTP ${status} keeps create locked after reload without a second POST`, async ({ page }) => {
    const state = await fixture(page, { createStatus: status });
    await page.goto("/procurement/workspace/recurring-bills/new");
    await page.getByRole("combobox", { name: "Supplier", exact: true }).click();
    await page.getByRole("option", { name: "Copper Services (Active)", exact: true }).click();
    await page.getByLabel("Purchase name").fill("Cloud subscription");
    await page.getByLabel("Expected each time").fill("10.0001");
    await page.getByLabel("First expected date").fill("2026-11-01");
    await page.getByLabel("Next expected date").fill("2026-11-01");
    await page.getByRole("button", { name: "Save recurring purchase" }).click();
    await expect(page.getByText("The save result was not confirmed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save recurring purchase" })).toBeDisabled();
    expect(state.writes).toHaveLength(1);
    await page.reload();
    await expect(page.getByText("The save result was not confirmed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save recurring purchase" })).toBeDisabled();
    expect(state.writes).toHaveLength(1);
  });
}

test("a save receipt owned by another principal never unlocks or navigates the editor", async ({ page }) => {
  const state = await fixture(page, { wrongOwner: true });
  await page.goto("/procurement/workspace/recurring-bills/new");
  await page.getByRole("combobox", { name: "Supplier", exact: true }).click();
  await page.getByRole("option", { name: "Copper Services (Active)", exact: true }).click();
  await page.getByLabel("Purchase name").fill("Account-owned schedule");
  await page.getByLabel("Expected each time").fill("10.0001");
  await page.getByLabel("First expected date").fill("2026-11-01");
  await page.getByLabel("Next expected date").fill("2026-11-01");
  await page.getByRole("button", { name: "Save recurring purchase" }).click();
  await expect(page.getByRole("alert")).toContainText("different account");
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toBeDisabled();
  await expect(page).toHaveURL(/\/recurring-bills\/new$/);
  expect(state.writes).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Save recurring purchase" })).toBeDisabled();
  expect(state.writes).toHaveLength(1);
});

for (const mode of ["wrong branch", "blocked storage"] as const) {
  test(`${mode} cannot confirm or repeat a recurring create`, async ({ page }) => {
    const state = await fixture(page, { wrongBranch: mode === "wrong branch" });
    if (mode === "blocked storage") await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("erp.procurement.recurring-write.v1:")) throw new Error("Synthetic storage denial");
        return original.call(this, key, value);
      };
    });
    await page.goto("/procurement/workspace/recurring-bills/new");
    await page.getByRole("combobox", { name: "Supplier", exact: true }).click();
    await page.getByRole("option", { name: "Copper Services (Active)", exact: true }).click();
    await page.getByLabel("Purchase name").fill("Scoped purchase");
    await page.getByLabel("Expected each time").fill("10.0001");
    await page.getByLabel("First expected date").fill("2026-11-01");
    await page.getByLabel("Next expected date").fill("2026-11-01");
    await page.getByRole("button", { name: "Save recurring purchase" }).click();
    await expect(page.getByRole("button", { name: "Save recurring purchase" })).toBeDisabled();
    if (mode === "wrong branch") {
      await expect(page.getByRole("alert")).toContainText("different branch");
      await page.reload();
      await expect(page.getByRole("button", { name: "Save recurring purchase" })).toBeDisabled();
    }
    expect(state.writes).toHaveLength(mode === "wrong branch" ? 1 : 0);
  });
}

test("recurring amount sorting compares exact decimal text within currency", async ({ page }) => {
  await fixture(page, { closed: true });
  const common = { supplierId: supplier, supplierContractId: null, ownerPrincipalId: principal, ownerWorkerId: null,
    workLocationId: branch, frequency: "Monthly", firstCycleOn: "2026-01-01", nextCycleOn: "2026-09-01", lastCycleOn: null,
    currencyCode: "ZMW", status: "Closed", version: 2, createdAt: "2026-01-01T00:00:00Z", closedAt: "2026-10-01T00:00:00Z", closedReason: "Completed" };
  await page.route("**/api/procurement/v1/recurring-purchases?*", route => route.fulfill({ json: { items: [
    { ...common, id: recordId, number: "RPC-LARGE", title: "Larger fraction", expectedAmount: 0.001, exactExpectedAmount: "0.001" },
    { ...common, id: "55555555-5555-4555-8555-555555555555", number: "RPC-SMALL", title: "Smaller fraction", expectedAmount: 0.0001, exactExpectedAmount: "0.0001" },
  ], total: 2, page: 1, pageSize: 25 } }));
  await page.goto("/procurement/workspace/recurring-bills");
  await page.getByRole("combobox", { name: "Sort recurring purchases on this page", exact: true }).click();
  await page.getByRole("option", { name: "Expected each time", exact: true }).click();
  const rows = page.getByTestId("erp-record-table").locator("tbody tr");
  await expect(rows.first()).toContainText("Smaller fraction");await expect(rows.last()).toContainText("Larger fraction");
});
