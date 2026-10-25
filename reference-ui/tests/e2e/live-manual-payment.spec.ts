import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const requester = "33333333-3333-4333-8333-333333333333";
const approver = "44444444-4444-4444-8444-444444444444";
const recorder = "55555555-5555-4555-8555-555555555555";
const confirmer = "66666666-6666-4666-8666-666666666666";
const invoice = "77777777-7777-4777-8777-777777777777";
const supplier = "88888888-8888-4888-8888-888888888888";
const payment = "99999999-9999-4999-8999-999999999999";
const now = "2026-10-23T12:00:00Z";
const requiredCapabilities = ["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft", "configurationDraft",
  "contractDraft", "sourcingDraft"];
const permissions = ["procurement-access", "procurement-payment-read", "procurement-payment-create",
  "procurement-payment-edit", "procurement-payment-submit"];
const base = { id: payment, version: 1, status: "Draft", title: "Laptop supplier transfer", branchId: branch,
  supplierInvoiceId: invoice, supplierId: supplier, invoiceNumber: "BILL-1042", supplierDisplayName: "Northwind Devices",
  currencyCode: "ZMW", amountExact: "1.0001", creatorPrincipalId: requester,
  approverPrincipalId: approver, recorderPrincipalId: recorder, confirmerPrincipalId: confirmer,
  createdAt: now, updatedAt: null };
function detail() { return { request: { ...base, purpose: "Externally reported transfer", approvedAmountExact: null,
  recordedAmountExact: null, paidOn: null, externalMethod: null, externalReference: null,
  approvedByPrincipalId: null, recordedByPrincipalId: null, confirmedByPrincipalId: null, closureReason: null },
  transitions: [], coreCases: [], coreDecisions: [] }; }

async function fixture(page: Page, enabled: boolean, options: {
  principalId?: string; paymentStatus?: string; permissions?: string[]; allBranches?: boolean;
} = {}) {
  const writes: { path: string; body: Record<string, unknown>; key: string | undefined }[] = [];
  let status = options.paymentStatus ?? "Draft", version = status === "Approved" ? 3 : 1;
  await page.addInitScript(({ company, branch, allBranches }) => localStorage.setItem("erp.shell.state.v1",
    JSON.stringify({ entityId: company, branch: allBranches ? "" : branch,
      branchScope: allBranches ? "all" : undefined })),
    { company, branch, allBranches: options.allBranches ?? false });
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: options.principalId ?? requester, isActive: true, roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/core/v1/workspace-context") return json({ schemaVersion: 1,
      tenantId: "test", principalId: options.principalId ?? requester, organisationWide: false,
      companies: [{ id: company, code: "AMIZO", registeredName: "Amizo Power", currency: "ZMW", isDefault: true }],
      branches: [{ id: branch, code: "HQ", name: "Lusaka", legalEntityId: company, type: "Headquarters" }] });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [{ id: branch, name: "Lusaka", legalEntityId: company }] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "test", legalEntityId: company,
      principalId: options.principalId ?? requester, workerId: null, company: { id: company, currencyCode: "ZMW" },
      branch: options.allBranches ? null : { id: branch }, permissions: options.permissions ?? permissions });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company,
      schemaReady: true, capabilities: Object.fromEntries([...requiredCapabilities, "manualPaymentWorkflow"]
        .map(name => [name, name === "manualPaymentWorkflow" && enabled])) });
    if (path === "/api/procurement/v1/manual-payments/lookups/branches")
      return json({ items: [{ id: branch, code: "HQ", name: "Lusaka" }] });
    if (path === "/api/procurement/v1/manual-payments/lookups/invoices") return json({ items: [{ invoiceId: invoice,
      invoiceNumber: "BILL-1042", supplierId: supplier, supplierDisplayName: "Northwind Devices",
      currencyCode: "ZMW", grossExact: "100.0000", invoiceDate: "2026-10-20", branchId: branch }],
      nextCursor: null, hasMore: false, previewOnly: true });
    if (path === "/api/procurement/v1/manual-payments/lookups/assignees") {
      const role = url.searchParams.get("role");
      const person = role === "approve" ? [approver, "Approval officer"] : role === "record"
        ? [recorder, "Payment recorder"] : [confirmer, "Independent confirmer"];
      return json({ items: [{ principalId: person[0], displayName: person[1] }], nextCursor: null, hasMore: false });
    }
    if (path === "/api/procurement/v1/manual-payments" && request.method() === "GET")
      return json({ items: [], total: 0, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/manual-payments" && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push({ path, body, key: request.headers()["idempotency-key"] });
      return json({ id: payment, version: 1, status: "Draft", action: "Create",
        commandKey: request.headers()["idempotency-key"], amountExact: body.amount }, 201);
    }
    if (path === `/api/procurement/v1/manual-payments/${payment}/record` && request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push({ path, body, key: request.headers()["idempotency-key"] });
      status = "PaymentRecorded"; version += 1;
      return json({ id: payment, version, status, action: "Record",
        commandKey: request.headers()["idempotency-key"], amountExact: "1.0001" });
    }
    if (path === `/api/procurement/v1/manual-payments/${payment}`) {
      const saved = detail();
      return json({ ...saved, request: { ...saved.request, status, version,
        approvedAmountExact: status === "Draft" ? null : "1.0001",
        approvedByPrincipalId: status === "Draft" ? null : approver,
        recordedAmountExact: status === "PaymentRecorded" ? "1.0001" : null,
        recordedByPrincipalId: status === "PaymentRecorded" ? recorder : null,
        paidOn: status === "PaymentRecorded" ? "2026-10-22" : null,
        externalMethod: status === "PaymentRecorded" ? "External transfer" : null,
        externalReference: status === "PaymentRecorded" ? "BANK-1" : null } });
    }
    return json({ code: "not-found" }, 404);
  });
  return writes;
}

