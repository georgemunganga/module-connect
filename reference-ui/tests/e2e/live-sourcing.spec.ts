import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const lineId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "sourcingDraft"]));
type EventRecord = Record<string, unknown> & {
  id: string; version: number; title: string; status: string; lines: Record<string, unknown>[];
};

async function mockErp(page: Page, options: { denyList?: boolean; staleUpdate?: boolean } = {}) {
  let record: EventRecord | null = null;
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
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: companyId, workerId, permissions: ["procurement-access", "procurement-sourcing-read", "procurement-sourcing-create", "procurement-sourcing-edit"], company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: companyId, schemaReady: true, capabilities });
    if (path === "/api/procurement/v1/sourcing") {
      if (request.method() === "GET") return options.denyList ? json({ message: "Forbidden" }, 403)
        : json({ items: record ? [{ ...record, lineCount: record.lines.filter((line) => line.status === "Active").length }] : [], total: record ? 1 : 0, page: 1, pageSize: 25 });
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        record = { ...input, id: eventId, number: "RF-001", status: "Draft", version: 1,
          currencyCode: input.currencyCode || "ZMW", lines: input.lines.map((line: Record<string, unknown>) => ({ ...line, id: lineId, lineNumber: 1, status: "Active", version: 1 })) };
        return json(record, 201);
      }
    }
    if (path === `/api/procurement/v1/sourcing/${eventId}` && record) {
      if (request.method() === "GET") return json(record);
      if (request.method() === "PUT") {
        if (options.staleUpdate) return json({ message: "Refresh this event before saving." }, 409);
        const input = request.postDataJSON();
        record = { ...record, ...input.draft, version: record.version + 1,
          lines: input.draft.lines.map((line: Record<string, unknown>) => ({ ...line, id: lineId, lineNumber: 1, status: "Active", version: 2 })) };
        return json(record);
      }
    }
    if (path === `/api/procurement/v1/sourcing/${eventId}/cancel` && record) {
      const input = request.postDataJSON();
      record = { ...record, status: "Cancelled", cancellationReason: input.reason, version: record.version + 1,
        lines: record.lines.map((line) => ({ ...line, status: "Cancelled" })) };
      return json(record);
    }
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
}

test("quote request draft persists, can be revised and cancelled", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/rfqs");
  await expect(page.getByText("No quote requests yet")).toBeVisible();
  await page.getByRole("link", { name: "New quote request" }).first().click();
  await page.getByLabel("What are you buying?").fill("Office chairs for Lusaka");
  await page.getByLabel("Item or service 1").fill("Office chair");
  await page.getByLabel("Quantity").fill("10");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Office chairs for Lusaka" })).toBeVisible();
  await page.getByRole("tab", { name: "Items (1)" }).click();
  await expect(page.getByRole("cell", { name: "Office chair" })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Items (1)" }).click();
  await expect(page.getByRole("cell", { name: "Office chair" })).toBeVisible();
  await page.getByRole("link", { name: "Edit draft" }).click();
  await page.getByLabel("Quantity").fill("12");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("tab", { name: "Items (1)" }).click();
  await expect(page.getByRole("cell", { name: "12" })).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByLabel("Reason").fill("Specifications changed");
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(page.getByRole("heading", { name: "Request for Quotes" })).toBeVisible();
  await expect(page.getByText("Cancelled")).toBeVisible();
});

test("quote request list denial does not show demo records", async ({ page }) => {
  await mockErp(page, { denyList: true });
  await page.goto("/procurement/workspace/rfqs");
  await expect(page.getByRole("alert")).toContainText("do not have access");
  await expect(page.getByText("No quote requests yet")).toHaveCount(0);
  await expect(page.getByTestId("erp-record-table")).toHaveCount(0);
});

