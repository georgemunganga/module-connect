import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { expect, test, type Page, type APIResponse } from "@playwright/test";

// Proposed --serve --matching contract; no test may start a backend or fabricate its business responses.
type Actor = "mapper" | "matcher" | "reader" | "otherBranchMatcher";
type FixtureActor = { principalId: string; branchId: string; context: { permissions: string[]; roles?: string[]; company: { name: string; code: string } } };
type Manifest = { baseUrl: string; tenantId: string; companyId: string; branchId: string; currencyCode: string; authenticationHeader: string;
  actors: Record<Actor, FixtureActor>; matching: { source: { orderId: string; orderNumber: string; issuedVersionId: string; purchaseOrderLineId: string;
    description: string; supplierId: string; supplierName: string; unitCode: string; categoryCode: string; currencyCode: string; receiptLineId: string;
    receiptReference: string; acceptedQuantity: string; acceptedNetAmount: string }; policyVersionId: string;
    invoice: { number: string; date: string; description: string; quantity: string; unitPrice: string; taxAmount: string };
    document: { fileName: string; mediaType: string; contentUtf8: string; sha256: string; invoiceUnitCode: string; lineReference: string; scannerBoundary: string };
    noInvoiceOrMatchingRowsSeeded: boolean; originalUnitReviewer: string; historicalExposureOwner: string; noFinanceAuthority: boolean } };
