import { expect, test } from "@playwright/test";
import { mockErp, branchId, requestId } from "./request-mock";

// Mocked business HTTP tests assert presentation and request contracts only.
// Real-cookie PostgreSQL and independent owner checks are a separate release gate.
for (const width of [1440, 390]) test(`All requests keeps directory, branch labels and branch-required actions at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await mockErp(page, { allBranches: true, policyReviewer: true });
  let policyReads = 0;
  const listHeaders: Record<string, string>[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/procurement/v1/requests/policy-queue") policyReads++;
  });
  await page.route("**/api/procurement/v1/requests?*", async route => {
    listHeaders.push(await route.request().allHeaders());
    await route.fulfill({ json: { records: [
      { id: requestId, number: "PR-001", purpose: "Office chairs", status: "Draft", currencyCode: "ZMW",
        createdAt: "2026-10-25T12:00:00Z", version: 1, lineCount: 1, branchRef: branchId },
      { id: "66666666-6666-4666-8666-666666666666", number: "PR-002", purpose: "Office paper", status: "Draft", currencyCode: "ZMW",
        createdAt: "2026-10-25T11:00:00Z", version: 1, lineCount: 1, branchRef: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
    ], count: 2, limit: 50, offset: 0 } });
  });
  await page.goto("/procurement/workspace/procurement-requests");
  await expect(page.getByRole("heading", { name: "Purchase Requests", exact: true })).toBeVisible();
  await expect(page.getByTestId("erp-record-table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Branch", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Lusaka", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Kitwe", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New request", exact: true })).toBeEnabled();
  await expect(page.getByText("Showing your requests across permitted branches.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buying-rule checks and issues", exact: true })).toHaveCount(0);
  expect(policyReads).toBe(0);
  expect(listHeaders.length).toBeGreaterThan(0);
  for (const headers of listHeaders) {
    expect(headers["x-shell-branch-scope"]).toBe("all");
    expect(headers["x-shell-location"]).toBeUndefined();
  }
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

for (const width of [1440, 390]) test(`All-company new request asks for a branch before opening its form at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await mockErp(page, { allBranches: true });
  const writes: string[] = [];
  const contexts: Array<Record<string, string>> = [];
  page.on("request", request => {
    if (request.method() !== "GET" && request.url().includes("/api/procurement/")) writes.push(request.url());
    if (new URL(request.url()).pathname === "/api/procurement/v1/context") contexts.push(request.headers());
  });
  await page.goto("/procurement/workspace/requests");
  await page.getByRole("button", { name: "New request", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Choose a branch to continue", exact: true })).toBeVisible();
  await expect(page.getByLabel("What do you need?", { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
  await page.getByRole("combobox", { name: "Branch for this work", exact: true }).click();
  await page.getByRole("option", { name: "Lusaka", exact: true }).click();
  await expect(page.getByLabel("What do you need?", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a branch to continue", exact: true })).toHaveCount(0);
  expect(contexts.some(headers => headers["x-shell-location"] === branchId && headers["x-shell-branch-scope"] !== "all")).toBe(true);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("company-wide Home opens read-only summaries without forcing a transaction branch", async ({ page }) => {
  await mockErp(page, { allBranches: true });
  const reads: string[] = []; const writes: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/procurement/")) (request.method() === "GET" ? reads : writes).push(new URL(request.url()).pathname);
  });
  await page.goto("/procurement/workspace/");
  await expect.poll(() => reads.includes("/api/procurement/v1/requests")).toBe(true);
  await expect(page.getByRole("heading", { name: "Choose a branch to continue", exact: true })).toHaveCount(0);
  await expect(page.getByText("Recent Activity", { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test("inline branch choices stay in the current company even with another authorised company", async ({ page }) => {
  await mockErp(page, { allBranches: true });
  const current = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
  await page.route("**/api/core/v1/workspace-context", route => route.fulfill({ json: {
    schemaVersion: 1, tenantId: "amizo", principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", organisationWide: false,
    companies: [{ id: current, code: "AMIZO", registeredName: "Amizo Power", currency: "ZMW", isDefault: true },
      { id: other, code: "OTHER", registeredName: "Other company", currency: "ZMW", isDefault: false }],
    branches: [{ id: branchId, code: "HQ", name: "Lusaka", legalEntityId: current, type: "Headquarters" },
      { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", code: "OTHER", name: "Other-company branch", legalEntityId: other, type: "branch" }],
  } }));
  await page.goto("/procurement/workspace/requests/new");
  await page.getByRole("combobox", { name: "Branch for this work", exact: true }).click();
  await expect(page.getByRole("option", { name: "Lusaka", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Other-company branch", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("erp.shell.state.v1")!).entityId)).toBe(current);
});
