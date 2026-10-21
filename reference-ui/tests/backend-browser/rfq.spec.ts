import { readFileSync, statSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Context = { permissions: string[]; roles?: string[]; company: { name: string; code: string } };
type Manifest = { baseUrl: string; tenantId: string; companyId: string; branchId: string; currencyCode: string; authenticationHeader: string;
  actors: { buyer: { principalId: string; context: Context } };
  rfq: { requestId: string; lineId: string; requestVersion: number; requestNumber: string; purpose: string; currencyCode: string;
    approvedQuantity: string; unitEstimate: string; selectedQuantity: string; expectedEstimatedValue: string;
    minimumQuoteCount: number; methodCode: string; buyerPrincipalId: string; title: string; cancellationReason: string } };
type Traffic = { method: string; path: string; query: string; status: number; body: string | null; key: string | null;
  rawResponse: string; droppedAfterOwnerResponse: boolean };
const root = "/api/procurement/v1", workspace = "/procurement/workspace";
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const title = "Browser exact governed RFQ draft", reason = "Browser source no longer needed";
function fixture(): Manifest {
  const file = process.env.PROCUREMENT_APPROVAL_BROWSER_MANIFEST;
  if (!file) throw new Error("Supply the owner-private --serve --rfq manifest; this test starts no API/database.");
  if (process.platform !== "win32" && (statSync(file).mode & 0o077)) throw new Error("Synthetic manifest must be owner-private.");
  const value = JSON.parse(readFileSync(file, "utf8")) as Manifest, url = new URL(value.baseUrl), seed = value.rfq;
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || value.tenantId !== "probe" || value.authenticationHeader !== "X-Probe-User" || value.currencyCode !== "ZMW" || !seed
    || ![value.companyId, value.branchId, seed.requestId, seed.lineId, seed.buyerPrincipalId].every(x => guid.test(x))
    || seed.buyerPrincipalId !== value.actors.buyer?.principalId || seed.currencyCode !== "ZMW"
    || seed.approvedQuantity !== "0.0002" || seed.unitEstimate !== "0.0001" || seed.selectedQuantity !== "0.0001"
    || seed.expectedEstimatedValue !== "0.00000001" || seed.minimumQuoteCount !== 0 || seed.methodCode !== "COMPETITIVE"
    || seed.title !== title || seed.cancellationReason !== reason || seed.purpose !== "Browser governed competitive RFQ source"
    || !seed.requestNumber || !Number.isSafeInteger(seed.requestVersion) || seed.requestVersion < 1)
    throw new Error("Refusing non-synthetic or incomplete exact RFQ fixture.");
  expect(value.actors.buyer.context.permissions).toEqual(expect.arrayContaining(["procurement-sourcing-convert", "procurement-sourcing-cancel"]));
  expect(value.actors.buyer.context.roles ?? []).not.toContain("erp_admin");
  return value;
}
async function connect(page: Page, seed: Manifest) {
  const traffic: Traffic[] = []; let droppedCancel = false;
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })),
    { entityId: seed.companyId, branch: seed.branchId });
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith("/api/procurement/")) {
      expect(request.headers()["x-shell-entity"]).toBe(seed.companyId); expect(request.headers()["x-shell-location"]).toBe(seed.branchId);
      // ALL Procurement context/meta/reads/writes go to the actual finite-runtime API.
      const upstream = await route.fetch({ url: `${seed.baseUrl}${url.pathname}${url.search}`, timeout: 45_000, maxRetries: 0,
        headers: { ...request.headers(), [seed.authenticationHeader]: seed.actors.buyer.principalId,
          "X-Shell-Entity": seed.companyId, "X-Shell-Location": seed.branchId } });
      const drop = request.method() === "POST" && url.pathname.endsWith("/source-cancel") && upstream.status() === 200 && !droppedCancel;
      traffic.push({ method: request.method(), path: url.pathname, query: url.search, status: upstream.status(), body: request.postData(),
        key: request.headers()["idempotency-key"] ?? null, rawResponse: await upstream.text(), droppedAfterOwnerResponse: drop });
      // Real owner already responded; simulate only loss of that browser transport response.
      // No Procurement body/status/capability is fabricated or reserialized.
      if (drop) { droppedCancel = true; return route.abort("failed"); }
      return route.fulfill({ response: upstream });
    }
    const context = seed.actors.buyer.context;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    // Synthetic shell presentation only; actual Procurement API owns every authorization decision.
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Finite RFQ buyer", roles: context.roles ?? ["rfq_buyer"] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: context.company.name });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: seed.companyId, code: context.company.code, registeredName: context.company.name }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    return json({ message: "Synthetic shell endpoint is not implemented." }, 404);
  });
  return traffic;
}

