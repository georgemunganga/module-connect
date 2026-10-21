import { readFileSync, statSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Actor = "maker" | "reviewer";
type Context = { roles?: string[]; permissions: string[]; company: { name: string; code: string } };
type Manifest = { baseUrl: string; tenantId: string; companyId: string; branchId: string; currencyCode: string; authenticationHeader: string;
  actors: Record<Actor, { principalId: string; workerId: string; context: Context }>;
  sourcingAuthority: { authorityReference: string; principalId: string; principalDisplayName: string; maximumAmount: string;
    currencyCode: string; branchId: string; expectedAction: string; amountBasis: string; activationReason: string;
    effectiveFrom: string; effectiveUntil: null } };
type Traffic = { actor: Actor; method: string; path: string; query: string; status: number; body: string | null; rawResponse: string };
const base = "/api/procurement/v1/configuration/spending-authorities";
const settings = "/procurement/workspace/settings/modules/request-for-quotes/approvals";
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

function manifest(): Manifest {
  const file = process.env.PROCUREMENT_APPROVAL_BROWSER_MANIFEST;
  if (!file) throw new Error("Supply the private --serve --settings sourcing authority manifest; this test starts no API/database.");
  if (process.platform !== "win32" && (statSync(file).mode & 0o077)) throw new Error("The synthetic manifest must be owner-private.");
  const value = JSON.parse(readFileSync(file, "utf8")) as Manifest, url = new URL(value.baseUrl), seed = value.sourcingAuthority;
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || value.tenantId !== "probe" || value.authenticationHeader !== "X-Probe-User" || value.currencyCode !== "ZMW" || !seed
    || seed.authorityReference !== "BROWSER-SOURCING-LIMIT" || seed.principalDisplayName !== "manager2" || seed.maximumAmount !== "1.2345"
    || seed.currencyCode !== "ZMW" || seed.branchId !== value.branchId || seed.expectedAction !== "SourcingEvent.Publish" || seed.amountBasis !== "ApprovedLineBase"
    || seed.activationReason !== "Browser independent sourcing limit approved"
    || !Number.isFinite(Date.parse(seed.effectiveFrom)) || Date.parse(seed.effectiveFrom) >= Date.now() || seed.effectiveUntil !== null
    || ![value.companyId, value.branchId, seed.principalId, value.actors.maker?.principalId, value.actors.reviewer?.principalId,
      value.actors.maker?.workerId, value.actors.reviewer?.workerId].every(id => typeof id === "string" && guid.test(id)))
    throw new Error("Refusing non-synthetic or incomplete sourcing authority fixture.");
  expect(value.actors.maker.principalId).not.toBe(value.actors.reviewer.principalId);
  expect(value.actors.maker.workerId).not.toBe(value.actors.reviewer.workerId);
  expect(seed.principalId).not.toBe(value.actors.maker.principalId);
  expect(seed.principalId).not.toBe(value.actors.reviewer.principalId);
  for (const actor of Object.values(value.actors)) {
    expect(actor.context.roles ?? []).not.toContain("erp_admin");
    expect(actor.context.permissions).toContain("procurement-authority-read");
  }
  return value;
}
async function connect(page: Page, fixture: Manifest) {
  let actor: Actor = "maker"; const traffic: Traffic[] = [];
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })),
    { entityId: fixture.companyId, branch: fixture.branchId });
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), acting = actor;
    if (url.pathname.startsWith("/api/procurement/")) {
      expect(request.headers()["x-shell-entity"]).toBe(fixture.companyId); expect(request.headers()["x-shell-location"]).toBe(fixture.branchId);
      const upstream = await route.fetch({ url: `${fixture.baseUrl}${url.pathname}${url.search}`, timeout: 45_000, maxRetries: 0,
        headers: { ...request.headers(), [fixture.authenticationHeader]: fixture.actors[acting].principalId } });
      traffic.push({ actor: acting, method: request.method(), path: url.pathname, query: url.search, status: upstream.status(),
        body: request.postData(), rawResponse: await upstream.text() });
      return route.fulfill({ response: upstream });
    }
    // Synthetic outer shell only. All Procurement capability, permission, lookup and command replies are actual.
    const context = fixture.actors[acting].context;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: acting, roles: context.roles ?? [] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: context.company.name });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: fixture.companyId, code: context.company.code, registeredName: context.company.name }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    return json({ message: "Synthetic shell endpoint is not implemented." }, 404);
  });
  return { traffic, async visit(next: Actor) {
    actor = next; await page.goto(settings);
    await page.getByRole("tab", { name: "Approval limits", exact: true }).click();
  } };
}

