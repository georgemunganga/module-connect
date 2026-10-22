import { expect, test, type Page } from "@playwright/test";
const company = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
const keys = ["SOURCING", "RECEIVING", "INVOICE_MATCHING", "INVOICE_UNIT_REVIEW", "FUTURE_POLICY", "PURCHASE_REQUEST", "PURCHASE_ORDER"];
const labels = ["Sourcing publication", "Receiving and service acceptance", "Invoice matching", "Original invoice unit review", "Other policy (FUTURE_POLICY)"];
const id = (index: number) => `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`;
const definition = (key: string) => JSON.stringify({ schemaVersion: 1, transactionType: key === "PURCHASE_ORDER" ? "PurchaseOrder" : "PurchaseRequest",
  currencyCode: "ZMW", amountBasis: key === "PURCHASE_ORDER" ? "ApprovedLineBase" : "EstimatedLineBase",
  rules: [{ code: "DEFAULT", priority: 0, when: { minimumAmountInclusive: null, maximumAmountExclusive: null, categoryCodes: [], purchaseTypes: [], branchIds: [] },
    result: { budgetReservation: "Required", sourcingMethodCode: null, minimumQuoteCount: null, approvalStages: [{ code: "BUYING", assignee: "ProcurementManager", mode: "One" }] } }] });

// Mocked UI dispatch contract only, not policy or database authorization evidence.
async function fixture(page: Page, detailKeyOverride?: string) {
  const writes: string[] = [], reads: string[] = [];
  let retired = false;
  const record = (key: string, index: number) => ({ id: id(index), policyKey: key, policyVersionNumber: 1,
    state: retired && index === 0 ? "Retired" : index === 6 || index === 2 ? "PendingReview" : "Draft", version: retired && index === 0 ? 2 : 1,
    effectiveFrom: "2026-12-01T00:00:00Z", effectiveTo: null, createdAt: "2026-10-22T00:00:00Z",
    draftRetirementVersion: 1, canRetireDraft: index === 0 && !retired,
    rulesJson: definition(key) });
  await page.addInitScript(value => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: value })), company);
  await page.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, roles: ["procurement_manager"], displayName: "Reader" } });
    if (path === "/api/hrm/branding") return json({ displayName: "Test company" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "TEST", registeredName: "Test company" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "test", legalEntityId: company, workerId: worker,
      permissions: ["procurement-access", "procurement-configuration-read", "procurement-configuration-edit", "procurement-configuration-approve"],
      company: { id: company, code: "TEST", name: "Test company", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true, capabilities: { configurationDraft: true } });
    const base = "/api/procurement/v1/configuration/policies";
    if (path.startsWith(base)) {
      if (method !== "GET") writes.push(`${method} ${path}`); else reads.push(path);
      if (path === base && method === "GET") return json({ items: keys.map(record), total: keys.length, page: 1, pageSize: 100 });
      const index = keys.findIndex((_, i) => path === `${base}/${id(i)}`);
      if (index >= 0 && method === "GET") return json(record(detailKeyOverride ?? keys[index], index));
      if (path === `${base}/${id(0)}/retire` && method === "POST") { retired = true; return json(record(keys[0], 0)); }
    }
    return json({ message: `Unexpected ${method} ${path}` }, 404);
  });
  return { writes, reads };
}

test("owning keys stay correctly labelled read only while PR and PO keep controls", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/procurement/workspace/settings/buying-rules");
  for (const label of labels) {
    const row = page.getByRole("cell", { name: label, exact: true }).locator("..");
    await expect(row).toBeVisible();
    for (const name of ["Try a sample", "Edit draft", "Send for review", "Publish", "Return for changes"])
      await expect(row.getByRole("button", { name, exact: true })).toHaveCount(0);
    await expect(row.getByText("Read only here.", { exact: false })).toBeVisible();
  }
  const pr = page.getByRole("cell", { name: "Purchase requests", exact: true }).locator("..");
  await expect(pr.getByRole("button", { name: "Edit draft", exact: true })).toBeVisible();
  await expect(pr.getByRole("button", { name: "Send for review", exact: true })).toBeVisible();
  const po = page.getByRole("cell", { name: "Purchase orders", exact: true }).locator("..");
  await expect(po.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await expect(po.getByRole("button", { name: "Return for changes", exact: true })).toBeVisible();
  const source = page.getByRole("cell", { name: labels[0], exact: true }).locator("..");
  await source.getByRole("button", { name: "View saved version" }).click();
  await expect(page.getByText("Sourcing publication — saved version 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sourcing settings" }).first()).toHaveAttribute("href", /settings\/modules\/request-for-quotes\/approvals$/);
  expect(state.reads).toContain(`/api/procurement/v1/configuration/policies/${id(0)}`);
  expect(state.writes).toEqual([]);
});

test("a detail key cannot masquerade as PR merely by carrying PR JSON", async ({ page }) => {
  const state = await fixture(page, "RECEIVING");
  await page.goto("/procurement/workspace/settings/buying-rules");
  await page.getByRole("cell", { name: "Purchase requests", exact: true }).locator("..").getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("fuller editor");
  await expect(page.getByRole("button", { name: "Check and save draft" })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});


test("advanced draft retirement stays tied to the actual server hint", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/procurement/workspace/settings/buying-rules");
  const source = page.getByRole("cell", { name: labels[0], exact: true }).locator("..");
  const receiving = page.getByRole("cell", { name: labels[1], exact: true }).locator("..");
  await expect(receiving.getByRole("button", { name: "Retire unused draft" })).toHaveCount(0);
  await source.getByRole("button", { name: "Retire unused draft" }).click();
  await page.getByLabel("Retirement reason").fill("Unused draft retained for history");
  await page.getByRole("button", { name: "Confirm retirement", exact: true }).click();
  await expect(source.getByText("Retired", { exact: true })).toBeVisible();
  expect(state.writes).toEqual([`POST /api/procurement/v1/configuration/policies/${id(0)}/retire`]);
});
