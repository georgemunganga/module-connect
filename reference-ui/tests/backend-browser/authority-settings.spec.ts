import { readFileSync, statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Actor = "buyer" | "finance" | "reader";
type Context = { roles?: string[]; permissions: string[]; company: { name: string; code: string } };
type Manifest = { baseUrl: string; tenantId: string; companyId: string; branchId: string; authenticationHeader: string;
  actors: Record<Actor, { principalId: string; context: Context }>;
  settings: { authorityReference: string; principalId: string; principalDisplayName: string; maximumAmount: string; branchId: string } };
const api = "/api/procurement/v1/configuration/spending-authorities";
const settingsPath = "/procurement/workspace/settings/modules/purchase-requests/approvals";

test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });
const check = expect.configure({ timeout: 30_000 });

function manifest(): Manifest {
  const path = process.env.PROCUREMENT_APPROVAL_BROWSER_MANIFEST;
  if (!path) throw new Error("Set PROCUREMENT_APPROVAL_BROWSER_MANIFEST to the private --serve fixture; this test never starts a backend.");
  if (process.platform !== "win32" && (statSync(path).mode & 0o077)) throw new Error("The fixture manifest must be private to its owner.");
  const value = JSON.parse(readFileSync(path, "utf8")) as Manifest, url = new URL(value.baseUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || value.tenantId !== "probe" || value.authenticationHeader !== "X-Probe-User" || !value.companyId || value.settings?.branchId !== value.branchId
    || value.settings.maximumAmount !== "99999999999999.9999" || !value.actors.reader || !value.actors.finance || !value.actors.buyer)
    throw new Error("Refusing anything except the synthetic loopback authority-settings fixture.");
  return value;
}

async function connect(page: Page, fixture: Manifest) {
  let actor: Actor = "buyer";
  const traffic: Array<{ actor: Actor; method: string; path: string; status: number; body?: string; response: unknown; durationMs: number }> = [];
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })),
    { entityId: fixture.companyId, branch: fixture.branchId });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), acting = actor;
    if (url.pathname.startsWith("/api/procurement/")) {
      // Transport only: all Procurement context, capability, lookup, command and
      // read responses come unchanged from the actual disposable mapped API.
      expect(request.headers()["x-shell-entity"]).toBe(fixture.companyId);
      expect(request.headers()["x-shell-location"]).toBe(fixture.branchId);
      const started = Date.now();
      const upstream = await route.fetch({ url: `${fixture.baseUrl}${url.pathname}${url.search}`, timeout: 45_000, maxRetries: 0,
        headers: { ...request.headers(), [fixture.authenticationHeader]: fixture.actors[acting].principalId } });
      const text = await upstream.text(); let response: unknown; try { response = JSON.parse(text); } catch { response = text; }
      traffic.push({ actor: acting, method: request.method(), path: url.pathname, status: upstream.status(), body: request.postData() ?? undefined,
        response, durationMs: Date.now() - started });
      return route.fulfill({ response: upstream });
    }
    // The synthetic sandbox has no shell service. These presentation-only replies
    // do not confer permission: Procurement /context and all server checks remain real.
    const context = fixture.actors[acting].context;
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: acting, roles: context.roles ?? ["procurement_manager"] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: context.company.name });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: fixture.companyId, code: context.company.code, registeredName: context.company.name }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    return json({ message: "Synthetic shell endpoint is not implemented." }, 404);
  });
  async function request(next: Actor, suffix = "", method: "GET" | "POST" = "GET", data?: unknown) {
    return page.request.fetch(`${fixture.baseUrl}${api}${suffix}`, { method, data, timeout: 45_000, headers: {
      [fixture.authenticationHeader]: fixture.actors[next].principalId, "X-Shell-Entity": fixture.companyId, "X-Shell-Location": fixture.branchId,
    } });
  }
  return { traffic, request, async visit(next: Actor) {
    actor = next; await page.goto(settingsPath);
    await page.getByRole("tab", { name: "Approval limits", exact: true }).click();
  } };
}

