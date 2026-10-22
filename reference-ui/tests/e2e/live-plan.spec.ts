import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const planId = "55555555-5555-4555-8555-555555555555";
const lineId = "66666666-6666-4666-8666-666666666666";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "planningDraft"]));
type PlanRecord = Record<string, unknown> & {
  id: string; version: number; status: string; lines: Record<string, unknown>[];
};

async function mockErp(page: Page, options: { denyList?: boolean; staleUpdate?: boolean } = {}) {
  let record: PlanRecord | null = null;
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
    if (path === "/api/procurement/v1/plans") {
      if (request.method() === "GET") return options.denyList ? json({ message: "Forbidden" }, 403)
        : json({ items: record ? [{ ...record, lineCount: record.lines.filter((line) => line.status === "Active").length }] : [], total: record ? 1 : 0, page: 1, pageSize: 25 });
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        record = { ...input, id: planId, number: "PLAN-001", status: "Draft", version: 1,
          revisionNumber: 0, createdAt: "2026-10-18T00:00:00Z", currencyCode: input.currencyCode || "ZMW",
          lines: input.lines.map((line: Record<string, unknown>) => ({ ...line, id: lineId, lineNumber: 1, status: "Active", version: 1 })) };
        return json(record, 201);
      }
    }
    if (path === `/api/procurement/v1/plans/${planId}` && record) {
      if (request.method() === "GET") return json(record);
      if (request.method() === "PUT") {
        if (options.staleUpdate) return json({ message: "Refresh this plan before saving changes." }, 409);
        const input = request.postDataJSON();
        record = { ...record, ...input.draft, version: record.version + 1,
          lines: input.draft.lines.map((line: Record<string, unknown>) => ({ ...line, id: line.id || lineId, lineNumber: 1, status: "Active", version: 2 })) };
        return json(record);
      }
    }
    if (path === `/api/procurement/v1/plans/${planId}/cancel` && record) {
      const input = request.postDataJSON();
      record = { ...record, status: "Cancelled", statusReason: input.reason, version: record.version + 1,
        lines: record.lines.map((line) => ({ ...line, status: "Cancelled" })) };
      return json(record);
    }
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
}

test("purchase plan draft persists, can be revised and cancelled", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/plans");
  await expect(page.getByText("No purchase plans yet")).toBeVisible();
  await page.getByRole("link", { name: "New plan" }).first().click();
  await page.getByLabel("Financial period").fill("FY 2027");
  await page.getByLabel("Need 1").fill("Office desks");
  await page.getByLabel("Estimated amount").fill("40000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "FY 2027" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Office desks" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: "Office desks" })).toBeVisible();
  await page.getByRole("link", { name: "Edit draft" }).click();
  await page.getByLabel("Estimated amount").fill("50000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("ZMW 50,000.00")).toHaveCount(2);
  await page.getByLabel("Reason").fill("Priorities changed");
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(page.getByRole("heading", { name: "Purchase Plans" })).toBeVisible();
  await expect(page.getByText("Cancelled")).toBeVisible();
});

test("plan list denial shows no local records", async ({ page }) => {
  await mockErp(page, { denyList: true });
  await page.goto("/procurement/workspace/plans");
  await expect(page.getByRole("alert")).toContainText("do not have access");
  await expect(page.getByText("No purchase plans yet")).toBeVisible();
});

test("stale plan edit preserves entered values", async ({ page }) => {
  await mockErp(page, { staleUpdate: true });
  await page.goto("/procurement/workspace/plans/new");
  await page.getByLabel("Financial period").fill("FY 2027");
  await page.getByLabel("Need 1").fill("Office desks");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("link", { name: "Edit draft" }).click();
  await page.getByLabel("Need 1").fill("Revised desks");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh");
  await expect(page.getByLabel("Need 1")).toHaveValue("Revised desks");
});


test("unavailable plans edit cannot create a replacement record", async ({ page }) => {
  await mockErp(page);
  let writes = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/procurement/v1/plans")
      && ["POST", "PUT"].includes(request.method())) writes++;
  });
  await page.goto(`/procurement/workspace/plans/${planId}/edit`);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});
