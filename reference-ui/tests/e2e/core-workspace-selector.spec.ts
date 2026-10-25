import { expect, test, type Page } from "@playwright/test";

const principal = "11111111-1111-4111-8111-111111111111";
const companyA = "22222222-2222-4222-8222-222222222222";
const companyC = "33333333-3333-4333-8333-333333333333";
const branchA = "44444444-4444-4444-8444-444444444444";
const branchC = "55555555-5555-4555-8555-555555555555";
const capabilities = ["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts",
  "orders", "receiving", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft", "manualPaymentWorkflow"];

async function setup(page: Page, coreStatus = 200) {
  const seen: { path: string; company: string | undefined; all: string | undefined }[] = [];
  let adminCalls = 0;
  await page.route("**/api/**", route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = request.headers();
    const json = (body: unknown, status = 200) => route.fulfill({ status,
      contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true,
      user: { id: principal, isActive: true, roles: ["procurement_payment_requester"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Synthetic ERP" });
    if (path.startsWith("/api/hrm/admin/") || path === "/api/hrm/shell/") {
      adminCalls++;
      return json({ code: "forbidden" }, 403);
    }
    if (path === "/api/core/v1/workspace-context") return json({ schemaVersion: 1,
      tenantId: "synthetic", principalId: principal, organisationWide: false,
      companies: [
        { id: companyA, code: "A", registeredName: "Company A", currency: "ZMW", isDefault: false },
        { id: companyC, code: "C", registeredName: "Company C", currency: "ZMW", isDefault: true },
      ],
      branches: [
        { id: branchA, code: "A1", name: "Company A branch", legalEntityId: companyA },
        { id: branchC, code: "C1", name: "Company C branch", legalEntityId: companyC },
      ],
    }, coreStatus);
    if (path === "/api/procurement/v1/context") {
      seen.push({ path, company: headers["x-shell-entity"], all: headers["x-shell-branch-scope"] });
      const company = headers["x-shell-entity"] || companyC;
      return json({ tenantId: "synthetic", legalEntityId: company, principalId: principal,
        workerId: null, branch: headers["x-shell-branch-scope"] === "all" ? null : { id: branchC },
        company: { id: company, currencyCode: "ZMW" },
        permissions: company === companyA
          ? ["procurement-access", "procurement-payment-read"] : ["procurement-access"] });
    }
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "synthetic",
      legalEntityId: headers["x-shell-entity"] || companyC, schemaReady: true,
      capabilities: Object.fromEntries(capabilities.map(key => [key, true])) });
    if (path === "/api/procurement/v1/manual-payments") {
      seen.push({ path, company: headers["x-shell-entity"], all: headers["x-shell-branch-scope"] });
      return json({ items: [], total: 0, page: 1, pageSize: 25 });
    }
    return json({ code: "not-found" }, 404);
  });
  return { seen, adminCalls: () => adminCalls };
}

test("a payment-only Core account can switch from default C to authorized company A", async ({ page }) => {
  const scope = await setup(page);
  await page.goto("/procurement/workspace/payments");
  await expect(page.getByText("You do not have permission to open this Procurement page", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Organisation context" }).click();
  await expect(page.getByRole("button", { name: "Company A", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Company A", exact: true }).locator("..")
    .getByRole("button", { name: "All permitted branches" }).click();
  await expect(page.getByRole("heading", { name: "Payments Made" })).toBeVisible();
  await expect.poll(() => scope.seen.some(request => request.path === "/api/procurement/v1/manual-payments"
    && request.company === companyA && request.all === "all")).toBe(true);
  expect(scope.adminCalls()).toBe(0);
});

test("Core selector denial never falls back to broad administrator choices", async ({ page }) => {
  const scope = await setup(page, 403);
  await page.goto("/procurement/workspace/payments");
  await expect(page.getByText("Your ERP account could not open verified organisation choices", { exact: false })).toBeVisible();
  expect(scope.adminCalls()).toBe(0);
  expect(scope.seen).toEqual([]);
});
