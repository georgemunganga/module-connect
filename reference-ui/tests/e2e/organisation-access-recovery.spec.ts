import { expect, test } from "@playwright/test";

for (const status of [401, 200]) {
  test(`anonymous auth ${status} offers sign in before company or branch selection`, async ({ page }) => {
    const businessCalls: string[] = [];
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/hrm/branding") return route.fulfill({ json: { displayName: "Synthetic ERP" } });
      if (path === "/api/hrm/auth/me") return route.fulfill({ status, json: { authenticated: false } });
      businessCalls.push(path);
      return route.fulfill({ status: 401, json: { code: "unauthorized" } });
    });
    await page.goto("/procurement/workspace/requests");
    await expect(page.getByRole("heading", { name: "Sign in to Procurement" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/sign-in");
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Organisation context" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose your branch" })).toHaveCount(0);
    expect(businessCalls).toEqual([]);
  });
}

test("retry repeats a failed lookup and recovers without reloading the shell", async ({ page }) => {
  let authCalls = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/hrm/branding") return route.fulfill({ json: { displayName: "Synthetic ERP" } });
    if (path === "/api/hrm/auth/me") {
      authCalls++;
      return route.fulfill({ status: authCalls === 1 ? 503 : 200, json: { authenticated: false } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/procurement/workspace/requests");
  await expect(page.getByRole("heading", { name: "Unable to load your organisation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in to Procurement" })).toBeVisible();
  expect(authCalls).toBe(2);
  await expect(page.getByRole("button", { name: "Organisation context" })).toBeVisible();
});

test("resolving access keeps a status message until the session response arrives", async ({ page }) => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/hrm/branding") return route.fulfill({ json: { displayName: "Synthetic ERP" } });
    if (path === "/api/hrm/auth/me") { await pending; return route.fulfill({ json: { authenticated: false } }); }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/procurement/workspace/requests");
  await expect(page.getByRole("heading", { name: "Checking your branch" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Checking the branch saved");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
  finish();
  await expect(page.getByRole("heading", { name: "Sign in to Procurement" })).toBeVisible();
});
