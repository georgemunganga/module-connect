import { expect, test, type Page } from "@playwright/test";

const companyId = "11111111-1111-4111-8111-111111111111";
const workerId = "22222222-2222-4222-8222-222222222222";
const vendorId = "33333333-3333-4333-8333-333333333333";
const contractId = "44444444-4444-4444-8444-444444444444";
const capabilities = Object.fromEntries([
  "vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft",
].map((key) => [key, key === "contractDraft"]));
type ContractRecord = Record<string, unknown> & { id: string; version: number; title: string; status: string };

async function mockErp(page: Page, options: { denyList?: boolean; staleUpdate?: boolean; noSupplier?: boolean; searchOnly?: boolean; ratesEnabled?: boolean; loseFirstRate?: boolean } = {}) {
  let record: ContractRecord | null = null;
  let savedRate: Record<string, unknown> | null = null;
  let rateWrites = 0;
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
    if (path === "/api/procurement/v1/context") return json({ principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenantId: "amizo", legalEntityId: companyId, workerId: null, permissions: ["procurement-access", "procurement-contract-read", "procurement-contract-create", "procurement-contract-edit"], company: { id: companyId, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: companyId, schemaReady: true, capabilities: { ...capabilities, contractDraftRates: options.ratesEnabled === true } });
    if (path === "/api/procurement/v1/vendors") {
      const found = !options.noSupplier && (!options.searchOnly || new URL(request.url()).searchParams.get("search")?.toLowerCase().includes("copper"));
      return json({ items: found ? [{ id: vendorId, number: "VEN-001", displayName: "Copper Supplies", legalName: "Copper Supplies", countryCode: "ZM", status: "Active", isOrderable: true, version: 1, createdAt: "2026-10-18T00:00:00Z" }] : [], total: found ? 1 : 0, page: 1, pageSize: 100 });
    }
    if (path === "/api/procurement/v1/contracts") {
      if (request.method() === "GET") return options.denyList ? json({ message: "Forbidden" }, 403)
        : json({ items: record ? [record] : [], total: record ? 1 : 0, page: 1, pageSize: 25 });
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        record = { ...input, ceilingAmount: Number(input.ceilingAmount),
          ceilingAmountExact: input.ceilingAmount, id: contractId, number: "CON-001", status: "Draft", version: 1,
          currencyCode: input.currencyCode || "ZMW", draftVersion: { id: contractId, revisionNumber: 1, status: "Draft", version: 1 } };
        return json(record, 201);
      }
    }
    if (path === `/api/procurement/v1/contracts/${contractId}` && record) {
      if (request.method() === "GET") return json(record);
      if (request.method() === "PUT") {
        if (options.staleUpdate) return json({ message: "Refresh this contract before saving." }, 409);
        const input = request.postDataJSON();
        record = { ...record, ...input.draft, ceilingAmount: Number(input.draft.ceilingAmount),
          ceilingAmountExact: input.draft.ceilingAmount, version: record.version + 1 };
        return json(record);
      }
    }
    if (path === `/api/procurement/v1/contracts/${contractId}/cancel` && record) {
      const input = request.postDataJSON();
      record = { ...record, status: "Cancelled", terminationReason: input.reason, version: record.version + 1 };
      return json(record);
    }
    if (path === `/api/procurement/v1/contracts/${contractId}/rates` && record) {
      if (request.method() === "GET") return json({ contractId, contractVersion: record.version, draftVersionId: contractId, items: savedRate ? [savedRate] : [] });
      if (request.method() === "POST") {
        rateWrites++;
        const input = request.postDataJSON();
        if (input.contractVersion !== record.version) return json({ message: "Refresh the contract." }, 409);
        record = { ...record, version: record.version + 1 };
        savedRate = { ...input.rate, id: "55555555-5555-4555-8555-555555555555",
          lineNumber: 1, unitPriceExact: input.rate.unitPrice, maximumQuantityExact: input.rate.maximumQuantity,
          status: "Active", statusReason: null, version: 1 };
        if (options.loseFirstRate && rateWrites === 1) return route.abort("failed");
        return json({ contractId, contractVersion: record.version, rate: savedRate }, 201);
      }
    }
    if (path === `/api/procurement/v1/contracts/${contractId}/rates/55555555-5555-4555-8555-555555555555` && record && savedRate) {
      if (request.method() === "GET") return json({ contractId, contractVersion: record.version, rate: savedRate });
      const input = request.postDataJSON();
      if (input.contractVersion !== record.version || input.rateVersion !== savedRate.version)
        return json({ message: "Refresh the rate." }, 409);
      if (request.method() === "PUT") savedRate = { ...savedRate, ...input.rate,
        unitPriceExact: String(input.rate.unitPrice).replace(/0+$/, "").replace(/\.$/, ""),
        maximumQuantityExact: input.rate.maximumQuantity, version: Number(savedRate.version) + 1 };
      else if (request.method() === "POST") savedRate = { ...savedRate, status: "Removed", statusReason: input.reason, version: Number(savedRate.version) + 1 };
      else return json({ message: "Unexpected method" }, 405);
      record = { ...record, version: record.version + 1 };
      return json({ contractId, contractVersion: record.version, rate: savedRate });
    }
    return json({ message: `Unexpected route: ${path}` }, 404);
  });
  return { rateWrites: () => rateWrites };
}

