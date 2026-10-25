import { expect, test } from "@playwright/test";

// Run with playwright.nonlive-returns.config.ts against preview mode.
for (const suffix of ["", "/44444444-4444-4444-8444-444444444444"]) {
  test(`non-live recommendation ${suffix || "worklist"} retains the ERP shell without live API calls`, async ({ page }) => {
    const calls: string[] = [];
    await page.route("**/api/procurement/v1/sourcing/**", async route => { calls.push(route.request().url()); await route.abort(); });
    await page.goto(`/procurement/workspace/rfqs/recommendations${suffix}`);
    await expect(page.getByText(/This workflow is being connected to your ERP/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save recommendation draft" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open recommendation draft" })).toHaveCount(0);
    expect(calls).toEqual([]);
  });
}
