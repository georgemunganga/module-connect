import { readFileSync, statSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { ReceiptDetail, ServiceDetail } from "../../../src/platform/procurement-receiving-api";

type Actor = "requester" | "manager1" | "manager2" | "acceptor" | "unassigned" | "buyer" | "finance";
type Context = { roles?: string[]; permissions: string[]; company: { name: string; code: string } };
type Source = { orderId: string; orderNumber: string; purchaseOrderLineId: string; issuedVersionId: string; description: string; siteId: string; authorizedQuantity: string; netUnitPrice: string };
type Manifest = { baseUrl: string; tenantId: string; companyId: string; branchId: string; currencyCode: string; authenticationHeader: string;
  actors: Record<Actor, { principalId: string; context: Context }>;
  receiving: { goods: Source; service: Source; physicalQuantity: string; qualifiedQuantity: string; goodsAcceptQuantity: string; partialServiceQuantity: string; serviceNotes: string; evidencePrefix: string; noReceivingEffectsSeeded: boolean } };
type Traffic = { origin: "browser" | "verification"; actor: Actor; method: string; path: string; status: number; body: string | null; key?: string; response: unknown };
const root = "/api/procurement/v1", workspace = "/procurement/workspace", receives = "/purchase-receives";
const check = expect.configure({ timeout: 30_000 });
test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });
function manifest(): Manifest {
  const path = process.env.PROCUREMENT_APPROVAL_BROWSER_MANIFEST;
  if (!path) throw new Error("Set PROCUREMENT_APPROVAL_BROWSER_MANIFEST to a fresh private --serve --receiving fixture; this test starts no backend.");
  if (process.platform !== "win32" && (statSync(path).mode & 0o077)) throw new Error("Manifest must be owner-private.");
  const value = JSON.parse(readFileSync(path, "utf8")) as Manifest, url = new URL(value.baseUrl), seed = value.receiving;
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || value.tenantId !== "probe" || value.authenticationHeader !== "X-Probe-User" || value.currencyCode !== "ZMW" || !seed?.noReceivingEffectsSeeded
    || seed.physicalQuantity !== "2" || seed.qualifiedQuantity !== "2" || seed.goodsAcceptQuantity !== "1" || seed.partialServiceQuantity !== "0.5"
    || seed.serviceNotes !== "n".repeat(1500) || seed.evidencePrefix !== "RCP:"
    || [seed.goods, seed.service].some(source => source.authorizedQuantity !== "1" || source.netUnitPrice !== "100" || source.siteId !== value.branchId))
    throw new Error("Refusing non-synthetic or incomplete receiving fixture.");
  for (const actor of ["manager1", "manager2", "unassigned"] as const) {
    expect(value.actors[actor].context.permissions).not.toContain("procurement-receipt-view");
    expect(value.actors[actor].context.permissions).not.toContain("procurement-po-read");
  }
  expect(value.actors.manager1.context.permissions.slice().sort()).toEqual(["procurement-access", "procurement-receipt-inspect"]);
  expect(value.actors.manager2.context.permissions.slice().sort()).toEqual(["procurement-access", "procurement-service-certify"]);
  expect(new Set(["requester", "manager1", "manager2", "acceptor"].map(name => value.actors[name as Actor].principalId)).size).toBe(4);
  return value;
}

