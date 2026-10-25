import { expect, test } from "@playwright/test";

// Run with playwright.nonlive-returns.config.ts. No real API, DB or live-mode claim.
for (const suffix of ["", "/new", "/44444444-4444-4444-8444-444444444444", "/44444444-4444-4444-8444-444444444444/edit"]) {
  test(`non-live Returns route ${suffix || "list"} keeps the ERP shell and does not mount live forms`, async ({ page }) => {
    const calls: string[] = [];
    await page.route("**/api/procurement/v1/returns/**", async (route) => { calls.push(route.request().url()); await route.abort(); });
    await page.goto(`/procurement/workspace/purchase-receives/returns${suffix}`);
    await expect(page.getByText(/This workflow is being connected to your ERP/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save return draft" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Add return draft" })).toHaveCount(0);
    expect(calls).toEqual([]);
  });
}