test("live RFQ retains directory, wizard stages and detail sections without publishing", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/rfqs");
  await expect(page.getByRole("button", { name: "Filter Request for Quotes by field" })).toBeVisible();
  await page.getByRole("link", { name: "New quote request" }).first().click();
  await expect(page.getByLabel("Quote request stages")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bidding Preferences", exact: true })).toBeVisible();
  await page.getByLabel("Quote request stages").getByRole("button", { name: /Items$/ }).click();
  await expect(page.locator("#rfq-stage-1")).toBeInViewport();
  await page.getByLabel("Quote request stages").getByRole("button", { name: /Terms$/ }).click();
  await expect(page.locator("#rfq-stage-2")).toBeInViewport();
  await page.getByLabel("Quote request stages").getByRole("button", { name: /Basic Details$/ }).click();
  await expect(page.locator("#rfq-stage-0")).toBeInViewport();
  await page.getByLabel("What are you buying?").fill("Office chairs");
  await page.getByLabel("Item or service 1").fill("Chair");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("tab", { name: "Items (1)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
  await page.getByRole("tab", { name: "Comments" }).click();
  await expect(page.getByText("Comments are not available for this quote request yet.")).toBeVisible();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Cancel this draft" })).toBeVisible();
});

test("stale quote edit preserves entered values", async ({ page }) => {
  await mockErp(page, { staleUpdate: true });
  await page.goto("/procurement/workspace/rfqs/new");
  await page.getByLabel("What are you buying?").fill("Office chairs");
  await page.getByLabel("Item or service 1").fill("Chair");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("link", { name: "Edit draft" }).click();
  await page.getByLabel("Item or service 1").fill("Updated chair");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh");
  await expect(page.getByLabel("Item or service 1")).toHaveValue("Updated chair");
});

test("unavailable quote edit never falls back to creating another draft", async ({ page }) => {
  await mockErp(page);
  let writes = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/procurement/v1/sourcing")
      && ["POST", "PUT"].includes(request.method())) writes++;
  });
  await page.goto(`/procurement/workspace/rfqs/${eventId}/edit`);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("What are you buying?", { exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});

test("a delayed quote save cannot reopen the editor after navigating away", async ({ page }) => {
  await mockErp(page);
  let release!: () => void;
  let arrived!: () => void;
  const received = new Promise<void>(resolve => { arrived = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/procurement/v1/sourcing", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    arrived(); await blocked;
    const input = route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
      ...input, id: eventId, number: "RF-001", status: "Draft", version: 1,
      lines: input.lines.map((line: Record<string, unknown>) => ({ ...line, id: lineId, lineNumber: 1, status: "Active", version: 1 })),
    }) });
  });
  await page.goto("/procurement/workspace/rfqs/new");
  await page.getByLabel("What are you buying?", { exact: true }).fill("Delayed chairs");
  await page.getByLabel("Item or service 1", { exact: true }).fill("Chair");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await received;
  await page.getByRole("link", { name: "Request for Quotes", exact: true }).click();
  await expect(page).toHaveURL(/\/rfqs$/);
  const settled = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/sourcing"));
  release(); const response = await settled; await response.finished();
  await expect(page.waitForURL(new RegExp(`/rfqs/${eventId}$`), { timeout: 1000 })).rejects.toThrow();
  await expect(page.getByRole("heading", { name: "Request for Quotes", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/rfqs$/);
});


test("unconfirmed rfqs create preserves entries and blocks repeat submission", async ({ page }) => {
  await mockErp(page);
  let attempts = 0;
  await page.route("**/api/procurement/v1/sourcing", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts++; await route.abort("connectionreset");
  });
  await page.goto("/procurement/workspace/rfqs/new");
  await page.getByLabel("What are you buying?", { exact: true }).fill("Unconfirmed quotes");
  await page.getByLabel("Item or service 1", { exact: true }).fill("Chair");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("save result was not confirmed");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await expect(page.getByLabel("What are you buying?", { exact: true })).toHaveValue("Unconfirmed quotes");
  await page.getByRole("link", { name: /^Review saved / }).click();
  await expect(page).toHaveURL(/\/rfqs$/);
  expect(attempts).toBe(1);
});

test("actual exported ad hoc editor and detail routes remain legacy and never recurse into governed dispatch", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/rfqs/new");
  await page.getByLabel("What are you buying?").fill("Ad hoc route proof");
  await page.getByLabel("Item or service 1").fill("Paper");
  await page.getByLabel("Quantity").fill("2");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ad hoc route proof", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ad hoc route proof", exact: true })).toBeVisible();
  await expect(page.getByText("This is an internal draft.", { exact: false })).toHaveCount(0);
});

for (const width of [1440, 390]) test(`RFQ wizard fits ERP workspace at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await mockErp(page);
  await page.goto("/procurement/workspace/rfqs/new");
  await expect(page.getByLabel("Quote request stages")).toBeVisible();
  await expect(page.getByRole("heading", { name: "New quote request", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`rfq-wizard-${width}.png`), fullPage: true });
});
