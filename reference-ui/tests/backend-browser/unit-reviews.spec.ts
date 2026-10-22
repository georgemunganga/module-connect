import { expect, test, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, realpathSync, lstatSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { privateFixtureRequest } from "./private-unix-transport";

type Actor = "maker" | "reviewer" | "unassigned" | "otherBranch" | "revoked";
type Context = { principalId: string; workerId: null; permissions: string[]; roles?: string[];
  company: { name: string; code: string }; branch?: { name: string } | null };
type Manifest = { fixtureKind: string; production: false; transport: "unix"; socketPath: string; noTcpListener: true;
  baseUrl: string; tenantId: string; companyId: string; branchId: string; currencyCode: string; authenticationHeader: string;
  scannerMode: string; noReviewEffectsSeeded: true; actors: Record<Actor, { principalId: string; branchId: string; context: Context }>;
  original: { invoiceId: string; invoiceVersion: number; mappingVersionId: string; mappingRevision: number;
    documentVersionId: string; documentSha256: string } };
type Traffic = { origin: "browser" | "verification"; actor: Actor; method: string; path: string;
  status: number; body: string | null; key?: string; response: string };
const root = "/api/procurement/v1", workspace = "/procurement/workspace";
const guid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
function manifest(): Manifest {
  const file = process.env.PROCUREMENT_APPROVAL_BROWSER_MANIFEST;
  if (!file || !isAbsolute(file) || realpathSync(file) !== file || !lstatSync(file).isFile()
    || lstatSync(file).isSymbolicLink() || lstatSync(file).size > 65536 || (lstatSync(file).mode & 0o077))
    throw new Error("Require a fresh protected original-unit Unix fixture manifest.");
  const value = JSON.parse(readFileSync(file, "utf8")) as Manifest, url = new URL(value.baseUrl);
  if (value.fixtureKind !== "invoice-unit-review-v1" || value.production !== false || value.tenantId !== "probe"
    || value.transport !== "unix" || value.socketPath !== "/procurement-browser/probe.sock" || value.noTcpListener !== true
    || url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || value.authenticationHeader !== "X-Probe-User" || value.currencyCode !== "ZMW"
    || value.scannerMode !== "synthetic-known-bytes" || value.noReviewEffectsSeeded !== true
    || ![value.companyId, value.branchId, value.original?.invoiceId, value.original?.mappingVersionId, value.original?.documentVersionId].every(id => guid.test(id))
    || !/^[a-f0-9]{64}$/.test(value.original.documentSha256)) throw new Error("Unverified original-unit fixture contract.");
  for (const name of ["maker", "reviewer", "unassigned", "otherBranch", "revoked"] as Actor[]) {
    const actor = value.actors[name];
    if (!actor || !guid.test(actor.principalId) || actor.context.principalId !== actor.principalId || actor.context.workerId !== null)
      throw new Error("Actual workerless Core fixture actors are required.");
  }
  expect(new Set(Object.values(value.actors).map(actor => actor.principalId)).size).toBe(5);
  expect(value.actors.reviewer.context.permissions.slice().sort()).toEqual(["procurement-access", "procurement-invoice-unit-review"]);
  expect(value.actors.revoked.context.permissions).toEqual(["procurement-access"]);
  return value;
}
async function connect(page: Page, fixture: Manifest, trafficFile: string) {
  let actor: Actor = "maker";
  const traffic: Traffic[] = [];
  const save = (item: Traffic) => { traffic.push(item); writeFileSync(trafficFile, JSON.stringify(traffic, null, 2) + "\n", { mode: 0o600 }); };
  const headers = (name: Actor) => ({ [fixture.authenticationHeader]: fixture.actors[name].principalId,
    "X-Shell-Entity": fixture.companyId, "X-Shell-Location": fixture.branchId });
  await page.addInitScript(({ company, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: company, branch })),
    { company: fixture.companyId, branch: fixture.branchId });
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), acting = actor;
    if (url.pathname.startsWith("/api/procurement/")) {
      expect(request.headers()["x-shell-entity"]).toBe(fixture.companyId);
      expect(request.headers()["x-shell-location"]).toBe(fixture.branchId);
      const result = await privateFixtureRequest(page.request, fixture, url.pathname + url.search,
        { method: request.method(), body: request.postData(), headers: { ...request.headers(), ...headers(acting) } });
      save({ origin: "browser", actor: acting, method: request.method(), path: url.pathname, status: result.status(),
        body: request.postData(), key: request.headers()["idempotency-key"], response: await result.text() });
      return route.fulfill(result.fulfill); // Actual API response, never business/context/meta mocks.
    }
    // Shell presentation/outer fixture identity only. Real API revalidates actual Core rows.
    const context = fixture.actors[acting].context;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: acting, roles: context.roles ?? [] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: context.company.name });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: fixture.companyId, code: context.company.code, registeredName: context.company.name }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [{ id: fixture.branchId, name: fixture.actors.maker.context.branch?.name ?? "Review site", legalEntityId: fixture.companyId }] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    return json({ message: "Synthetic shell endpoint unavailable" }, 404);
  });
  return { traffic, async visit(name: Actor, path: string) { actor = name; await page.goto(workspace + path); },
    async api(name: Actor, path: string, method = "GET", body?: string, key?: string) {
      const result = await privateFixtureRequest(page.request, fixture, path, { method, body,
        headers: { ...headers(name), ...(body ? { "Content-Type": "application/json" } : {}), ...(key ? { "Idempotency-Key": key } : {}) } });
      save({ origin: "verification", actor: name, method, path, status: result.status(), body: body ?? null, key, response: await result.text() });
      return result;
    } };
}

