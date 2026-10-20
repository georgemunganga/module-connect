import { readFileSync, statSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { ExecutionOrderDetail } from "../../../src/platform/procurement-order-execution-api";

type Actor = "buyer" | "finance" | "manager1" | "manager2" | "requester";
type Context = { roles?: string[]; permissions: string[]; company: { name: string; code: string } };
type Manifest = { baseUrl: string; tenantId: string; companyId: string; branchId: string; currencyCode: string; authenticationHeader: string;
  actors: Record<Actor, { principalId: string; context: Context }>;
  orders: { source: { id: string; number: string; approvalState: string; lines: { id: string; description: string; approvedQuantity: number }[] };
    sourceRequestId: string; sourceLineId: string; supplierId: string; supplierDisplayName: string; sourceReservationReference: string;
    quantity: string; unitPrice: string; confirmedGrossAmount: string; currencyCode: string; buyerPrincipalId: string;
    financePrincipalId: string; approverPrincipalId: string; dispatcherPrincipalId: string; deliveryChannel: string } };
type Traffic = { actor: Actor; method: string; path: string; status: number; body: string | null; key?: string; response: unknown };
const root = "/api/procurement/v1", orders = root + "/orders", workspace = "/procurement/workspace";
const check = expect.configure({ timeout: 30_000 });
test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

function manifest(): Manifest {
  const path = process.env.PROCUREMENT_APPROVAL_BROWSER_MANIFEST;
  if (!path) throw new Error("Set PROCUREMENT_APPROVAL_BROWSER_MANIFEST to a fresh private --serve --orders fixture. This test starts no backend.");
  if (process.platform !== "win32" && (statSync(path).mode & 0o077)) throw new Error("The synthetic manifest must be owner-private.");
  const value = JSON.parse(readFileSync(path, "utf8")) as Manifest, url = new URL(value.baseUrl), seed = value.orders;
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || value.tenantId !== "probe" || value.authenticationHeader !== "X-Probe-User" || value.currencyCode !== "ZMW" || !seed
    || seed.quantity !== "1" || seed.unitPrice !== "100" || seed.confirmedGrossAmount !== "100" || seed.deliveryChannel !== "SecureEmail"
    || seed.sourceRequestId !== seed.source.id || seed.sourceLineId !== seed.source.lines[0]?.id || seed.source.approvalState !== "Approved"
    || seed.buyerPrincipalId !== value.actors.buyer?.principalId || seed.financePrincipalId !== value.actors.finance?.principalId
    || seed.approverPrincipalId !== value.actors.manager2?.principalId || seed.dispatcherPrincipalId !== value.actors.manager1?.principalId)
    throw new Error("Refusing a non-synthetic or incomplete PO browser fixture.");
  expect(value.actors.finance.context.permissions).not.toContain("procurement-po-read");
  expect(value.actors.manager2.context.permissions).toEqual(expect.arrayContaining(["procurement-po-approve"]));
  for (const permission of ["procurement-po-read", "procurement-request-read", "procurement-approval-read", "procurement-approval-decide"])
    expect(value.actors.manager2.context.permissions).not.toContain(permission);
  expect(value.actors.manager1.context.permissions).not.toContain("procurement-po-read");
  return value;
}

async function connect(page: Page, fixture: Manifest) {
  let actor: Actor = "buyer";
  const traffic: Traffic[] = [];
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
      traffic.push({ actor: acting, method: request.method(), path: url.pathname, status: upstream.status(), body: request.postData(),
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
      return page.request.fetch(fixture.baseUrl + path, { method, data: body, timeout: 45_000,
        headers: { ...headers(next), ...(body ? { "Content-Type": "application/json" } : {}), ...(key ? { "Idempotency-Key": key } : {}) } });
    } };
}
const localNow = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 23); };
async function action(page: Page, name: string, path: string, options: { reference?: string; evidence?: string; delivery?: boolean; channel?: string } = {}) {
  await page.getByRole("button", { name, exact: true }).click(); const dialog = page.getByRole("dialog");
  if (options.reference) await dialog.getByLabel(options.delivery ? "Sending reference" : "Finance commitment reference", { exact: true }).fill(options.reference);
  if (options.evidence) {
    await dialog.getByLabel("Evidence reference", { exact: true }).fill(options.evidence);
    await dialog.getByLabel("Evidence date and time", { exact: true }).fill(localNow());
  }
  if (options.delivery) {
    await dialog.getByRole("combobox", { name: "Sending channel", exact: true }).click();
    await page.getByRole("option", { name: options.channel!, exact: true }).click();
  }
  await expect(dialog.getByRole("button", { name: "Confirm action", exact: true })).toBeDisabled();
  await dialog.getByRole("switch").click();
  const reply = page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "Confirm action", exact: true }).click();
  const response = await reply; expect(response.status(), await response.text()).toBeGreaterThanOrEqual(200); expect(response.status()).toBeLessThan(300);
  await check(dialog).toHaveCount(0); return response.json() as Promise<{ id: string; status: string; version: number }>;
}

