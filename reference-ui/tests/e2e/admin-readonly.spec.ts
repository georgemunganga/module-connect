import { currentWorkspaceFixture, fixturePrincipal, fixtureBranch } from "./current-workspace-fixture";
import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const recordId = "77777777-7777-4777-8777-777777777777";
const lineId = "88888888-8888-4888-8888-888888888888";
const supplierId = "99999999-9999-4999-8999-999999999999";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders", "orderDraft",
  "receiving", "invoiceIntake", "invoiceDocuments", "invoiceValidation", "financeHandoff", "supplierPortal",
  "planningDraft", "configurationDraft", "contractDraft", "sourcingDraft",
].map(key => [key, key !== "approvals"]));

async function readonlyErp(page: Page) {
  const writes: string[] = [];
  await page.addInitScript(entityId => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), companyId);
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/api/procurement/") && request.method() !== "GET") {
      writes.push(`${request.method()} ${path}`); return json({ message: "Read only" }, 403);
    }
    if (path === "/api/core/v1/workspace-context") return json(currentWorkspaceFixture("amizo", fixturePrincipal, [{ companyId, branchId: fixtureBranch, code: "AMIZO", name: "Amizo Power" }]));
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: fixturePrincipal, isActive: true, displayName: "ERP admin", roles: ["erp_admin"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: companyId,
      workerId: null, adminViewOnly: true, company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" },
      permissions: ["procurement-access", "procurement-request-read", "procurement-sourcing-read", "procurement-contract-read", "procurement-plan-read", "procurement-configuration-read"] });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: companyId, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/configuration/categories") return json({ items: [{ id: recordId, code: "OFFICE", name: "Office category", status: "Draft", version: 1 }], total: 1, page: 1, pageSize: 25 });
    if (path === "/api/procurement/v1/configuration/policies") return json({ items: [{ id: recordId, policyKey: "PURCHASE_REQUEST", policyVersionNumber: 1, state: "Draft", version: 1, effectiveFrom: "2026-10-19T00:00:00Z", effectiveTo: null }], total: 1, page: 1, pageSize: 100 });
    const common = { id: recordId, number: "RETAINED-001", status: "Draft", version: 1, currencyCode: "ZMW" };
    if (path === `/api/procurement/v1/requests/${recordId}`) return json({ ...common, purpose: "Retained request", neededBy: "2026-11-01",
      lines: [{ id: lineId, description: "Retained need", requestedQuantity: 1, estimatedUnitPrice: 10, unitCode: "each", approvalStatus: "Pending" }] });
    if (path === `/api/procurement/v1/sourcing/${recordId}`) return json({ ...common, title: "Retained quote", method: "RFQ",
      lines: [{ id: lineId, description: "Retained need", quantity: 1, unitCode: "each", status: "Active" }] });
    if (path === `/api/procurement/v1/contracts/${recordId}`) return json({ ...common, title: "Retained contract", supplierId, contractType: "Agreement", ceilingAmount: 10 });
    if (path === `/api/procurement/v1/plans/${recordId}`) return json({ ...common, financialPeriodRef: "Retained financial period", revisionNumber: 1,
      lines: [{ id: lineId, description: "Retained need", estimatedQuantity: 1, estimatedAmount: 10, unitCode: "each", status: "Active" }] });
    return json({ message: `Unexpected read: ${path}` }, 404);
  });
  return writes;
}

for (const [path, heading, content] of [
  ["/settings/reference-data", "Buying categories & methods", "Office category"],
  ["/settings/buying-rules", "Buying rules", "Draft"],
  [`/requests/${recordId}`, "Retained request", "Retained need"],
  [`/rfqs/${recordId}`, "Retained quote", "Retained need"],
  [`/contracts/${recordId}`, "Retained contract", "Supplier reference"],
  [`/plans/${recordId}`, "Retained financial period", "Retained need"],
]) {
  test(`administrator can read ${path} without inline business commands`, async ({ page }) => {
    const writes = await readonlyErp(page);
    await page.goto(`/procurement/workspace${path}`);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    if (path.startsWith("/rfqs/")) await main.getByRole("tab", { name: "Items (1)" }).click();
    await expect(main.getByText(content, { exact: true })).toBeVisible();
    await expect(main.getByRole("button", { name: /^(Add|New |Edit|Save|Send for review|Withdraw|Cancel draft|Publish|Return for changes)/i })).toHaveCount(0);
    await expect(main.getByRole("link", { name: /^(Add|New |Edit)/i })).toHaveCount(0);
    if (path === "/settings/buying-rules") await expect(main.getByRole("button", { name: "Try a sample", exact: true })).toBeVisible();
    expect(writes).toEqual([]);
  });
}