type Traffic = { actor: Actor; origin: "browser" | "verification"; method: string; path: string; query: string; status: number; key?: string; body: string | null; response: unknown };
const api = "/api/procurement/v1", workspace = "/procurement/workspace", guid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const check = expect.configure({ timeout: 30_000 });
const allTraffic: Traffic[] = [];
let captured: { invoiceId: string; invoiceLineId: string; mappingId: string; version: number; documentVersionId: string; documentId: string } | null = null;
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function fixture(): Manifest {
  const file = process.env.PROCUREMENT_MATCHING_BROWSER_MANIFEST;
  if (!file || process.platform !== "win32" && (statSync(file).mode & 0o077)) throw new Error("A fresh owner-private --serve --matching manifest is required.");
  const value = JSON.parse(readFileSync(file, "utf8")) as Manifest, url = new URL(value.baseUrl), seed = value.matching;
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || value.tenantId !== "probe" || value.currencyCode !== "ZMW" || value.authenticationHeader !== "X-Probe-User"
    || !seed?.noInvoiceOrMatchingRowsSeeded || !seed.noFinanceAuthority || seed.originalUnitReviewer !== "Unavailable" || seed.historicalExposureOwner !== "Unavailable"
    || seed.source.categoryCode !== "IT" || seed.source.currencyCode !== "ZMW" || seed.source.acceptedQuantity !== "1" || seed.source.acceptedNetAmount !== "100"
    || seed.invoice.quantity !== "1" || seed.invoice.unitPrice !== "100" || seed.invoice.taxAmount !== "0"
    || seed.document.scannerBoundary !== "KnownFixtureOnlyDocumentScanner" || seed.document.mediaType !== "application/pdf"
    || !seed.document.contentUtf8.startsWith("%PDF-") || Buffer.byteLength(seed.document.contentUtf8) > 4096
    || sha(Buffer.from(seed.document.contentUtf8)) !== seed.document.sha256 || seed.document.lineReference !== "Page 1 line 1")
    throw new Error("Refusing an incomplete or non-synthetic matching fixture.");
  const expected: Record<Actor, string[]> = {
    mapper: ["procurement-access", "procurement-invoice-read", "procurement-invoice-capture", "procurement-invoice-match", "procurement-vendor-read"],
    matcher: ["procurement-access", "procurement-invoice-read", "procurement-invoice-match"],
    reader: ["procurement-access", "procurement-invoice-read"],
    otherBranchMatcher: ["procurement-access", "procurement-invoice-read", "procurement-invoice-match"],
  };
  for (const actor of Object.keys(expected) as Actor[]) {
    expect(value.actors[actor].context.permissions.slice().sort()).toEqual(expected[actor].slice().sort());
    expect(guid.test(value.actors[actor].principalId)).toBe(true);
    expect(value.actors[actor].branchId === value.branchId).toBe(actor !== "otherBranchMatcher");
  }
  expect(new Set(Object.values(value.actors).map((actor) => actor.principalId)).size).toBe(4);
  return value;
}
async function connect(page: Page, seed: Manifest, trafficPath: string) {
  let actor: Actor = "mapper", interruptCompare = false;
  const record = (entry: Traffic) => { allTraffic.push(entry); writeFileSync(trafficPath, JSON.stringify(allTraffic, null, 2) + "\n", { mode: 0o600 }); };
  const headers = (who: Actor) => ({ [seed.authenticationHeader]: seed.actors[who].principalId,
    "X-Shell-Entity": seed.companyId, "X-Shell-Location": seed.actors[who].branchId });
  const content = async (response: APIResponse): Promise<unknown> => {
    const bytes = await response.body();
    if (response.headers()["content-type"]?.includes("application/pdf")) return { sha256: sha(bytes), byteLength: bytes.length };
    const text = bytes.toString("utf8"); try { return JSON.parse(text); } catch { return text; }
  };
  await page.addInitScript(({ company, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: company, branch })), { company: seed.companyId, branch: seed.branchId });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), who = actor;
    if (url.pathname.startsWith("/api/procurement/")) {
      expect(request.headers()["x-shell-entity"]).toBe(seed.companyId);
      expect(request.headers()["x-shell-location"]).toBe(seed.actors[who].branchId);
      const upstream = await route.fetch({ url: seed.baseUrl + url.pathname + url.search, timeout: 45_000, maxRetries: 0, headers: { ...request.headers(), ...headers(who) } });
      record({ actor: who, origin: "browser", method: request.method(), path: url.pathname, query: url.search, key: request.headers()["idempotency-key"], body: request.postData(), status: upstream.status(), response: await content(upstream) });
      if (interruptCompare && request.method() === "POST" && url.pathname.endsWith("/matching/compare") && upstream.status() === 200) {
        interruptCompare = false; return route.abort("failed"); // actual commit/receipt already returned, downstream transport only
      }
      return route.fulfill({ response: upstream });
    }
    const context = seed.actors[who].context;
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: who, roles: context.roles ?? [] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: context.company.name });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: seed.companyId, code: context.company.code, registeredName: context.company.name }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    return json({ message: "Synthetic presentation endpoint unavailable." }, 404);
  });
  return { interruptNextComparison() { interruptCompare = true; }, async visit(who: Actor, path: string) { actor = who; await page.goto(workspace + path); },
    async request(who: Actor, path: string, method: "GET" | "POST" = "GET", body?: string, key?: string) {
      const result = await page.request.fetch(seed.baseUrl + path, { method, data: body, timeout: 45_000, headers: { ...headers(who),
        ...(body ? { "Content-Type": "application/json" } : {}), ...(key ? { "Idempotency-Key": key } : {}) } });
      const url = new URL(seed.baseUrl + path); record({ actor: who, origin: "verification", method, path: url.pathname, query: url.search, body: body ?? null, key, status: result.status(), response: await content(result) });
      return result;
    } };
}
const realPosts = () => allTraffic.filter((r) => r.origin === "browser" && r.method === "POST" && /\/matching\/(?:mappings|compare)$/.test(r.path));
test.describe.serial("actual blocked invoice comparison", () => {
  test("capture and checked owned document link to actual issued source as Unverified", async ({ page }, info) => {
    allTraffic.length = 0; captured = null;
    const seed = fixture(), trafficPath = info.outputPath("actual-matching-api-traffic.json"), connection = await connect(page, seed, trafficPath), data = seed.matching;
    try {
      const before = await connection.request("mapper", api + "/invoices"); expect(before.status(), await before.text()).toBe(200); expect((await before.json()).total).toBe(0);
      await connection.visit("mapper", "/bills/new");
      await page.getByRole("combobox", { name: "Vendor", exact: true }).click();
      await page.getByRole("option", { name: data.source.supplierName, exact: true }).click();
      await page.getByLabel("Invoice number", { exact: true }).fill(data.invoice.number);
      await page.getByLabel("Invoice date", { exact: true }).fill(data.invoice.date);
      await page.getByLabel("Description 1", { exact: true }).fill(data.invoice.description);
      await page.getByLabel("Quantity", { exact: true }).fill(data.invoice.quantity);
      await page.getByLabel("Unit price", { exact: true }).fill(data.invoice.unitPrice);
      await page.getByLabel("Tax amount", { exact: true }).fill(data.invoice.taxAmount);
      const captureWait = page.waitForResponse((r) => new URL(r.url()).pathname === api + "/invoices" && r.request().method() === "POST");
      await page.getByRole("button", { name: "Record as received", exact: true }).click();
      const capture = await captureWait; expect(capture.status(), await capture.text()).toBe(201); const invoice = await capture.json();
      await check(page).toHaveURL(new RegExp(`/bills/${invoice.id}$`));
      const originalRead = await connection.request("mapper", `${api}/invoices/${invoice.id}`); expect(originalRead.status()).toBe(200); const original = await originalRead.json();
      expect(original.lines).toHaveLength(1); expect(original.supplierId).toBe(data.source.supplierId);
      expect(original.status).toBe("Received"); expect(original.currencyCode).toBe("ZMW");
      await page.getByLabel("Invoice document", { exact: true }).setInputFiles({ name: data.document.fileName, mimeType: data.document.mediaType, buffer: Buffer.from(data.document.contentUtf8) });
      const docPath = `${api}/invoices/${invoice.id}/documents`, uploadWait = page.waitForResponse((r) => new URL(r.url()).pathname === docPath && r.request().method() === "POST");
      await page.getByRole("button", { name: "Add document", exact: true }).click();
      const upload = await uploadWait; expect(upload.status(), await upload.text()).toBe(200); const document = await upload.json();
      expect(document.scanState).toBe("Available"); expect(document.canDownload).toBe(true); expect(document.sha256).toBe(data.document.sha256);
      expect(document.fileName).toBe(data.document.fileName); expect(document.versionNumber).toBe(1);
      expect(guid.test(document.versionId)).toBe(true); expect(guid.test(document.documentId)).toBe(true);
      const download = await connection.request("mapper", `${docPath}/${document.versionId}/download`); expect(download.status()).toBe(200); expect(sha(await download.body())).toBe(data.document.sha256);
      await page.getByRole("button", { name: "Link invoice lines", exact: true }).click();
      await page.getByLabel("Find order or item", { exact: true }).fill(data.source.orderNumber);
      await page.getByRole("button", { name: "Search sources", exact: true }).click();
      const sourceRow = page.getByRole("row").filter({ hasText: data.source.orderNumber }).filter({ hasText: data.source.description });
      await check(sourceRow).toHaveCount(1); await sourceRow.getByRole("button", { name: "Choose source", exact: true }).click();
      await page.getByRole("combobox", { name: "Receipt or service confirmation", exact: true }).click();
      await page.getByRole("option", { name: `${data.source.receiptReference} · 1 · Goods receipt`, exact: true }).click();
      await page.getByLabel("Unit on original invoice", { exact: true }).fill(data.document.invoiceUnitCode);
      await page.getByRole("combobox", { name: "Original invoice document", exact: true }).click();
      await page.getByRole("option", { name: `${data.document.fileName} · Version 1`, exact: true }).click();
      await page.getByLabel("Line or page reference in document", { exact: true }).fill(data.document.lineReference);
      expect(realPosts()).toHaveLength(0);
      const mapWait = page.waitForResponse((r) => new URL(r.url()).pathname === `${api}/invoices/${invoice.id}/matching/mappings` && r.request().method() === "POST");
      await page.getByRole("button", { name: "Save line links", exact: true }).click(); const response = await mapWait;
      expect(response.status(), await response.text()).toBe(200); const mapped = await response.json();
      expect(mapped.isCurrentApproval).toBe(false); expect(mapped.canPostToFinance).toBe(false); expect(mapped.result.verificationState).toBe("Unverified");
      expect(mapped.result.version).toBeGreaterThan(original.version);
      await check(page.getByText("Line links saved. Original units and documents still need verified review.", { exact: true })).toBeVisible();
      const write = realPosts()[0], sent = JSON.parse(write.body!);
      expect(sent.version).toBe(original.version); expect(sent.purchaseOrderId).toBe(data.source.orderId); expect(sent.issuedVersionId).toBe(data.source.issuedVersionId);
      expect(sent.lines).toEqual([{ invoiceLineId: original.lines[0].id, purchaseOrderLineId: data.source.purchaseOrderLineId, goodsReceiptLineId: data.source.receiptLineId,
        serviceAcceptanceId: null, invoiceUnitCode: data.document.invoiceUnitCode, documentVersionId: document.versionId, documentLineReference: data.document.lineReference }]);
      expect(realPosts()).toHaveLength(1); expect(guid.test(write.key!)).toBe(true);
      captured = { invoiceId: invoice.id, invoiceLineId: original.lines[0].id, mappingId: mapped.result.id, version: mapped.result.version, documentVersionId: document.versionId, documentId: document.documentId };
    } finally { writeFileSync(trafficPath, JSON.stringify(allTraffic, null, 2) + "\n", { mode: 0o600 }); await page.unrouteAll({ behavior: "ignoreErrors" }); }
  });
  test("narrow matcher records Blocked then recovers its real original command without AP authority", async ({ page }, info) => {
    if (!captured) throw new Error("Fresh capture/document/mapping phase did not complete.");
    const seed = fixture(), state = captured, path = `${api}/invoices/${state.invoiceId}`, trafficPath = info.outputPath("actual-matching-api-traffic.json"), connection = await connect(page, seed, trafficPath);
    try {
      await connection.visit("matcher", `/bills/${state.invoiceId}`);
      await check(page.getByRole("button", { name: "Run invoice comparison", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Link invoice lines", exact: true })).toHaveCount(0);
      expect(realPosts().filter((r) => r.path.endsWith("/compare"))).toHaveLength(0);
      connection.interruptNextComparison(); await page.getByRole("button", { name: "Run invoice comparison", exact: true }).click();
      await check(page.getByRole("button", { name: "Check saved invoice action", exact: true })).toBeVisible();
      const compared = realPosts().filter((r) => r.path.endsWith("/compare")); expect(compared).toHaveLength(1);
      const command = compared[0], reply = command.response as { result: { id: string; outcome: string; version: number; hasCapacityClaim: boolean; canPostToFinance: boolean; discrepancies: { code: string }[] } };
      expect(command.status).toBe(200); expect(command.actor).toBe("matcher"); expect(JSON.parse(command.body!)).toEqual({ version: state.version, mappingVersionId: state.mappingId, reason: null });
      expect(reply.result.outcome).toBe("Blocked"); expect(reply.result.hasCapacityClaim).toBe(false); expect(reply.result.canPostToFinance).toBe(false);
      expect(reply.result.discrepancies.map((i) => i.code)).toContain("CompleteConsumptionEvidenceRequired");
      await expect(page.getByRole("button", { name: "Run invoice comparison", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Check saved invoice action", exact: true }).click();
      await check(page.getByText("Saved result found. Comparison recorded. Review the saved issues before continuing.", { exact: true })).toBeVisible();
      expect(realPosts().filter((r) => r.path.endsWith("/compare"))).toHaveLength(1);
      const recovery = allTraffic.filter((r) => r.origin === "browser" && r.path === `${path}/matching/commands/${command.key}`); expect(recovery).toHaveLength(1);
      expect(recovery[0].query).toBe("?operation=InvoiceCompare"); expect(recovery[0].status).toBe(200);
      const restored = recovery[0].response as Record<string, any>; expect(restored.recordedHistoricalResult).toBe(true); expect(restored.isCurrentReplayAuthorization).toBe(false); expect(restored.canPostToFinance).toBe(false);
      expect(restored.recordedResult).toEqual(command.response);
      const historyResponse = await connection.request("matcher", path + "/matching"); expect(historyResponse.status()).toBe(200); const history = await historyResponse.json();
      expect(history.comparisons).toHaveLength(1); expect(history.mappings).toHaveLength(1); expect(history.comparisons[0].id).toBe(reply.result.id);
      expect(history.mappings[0].verificationState).toBe("Unverified"); expect(history.canPostToFinance).toBe(false); expect(history.isInvoiceApproval).toBe(false);
      expect(JSON.stringify(history)).not.toMatch(/"allocations"|"ownerReference"|"bank/i);
      const readyResponse = await connection.request("matcher", path + "/finance-readiness"); expect(readyResponse.status()).toBe(200); const ready = await readyResponse.json();
      expect(ready.state).toBe("Blocked"); expect(ready.canPrepareHandoff).toBe(false);
      expect(ready.blockers.map((b: { code: string }) => b.code)).toEqual(expect.arrayContaining(["InvoiceValidationAuthorityUnavailable", "FinanceReceiverUnavailable"]));
      expect((await connection.request("reader", path + "/matching/sources")).status()).toBe(403);
      expect((await connection.request("reader", path + "/matching/compare", "POST", command.body!, command.key)).status()).toBe(403);
      expect((await connection.request("reader", `${path}/matching/commands/${command.key}?operation=InvoiceCompare`)).status()).toBe(403);
      expect((await connection.request("otherBranchMatcher", path + "/matching/sources")).status()).toBe(404);
      expect((await connection.request("otherBranchMatcher", `${path}/matching/commands/${command.key}?operation=InvoiceCompare`)).status()).toBe(404);
      const finalRead = await connection.request("matcher", path); expect(finalRead.status()).toBe(200); const final = await finalRead.json();
      expect(final.status).toBe("Received"); expect(final.version).toBe(reply.result.version); expect(final.lines[0].id).toBe(state.invoiceLineId);
      expect(realPosts()).toHaveLength(2); expect(new Set(realPosts().map((r) => r.key)).size).toBe(2);
      await expect(page.getByRole("main").getByRole("button", { name: /approve|post|pay|send to finance/i })).toHaveCount(0);
    } finally { writeFileSync(trafficPath, JSON.stringify(allTraffic, null, 2) + "\n", { mode: 0o600 }); await page.unrouteAll({ behavior: "ignoreErrors" }); }
  });
});