async function connect(page: Page, fixture: Manifest, trafficPath: string) {
  let actor: Actor = "buyer";
  const traffic: Traffic[] = [];
  const record = (row: Traffic) => { traffic.push(row); writeFileSync(trafficPath, JSON.stringify(traffic, null, 2) + "\n", { mode: 0o600 }); };
  const headers = (next: Actor) => ({ [fixture.authenticationHeader]: fixture.actors[next].principalId,
    "X-Shell-Entity": fixture.companyId, "X-Shell-Location": fixture.branchId });
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })),
    { entityId: fixture.companyId, branch: fixture.branchId });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), acting = actor;
    if (url.pathname.startsWith("/api/procurement/")) {
      // Transport forwarding only. No Procurement context/meta/read/command/business response is mocked.
      expect(request.headers()["x-shell-entity"]).toBe(fixture.companyId);
      expect(request.headers()["x-shell-location"]).toBe(fixture.branchId);
      const upstream = await route.fetch({ url: `${fixture.baseUrl}${url.pathname}${url.search}`, timeout: 45_000, maxRetries: 0,
        headers: { ...request.headers(), ...headers(acting) } });
      const text = await upstream.text(); let response: unknown; try { response = JSON.parse(text); } catch { response = text; }
      record({ origin: "browser", actor: acting, method: request.method(), path: url.pathname, status: upstream.status(), body: request.postData(),
        key: request.headers()["idempotency-key"], response });
      return route.fulfill({ response: upstream });
    }
    // Only presentation/authentication for the ERP shell is synthetic; API authorization is real.
    const context = fixture.actors[acting].context;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: acting, roles: context.roles ?? ["procurement_manager"] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: context.company.name });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: fixture.companyId, code: context.company.code, registeredName: context.company.name }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    return json({ message: "Synthetic shell endpoint is not implemented." }, 404);
  });
  return { traffic, async visit(next: Actor, path: string) { actor = next; await page.goto(workspace + path); },
    async request(next: Actor, path: string, method: "GET" | "POST" = "GET", body?: string, key?: string) {
      const result = await page.request.fetch(fixture.baseUrl + path, { method, data: body, timeout: 45_000,
        headers: { ...headers(next), ...(body ? { "Content-Type": "application/json" } : {}), ...(key ? { "Idempotency-Key": key } : {}) } });
      const text = await result.text(); let response: unknown; try { response = JSON.parse(text); } catch { response = text; }
      record({ origin: "verification", actor: next, method, path, status: result.status(), body: body ?? null, key, response });
      return result;
    } };
}
async function deliveryAction(page: Page, name: string, path: string, evidence: string, quantity?: string) {
  await page.getByRole("button", { name, exact: true }).click();
  const dialog = page.getByRole("dialog"), confirm = dialog.getByRole("button", { name: "Confirm delivery action", exact: true });
  if (quantity) await dialog.getByRole("textbox", { name: name === "Inspect delivery" ? "Qualified quantity" : "Quantity to accept", exact: true }).fill(quantity);
  if (name === "Confirm service") await expect(dialog.getByRole("textbox", { name: "Quantity to accept", exact: true })).toHaveValue("0.5");
  await dialog.getByRole("textbox", { name: "Evidence reference", exact: true }).fill(evidence);
  await expect(confirm).toBeDisabled(); await dialog.getByRole("switch").click();
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === "POST");
  await confirm.click(); const response = await pending; expect(response.status(), await response.text()).toBe(200);
  await check(dialog).toHaveCount(0); await check(page.getByRole("status").filter({ hasText: /^Saved:/ })).toBeVisible();
}

