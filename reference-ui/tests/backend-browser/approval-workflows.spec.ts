import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Actor = "requester" | "buyer" | "finance" | "manager1" | "manager2";
type RequestSeed = { id: string; number: string; purpose: string; submittedVersion: number };
type Manifest = {
  baseUrl: string; tenantId: string; companyId: string; branchId: string; authenticationHeader: string;
  actors: Record<Actor, { principalId: string; context: { roles?: string[]; permissions: string[]; company: { name: string; code: string } } }>;
  requests: RequestSeed[];
};
const root = "/procurement/workspace", api = "/api/procurement/v1";

function loadManifest(): Manifest {
  const path = process.env.PROCUREMENT_APPROVAL_BROWSER_MANIFEST;
  if (!path) throw new Error("Set PROCUREMENT_APPROVAL_BROWSER_MANIFEST to the private --serve manifest; this suite never starts a database or backend.");
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Manifest;
  const url = new URL(manifest.baseUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/"
    || url.username || url.password || url.search || url.hash || manifest.tenantId !== "probe"
    || manifest.authenticationHeader !== "X-Probe-User" || !manifest.companyId || !manifest.branchId)
    throw new Error("Refusing anything except the synthetic loopback approval sandbox manifest.");
  return manifest;
}

async function connect(page: Page, manifest: Manifest) {
  let actor: Actor = "buyer", loseNextDecision = false;
  const traffic: Array<{ actor: Actor; method: string; path: string; status: number; durationMs: number; key?: string; body?: string; response: unknown }> = [];
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })),
    { entityId: manifest.companyId, branch: manifest.branchId });
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), acting = actor;
    if (url.pathname.startsWith("/api/procurement/")) {
      // The only Procurement intervention is transport: real scope + synthetic authentication.
      // No Procurement response, context, capability, error or state is fabricated here.
      expect(request.headers()["x-shell-entity"]).toBe(manifest.companyId);
      expect(request.headers()["x-shell-location"]).toBe(manifest.branchId);
      const started = Date.now();
      const upstream = await route.fetch({ url: `${manifest.baseUrl}${url.pathname}${url.search}`, timeout: 45_000, maxRetries: 0,
        headers: { ...request.headers(), [manifest.authenticationHeader]: manifest.actors[acting].principalId } });
      const text = await upstream.text();
      let response: unknown; try { response = JSON.parse(text); } catch { response = text; }
      traffic.push({ actor: acting, method: request.method(), path: url.pathname, status: upstream.status(), durationMs: Date.now() - started,
        key: request.headers()["idempotency-key"], body: request.postData() ?? undefined, response });
      if (loseNextDecision && request.method() === "POST" && url.pathname.endsWith("/decisions") && upstream.ok()) {
        loseNextDecision = false; await route.abort("failed"); return;
      }
      await route.fulfill({ response: upstream }); return;
    }
    // The probe deliberately has no HRM shell/login/branding service. These synthetic
    // presentation fixtures confer no Procurement permissions: /context is always real.
    const context = manifest.actors[acting].context;
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: {
      isActive: true, displayName: acting, roles: context.roles ?? [acting === "requester" ? "employee" : "procurement_manager"] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: context.company.name });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: manifest.companyId, code: context.company.code, registeredName: context.company.name }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    return json({ message: "This disposable probe does not implement the HRM shell endpoint." }, 404);
  });
  return {
    traffic,
    async visit(next: Actor, path: string) { actor = next; await page.goto(`${root}${path}`); },
    loseNextDecision() { loseNextDecision = true; },
    async get(next: Actor, path: string) {
      const response = await page.request.get(`${manifest.baseUrl}${api}${path}`, { headers: {
        [manifest.authenticationHeader]: manifest.actors[next].principalId,
        "X-Shell-Entity": manifest.companyId, "X-Shell-Location": manifest.branchId,
      } });
      expect(response.status(), await response.text()).toBe(200);
      return response.json();
    },
  };
}

async function open(page: Page, connection: Awaited<ReturnType<typeof connect>>, request: RequestSeed) {
  const before = await connection.get("requester", `/requests/${request.id}/approval-history`);
  expect(before.records, "Use an unopened request; never silently reuse or reset a consumed workflow fixture.").toHaveLength(0);
  await connection.visit("buyer", "/approvals");
  await page.getByRole("button", { name: `Start approvals for ${request.number}`, exact: true }).click();
  await expect(page.getByRole("status")).toContainText(`Approvals started for ${request.number}`);
  const history = await connection.get("requester", `/requests/${request.id}/approval-history`);
  expect(history.records).toHaveLength(1);
  expect(history.records[0].state).toBe("Pending");
  return history.records[0].caseId as string;
}