test("actual PO API: approved source, independent Finance and assigned reviewer, authorise then prove sending", async ({ page }, info) => {
  const fixture = manifest(), seed = fixture.orders, connection = await connect(page, fixture);
  const detail = async (actor: Actor, id: string) => {
    const response = await connection.request(actor, `${orders}/${id}/execution-detail`); expect(response.status(), await response.text()).toBe(200);
    return response.json() as Promise<ExecutionOrderDetail>;
  };
  try {
    const meta = await connection.request("buyer", root + "/meta"); expect(meta.status()).toBe(200);
    expect(await meta.json()).toMatchObject({ schemaReady: true, capabilities: { orders: true } });
    const sourceBefore = await connection.request("buyer", orders + "/approved-sources?pageSize=100"); expect(sourceBefore.status()).toBe(200);
    expect((await sourceBefore.json()).items.find((row: { lineId: string }) => row.lineId === seed.sourceLineId))
      .toMatchObject({ availableQuantityExact: "1", approvedUnitPriceExact: "100", eligibility: "Available" });
    await connection.visit("buyer", "/purchase-orders/new");
    await page.getByRole("switch", { name: `Select ${seed.source.number} ${seed.source.lines[0].description}`, exact: true }).click();
    await page.getByRole("combobox", { name: "Vendor", exact: true }).click();
    await page.getByRole("option", { name: seed.supplierDisplayName, exact: true }).click();
    await page.getByLabel("Quantity 1", { exact: true }).fill(seed.quantity);
    await page.getByLabel("Unit price 1", { exact: true }).fill(seed.unitPrice);
    const conversion = page.waitForResponse((response) => new URL(response.url()).pathname === orders + "/from-approved-sources" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create linked order", exact: true }).click();
    const converted = await conversion; expect(converted.status(), await converted.text()).toBe(201);
    const order = await converted.json() as { id: string; number: string }, id = order.id;
    await check(page.getByRole("heading", { name: order.number, exact: true })).toBeVisible();
    let persisted = await detail("buyer", id);
    expect(persisted.order).toMatchObject({ status: "Draft", currencyCode: "ZMW", supplierId: seed.supplierId });
    expect(persisted.order.lines).toHaveLength(1); expect(persisted.order.lines[0]).toMatchObject({ quantity: "1", unitPrice: "100", taxAmount: "0", sourcePurchaseRequestLineId: seed.sourceLineId });
    expect(persisted.totals).toEqual({ lineBaseAmount: "100", grossAmount: "100" });
    expect(persisted.sourceReservationReferences).toEqual([seed.sourceReservationReference]);
    expect((await connection.request("finance", `${orders}/${id}`)).status()).toBe(403);

    await connection.visit("finance", `/purchase-orders/${id}`);
    await expect(page.getByText("Total: ZMW 100", { exact: true })).toBeVisible();
    await action(page, "Record Finance confirmation", `${orders}/${id}/finance-confirmations`, { reference: "BROWSER-PO-COMMITMENT", evidence: "BROWSER-INDEPENDENT-FINANCE" });
    persisted = await detail("finance", id);
    expect(persisted.financeStatus).toBe("CommitmentHeld"); expect(persisted.financeEvidence).toHaveLength(1);
    expect(persisted.financeEvidence[0]).toMatchObject({ confirmedGrossAmount: "100", currencyCode: "ZMW", commitmentReference: "BROWSER-PO-COMMITMENT", releaseConfirmed: false });

    await connection.visit("buyer", `/purchase-orders/${id}`);
    await action(page, "Send order for approval", `${orders}/${id}/submit`);
    persisted = await detail("buyer", id); expect(persisted.order.status).toBe("PendingApproval"); expect(persisted.cases).toHaveLength(1);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await connection.visit("manager2", "/approvals");
    await check(page.getByRole("heading", { name: "Order approvals", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Purchase requests", exact: true })).toHaveCount(0);
    await page.getByRole("row").filter({ hasText: order.number }).getByRole("link", { name: "Review order approval", exact: true }).click();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const decisionDialog = page.getByRole("dialog");
    await decisionDialog.getByLabel("Comment (optional)", { exact: true }).fill("Independent review of exact approved order base");
    const decisionReply = page.waitForResponse((response) => response.url().includes(`/orders/${id}/assignments/`) && response.request().method() === "POST");
    await decisionDialog.getByRole("button", { name: "Confirm decision", exact: true }).click();
    const approved = await decisionReply; expect(approved.status(), await approved.text()).toBe(200);
    persisted = await detail("manager2", id); expect(persisted.order.status).toBe("Approved"); expect(persisted.decisions).toHaveLength(1);
    expect(persisted.cases[0].state).toBe("Approved");
    expect(connection.traffic.filter((entry) => entry.actor === "manager2").every((entry) => !entry.path.startsWith(root + "/requests") && !entry.path.startsWith(root + "/approvals"))).toBe(true);

    await connection.visit("buyer", `/purchase-orders/${id}`);
    await action(page, "Authorise sending", `${orders}/${id}/issue`);
    persisted = await detail("buyer", id); expect(persisted.order.status).toBe("IssuePending");
    expect(persisted.issued).toHaveLength(1); expect(persisted.deliveries).toHaveLength(0);
    await connection.visit("manager1", `/purchase-orders/${id}`);
    await expect(page.getByRole("button", { name: "Authorise sending", exact: true })).toHaveCount(0);
    await action(page, "Record sending outcome", `${orders}/${id}/delivery-confirmations`, { reference: "BROWSER-PO-SENT-1", evidence: "BROWSER-VERIFIED-EMAIL-DELIVERY", delivery: true, channel: seed.deliveryChannel });
    persisted = await detail("manager1", id); expect(persisted.order.status).toBe("Issued");
    expect(persisted.deliveries).toHaveLength(1); expect(persisted.deliveries[0]).toMatchObject({ outcome: "Delivered", channel: seed.deliveryChannel, evidenceReference: "BROWSER-VERIFIED-EMAIL-DELIVERY" });
    expect(persisted.issued).toHaveLength(1); expect(persisted.submissions).toHaveLength(1); expect(persisted.decisions).toHaveLength(1); expect(persisted.financeEvidence).toHaveLength(1);
    const remaining = await connection.request("buyer", orders + "/approved-sources?pageSize=100"); expect(remaining.status()).toBe(200);
    expect((await remaining.json()).items.find((row: { lineId: string }) => row.lineId === seed.sourceLineId)).toMatchObject({ availableQuantityExact: "0", eligibility: "FullyAllocated" });
    const writes = connection.traffic.filter((entry) => entry.method === "POST"); expect(writes).toHaveLength(6);
    expect(writes.map((entry) => entry.actor)).toEqual(["buyer", "finance", "buyer", "manager2", "buyer", "manager1"]);
    for (const entry of writes) { expect(entry.status).toBeGreaterThanOrEqual(200); expect(entry.status).toBeLessThan(300); expect(entry.key).toMatch(/^[0-9a-f-]{36}$/i); }
    expect(new Set(writes.map((entry) => entry.key)).size).toBe(6);
    const financeBody = JSON.parse(writes[1].body!); expect(financeBody).toMatchObject({ confirmedGrossAmount: 100, currencyCode: "ZMW", sourceReservationReferences: [seed.sourceReservationReference] });
    const delivery = writes[5];
    const replay = await connection.request("manager1", delivery.path, "POST", delivery.body!, delivery.key); expect(replay.status()).toBe(200); expect(await replay.json()).toEqual(delivery.response);
    const afterReplay = await detail("buyer", id); expect(afterReplay.deliveries).toHaveLength(1); expect(afterReplay.issued).toHaveLength(1); expect(afterReplay.order.status).toBe("Issued");
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    // Materialize evidence before attaching: the list reporter does not persist inline
    // successful attachments. This synthetic fixture contains no credentials.
    const trafficPath = info.outputPath("actual-order-api-traffic.json");
    writeFileSync(trafficPath, JSON.stringify(connection.traffic, null, 2) + "\n", { mode: 0o600 });
    await info.attach("actual-order-api-traffic", { path: trafficPath, contentType: "application/json" });
  }
});
