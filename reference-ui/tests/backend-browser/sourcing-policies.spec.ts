import { readFileSync, statSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Actor = "maker" | "reviewer";
type Context = { roles?: string[]; permissions: string[]; company: { name: string; code: string } };
type Manifest = { baseUrl: string; tenantId: string; companyId: string; branchId: string; currencyCode: string; authenticationHeader: string;
  actors: Record<Actor, { principalId: string; workerId: string; context: Context }>;
  sourcingPolicy: { policyKey: string; currencyCode: string; makerPrincipalId: string; reviewerPrincipalId: string;
    namedApproverPrincipalId: string; namedApproverDisplayName: string; effectiveFrom: string; effectiveTo: string;
    expectedConfigurationVersion: number; noPolicyEffectsSeeded: boolean } };
type Traffic = { actor: Actor; method: string; path: string; query: string; status: number; body: string | null; rawResponse: string };
const root = "/api/procurement/v1/configuration/policies", path = "/procurement/workspace/settings/buying-rules";
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const reviewReason = "Browser independent review requested", publicationReason = "Browser independent sourcing settings approved";
test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

function manifest(): Manifest {
  const file = process.env.PROCUREMENT_APPROVAL_BROWSER_MANIFEST;
  if (!file) throw new Error("Supply the private --serve --sourcing-policies manifest; this test starts no backend.");
  if (process.platform !== "win32" && (statSync(file).mode & 0o077)) throw new Error("The synthetic manifest must be owner-private.");
  const value = JSON.parse(readFileSync(file, "utf8")) as Manifest, url = new URL(value.baseUrl), seed = value.sourcingPolicy;
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || value.tenantId !== "probe" || value.authenticationHeader !== "X-Probe-User" || value.currencyCode !== "ZMW"
    || !seed || seed.policyKey !== "SOURCING" || seed.currencyCode !== "ZMW" || seed.expectedConfigurationVersion !== 1 || seed.noPolicyEffectsSeeded !== true
    || ![value.companyId, value.branchId, seed.makerPrincipalId, seed.reviewerPrincipalId, seed.namedApproverPrincipalId].every(id => guid.test(id))
    || seed.makerPrincipalId !== value.actors.maker?.principalId || seed.reviewerPrincipalId !== value.actors.reviewer?.principalId
    || seed.namedApproverDisplayName !== "manager2" || seed.makerPrincipalId === seed.reviewerPrincipalId
    || !seed.effectiveFrom.endsWith("T00:00:00.000Z") || !seed.effectiveTo.endsWith("T00:00:00.000Z")
    || !Number.isFinite(Date.parse(seed.effectiveFrom)) || !Number.isFinite(Date.parse(seed.effectiveTo))
    || Date.parse(seed.effectiveFrom) <= Date.now() || Date.parse(seed.effectiveTo) <= Date.parse(seed.effectiveFrom))
    throw new Error("Refusing non-synthetic or incomplete sourcing policy fixture.");
  for (const actor of Object.values(value.actors)) {
    expect(guid.test(actor.workerId)).toBe(true); expect(actor.context.roles ?? []).not.toContain("erp_admin");
    expect(actor.context.permissions).toContain("procurement-configuration-read");
  }
  expect(value.actors.maker.workerId).not.toBe(value.actors.reviewer.workerId);
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
    // Synthetic outer-shell presentation only; every Procurement response and authorization is actual.
    const context = fixture.actors[acting].context;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: acting, roles: context.roles ?? [] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: context.company.name });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: fixture.companyId, code: context.company.code, registeredName: context.company.name }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    return json({ message: "Synthetic shell endpoint is not implemented." }, 404);
  });
  return { traffic, async visit(next: Actor) { actor = next; await page.goto(path); } };
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("actual sourcing policy settings retain explicit zero/false choices through independent publication", async ({ page }, info) => {
  const fixture = manifest(), seed = fixture.sourcingPolicy, connection = await connect(page, fixture);
  const row = () => page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Sourcing publication rules", exact: true }) });
  try {
    await connection.visit("maker");
    await page.getByRole("button", { name: "Add buying rule draft", exact: true }).first().click();
    await choose(page, "Use these rules for", "Sourcing publication rules");
    await page.getByLabel("Start date", { exact: true }).fill(seed.effectiveFrom.slice(0, 10));
    await page.getByLabel("End date (optional)", { exact: true }).fill(seed.effectiveTo.slice(0, 10));
    await page.getByLabel("Rule code", { exact: true }).fill("BROWSER_POLICY");
    await page.getByLabel("Amount from (ZMW)", { exact: true }).fill("");
    await expect(page.getByLabel("Amount below (ZMW)", { exact: true })).toHaveValue("");
    await choose(page, "Branch coverage", "All company branches");
    await page.getByLabel("Minimum quotes", { exact: true }).fill("0");
    await page.getByLabel("Minimum invited suppliers", { exact: true }).fill("0");
    for (const label of ["Requirements pack", "Evaluation criteria", "Closing date"]) await choose(page, label, "Not required");
    await page.getByLabel("Step 1 code", { exact: true }).fill("BROWSER_REVIEW");
    await choose(page, "Step 1 decision rule", "All eligible reviewers");
    await choose(page, "Step 1 named reviewers", seed.namedApproverDisplayName);
    const createdReply = page.waitForResponse(response => new URL(response.url()).pathname === root && response.request().method() === "POST");
    await page.getByRole("button", { name: "Check and save draft", exact: true }).click();
    const created = await createdReply; expect(created.status(), await created.text()).toBe(201);
    const saved = await created.json() as { id: string; rulesJson: string; version: number; state: string; effectiveFrom: string; effectiveTo: string };
    expect(guid.test(saved.id)).toBe(true); expect(saved.state).toBe("Draft");
    const rules = JSON.parse(saved.rulesJson);
    expect(rules.currencyCode).toBe("ZMW"); expect(rules.rules).toHaveLength(1);
    expect(rules.rules[0]).toMatchObject({ code: "BROWSER_POLICY", priority: 0, when: { minimumAmountInclusive: null, maximumAmountExclusive: null,
      categoryCodes: [], purchaseTypes: [], branchIds: [] }, result: { publication: { minimumQuoteCount: 0, minimumInvitedSuppliers: 0,
        requirementsPackRequired: false, evaluationCriteriaRequired: false, closingDateRequired: false },
      approvalStages: [{ code: "BROWSER_REVIEW", assignee: "ProcurementManager", mode: "All", principalIds: [seed.namedApproverPrincipalId] }] } });
    await connection.visit("maker"); await expect(row().getByText("Draft", { exact: true })).toBeVisible();
    await row().getByRole("button", { name: "Edit draft", exact: true }).click();
    await expect(page.getByLabel("Minimum quotes", { exact: true })).toHaveValue("0");
    for (const label of ["Requirements pack", "Evaluation criteria", "Closing date"]) await expect(page.getByRole("combobox", { name: label, exact: true })).toHaveText("Not required");
    await expect(page.getByLabel("Amount from (ZMW)", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await row().getByRole("button", { name: "Send for review", exact: true }).click();
    await page.getByLabel("What should the reviewer check?", { exact: true }).fill(reviewReason);
    const submittedReply = page.waitForResponse(response => new URL(response.url()).pathname === `${root}/${saved.id}/submit-review`);
    await page.getByRole("button", { name: "Send for review", exact: true }).last().click();
    const submitted = await submittedReply; expect(submitted.status(), await submitted.text()).toBe(200);
    await expect(row().getByText("PendingReview", { exact: true })).toBeVisible();
    await expect(row().getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    await connection.visit("reviewer"); await row().getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByLabel("Publication reason", { exact: true }).fill(publicationReason);
    const publishedReply = page.waitForResponse(response => new URL(response.url()).pathname === `${root}/${saved.id}/publish`);
    await page.getByRole("button", { name: "Publish rules", exact: true }).click();
    const published = await publishedReply; expect(published.status(), await published.text()).toBe(200);
    expect(await published.json()).toMatchObject({ id: saved.id, state: "Published", rulesJson: saved.rulesJson });
    await connection.visit("reviewer"); await expect(row().getByText("Published", { exact: true })).toBeVisible();
    const final = await page.evaluate(async ({ url, entity, branch }) => {
      const response = await fetch(url, { headers: { "X-Shell-Entity": entity, "X-Shell-Location": branch } });
      return { status: response.status, body: await response.json() };
    }, { url: `${root}/${saved.id}`, entity: fixture.companyId, branch: fixture.branchId });
    expect(final.status).toBe(200);
    expect(final.body).toMatchObject({ id: saved.id, state: "Published", rulesJson: saved.rulesJson, publishedBy: seed.reviewerPrincipalId });
    const commands = connection.traffic.filter(entry => entry.method !== "GET" && entry.path !== `${root}/validate`);
    expect(commands.map(entry => [entry.actor, entry.method, entry.path, entry.status])).toEqual([
      ["maker", "POST", root, 201], ["maker", "POST", `${root}/${saved.id}/submit-review`, 200], ["reviewer", "POST", `${root}/${saved.id}/publish`, 200],
    ]);
    expect(connection.traffic.filter(entry => entry.path.endsWith("/lookups/sourcing-reviewers")).some(entry =>
      entry.status === 200 && JSON.parse(entry.rawResponse).configurationVersion === 1)).toBe(true);
    expect(connection.traffic.some(entry => entry.method === "GET" && entry.path === `${root}/${saved.id}` && entry.status === 200)).toBe(true);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    const file = info.outputPath("actual-sourcing-policy-api-traffic.json");
    writeFileSync(file, JSON.stringify(connection.traffic, null, 2) + "\n", { mode: 0o600 });
    await info.attach("actual-sourcing-policy-api-traffic", { path: file, contentType: "application/json" });
  }
});