async function decide(page: Page, action: "Approve" | "Return", reason: string) {
  await page.getByRole("button", { name: action === "Return" ? "Return for changes" : action, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(action === "Approve" ? "Comment (optional)" : "Reason").fill(reason);
  await dialog.getByRole("button", { name: "Confirm decision", exact: true }).click();
}

test("actual API: One then All approvals persist decisions, recover a lost response and approve source lines", async ({ page }, info) => {
  const manifest = loadManifest(), connection = await connect(page, manifest);
  try {
    const request = manifest.requests.find((item) => item.purpose === "Browser full One and All approval")!;
    expect(request).toBeTruthy();
    const caseId = await open(page, connection, request);
    await connection.visit("manager1", "/approvals");
    await page.getByRole("row").filter({ hasText: request.number }).getByRole("link", { name: "Review request" }).click();
    await expect(page.getByRole("heading", { name: request.number, exact: true })).toBeVisible();
    connection.loseNextDecision();
    await decide(page, "Approve", "Need confirmed by line manager");
    await page.getByRole("button", { name: "Retry same decision", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Other approvals are still needed");
    const replay = connection.traffic.filter((row) => row.method === "POST" && row.path.endsWith("/decisions"));
    expect(replay).toHaveLength(2); expect(replay[0].status).toBe(200); expect(replay[1].status).toBe(200);
    expect(replay[1].key).toBe(replay[0].key); expect(replay[1].body).toBe(replay[0].body);
    expect(replay[1].response).toEqual(replay[0].response);
    await decide(page, "Approve", "Procurement review by first panel member");
    await expect(page.getByRole("status")).toContainText("Other approvals are still needed");
    const intermediate = await connection.get("requester", `/requests/${request.id}`);
    expect(intermediate.status).toBe("Submitted");
    await connection.visit("manager2", `/approvals/${caseId}`);
    await decide(page, "Approve", "Procurement review by independent second member");
    await expect(page.getByRole("status")).toContainText("Decision saved. Approved");
    const approved = await connection.get("requester", `/requests/${request.id}`);
    expect(approved.status).toBe("Approved"); expect(approved.approvalState).toBe("Approved");
    expect(approved.approvalInstanceRef).toBe(caseId);
    for (const line of approved.lines.filter((item: { approvalStatus: string }) => item.approvalStatus !== "Cancelled")) {
      expect(line.approvalStatus).toBe("Approved"); expect(line.approvedQuantity).toBe(line.requestedQuantity);
    }
    const history = await connection.get("requester", `/requests/${request.id}/approval-history`);
    expect(history.records[0].state).toBe("Approved"); expect(history.records[0].decisions).toHaveLength(3);
    await connection.visit("requester", `/requests/${request.id}`);
    await expect(page.getByText("Submission " + request.submittedVersion + " · Approved", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Withdraw request", exact: true })).toHaveCount(0);
  } finally { await page.unrouteAll({ behavior: "wait" }); await info.attach("actual-api-traffic", { body: JSON.stringify(connection.traffic, null, 2), contentType: "application/json" }); }
});

test("actual API: Return locks editing until independent manual Finance release, then requester corrects and resubmits", async ({ page }, info) => {
  const manifest = loadManifest(), connection = await connect(page, manifest);
  try {
    const request = manifest.requests.find((item) => item.purpose === "Browser return and independent Finance release")!;
    expect(request).toBeTruthy();
    const caseId = await open(page, connection, request);
    await connection.visit("manager1", `/approvals/${caseId}`);
    await decide(page, "Return", "Please correct the delivery details");
    await expect(page.getByRole("status")).toContainText("Editing will open after Finance confirms");
    await connection.visit("requester", `/requests/${request.id}`);
    await expect(page.getByText("Waiting for Finance to release the reserved funds.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit request", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Withdraw request", exact: true })).toHaveCount(0);
    const pending = await connection.get("requester", `/requests/${request.id}`);
    expect(pending.status).toBe("ReturnPendingFinanceRelease");
    await connection.visit("finance", "/budgets");
    await page.getByRole("row").filter({ hasText: request.number }).getByRole("button", { name: "Record release evidence" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Release evidence reference", { exact: true }).fill("SYNTHETIC-BROWSER-MANUAL-RELEASE");
    await dialog.getByLabel("Reason", { exact: true }).fill("Independent Finance verified full release under the synthetic approved manual policy");
    // Use the actual current local timestamp, never a fabricated future confirmation.
    const now = new Date();
    await dialog.getByLabel("Finance confirmation date and time").fill(new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 23));
    await dialog.getByRole("button", { name: "Confirm release evidence", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("The requester can now make changes");
    await connection.visit("requester", `/requests/${request.id}`);
    await expect(page.getByText("Finance release confirmed", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit request", exact: true }).click();
    await page.getByLabel("Delivery address", { exact: true }).fill("Corrected synthetic branch receiving desk");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("button", { name: "Send for review", exact: true }).click();
    await expect(page.getByText("Sent for policy and budget review.", { exact: false })).toBeVisible();
    const resubmitted = await connection.get("requester", `/requests/${request.id}`);
    expect(resubmitted.status).toBe("Submitted"); expect(resubmitted.submittedVersion).toBeGreaterThan(request.submittedVersion);
    expect(resubmitted.approvalInstanceRef).toBeNull();
    const history = await connection.get("requester", `/requests/${request.id}/approval-history`);
    expect(history.records).toHaveLength(1); expect(history.records[0].state).toBe("Returned");
    expect(history.records[0].financeRelease.state).toBe("Confirmed");
    expect(history.records[0].decisions).toHaveLength(1);
  } finally { await page.unrouteAll({ behavior: "wait" }); await info.attach("actual-api-traffic", { body: JSON.stringify(connection.traffic, null, 2), contentType: "application/json" }); }
});