test("actual API: exact scoped approval limit is independently activated and remains read only for a reader", async ({ page }, info) => {
  const fixture = manifest(), connection = await connect(page, fixture), seed = fixture.settings;
  const row = () => page.getByRole("row").filter({ hasText: seed.authorityReference });
  try {
    const initial = await connection.request("buyer"); expect(initial.status(), await initial.text()).toBe(200);
    expect((await initial.json()).items.filter((item: { authorityReference: string }) => item.authorityReference === seed.authorityReference)).toHaveLength(0);
    await connection.visit("buyer");
    await page.getByRole("button", { name: "Add approval limit", exact: true }).click();
    await page.getByLabel("Limit reference", { exact: true }).fill(seed.authorityReference);
    await page.getByLabel("Find person", { exact: true }).fill(seed.principalDisplayName);
    await page.getByRole("combobox", { name: "Person", exact: true }).click();
    await page.getByRole("option", { name: seed.principalDisplayName, exact: true }).click();
    await page.getByLabel("Maximum amount").fill(seed.maximumAmount);
    const until = new Date(Date.now() + 86_400_000);
    await page.getByLabel("Ends (optional)", { exact: true }).fill(new Date(until.getTime() - until.getTimezoneOffset() * 60_000).toISOString().slice(0, 23));
    await page.getByRole("switch", { name: "All departments", exact: true }).click();
    await expect(page.getByRole("switch", { name: "All departments", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("switch", { name: "All categories", exact: true }).click();
    await expect(page.getByRole("switch", { name: "All categories", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Save limit draft", exact: true }).click();
    await check(page.getByRole("status")).toContainText("Draft saved");
    await check(row().getByRole("cell", { name: `ZMW ${seed.maximumAmount}`, exact: true })).toBeVisible();
    const creates = connection.traffic.filter((entry) => entry.path === api && entry.method === "POST");
    expect(creates).toHaveLength(1); expect(creates[0].status).toBe(201);
    const created = creates[0].response as { id: string; maximumAmount: string; principalId: string; allBranches: boolean; branchRef: string; state: string };
    expect(created).toMatchObject({ maximumAmount: seed.maximumAmount, principalId: seed.principalId, allBranches: false, branchRef: fixture.branchId, state: "Draft" });
    await row().getByRole("button", { name: "Send for review", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send for review", exact: true }).click();
    await check(row().getByText("PendingReview", { exact: true })).toBeVisible();
    await check(row().getByRole("button", { name: "Activate limit", exact: true })).toHaveCount(0);
    const pendingResponse = await connection.request("buyer", `/${created.id}`); expect(pendingResponse.status()).toBe(200);
    const pending = await pendingResponse.json(); expect(pending.allowedActions).not.toContain("Activate");
    const forbiddenOwn = await connection.request("buyer", `/${created.id}/activate`, "POST", { version: pending.version, reason: "Creator cannot independently activate its own configuration" });
    expect(forbiddenOwn.status(), await forbiddenOwn.text()).toBe(403);
    await connection.visit("finance");
    await check(row().getByRole("button", { name: "Activate limit", exact: true })).toBeVisible();
    await check(row().getByRole("button", { name: "Edit draft", exact: true })).toHaveCount(0);
    await row().getByRole("button", { name: "Activate limit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Activate limit", exact: true })).toBeDisabled();
    await dialog.getByLabel("Reason", { exact: true }).fill("Independent synthetic Finance review of the exact finite branch limit");
    await dialog.getByRole("button", { name: "Activate limit", exact: true }).click();
    await check(row().getByText("Active", { exact: true })).toBeVisible();
    await connection.visit("reader");
    await check(row().getByRole("cell", { name: `ZMW ${seed.maximumAmount}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add approval limit", exact: true })).toHaveCount(0);
    await expect(row().getByRole("button")).toHaveCount(0);
    const readerList = await connection.request("reader"); expect(readerList.status()).toBe(200);
    const scoped = await readerList.json(); expect(scoped.canCreate).toBe(false); expect(scoped.scope.branchId).toBe(fixture.branchId);
    expect(scoped.items.every((item: { allBranches: boolean; branchRef: string }) => !item.allBranches && item.branchRef === fixture.branchId)).toBe(true);
    const read = await connection.request("reader", `/${created.id}`); expect(read.status()).toBe(200);
    const saved = await read.json();
    expect(saved).toMatchObject({ state: "Active", maximumAmount: seed.maximumAmount, principalId: seed.principalId,
      principalDisplayName: seed.principalDisplayName, allBranches: false, branchRef: fixture.branchId, allowedActions: [] });
    expect(saved.version).toBeGreaterThan(pending.version);
    for (const key of Object.keys(saved)) expect(key).not.toMatch(/email|password|bank|payroll/i);
    const forbiddenReadMutation = await connection.request("reader", `/${created.id}/revoke`, "POST", { version: saved.version, reason: "Reader must not mutate this record" });
    expect(forbiddenReadMutation.status(), await forbiddenReadMutation.text()).toBe(403);
    const unchanged = await connection.request("reader", `/${created.id}`); expect(unchanged.status()).toBe(200);
    expect(await unchanged.json()).toEqual(saved);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await info.attach("actual-settings-api-traffic", { body: JSON.stringify(connection.traffic, null, 2), contentType: "application/json" });
  }
});