// Mocked HTTP/presentation cases. Real DB governance and Core assignment acceptance is separate.
test("capability off never mounts the local payment editor or sends a write", async ({ page }) => {
  const writes = await fixture(page, false);
  await page.goto("/procurement/workspace/payments/new");
  await expect(page.getByText("This workflow is being connected", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as Draft" })).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test("an assigned recorder sees the original detail tabs and records evidence without Finance Paid", async ({ page }) => {
  const writes = await fixture(page, true, { principalId: recorder, paymentStatus: "Approved",
    permissions: ["procurement-access", "procurement-payment-read", "procurement-payment-record"] });
  await page.goto(`/procurement/workspace/payments/${payment}`);
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
  await page.getByRole("button", { name: "Record external payment" }).click();
  await page.getByLabel("External payment date *").fill("2026-10-22");
  await page.getByLabel("External method *").fill("External transfer");
  await page.getByLabel("External reference *").fill("BANK-1");
  await page.getByRole("button", { name: "Record evidence" }).click();
  await expect(page.getByText("External payment recorded", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Paid", { exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({ expectedVersion: 3, paidOn: "2026-10-22",
    externalMethod: "External transfer", externalReference: "BANK-1", amount: "1.0001",
    evidenceDocumentRefId: null });
  expect(JSON.stringify(writes[0].body)).not.toMatch(/bankAccount|paidThrough|paymentRelease/i);
});

test("original payment editor layout creates one exact draft, then detail shows manual status", async ({ page }) => {
  const writes = await fixture(page, true);
  await page.goto(`/procurement/workspace/payments/new?invoiceId=${invoice}`);
  await expect(page.getByRole("heading", { name: "New Manual Payment Request" })).toBeVisible();
  await expect(page.getByText("Original bill gross: ZMW 100.0000", { exact: false })).toBeVisible();
  await page.getByLabel("Request title").fill("Laptop supplier transfer");
  await page.getByLabel("Exact amount *").fill("1.0001");
  await page.getByRole("combobox", { name: "Approver *" }).click();
  await page.getByRole("option", { name: "Approval officer" }).click();
  await page.getByRole("combobox", { name: "Recorder *" }).click();
  await page.getByRole("option", { name: "Payment recorder" }).click();
  await page.getByRole("combobox", { name: "Confirmer *" }).click();
  await page.getByRole("option", { name: "Independent confirmer" }).click();
  await expect(page.getByRole("combobox", { name: "Paid Through" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Attach document unavailable" })).toBeDisabled();
  await page.getByRole("button", { name: "Save as Draft" }).click();
  await expect(page.getByRole("heading", { name: "Laptop supplier transfer" })).toBeVisible();
  await expect(page.getByText("ZMW 1.0001", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({ branchId: branch, invoiceId: invoice,
    amount: "1.0001", approverPrincipalId: approver, recorderPrincipalId: recorder,
    confirmerPrincipalId: confirmer });
  expect(writes[0].key).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(writes[0].body)).not.toMatch(/bank|account|fee|advance/i);
});

test("all-branches header keeps its read scope while the form chooses an explicit transaction branch", async ({ page }) => {
  const writes = await fixture(page, true, { allBranches: true });
  const scoped: { path: string; headers: Record<string, string> }[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/procurement/v1/context" || path.startsWith("/api/procurement/v1/manual-payments"))
      scoped.push({ path, headers: request.headers() });
  });
  await page.goto(`/procurement/workspace/payments/new?invoiceId=${invoice}`);
  await page.getByRole("combobox", { name: "Transaction branch *" }).click();
  await page.getByRole("option", { name: "Lusaka (HQ)" }).click();
  await expect(page.getByText("Original bill gross: ZMW 100.0000", { exact: false })).toBeVisible();
  await page.getByLabel("Exact amount *").fill("1.0001");
  await page.getByRole("combobox", { name: "Approver *" }).click();
  await page.getByRole("option", { name: "Approval officer" }).click();
  await page.getByRole("combobox", { name: "Recorder *" }).click();
  await page.getByRole("option", { name: "Payment recorder" }).click();
  await page.getByRole("combobox", { name: "Confirmer *" }).click();
  await page.getByRole("option", { name: "Independent confirmer" }).click();
  await page.getByRole("button", { name: "Save as Draft" }).click();
  await expect(page.getByRole("heading", { name: "Laptop supplier transfer" })).toBeVisible();
  expect(writes[0].body.branchId).toBe(branch);
  expect(scoped.some(request => request.path === "/api/procurement/v1/context"
    && request.headers["x-shell-branch-scope"] === "all"
    && request.headers["x-shell-location"] === undefined)).toBe(true);
  expect(scoped.some(request => request.path === "/api/procurement/v1/manual-payments"
    && request.headers["x-shell-branch-scope"] === "all"
    && request.headers["x-shell-location"] === undefined)).toBe(true);
  expect(scoped.filter(request => request.path.startsWith("/api/procurement/v1/manual-payments"))
    .every(request => request.headers["x-shell-branch-scope"] === "all"
      && request.headers["x-shell-location"] === undefined)).toBe(true);
});

test("switching payment detail IDs never exposes the previous record while the next GET waits", async ({ page }) => {
  const nextPayment = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const writes = await fixture(page, true, { principalId: recorder, paymentStatus: "Approved",
    permissions: ["procurement-access", "procurement-payment-read", "procurement-payment-record"] });
  await page.goto(`/procurement/workspace/payments/${payment}`);
  await expect(page.getByRole("button", { name: "Record external payment" })).toBeVisible();
  await page.route(`**/api/procurement/v1/manual-payments/${nextPayment}`, async route => {
    await new Promise(resolve => setTimeout(resolve, 450));
    const next = detail();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...next,
      request: { ...next.request, id: nextPayment, status: "Approved", version: 7,
        title: "Second payment request", approvedAmountExact: "1.0001" } }) });
  });
  await page.evaluate(next => {
    history.pushState({}, "", `/procurement/workspace/payments/${next}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, nextPayment);
  await expect(page.getByText("Loading payment request…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record external payment" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Second payment request" })).toBeVisible();
  expect(writes).toHaveLength(0);
});

test("refresh after stale CAS hides old actions until the current detail GET completes", async ({ page }) => {
  await fixture(page, true, { principalId: recorder, paymentStatus: "Approved",
    permissions: ["procurement-access", "procurement-payment-read", "procurement-payment-record"] });
  await page.goto(`/procurement/workspace/payments/${payment}`);
  await page.route(`**/api/procurement/v1/manual-payments/${payment}/record`, route =>
    route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "stale" }) }));
  await page.getByRole("button", { name: "Record external payment" }).click();
  await page.getByLabel("External payment date *").fill("2026-10-22");
  await page.getByLabel("External method *").fill("External transfer");
  await page.getByLabel("External reference *").fill("BANK-1");
  await page.getByRole("button", { name: "Record evidence" }).click();
  await expect(page.getByText("The payment or approval task changed", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Keep reviewing" }).click();
  await page.route(`**/api/procurement/v1/manual-payments/${payment}`, async route => {
    await new Promise(resolve => setTimeout(resolve, 450));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...detail(),
      request: { ...detail().request, status: "Approved", version: 4,
        approvedAmountExact: "1.0001" } }) });
  });
  await page.getByRole("button", { name: "Refresh saved request" }).click();
  await expect(page.getByRole("button", { name: "Record external payment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record external payment" })).toBeVisible();
});

test("switching draft editor IDs waits for the new owner before Revise", async ({ page }) => {
  const nextPayment = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const writes = await fixture(page, true);
  await page.goto(`/procurement/workspace/payments/${payment}/edit`);
  await expect(page.getByRole("heading", { name: "Edit Manual Payment Request" })).toBeVisible();
  await page.route(`**/api/procurement/v1/manual-payments/${nextPayment}`, async route => {
    const request = route.request();
    if (request.method() === "GET") {
      await new Promise(resolve => setTimeout(resolve, 450));
      const next = detail();
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...next,
        request: { ...next.request, id: nextPayment, version: 7, amountExact: "9.0001",
          title: "Second draft" } }) });
    }
    if (request.method() === "PUT") {
      const input = request.postDataJSON() as Record<string, unknown>;
      writes.push({ path: new URL(request.url()).pathname, body: input,
        key: request.headers()["idempotency-key"] });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({
        id: nextPayment, version: 8, status: "Draft", action: "Revise",
        commandKey: request.headers()["idempotency-key"], amountExact: input.amount }) });
    }
    return route.fulfill({ status: 405 });
  });
  await page.evaluate(next => {
    history.pushState({}, "", `/procurement/workspace/payments/${next}/edit`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, nextPayment);
  await expect(page.getByText("Loading payment request…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as Draft" })).toHaveCount(0);
  await expect(page.getByLabel("Exact amount *")).toHaveValue("9.0001");
  await page.getByLabel("Exact amount *").fill("9.5001");
  await page.getByRole("button", { name: "Save as Draft" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].path).toBe(`/api/procurement/v1/manual-payments/${nextPayment}`);
  expect(writes[0].body).toMatchObject({ expectedVersion: 7, amount: "9.5001" });
});

test("an old draft save response cannot navigate away from a newly opened draft", async ({ page }) => {
  const nextPayment = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await fixture(page, true);
  await page.goto(`/procurement/workspace/payments/${payment}/edit`);
  await expect(page.getByRole("heading", { name: "Edit Manual Payment Request" })).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/procurement/v1/manual-payments/${payment}`, async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    await held;
    const input = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      id: payment, version: 2, status: "Draft", action: "Revise",
      commandKey: route.request().headers()["idempotency-key"], amountExact: input.amount }) });
  });
  await page.route(`**/api/procurement/v1/manual-payments/${nextPayment}`, route => {
    const next = detail();
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...next,
      request: { ...next.request, id: nextPayment, version: 7, title: "Second draft" } }) });
  });
  const sent = page.waitForRequest(request => request.method() === "PUT"
    && new URL(request.url()).pathname.endsWith(`/manual-payments/${payment}`));
  await page.getByLabel("Exact amount *").fill("1.1001");
  await page.getByRole("button", { name: "Save as Draft" }).click();
  await sent;
  await page.evaluate(next => {
    history.pushState({}, "", `/procurement/workspace/payments/${next}/edit`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, nextPayment);
  await expect(page.getByLabel("Exact amount *")).toHaveValue("1.0001");
  const completed = page.waitForResponse(response => response.request().method() === "PUT"
    && new URL(response.url()).pathname.endsWith(`/manual-payments/${payment}`));
  release();
  await completed;
  await page.waitForTimeout(100);
  await expect(page).toHaveURL(new RegExp(`/payments/${nextPayment}/edit$`));
  await expect(page.getByRole("heading", { name: "Edit Manual Payment Request" })).toBeVisible();
});