test("actual RFQ settings create a finite branch limit and independently activate the same original grant", async ({ page }, info) => {
  const fixture = manifest(), seed = fixture.sourcingAuthority, connection = await connect(page, fixture);
  const row = () => page.getByRole("row").filter({ hasText: seed.authorityReference });
  try {
    await connection.visit("maker");
    await expect(page.getByRole("combobox", { name: "Approval type", exact: true })).toHaveText("Request for quotes");
    await expect(row()).toHaveCount(0);
    await page.getByRole("button", { name: "Add approval limit", exact: true }).click();
    await page.getByLabel("Limit reference", { exact: true }).fill(seed.authorityReference);
    await page.getByLabel("Find person", { exact: true }).fill(seed.principalDisplayName);
    await page.getByRole("combobox", { name: "Person", exact: true }).click();
    await page.getByRole("option", { name: seed.principalDisplayName, exact: true }).click();
    await expect(page.getByLabel("Company currency", { exact: true })).toHaveValue("ZMW");
    await expect(page.getByLabel("Approval use", { exact: true })).toHaveValue("Request for quotes");
    await page.getByLabel("Maximum amount", { exact: true }).fill(seed.maximumAmount);
    const starts = new Date(seed.effectiveFrom);
    await page.getByLabel("Starts", { exact: true }).fill(new Date(starts.getTime() - starts.getTimezoneOffset() * 60_000).toISOString().slice(0, 23));
    await expect(page.getByLabel("Ends (optional)", { exact: true })).toHaveValue("");
    for (const name of ["All departments", "All categories"]) {
      await page.getByRole("switch", { name, exact: true }).click();
      await expect(page.getByRole("switch", { name, exact: true })).toHaveAttribute("aria-checked", "true");
    }
    const createdReply = page.waitForResponse(response => new URL(response.url()).pathname === base && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save limit draft", exact: true }).click();
    const created = await createdReply; expect(created.status(), await created.text()).toBe(201);
    const saved = await created.json() as { id: string; version: number; maximumAmount: string };
    expect(guid.test(saved.id)).toBe(true); expect(saved.version).toBe(1); expect(saved.maximumAmount).toBe(seed.maximumAmount);
    await expect(row().getByRole("cell", { name: "ZMW 1.2345", exact: true })).toBeVisible();
    await row().getByRole("button", { name: "Send for review", exact: true }).click();
    const submittedReply = page.waitForResponse(response => new URL(response.url()).pathname === `${base}/${saved.id}/submit`);
    await page.getByRole("dialog").getByRole("button", { name: "Send for review", exact: true }).click();
    const submitted = await submittedReply; expect(submitted.status(), await submitted.text()).toBe(200);
    await expect(row().getByText("PendingReview", { exact: true })).toBeVisible();
    await expect(row().getByRole("button", { name: "Activate limit", exact: true })).toHaveCount(0);
    await connection.visit("reviewer");
    await expect(row().getByRole("button", { name: "Edit draft", exact: true })).toHaveCount(0);
    await row().getByRole("button", { name: "Activate limit", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Activate limit", exact: true })).toBeDisabled();
    await dialog.getByLabel("Reason", { exact: true }).fill(seed.activationReason);
    const activatedReply = page.waitForResponse(response => new URL(response.url()).pathname === `${base}/${saved.id}/activate`);
    await dialog.getByRole("button", { name: "Activate limit", exact: true }).click();
    const activated = await activatedReply; expect(activated.status(), await activated.text()).toBe(200);
    const active = await activated.json() as { effectiveFrom: string; effectiveUntil: null };
    expect(active).toMatchObject({ id: saved.id, version: 3, state: "Active", maximumAmount: seed.maximumAmount,
      principalId: seed.principalId, principalDisplayName: seed.principalDisplayName, action: seed.expectedAction,
      permission: "procurement-sourcing-publish", amountBasis: seed.amountBasis, currencyCode: "ZMW", branchRef: fixture.branchId,
      allBranches: false, allDepartments: true, allCategories: true });
    expect(Date.parse(active.effectiveFrom)).toBe(Date.parse(seed.effectiveFrom)); expect(active.effectiveUntil).toBeNull();
    await connection.visit("reviewer"); await expect(row().getByText("Active", { exact: true })).toBeVisible();
    await expect(row().getByRole("cell", { name: "manager2", exact: true })).toBeVisible();
    await expect(row().getByRole("cell", { name: "ZMW 1.2345", exact: true })).toBeVisible();
    const final = await page.evaluate(async ({ url, entity, branch }) => {
      const reply = await fetch(url, { headers: { "X-Shell-Entity": entity, "X-Shell-Location": branch } });
      return { status: reply.status, body: await reply.json() };
    }, { url: `${base}/${saved.id}`, entity: fixture.companyId, branch: fixture.branchId });
    expect(final.status).toBe(200); expect(final.body).toMatchObject({ id: saved.id, version: 3, state: "Active", maximumAmount: "1.2345", principalId: seed.principalId });
    expect(connection.traffic.filter(entry => entry.method !== "GET").map(entry => [entry.actor, entry.method, entry.path, entry.status])).toEqual([
      ["maker", "POST", base, 201], ["maker", "POST", `${base}/${saved.id}/submit`, 200], ["reviewer", "POST", `${base}/${saved.id}/activate`, 200],
    ]);
    const people = connection.traffic.filter(entry => entry.path.startsWith(`${base}/lookups/people`));
    expect(people.length).toBeGreaterThan(0);
    expect(people.every(entry =>
      new URLSearchParams(entry.query).get("action") === seed.expectedAction)).toBe(true);
    expect(connection.traffic.some(entry => entry.path === base && entry.method === "GET" && new URLSearchParams(entry.query).get("action") === seed.expectedAction)).toBe(true);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    const file = info.outputPath("actual-sourcing-authority-api-traffic.json");
    writeFileSync(file, JSON.stringify(connection.traffic, null, 2) + "\n", { mode: 0o600 });
    await info.attach("actual-sourcing-authority-api-traffic", { path: file, contentType: "application/json" });
  }
});