test("actual RFQ API preserves exact G29 partial hold and cancels through GET-only lost-response recovery", async ({ page }, info) => {
  const manifest = fixture(), seed = manifest.rfq, traffic = await connect(page, manifest);
  try {
    const sourcesReply = page.waitForResponse(response => new URL(response.url()).pathname === `${root}/sourcing/approved-sources`);
    await page.goto(workspace + "/rfqs/new?source=approved");
    const sources = await sourcesReply; expect(sources.status(), await sources.text()).toBe(200);
    const sourcePage = await sources.json() as { items: Record<string, unknown>[] };
    expect(sourcePage.items.find(row => row.purchaseRequestLineId === seed.lineId)).toMatchObject({
      purchaseRequestId: seed.requestId, expectedRequestVersion: seed.requestVersion, availableQuantity: seed.approvedQuantity,
      approvedUnitEstimate: seed.unitEstimate, branchRef: manifest.branchId, currencyCode: seed.currencyCode, canSelect: true, minimumQuoteCount: 0 });
    const sourceRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: seed.requestNumber, exact: true }) });
    await sourceRow.getByRole("button", { name: "Add line", exact: true }).click();
    const quantity = page.getByRole("textbox", { name: `Quantity for ${seed.requestNumber}`, exact: true });
    await expect(quantity).toHaveValue(seed.approvedQuantity); await quantity.fill(seed.selectedQuantity);
    await page.getByRole("textbox", { name: "What are you buying?", exact: true }).fill(title);
    expect(traffic.filter(row => row.method !== "GET")).toHaveLength(0);
    const createReply = page.waitForResponse(response => new URL(response.url()).pathname === `${root}/sourcing/from-approved-sources` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create internal draft", exact: true }).click();
    const created = await createReply; expect(created.status(), await created.text()).toBe(201);
    const saved = await created.json() as { eventId: string; number: string; originalDraftFingerprint: string; canPublish: boolean; financeReservationChanged: boolean };
    expect(guid.test(saved.eventId)).toBe(true); expect(saved).toMatchObject({ canPublish: false, financeReservationChanged: false });
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: seed.selectedQuantity, exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: `ZMW ${seed.unitEstimate}`, exact: true })).toBeVisible();
    const detailPath = `${root}/sourcing/${saved.eventId}/source-draft`;
    const firstDetail = traffic.find(row => row.method === "GET" && row.path === detailPath && row.status === 200)!;
    expect(firstDetail).toBeTruthy();
    const detail = JSON.parse(firstDetail.rawResponse) as { version: number; originalDraftFingerprint: string; lines: Record<string, unknown>[] };
    expect(Number.isSafeInteger(detail.version) && detail.version > 0).toBe(true);
    expect(detail.originalDraftFingerprint).toBe(saved.originalDraftFingerprint);
    expect(detail.lines).toHaveLength(1); expect(detail.lines[0]).toMatchObject({ estimatedValue: "1E-08", quantity: seed.selectedQuantity, allocationState: "Reserved" });
    expect(firstDetail.rawResponse).toMatch(/"estimatedValue"\s*:\s*"1E-08"/);
    // Read retained owned history through the existing list, then reopen that same draft.
    await page.getByRole("link", { name: "Back to quote requests", exact: true }).click();
    const ownedRow = page.getByRole("row").filter({ has: page.getByRole("cell", { name: saved.number, exact: true }) });
    await expect(ownedRow).toContainText(title); await ownedRow.getByRole("link", { name: "Open", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Reason", exact: true }).fill(reason);
    await page.getByRole("button", { name: "Cancel draft and release its quantities", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Check the saved result", exact: true })).toBeVisible();
    // The recovery panel is visible while transport is pending too. Wait for the
    // real owner's completed200 before asserting that its response was dropped.
    await expect.poll(() => traffic.filter(row => row.method === "POST" && row.path === `${root}/sourcing/${saved.eventId}/source-cancel`
      && row.status === 200 && row.droppedAfterOwnerResponse)).toHaveLength(1);
    const posts = traffic.filter(row => row.method !== "GET"); expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ method: "POST", path: `${root}/sourcing/from-approved-sources`, status: 201 });
    expect(posts[1]).toMatchObject({ method: "POST", path: `${root}/sourcing/${saved.eventId}/source-cancel`, status: 200, droppedAfterOwnerResponse: true });
    expect(posts.every(row => guid.test(row.key ?? ""))).toBe(true); expect(posts[0].key).not.toBe(posts[1].key);
    expect(JSON.parse(posts[0].body!)).toMatchObject({ title, sources: [{ purchaseRequestId: seed.requestId,
      purchaseRequestLineId: seed.lineId, expectedRequestVersion: seed.requestVersion, quantity: seed.selectedQuantity }] });
    expect(JSON.parse(posts[1].body!)).toMatchObject({ expectedEventVersion: detail.version, originalDraftFingerprint: saved.originalDraftFingerprint, reason });
    await page.getByRole("button", { name: "Check saved result", exact: true }).click();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible(); await expect(page.getByRole("cell", { name: "Released", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel draft and release its quantities", exact: true })).toHaveCount(0);
    const recoveries = traffic.filter(row => row.path.includes("/command-receipts/")); expect(recoveries).toHaveLength(1);
    expect(recoveries[0]).toMatchObject({ method: "GET", path: `${root}/sourcing/command-receipts/Cancel/${posts[1].key}`, status: 200 });
    const historical = JSON.parse(recoveries[0].rawResponse) as { originalStatusCode: number; responseJson: string; recordedHistoricalResult: boolean };
    expect(historical.originalStatusCode).toBe(200); expect(historical.recordedHistoricalResult).toBe(true); expect(historical.responseJson).toBe(posts[1].rawResponse);
    expect(traffic.filter(row => row.method !== "GET")).toHaveLength(2);
    await expect(page.getByRole("main").getByRole("button", { name: /publish|send to vendor|award|pay/i })).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    const file = info.outputPath("actual-rfq-api-traffic.json"); writeFileSync(file, JSON.stringify(traffic, null, 2) + "\n", { mode: 0o600 });
    await info.attach("actual-rfq-api-traffic", { path: file, contentType: "application/json" });
  }
});