test("contract draft is saved, revised and cancelled", async ({ page }) => {
  await mockErp(page);
  await page.goto("/procurement/workspace/contracts");
  await expect(page.getByText("No contracts yet")).toBeVisible();
  await page.getByRole("link", { name: "New contract" }).first().click();
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: /Copper Supplies/ }).click();
  await page.getByLabel("Contract title").fill("Office supplies agreement");
  await page.getByLabel("Spending limit").fill("50000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Office supplies agreement" })).toBeVisible();
  await expect(page.getByText("ZMW 50,000.00")).toBeVisible();
  await expect(page.getByText("Detailed draft rates are not available for this ERP company yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add rate" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Office supplies agreement" })).toBeVisible();
  await page.getByRole("link", { name: "Edit draft" }).click();
  await page.getByLabel("Spending limit").fill("60000");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("ZMW 60,000.00")).toBeVisible();
  await page.getByLabel("Reason").fill("Agreement withdrawn");
  await page.getByRole("button", { name: "Cancel draft" }).click();
  await expect(page.getByRole("heading", { name: "Contracts" })).toBeVisible();
  await expect(page.getByText("Cancelled")).toBeVisible();
});

test("draft rates keep exact prices, removed history and parent CAS in the existing contract detail", async ({ page }) => {
  await mockErp(page, { ratesEnabled: true });
  await page.goto("/procurement/workspace/contracts/new");
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: /Copper Supplies/ }).click();
  await page.getByLabel("Contract title").fill("Rate schedule");
  await page.getByLabel("Spending limit").fill("99999999999999.9999");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("ZMW 99,999,999,999,999.9999")).toBeVisible();
  await page.getByRole("button", { name: "Add rate" }).click();
  await page.getByLabel("Description").fill("Monthly support");
  await page.getByLabel("Unit").fill("month");
  await page.getByLabel("Unit price").fill("0.0001");
  await page.getByLabel("Maximum quantity (optional)").fill("2.5000");
  await page.getByRole("button", { name: "Save rate" }).click();
  await expect(page.getByText("Monthly support")).toBeVisible();
  await expect(page.getByRole("cell", { name: "0.0001" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: "0.0001" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Unit price").fill("1.2500");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("cell", { name: "1.25" })).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByLabel("Why remove this rate?").fill("No longer offered");
  await page.getByRole("button", { name: "Remove rate" }).click();
  await expect(page.getByText("Reason: No longer offered")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
});

test("lost rate response requires GET review and never retries POST", async ({ page }) => {
  const state = await mockErp(page, { ratesEnabled: true, loseFirstRate: true });
  await page.goto("/procurement/workspace/contracts/new");
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: /Copper Supplies/ }).click();
  await page.getByLabel("Contract title").fill("Lost acknowledgement");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Add rate" }).click();
  await page.getByLabel("Description").fill("Monthly support");
  await page.getByLabel("Unit").fill("month");
  await page.getByLabel("Unit price").fill("0.0001");
  await page.getByRole("button", { name: "Save rate" }).click();
  await expect(page.getByText("The last result needs review.")).toBeVisible();
  expect(state.rateWrites()).toBe(1);
  await expect(page.getByRole("button", { name: "Save rate" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("The last result needs review.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add rate" })).toHaveCount(0);
  expect(state.rateWrites()).toBe(1);
  await page.getByRole("button", { name: "Review saved contract and rates" }).click();
  await expect(page.getByText("Monthly support")).toBeVisible();
  expect(state.rateWrites()).toBe(1);
});

test("contract list denial does not show local records", async ({ page }) => {
  await mockErp(page, { denyList: true });
  await page.goto("/procurement/workspace/contracts");
  await expect(page.getByRole("alert")).toContainText("do not have access");
  await expect(page.getByText("No contracts yet")).toBeVisible();
});

test("stale contract save keeps entered values", async ({ page }) => {
  await mockErp(page, { staleUpdate: true });
  await page.goto("/procurement/workspace/contracts/new");
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: /Copper Supplies/ }).click();
  await page.getByLabel("Contract title").fill("Office supplies agreement");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("link", { name: "Edit draft" }).click();
  await page.getByLabel("Contract title").fill("Revised agreement");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh");
  await expect(page.getByLabel("Contract title")).toHaveValue("Revised agreement");
});

test("cannot save a contract without an eligible supplier", async ({ page }) => {
  await mockErp(page, { noSupplier: true });
  await page.goto("/procurement/workspace/contracts/new");
  await expect(page.getByText("Add an eligible supplier before creating a contract.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
});

test("supplier picker searches beyond the initial supplier page", async ({ page }) => {
  await mockErp(page, { searchOnly: true });
  await page.goto("/procurement/workspace/contracts/new");
  await expect(page.getByText("Add an eligible supplier before creating a contract.")).toBeVisible();
  await page.getByLabel("Search suppliers").fill("Copper");
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: /Copper Supplies/ }).click();
  await page.getByLabel("Contract title").fill("Copper supply agreement");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("heading", { name: "Copper supply agreement" })).toBeVisible();
});


test("unavailable contracts edit cannot create a replacement record", async ({ page }) => {
  await mockErp(page);
  let writes = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/procurement/v1/contracts")
      && ["POST", "PUT"].includes(request.method())) writes++;
  });
  await page.goto(`/procurement/workspace/contracts/${contractId}/edit`);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});


test("unconfirmed contracts create preserves entries and blocks repeat submission", async ({ page }) => {
  await mockErp(page);
  let attempts = 0;
  await page.route("**/api/procurement/v1/contracts", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts++; await route.abort("connectionreset");
  });
  await page.goto("/procurement/workspace/contracts/new");
  await page.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: /Copper Supplies/ }).click();
  await page.getByLabel("Contract title", { exact: true }).fill("Unconfirmed contract");
  await page.getByLabel("Spending limit", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("save result was not confirmed");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Contract title", { exact: true })).toHaveValue("Unconfirmed contract");
  await page.getByRole("link", { name: /^Review saved / }).click();
  await expect(page).toHaveURL(/\/contracts$/);
  expect(attempts).toBe(1);
});