async function scenario(page: Page, fixture: Manifest, trafficPath: string) {
  const seed = fixture.receiving, connection = await connect(page, fixture, trafficPath);
  const read = async <T,>(actor: Actor, path: string): Promise<T> => {
    const response = await connection.request(actor, root + path); expect(response.status(), await response.text()).toBe(200); return response.json() as Promise<T>;
  };
  const goods = (actor: Actor, id: string, task = false) => read<ReceiptDetail>(actor, `/receipts/${id}${task ? "/inspection-task" : ""}`);
  const service = (actor: Actor, id: string, task = false) => read<ServiceDetail>(actor, `/service-acceptances/${id}${task ? "/certification-task" : ""}`);
  const writes = () => connection.traffic.filter(row => row.origin === "browser" && row.method === "POST");
  const create = async (kind: "goods" | "service", index = 1) => {
    const source = kind === "goods" ? seed.goods : seed.service;
    await connection.visit("requester", `${receives}/new?kind=${kind}`);
    await page.getByRole("switch", { name: `Select ${source.orderNumber} ${source.description}`, exact: true }).click();
    if (kind === "goods") {
      await page.getByRole("textbox", { name: "Received quantity 1", exact: true }).fill(seed.physicalQuantity);
      await page.getByRole("textbox", { name: "Initially rejected quantity 1", exact: true }).fill("0");
    } else {
      await page.getByRole("textbox", { name: "Deliverable reference", exact: true }).fill(`BROWSER-SERVICE-${index}`);
      await page.getByRole("textbox", { name: "Service quantity", exact: true }).fill(seed.partialServiceQuantity);
      const today = new Date().toISOString().slice(0, 10);
      await page.getByLabel("Service period from", { exact: true }).fill(today); await page.getByLabel("Service period to", { exact: true }).fill(today);
    }
    await page.getByRole("textbox", { name: "Receiving Notes", exact: true }).fill(kind === "service" && index === 1 ? seed.serviceNotes : "Private receiver notes");
    const path = root + (kind === "goods" ? "/receipts/drafts" : "/service-acceptances/drafts");
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save delivery draft", exact: true }).click(); const response = await pending;
    expect(response.status(), await response.text()).toBe(200); const created = await response.json() as { id: string; version: number };
    await check(page).toHaveURL(new RegExp(`/purchase-receives/${created.id}\\?kind=${kind}`));
    return created;
  };
  return { seed, connection, read, goods, service, writes, create };
}
const allTraffic: Traffic[] = [];
test.describe.serial("actual receiving API", () => {
  test("physical excess, independent inspection and acceptance", async ({ page }, info) => {
    allTraffic.length = 0;
    const fixture = manifest(), trafficPath = info.outputPath("actual-receiving-api-traffic.json");
    const { seed, connection, read, goods, writes, create } = await scenario(page, fixture, trafficPath);
    try {
    const meta = await read<{ capabilities: Record<string, boolean> }>("requester", "/meta");
    expect(meta.capabilities).toMatchObject({ receiving: false, receivingDrafts: true, receivingGoods: true, receivingInspection: true, receivingServices: true });
    const created = await create("goods"), id = created.id;
    let receipt = await goods("requester", id); expect(receipt.lines).toHaveLength(1);
    expect(receipt).toMatchObject({ version: created.version, physicalEvidenceRecorded: false, matchingAuthorityAvailable: false });
    expect(receipt.lines[0]).toMatchObject({ purchaseOrderLineId: seed.goods.purchaseOrderLineId, receivedQuantity: "2", initiallyRejectedQuantity: "0", acceptedQuantity: "0" });
    const recordVersion = receipt.version;
    await deliveryAction(page, "Record arrival", `${root}/receipts/${id}/record`, "RCP:BROWSER-PHYSICAL");
    expect(JSON.parse(writes().at(-1)!.body!)).toEqual({ version: recordVersion, evidenceReference: "RCP:BROWSER-PHYSICAL" });
    receipt = await goods("requester", id); expect(receipt.physicalEvidenceRecorded).toBe(true); expect(receipt.lines[0].acceptedQuantity).toBe("0");
    for (const actor of ["manager1", "manager2", "unassigned"] as const) {
      expect((await connection.request(actor, `${root}/receipts/${id}`)).status()).toBe(403);
      expect((await connection.request(actor, `${root}/receiving/sources?page=1&pageSize=25`)).status()).toBe(403);
    }
    expect((await connection.request("unassigned", `${root}/receipts/${id}/inspection-task`)).status()).toBe(404);
    const unassignedInspections = await read<{ items: unknown[]; total: number }>("unassigned", "/receiving/inspection-tasks?page=1&pageSize=25");
    expect(unassignedInspections).toMatchObject({ items: [], total: 0 });
    const beforeInspection = await goods("manager1", id, true);
    expect(beforeInspection.readPurpose).toBe("AssignedInspection");
    for (const key of ["notes", "deliveryNoteRef", "documents"]) expect(beforeInspection).not.toHaveProperty(key);
    await connection.visit("manager1", receives);
    await page.getByRole("row").filter({ hasText: receipt.number }).getByRole("link", { name: "Review delivery", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Documents", exact: true })).toHaveCount(0);
    await deliveryAction(page, "Inspect delivery", `${root}/receipts/${id}/lines/${receipt.lines[0].id}/inspect`, "RCP:BROWSER-INSPECT", seed.qualifiedQuantity);
    expect(JSON.parse(writes().at(-1)!.body!)).toEqual({ version: beforeInspection.lines[0].version, sourceVersion: beforeInspection.lines[0].sourceVersion, quantity: "2", evidenceReference: "RCP:BROWSER-INSPECT" });
    receipt = await goods("acceptor", id); expect(receipt.lines[0].inspection?.qualifiedQuantity).toBe("2");
    const beforeAccept = receipt.lines[0]; await connection.visit("acceptor", `${receives}/${id}?kind=goods`);
    await deliveryAction(page, "Accept goods", `${root}/receipts/${id}/lines/${beforeAccept.id}/accept`, "RCP:BROWSER-ACCEPT", seed.goodsAcceptQuantity);
    expect(JSON.parse(writes().at(-1)!.body!)).toEqual({ version: beforeAccept.version, sourceVersion: beforeAccept.sourceVersion, quantity: "1", evidenceReference: "RCP:BROWSER-ACCEPT" });
    receipt = await goods("acceptor", id);
    expect(receipt.lines[0]).toMatchObject({ receivedQuantity: "2", rejectedQuantity: "0", acceptedQuantity: "1", unacceptedHeldQuantity: "1" });
    expect(receipt.lineReadiness[0].effects).toHaveLength(1);
    expect(receipt.lineReadiness[0].effects![0]).toMatchObject({ quantity: "1", netAmount: "100" });
    expect(receipt.lineReadiness[0].capacity.orderRemainingQuantity).toBe("0");
    const acceptCommand = writes().at(-1)!;
    const replay = await connection.request("acceptor", acceptCommand.path, "POST", acceptCommand.body!, acceptCommand.key);
    expect(replay.status(), await replay.text()).toBe(200); expect(await replay.json()).toEqual(acceptCommand.response);
    expect((await goods("acceptor", id)).lineReadiness[0].effects).toHaveLength(1);

    } finally {
      // Persist first: timeout teardown may have already closed the page.
      writeFileSync(trafficPath, JSON.stringify(connection.traffic, null, 2) + "\n", { mode: 0o600 });
      await page.unrouteAll({ behavior: "wait" }).catch(() => {});
      allTraffic.push(...connection.traffic);
      writeFileSync(trafficPath, JSON.stringify(connection.traffic, null, 2) + "\n", { mode: 0o600 });
      await info.attach("actual-receiving-api-traffic", { path: trafficPath, contentType: "application/json" });
    }
  });
  test("two current-version partial service certificates and complete command evidence", async ({ page }, info) => {
    const fixture = manifest(), trafficPath = info.outputPath("actual-receiving-api-traffic.json");
    const { seed, connection, read, service, writes, create } = await scenario(page, fixture, trafficPath);
    try {
    let previousSourceVersion = 0;
    for (const index of [1, 2]) {
      const draft = await create("service", index), normal = await service("requester", draft.id);
      expect(normal).toMatchObject({ intendedQuantity: "0.5", acceptedQuantity: "0", acceptedNetAmount: "0", matchingAuthorityAvailable: false });
      expect(normal.notes).toBe(index === 1 ? seed.serviceNotes : "Private receiver notes"); expect(normal.cancellationReason ?? null).toBeNull();
      expect((await connection.request("manager2", `${root}/service-acceptances/${draft.id}`)).status()).toBe(403);
      expect((await connection.request("unassigned", `${root}/service-acceptances/${draft.id}/certification-task`)).status()).toBe(404);
      const unassignedServices = await read<{ items: unknown[]; total: number }>("unassigned", "/receiving/service-tasks?page=1&pageSize=25");
      expect(unassignedServices).toMatchObject({ items: [], total: 0 });
      const task = await service("manager2", draft.id, true);
      expect(task.readPurpose).toBe("AssignedServiceCertification");
      for (const key of ["notes", "cancellationReason", "documents"]) expect(task).not.toHaveProperty(key);
      if (index === 2) { expect(task).toHaveProperty("receivingSourceStateId", null); expect(task.sourceVersion).toBeGreaterThan(previousSourceVersion); expect(task.capacity.orderRemainingQuantity).toBe("0.5"); }
      await connection.visit("manager2", receives);
      await page.getByRole("row").filter({ hasText: `BROWSER-SERVICE-${index}` }).getByRole("link", { name: "Review delivery", exact: true }).click();
      await deliveryAction(page, "Confirm service", `${root}/service-acceptances/${draft.id}/certify`, `RCP:BROWSER-SERVICE-${index}`);
      expect(JSON.parse(writes().at(-1)!.body!)).toEqual({ version: task.version, sourceVersion: task.sourceVersion, quantity: "0.5", evidenceReference: `RCP:BROWSER-SERVICE-${index}` });
      const certified = await service("requester", draft.id);
      expect(certified).toMatchObject({ acceptedQuantity: "0.5", acceptedNetAmount: "50", currentAcceptedQuantity: "0.5", currentAcceptedNetAmount: "50", isCertifiedRecord: true, matchingAuthorityAvailable: false });
      expect(certified.notes).toBe(index === 1 ? seed.serviceNotes : "Private receiver notes");
      expect(certified.sourceVersion).toBeGreaterThan(task.sourceVersion); previousSourceVersion = task.sourceVersion;
      expect(certified.capacity.orderRemainingQuantity).toBe(index === 1 ? "0.5" : "0");
      await check(page.getByText("Accepted quantity: 0.5 · Accepted value: ZMW 50", { exact: true })).toBeVisible();
    }
    const combinedTraffic = [...allTraffic, ...connection.traffic];
    const commands = combinedTraffic.filter(row => row.origin === "browser" && row.method === "POST"); expect(commands).toHaveLength(8);
    expect(commands.map(row => row.actor)).toEqual(["requester", "requester", "manager1", "acceptor", "requester", "manager2", "requester", "manager2"]);
    for (const command of commands) { expect(command.status).toBe(200); expect(command.key).toMatch(/^[0-9a-f-]{36}$/i); }
    expect(new Set(commands.map(row => row.key)).size).toBe(8);
    const goodsDraft = JSON.parse(commands[0].body!);
    expect(goodsDraft).toMatchObject({ purchaseOrderId: seed.goods.orderId, issuedVersionId: seed.goods.issuedVersionId, siteId: fixture.branchId,
      lines: [{ purchaseOrderLineId: seed.goods.purchaseOrderLineId, receivedQuantity: "2", rejectedQuantity: "0" }] });
    for (const command of [commands[4], commands[6]]) expect(JSON.parse(command.body!)).toMatchObject({ purchaseOrderId: seed.service.orderId,
      issuedVersionId: seed.service.issuedVersionId, purchaseOrderLineId: seed.service.purchaseOrderLineId, quantity: "0.5" });
    const purposeReads = combinedTraffic.filter(row => row.origin === "browser" && ["manager1", "manager2"].includes(row.actor));
    expect(purposeReads.some(row => row.path.includes("/inspection-task"))).toBe(true);
    expect(purposeReads.some(row => row.path.includes("/certification-task"))).toBe(true);
    expect(purposeReads.some(row => row.path.includes("/receiving/worklist") || row.path.includes("/receiving/sources") || /^\/api\/procurement\/v1\/(receipts|service-acceptances)\/[^/]+$/.test(row.path))).toBe(false);
    expect(combinedTraffic.some(row => /\/orders|\/invoices|\/finance-handoffs/.test(row.path))).toBe(false);
    } finally {
      writeFileSync(trafficPath, JSON.stringify([...allTraffic, ...connection.traffic], null, 2) + "\n", { mode: 0o600 });
      await page.unrouteAll({ behavior: "wait" }).catch(() => {});
      writeFileSync(trafficPath, JSON.stringify([...allTraffic, ...connection.traffic], null, 2) + "\n", { mode: 0o600 });
      await info.attach("actual-receiving-api-traffic", { path: trafficPath, contentType: "application/json" });
    }
  });
});
