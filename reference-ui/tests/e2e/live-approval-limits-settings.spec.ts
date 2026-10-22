import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const worker = "22222222-2222-4222-8222-222222222222";
const person = "33333333-3333-4333-8333-333333333333";
const capabilities = Object.fromEntries(["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft"].map(key => [key, true]));

async function fixture(page: Page, permissions: string[], lostCreate = false) {
  let listReads = 0, creates = 0;
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id })), company);
  await page.route("**/api/**", route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, roles: ["procurement_manager"], displayName: "Settings user" } });
    if (path === "/api/hrm/branding") return json({ displayName: "Test company" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "TEST", registeredName: "Test company" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "test", legalEntityId: company, workerId: worker,
      permissions: ["procurement-access", ...permissions], company: { id: company, code: "TEST", name: "Test company", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "test", legalEntityId: company, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/configuration/spending-authorities" && method === "GET") {
      listReads++;
      const action = url.searchParams.get("action");
      return json({ items: [], total: 0, page: 1, pageSize: 25, currentActorPrincipalId: person,
        canCreate: true, createAction: action, createAmountBasis: action === "PurchaseOrder.Approve" ? "ApprovedLineBase" : "EstimatedLineBase",
        scope: { branchId: null, departmentId: null, confined: false } });
    }
    if (path === "/api/procurement/v1/configuration/spending-authorities/lookups/people")
      return json({ items: [{ principalId: person, displayName: "Named approver" }], offset: 0, limit: 25, nextOffset: null });
    if (path.includes("/configuration/spending-authorities/lookups/"))
      return json({ items: [], offset: 0, limit: 25, nextOffset: null });
    if (path === "/api/procurement/v1/configuration/spending-authorities" && method === "POST") {
      creates++;
      if (lostCreate) return route.abort("failed");
      return json({ message: "Unexpected create" }, 500);
    }
    return json({ message: `Unexpected ${method} ${path}` }, 404);
  });
  return { listReads: () => listReads, creates: () => creates };
}

test("request approval limits require authority read and do not borrow generic configuration access", async ({ page }) => {
  const state = await fixture(page, ["procurement-configuration-read"]);
  await page.goto("/procurement/workspace/settings/modules/purchase-requests/approvals");
  await expect(page.getByRole("heading", { level: 1, name: "Purchase Requests settings" })).toBeVisible();
  await expect(page.getByText("You do not have access to approval limits.")).toBeVisible();
  expect(state.listReads()).toBe(0);
});

test("authority reader sees only their scoped list and no draft command", async ({ page }) => {
  const state = await fixture(page, ["procurement-authority-read"]);
  await page.goto("/procurement/workspace/settings/modules/purchase-orders/approvals");
  await expect(page.getByText("No approval limits yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add approval limit" })).toHaveCount(0);
  expect(state.listReads()).toBeGreaterThan(0);
  expect(state.creates()).toBe(0);
});

test("interrupted PO limit create keeps entered data and blocks a second POST", async ({ page }) => {
  const state = await fixture(page, ["procurement-authority-read", "procurement-authority-configure"], true);
  await page.goto("/procurement/workspace/settings/modules/purchase-orders/approvals");
  await page.getByRole("button", { name: "Add approval limit" }).click();
  await page.getByLabel("Limit reference").fill("PO-LIMIT-KEEP");
  await page.getByLabel("Person", { exact: true }).selectOption(person);
  await page.getByLabel("Maximum amount").fill("99999999999999.9999");
  await page.getByRole("button", { name: "Save limit draft" }).click();
  await expect(page.getByText("The saved result is uncertain.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Limit reference")).toHaveValue("PO-LIMIT-KEEP");
  await expect(page.getByLabel("Maximum amount")).toHaveValue("99999999999999.9999");
  await page.getByRole("button", { name: "Read saved result" }).click();
  await expect(page.getByText("This form will not repeat the create.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Close after comparison" }).click();
  await page.reload();
  await expect(page.getByText("This approval type is read-only in this session.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add approval limit" })).toHaveCount(0);
  expect(state.creates()).toBe(1);
});
