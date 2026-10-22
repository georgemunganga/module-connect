import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const categoryId = "77777777-7777-4777-8777-777777777777";
const methodId = "88888888-8888-4888-8888-888888888888";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "configurationDraft"]));
type Reference = Record<string, unknown> & { id: string; code: string; name: string; version: number; status: string };

async function mockErp(page: Page, options: { denyList?: boolean; staleUpdate?: boolean; staleRemoval?: boolean; canApprove?: boolean } = {}) {
  let category: Reference | null = null;
  let method: Reference | null = null;
  await page.addInitScript((entityId) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId })), companyId);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Manager", email: "manager@example.test", roles: ["procurement_manager"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: companyId, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ tenantId: "amizo", legalEntityId: companyId, workerId,
      permissions: options.canApprove ? ["procurement-access", "procurement-configuration-approve"] : [],
      company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: companyId, schemaReady: true, capabilities });
    for (const kind of ["categories", "methods"] as const) {
      const base = `/api/procurement/v1/configuration/${kind}`;
      const current = kind === "categories" ? category : method;
      const id = kind === "categories" ? categoryId : methodId;
      if (path === base) {
        if (request.method() === "GET") return options.denyList ? json({ message: "Forbidden" }, 403)
          : json({ items: current ? [current] : [], total: current ? 1 : 0, page: 1, pageSize: 25 });
        if (request.method() === "POST") {
          const input = request.postDataJSON();
          const saved = { ...input, id, status: "Draft", version: 1, createdAt: "2026-10-18T00:00:00Z" };
          if (kind === "categories") category = saved; else method = saved;
          return json(saved, 201);
        }
      }
      if (path === `${base}/${id}` && current) {
        if (request.method() === "GET") return json(current);
        if (request.method() === "PUT") {
          if (options.staleUpdate) return json({ message: "Refresh this setting before saving." }, 409);
          const input = request.postDataJSON();
          const saved = { ...current, ...input.draft, version: current.version + 1 };
          if (kind === "categories") category = saved; else method = saved;
          return json(saved);
        }
      }
      if (path === `${base}/${id}/retire` && current) {
        if (options.staleRemoval) return json({ message: "Refresh this setting before removing it." }, 409);
        const { version, reason } = request.postDataJSON();
        if (version !== current.version || !reason?.trim()) return json({ message: "Refresh or add a removal reason." }, 409);
        const retired = { ...current, status: "Retired", version: current.version + 1 };
        if (kind === "categories") category = retired; else method = retired;
        return json(retired);
      }
      if (path === `${base}/${id}/activate` && current) {
        const { version, reason } = request.postDataJSON();
        if (version !== current.version || !reason) return json({ message: "Refresh or add a review reason." }, 409);
        const activated = { ...current, status: "Active", version: current.version + 1 };
        if (kind === "categories") category = activated; else method = activated;
        return json(activated);
      }
    }
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
}

test("category and buying method drafts persist in Procurement settings", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/settings/reference-data");
  await expect(page.getByRole("heading", { name: "Buying categories & methods" })).toBeVisible();
  await page.getByRole("button", { name: "Add category" }).first().click();
  await page.getByRole("textbox", { name: "Code", exact: true }).fill("IT");
  await page.getByLabel("Name").fill("Technology");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("cell", { name: "Technology" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: "Technology" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("textbox", { name: "Code", exact: true })).toBeDisabled();
  await page.getByLabel("Name").fill("IT equipment");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("cell", { name: "IT equipment" })).toBeVisible();
  await page.getByRole("tab", { name: "Buying methods" }).click();
  await page.getByRole("button", { name: "Add buying method" }).first().click();
  await page.getByRole("textbox", { name: "Code", exact: true }).fill("RFQ");
  await page.getByLabel("Name").fill("Request for quotes");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("cell", { name: "Request for quotes" })).toBeVisible();
});