test("actual workerless Core maker and reviewer open, inspect, attest and recover one original-unit review", async ({ page }, info) => {
  test.setTimeout(180_000);
  const fixture = manifest(), bridge = await connect(page, fixture, info.outputPath("unit-review-actual-traffic.json"));
  const invoicePath = `${root}/invoices/${fixture.original.invoiceId}`;
  await bridge.visit("maker", `/bills/${fixture.original.invoiceId}`);
  const openedResponse = page.waitForResponse(response => new URL(response.url()).pathname === invoicePath + "/unit-reviews" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Request original unit review", exact: true }).click();
  const open = await openedResponse;
  expect(open.status(), await open.text()).toBe(200);
  const openedText = await open.text(), opened = JSON.parse(openedText);
  expect(opened).toMatchObject({ schemaVersion: 1, makerPrincipalId: fixture.actors.maker.principalId,
    identitySchemaVersion: 3, reviewState: "Pending", canPostToFinance: false, isInvoiceApproval: false });
  const reviewPath = `${root}/invoice-unit-reviews/${opened.reviewId}`;
  const replay = await bridge.api("maker", invoicePath + "/unit-reviews", "POST", open.request().postData()!, open.request().headers()["idempotency-key"]);
  expect(replay.status()).toBe(200); expect(await replay.text()).toBe(openedText);
  await bridge.visit("maker", `/approvals/unit-review/${opened.reviewId}`);
  await expect(page.getByText("UNIT-BROWSER-ORIGINAL-1 · 2026-10-20", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm original units", exact: true })).toHaveCount(0);
  const assignedResponse = await bridge.api("reviewer", reviewPath);
  expect(assignedResponse.status()).toBe(200);
  const assigned = await assignedResponse.json() as { assignments: { assignmentId: string; assignmentVersion: number }[]; invoiceVersion: number; caseVersion: number };
  const ownDecision = await bridge.api("maker", reviewPath + `/assignments/${assigned.assignments[0].assignmentId}/decisions`, "POST", JSON.stringify({
    invoiceVersion: assigned.invoiceVersion, caseVersion: assigned.caseVersion, assignmentVersion: assigned.assignments[0].assignmentVersion,
    action: "Approve", reason: null, attestation: "OriginalDocumentUnitsConfirmed" }), randomUUID());
  expect(ownDecision.status()).toBe(403);
  expect((await bridge.api("reviewer", invoicePath)).status()).toBe(403);
  expect([403, 404]).toContain((await bridge.api("otherBranch", reviewPath)).status());
  expect((await bridge.api("revoked", reviewPath)).status()).toBe(403);
  expect((await bridge.api("unassigned", reviewPath)).status()).toBe(403);
  await bridge.visit("reviewer", "/approvals");
  await page.getByRole("link", { name: "Check original", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download original", exact: true })).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download original", exact: true }).click();
  const download = await downloading, downloaded = await download.path();
  expect(downloaded).toBeTruthy();
  expect(createHash("sha256").update(readFileSync(downloaded!)).digest("hex")).toBe(fixture.original.documentSha256);
  await page.getByRole("button", { name: "Confirm original units", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm decision", exact: true })).toBeDisabled();
  await page.getByRole("switch", { name: /I checked the original invoice document/ }).click();
  const deciding = page.waitForResponse(response => new URL(response.url()).pathname.startsWith(reviewPath + "/assignments/") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Confirm decision", exact: true }).click();
  const decision = await deciding;
  expect(decision.status(), await decision.text()).toBe(200);
  const decisionText = await decision.text(), terminal = JSON.parse(decisionText);
  expect(terminal).toMatchObject({ schemaVersion: 1, identitySchemaVersion: 3, evidenceSchemaVersion: 3,
    reviewState: "Verified", caseState: "Approved", canPostToFinance: false, isInvoiceApproval: false });
  await expect(page.getByText(/Decision recorded: Verified/)).toBeVisible();
  const repeated = await bridge.api("reviewer", new URL(decision.url()).pathname, "POST", decision.request().postData()!, decision.request().headers()["idempotency-key"]);
  expect(repeated.status()).toBe(200); expect(await repeated.text()).toBe(decisionText);
  const recovered = await bridge.api("reviewer", reviewPath + `/commands/${terminal.commandKey}`);
  expect(recovered.status()).toBe(200); expect(await recovered.text()).toBe(decisionText);
  await page.reload();
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm original units", exact: true })).toHaveCount(0);
  expect(bridge.traffic.filter(row => row.origin === "browser" && row.method === "POST")).toHaveLength(2);
  expect(bridge.traffic.filter(row => row.origin === "browser" && row.actor === "reviewer" && row.path === invoicePath)).toEqual([]);
  expect(bridge.traffic.some(row => /handoff|payments|post-to-finance/.test(row.path))).toBe(false);
});
