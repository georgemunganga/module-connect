import { readFileSync, statSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { privateFixtureRequest } from "./private-unix-transport";

type Fixture = { baseUrl: string; transport?: string; socketPath?: string; noTcpListener?: boolean;
  tenantId: string; companyId: string; branchId: string; currencyCode: string; authenticationHeader: string;
  actors: { buyer: { principalId: string; context: { permissions: string[]; company: { name: string; code: string } } } };
  rfq: { requestId: string; lineId: string; requestVersion: number; requestNumber: string; title: string;
    cancellationReason: string; selectedQuantity: string; approvedQuantity: string; expectedEstimatedValue: string; noSourcingEffectsSeeded: boolean } };

test("actual finite competitive source creates exact partial RFQ and cancels with retained receipts", async ({ page }, info) => {
  test.setTimeout(180_000);
  const path = process.env.PROCUREMENT_APPROVAL_BROWSER_MANIFEST;
  if (!path || (statSync(path).mode & 0o077)) throw new Error("Explicit fresh owner-private --serve --rfq fixture required.");
  const fixture = JSON.parse(readFileSync(path, "utf8")) as Fixture;
  const url = new URL(fixture.baseUrl), seed = fixture.rfq, buyer = fixture.actors.buyer;
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || fixture.tenantId !== "probe" || fixture.authenticationHeader !== "X-Probe-User" || fixture.currencyCode !== "ZMW"
    || !seed?.noSourcingEffectsSeeded || seed.approvedQuantity !== "0.0002" || seed.selectedQuantity !== "0.0001" || seed.expectedEstimatedValue !== "0.00000001"
    || seed.title !== "Browser exact governed RFQ draft" || seed.cancellationReason !== "Browser source no longer needed") throw new Error("Refusing incomplete/non-synthetic RFQ fixture.");
  expect([...buyer.context.permissions].sort()).toEqual(["procurement-access", "procurement-sourcing-cancel", "procurement-sourcing-convert"]);
  const headers = { [fixture.authenticationHeader]: buyer.principalId, "X-Shell-Entity": fixture.companyId, "X-Shell-Location": fixture.branchId };
  const traffic: { method: string; path: string; status: number; body: string | null; key?: string }[] = [];
  const record = () => writeFileSync(info.outputPath("actual-rfq-traffic.json"), JSON.stringify(traffic, null, 2), { mode: 0o600 });
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })), { entityId: fixture.companyId, branch: fixture.branchId });
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith("/api/procurement/")) {
      expect(request.headers()["x-shell-entity"]).toBe(fixture.companyId);
      expect(request.headers()["x-shell-location"]).toBe(fixture.branchId);
      const upstream = await privateFixtureRequest(page.request, fixture, url.pathname + url.search, { method: request.method(), body: request.postData(), headers: { ...request.headers(), ...headers } });
      traffic.push({ method: request.method(), path: url.pathname, status: upstream.status(), body: request.postData(), key: request.headers()["idempotency-key"] }); record();
      return route.fulfill(upstream.fulfill); // Actual business response, no Procurement mocks.
    }
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "buyer", roles: ["browser_rfq_buyer"] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: buyer.context.company.name });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: fixture.companyId, code: buyer.context.company.code, registeredName: buyer.context.company.name }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    return route.fulfill({ status: 404, body: "Synthetic shell endpoint unavailable" });
  });
  try {
    await page.goto("/procurement/workspace/rfqs/new?source=approved");
    await page.getByLabel("What are you buying?").fill(seed.title);
    await page.getByRole("row").filter({ hasText: seed.requestNumber }).getByRole("button", { name: "Add line", exact: true }).click();
    await page.getByLabel(`Quantity for ${seed.requestNumber}`, { exact: true }).fill(seed.selectedQuantity);
    const created = page.waitForResponse(r => new URL(r.url()).pathname.endsWith("/sourcing/from-approved-sources") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Create internal draft", exact: true }).click();
    const create = await created; expect(create.status(), await create.text()).toBe(201);
    const saved = await create.json() as { eventId: string; commandKey: string };
    await expect(page.getByRole("heading", { name: seed.title, exact: true })).toBeVisible();
    await page.reload(); await expect(page.getByRole("heading", { name: seed.title, exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: seed.selectedQuantity, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /publish|send to vendor|award/i })).toHaveCount(0);
    const read = await privateFixtureRequest(page.request, fixture, `/api/procurement/v1/sourcing/${saved.eventId}/source-draft`, { headers });
    expect(read.status()).toBe(200);
    const detail = await read.json() as { status: string; lines: { quantity: string; estimatedValue: string; allocationState: string }[] };
    expect(detail.status).toBe("Draft"); expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]).toMatchObject({ quantity: seed.selectedQuantity, estimatedValue: seed.expectedEstimatedValue, allocationState: "Reserved" });
    await page.getByRole("textbox", { name: "Reason", exact: true }).fill(seed.cancellationReason);
    const cancelled = page.waitForResponse(r => new URL(r.url()).pathname.endsWith("/source-cancel") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Cancel draft and release its quantities", exact: true }).click();
    const cancel = await cancelled; expect(cancel.status(), await cancel.text()).toBe(200);
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    const writes = traffic.filter(x => x.method === "POST"); expect(writes).toHaveLength(2);
    const createBody = JSON.parse(writes[0].body!) as { sources: { purchaseRequestId: string; purchaseRequestLineId: string; quantity: string }[] };
    expect(createBody.sources).toHaveLength(1); expect(createBody.sources[0]).toMatchObject({ purchaseRequestId: seed.requestId, purchaseRequestLineId: seed.lineId, quantity: seed.selectedQuantity });
    for (const [operation, write] of [["Create", writes[0]], ["Cancel", writes[1]]] as const) {
      const receipt = await privateFixtureRequest(page.request, fixture, `/api/procurement/v1/sourcing/command-receipts/${operation}/${write.key}`, { headers });
      expect(receipt.status()).toBe(200);
      expect(await receipt.json()).toMatchObject({ operation, commandKey: write.key, recordedHistoricalResult: true, canPublish: false });
    }
    const final = await privateFixtureRequest(page.request, fixture, `/api/procurement/v1/sourcing/${saved.eventId}/source-draft`, { headers });
    expect(final.status()).toBe(200);
    const retained = await final.json() as { status: string; lines: { allocationState: string; quantity: string }[] };
    expect(retained.status).toBe("Cancelled"); expect(retained.lines[0]).toMatchObject({ allocationState: "Released", quantity: seed.selectedQuantity });
    expect(traffic.filter(x => /\/requests(?:\/|$)|\/purchase-orders(?:\/|$)/.test(x.path))).toHaveLength(0);
  } finally { record(); await page.unrouteAll({ behavior: "wait" }); }
});