test("separate reviewer activates a category for buying", async ({ page }) => {
  await mockErp(page, { canApprove: true });
  await page.goto("/procurement/workspace/settings/reference-data");
  await page.getByRole("button", { name: "Add category" }).first().click();
  await page.getByRole("textbox", { name: "Code", exact: true }).fill("OFFICE");
  await page.getByLabel("Name").fill("Office equipment");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByLabel("Review reason").fill("Checked category and parent");
  await page.getByRole("button", { name: "Activate category" }).click();
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
});

test("separate reviewer activates a buying method", async ({ page }) => {
  await mockErp(page, { canApprove: true });
  await page.goto("/procurement/workspace/settings/reference-data");
  await page.getByRole("tab", { name: "Buying methods" }).click();
  await page.getByRole("button", { name: "Add buying method" }).first().click();
  await page.getByRole("textbox", { name: "Code", exact: true }).fill("DIRECT");
  await page.getByLabel("Name").fill("Direct purchase");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("Check the buying method and any linked policy", { exact: false })).toBeVisible();
  await page.getByLabel("Review reason").fill("Reviewed method and scope");
  const review = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith("/configuration/methods/" + methodId + "/activate"));
  await page.getByRole("button", { name: "Activate buying method" }).click();
  expect((await review).postDataJSON()).toMatchObject({ version: 1, reason: "Reviewed method and scope" });
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
});

test("configuration denial shows no browser-only records", async ({ page }) => {
  await mockErp(page, { denyList: true });
  await page.goto("/procurement/workspace/settings/reference-data");
  await expect(page.getByRole("alert")).toContainText("do not have access");
  await expect(page.getByText("No categories yet")).toBeVisible();
});

test("stale configuration edit keeps entered fields", async ({ page }) => {
  await mockErp(page, { staleUpdate: true });
  await page.goto("/procurement/workspace/settings/reference-data");
  await page.getByRole("button", { name: "Add category" }).first().click();
  await page.getByRole("textbox", { name: "Code", exact: true }).fill("IT");
  await page.getByLabel("Name").fill("Technology");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Revised technology");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh");
  await expect(page.getByLabel("Name")).toHaveValue("Revised technology");
});


for (const kind of ["category", "buying method"] as const) {
  test(`unused ${kind} removal is confirmed and survives a reload (mocked API)`, async ({ page }) => {
    await mockErp(page);
    await page.goto("/procurement/workspace/settings/reference-data");
    if (kind === "buying method") await page.getByRole("tab", { name: "Buying methods" }).click();
    await page.getByRole("button", { name: `Add ${kind}` }).first().click();
    await page.getByRole("textbox", { name: "Code", exact: true }).fill("UNUSED");
    await page.getByLabel("Name", { exact: true }).fill("Unused setting");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("button", { name: `Remove ${kind}`, exact: true })).toBeDisabled();
    await page.getByLabel("Removal reason").fill("Draft is not required");
    await page.getByRole("button", { name: `Remove ${kind}`, exact: true }).click();
    await expect(page.getByRole("cell", { name: "Retired", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await page.reload();
    if (kind === "buying method") await page.getByRole("tab", { name: "Buying methods" }).click();
    await expect(page.getByRole("cell", { name: "Unused setting", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Retired", exact: true })).toBeVisible();
  });
}

test("stale draft removal preserves the reason and does not claim success (mocked API)", async ({ page }) => {
  await mockErp(page, { staleRemoval: true });
  await page.goto("/procurement/workspace/settings/reference-data");
  await page.getByRole("button", { name: "Add category" }).first().click();
  await page.getByRole("textbox", { name: "Code", exact: true }).fill("STALE");
  await page.getByLabel("Name", { exact: true }).fill("Keep my draft");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByLabel("Removal reason").fill("Reason stays here");
  await page.getByRole("button", { name: "Remove category", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh this setting");
  await expect(page.getByLabel("Removal reason")).toHaveValue("Reason stays here");
  await expect(page.getByRole("cell", { name: "Draft", exact: true })).toBeVisible();
});
