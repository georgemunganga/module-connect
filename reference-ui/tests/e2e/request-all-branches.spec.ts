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
  await expect(page.getByRole("button", { name: "New request", exact: true })).toBeDisabled();
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
