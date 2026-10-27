import { currentWorkspaceFixture, fixturePrincipal, fixtureBranch } from "./current-workspace-fixture";
import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111", worker = "22222222-2222-4222-8222-222222222222", billId = "33333333-3333-4333-8333-333333333333", id = "44444444-4444-4444-8444-444444444444";
async function fixture(page: Page, options: { enabled?: boolean; readOnly?: boolean; stale?: boolean; lostCreate?: boolean; historical?: boolean } = {}) {
  let credit: Record<string, unknown> | null = options.historical ? { id, supplierInvoiceId: billId, invoiceNumber: "BILL-1", supplierId: worker,
    supplierName: "Actual supplier", creditNumber: "LEGACY-CREDIT-1", status: "Received", currencyCode: "ZMW", amount: 1.2345, exactAmount: "1.2345",
    version: 1, createdAt: "2026-10-22T00:00:00Z", reason: "Retained documentary credit", creditCrudVersion: 1, allowedActions: [] } : null; const listQueries: string[] = []; const writes: Array<{ method: string; body: Record<string, unknown> }> = [];
  const capabilities = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "orderDraft", "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft", "vendorCreditDraft"].map(key => [key, key === "vendorCreditDraft" && options.enabled !== false]));
  await page.addInitScript(entityId => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), company);
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/core/v1/workspace-context") return json(currentWorkspaceFixture("test", fixturePrincipal, [{ companyId: company, branchId: fixtureBranch, code: "TEST", name: "Synthetic company" }]));
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: fixturePrincipal, isActive: true, displayName: "Credit clerk", roles: ["ap_processor"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path.startsWith("/api/procurement/") && request.headers()["x-shell-entity"] !== company) return json({ message: "Company mismatch" }, 403);
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "test", legalEntityId: company, workerId: worker, company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" }, permissions: ["procurement-access", "procurement-invoice-read", ...(options.readOnly ? [] : ["procurement-invoice-capture"])] });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true, capabilities });
    const bill = { id: billId, supplierId: worker, supplierName: "Actual supplier", invoiceNumber: "BILL-1", invoiceDate: "2026-10-22", currencyCode: "ZMW", status: "Received", grossAmount: 100, taxAmount: 0, netAmount: 100, intakeChannel: "Manual", version: 1, createdAt: "2026-10-22T00:00:00Z", lines: [] };
    if (path === "/api/procurement/v1/invoices") return json({ items: [bill], total: 1, page: 1, pageSize: 25 });
    if (path === `/api/procurement/v1/invoices/${billId}`) return json(bill);
    if (path.startsWith("/api/procurement/v1/vendor-credits")) {
      if (request.method() !== "GET") {
        const body = request.postDataJSON(); writes.push({ method: request.method(), body });
        if (options.readOnly) return json({ message: "Read only" }, 403);
        if (options.stale && credit) return json({ message: "Refresh saved credit" }, 409);
        if (path.endsWith("/cancel") && credit) credit = { ...credit, status: "Cancelled", version: Number(credit.version) + 1, allowedActions: [] };
        else if (request.method() === "PUT" && credit) credit = { ...credit, ...body.draft, exactAmount: body.draft.amount, version: Number(credit.version) + 1 };
        else credit = { ...body, id, supplierInvoiceId: billId, invoiceNumber: bill.invoiceNumber, supplierId: worker, supplierName: bill.supplierName, currencyCode: bill.currencyCode, status: "Draft", exactAmount: body.amount, version: 1, createdAt: "2026-10-22T00:00:00Z", creditCrudVersion: 1, allowedActions: ["Edit", "Cancel"] };
        if (options.lostCreate && request.method() === "POST" && !path.endsWith("/cancel")) return route.abort("failed");
        return json(credit, request.method() === "POST" && !path.endsWith("/cancel") ? 201 : 200);
      }
      if (path.endsWith(`/${id}`) && credit) return json(credit);
      const query = new URL(request.url()).searchParams; listQueries.push(query.toString());
      const matches = credit && (!query.get("status") || credit.status === query.get("status"))
        && (!query.get("search") || [credit.creditNumber, credit.invoiceNumber, credit.supplierName].some(value => String(value).toLowerCase().includes(query.get("search")!.toLowerCase())));
      return json({ items: matches ? [credit] : [], total: matches ? 1 : 0, page: 1, pageSize: 25, creditCrudVersion: 1 });
    }
    return json({ message: "Not found" }, 404);
  });
  return { writes, listQueries };
}
async function create(page: Page) {
  await page.goto("/procurement/workspace/vendor-credits/new");
  await page.getByRole("combobox", { name: "Source bill", exact: true }).click();
  await page.getByRole("option", { name: "BILL-1 · Actual supplier", exact: true }).click();
  await expect(page.getByText("Vendor: Actual supplier", { exact: false })).toBeVisible();
  await page.getByLabel("Vendor Credit #", { exact: true }).fill("CREDIT-1");
  await page.getByLabel("Credit amount", { exact: true }).fill("1.2345");
  await page.getByLabel("Credit reason", { exact: true }).fill("Price correction");
  await page.getByRole("button", { name: "Save as Draft", exact: true }).click();
}
// Mocked HTTP contract only. Real persisted API/audit acceptance is a separate parent-owned gate.
test("invoice-derived credit draft create, edit and cancel survive GET refresh", async ({ page }) => {
  const setup = await fixture(page); await create(page);
  await expect(page.getByRole("heading", { name: "CREDIT-1", exact: true })).toBeVisible(); await page.reload();
  await expect(page.getByText("ZMW 1.2345", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit draft", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Source bill", exact: true })).toBeDisabled();
  await page.getByLabel("Credit amount", { exact: true }).fill("2.3456"); await page.getByLabel("Reason for change", { exact: true }).fill("Correct original");
  await page.getByRole("button", { name: "Save as Draft", exact: true }).click();
  await expect(page.getByText("ZMW 2.3456", { exact: true })).toBeVisible(); await page.reload();
  await page.getByLabel("Cancellation reason").fill("Withdraw incorrect credit"); page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Cancel draft", exact: true }).click(); await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText("ZMW 2.3456", { exact: true })).toBeVisible();
  expect(setup.writes.map(write => write.method)).toEqual(["POST", "PUT", "POST"]);
  expect(setup.writes[0].body).toEqual({ supplierInvoiceId: billId, creditNumber: "CREDIT-1", amount: "1.2345", reason: "Price correction" });
  expect(setup.writes[1].body).toMatchObject({ version: 1, reason: "Correct original" }); expect(setup.writes[2].body).toEqual({ version: 2, reason: "Withdraw incorrect credit" });
});
test("unknown create response reconciles by GET list without another POST", async ({ page }) => {
  const setup = await fixture(page, { lostCreate: true }); await create(page);
  await expect(page.getByText("The response was not confirmed. Check saved credits before making another change.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as Draft", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Review saved credits", exact: true }).click();
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CREDIT-1", exact: true })).toBeVisible(); expect(setup.writes).toHaveLength(1);
});
test("stale credit edit retains entries and blocks resubmit", async ({ page }) => {
  const setup = await fixture(page, { stale: true }); await create(page);
  await page.getByRole("link", { name: "Edit draft", exact: true }).click();
  await page.getByLabel("Credit amount", { exact: true }).fill("3.4567"); await page.getByLabel("Reason for change", { exact: true }).fill("Correct amount");
  await page.getByRole("button", { name: "Save as Draft", exact: true }).click();
  await expect(page.getByText("The saved record changed.", { exact: false })).toBeVisible(); await expect(page.getByLabel("Credit amount", { exact: true })).toHaveValue("3.4567");
  await expect(page.getByRole("button", { name: "Save as Draft", exact: true })).toBeDisabled(); expect(setup.writes).toHaveLength(2);
});
test("missing capability never mounts browser-local credit mutations", async ({ page }) => {
  const setup = await fixture(page, { enabled: false }); await page.goto("/procurement/workspace/vendor-credits/new");
  await expect(page.getByText("This workflow is being connected", { exact: false })).toBeVisible(); await expect(page.getByRole("button", { name: "Save as Draft", exact: true })).toHaveCount(0); expect(setup.writes).toEqual([]);
});
test("read-only invoice access cannot create a credit", async ({ page }) => {
  const setup = await fixture(page, { readOnly: true }); await page.goto("/procurement/workspace/vendor-credits/new");
  await expect(page.getByText("Invoice capture and read access are required", { exact: false })).toBeVisible(); expect(setup.writes).toEqual([]);
});


test("existing credit list tools keep server search, columns and selection available", async ({ page }) => {
  const setup = await fixture(page); await create(page);
  await page.getByRole("link", { name: "Vendor Credits", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Customize columns", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter Vendor Credits by field", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search vendor credits", exact: true }).fill("missing credit");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No credits match these filters", { exact: true })).toBeVisible();
  expect(setup.listQueries.some(value => new URLSearchParams(value).get("search") === "missing credit")).toBe(true);
  await page.getByRole("textbox", { name: "Search vendor credits", exact: true }).fill("CREDIT-1");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Select CREDIT-1", exact: true })).toBeVisible();
  expect(setup.writes).toHaveLength(1);
});


test("historical Received credit remains readable in list/detail and cannot be edited or cancelled", async ({ page }) => {
  const setup = await fixture(page, { historical: true });
  await page.goto("/procurement/workspace/vendor-credits");
  await expect(page.getByRole("cell", { name: "LEGACY-CREDIT-1", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page.getByRole("heading", { name: "LEGACY-CREDIT-1", exact: true })).toBeVisible();
  await expect(page.getByText("Received", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit draft", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel draft", exact: true })).toHaveCount(0);
  await page.goto(`/procurement/workspace/vendor-credits/${id}/edit`);
  await expect(page.getByText("This credit cannot be edited.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as Draft", exact: true })).toHaveCount(0);
  expect(setup.writes).toEqual([]);
});
