import { readFileSync, statSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { parseBudgetJson } from "../../../src/platform/procurement-budget-exact";

type Context = { permissions: string[]; roles?: string[]; company: { name: string; code: string } };
type Manifest = { baseUrl: string; tenantId: string; companyId: string; branchId: string; currencyCode: string; authenticationHeader: string;
  actors: { finance: { principalId: string; context: Context } };
  budget: { requestId: string; lineId: string; number: string; purpose: string; currentVersion: number; businessVersion: number; quantity: string;
    unitPrice: string; exactSourceAmount: string; reviewedCheckedAmount: string; currencyCode: string; financePrincipalId: string;
    financeCheckReference: string; evidenceReference: string; reservationReference: string; noFinanceCheckOrApprovalSeeded: boolean; authorityMeaning: string } };
type Traffic = { method: string; path: string; status: number; body: string | null; rawResponse: string };
const root = "/api/procurement/v1", workspace = "/procurement/workspace", guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function fixture(): Manifest {
  const file = process.env.PROCUREMENT_APPROVAL_BROWSER_MANIFEST;
  if (!file) throw new Error("Set PROCUREMENT_APPROVAL_BROWSER_MANIFEST to the private --serve --orders Budget fixture; this test starts no backend/database.");
  if (process.platform !== "win32" && (statSync(file).mode & 0o077)) throw new Error("Synthetic manifest must be owner-private.");
  const value = JSON.parse(readFileSync(file, "utf8")) as Manifest, url = new URL(value.baseUrl), seed = value.budget;
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" || url.username || url.password || url.search || url.hash
    || value.tenantId !== "probe" || value.authenticationHeader !== "X-Probe-User" || value.currencyCode !== "ZMW" || !seed
    || ![value.companyId, value.branchId, seed.requestId, seed.lineId, seed.financePrincipalId].every(x => guid.test(x))
    || seed.financePrincipalId !== value.actors.finance?.principalId || !seed.noFinanceCheckOrApprovalSeeded
    || seed.authorityMeaning !== "SyntheticManualFinanceEvidenceOnly" || seed.quantity !== "1.0001" || seed.unitPrice !== "0.0001"
    || seed.exactSourceAmount !== "0.00010001" || seed.reviewedCheckedAmount !== "0.0002" || seed.currencyCode !== "ZMW"
    || !Number.isSafeInteger(seed.currentVersion) || seed.currentVersion < 1 || !Number.isSafeInteger(seed.businessVersion)
    || seed.businessVersion < 1 || seed.businessVersion > seed.currentVersion)
    throw new Error("Refusing non-synthetic or incomplete exact Budget fixture.");
  expect(value.actors.finance.context.permissions).toContain("procurement-budget-check");
  return value;
}
async function connect(page: Page, seed: Manifest) {
  const traffic: Traffic[] = [];
  await page.addInitScript(({ entityId, branch }) => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId, branch })),
    { entityId: seed.companyId, branch: seed.branchId });
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith("/api/procurement/")) {
      expect(request.headers()["x-shell-entity"]).toBe(seed.companyId); expect(request.headers()["x-shell-location"]).toBe(seed.branchId);
      // No Procurement response/capability/role/business fact is mocked or reserialized.
      const upstream = await route.fetch({ url: `${seed.baseUrl}${url.pathname}${url.search}`, timeout: 45_000, maxRetries: 0,
        headers: { ...request.headers(), [seed.authenticationHeader]: seed.actors.finance.principalId,
          "X-Shell-Entity": seed.companyId, "X-Shell-Location": seed.branchId } });
      traffic.push({ method: request.method(), path: url.pathname, status: upstream.status(), body: request.postData(), rawResponse: await upstream.text() });
      return route.fulfill({ response: upstream });
    }
    // Only shell auth/branding/organisation presentation is synthetic; actual API authorizes Finance.
    const context = seed.actors.finance.context;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/api/hrm/auth/me") return json({ authenticated: true, user: { isActive: true, displayName: "Finance reviewer", roles: context.roles ?? ["finance_approver"] } });
    if (url.pathname === "/api/hrm/branding") return json({ displayName: context.company.name });
    if (url.pathname === "/api/hrm/admin/legal-entities") return json({ items: [{ id: seed.companyId, code: context.company.code, registeredName: context.company.name }] });
    if (url.pathname === "/api/hrm/admin/locations") return json({ items: [] });
    if (url.pathname === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    return json({ message: "Synthetic shell endpoint is not implemented." }, 404);
  });
  return traffic;
}

test("actual Budget API records explicit4dp reviewed funding against exact8dp unapproved demand", async ({ page }, info) => {
  const manifest = fixture(), seed = manifest.budget, traffic = await connect(page, manifest), path = `${root}/requests/${seed.requestId}/budget-checks`;
  try {
    const queueReply = page.waitForResponse(response => new URL(response.url()).pathname === `${root}/requests/budget-queue` && response.request().method() === "GET");
    await page.goto(workspace + "/budgets");
    const queueResponse = await queueReply; expect(queueResponse.status()).toBe(200);
    const queueRaw = await queueResponse.text();
    expect(queueRaw).toMatch(/"estimatedAmount"\s*:\s*0\.00010001(?:[,}])/);
    const queue = parseBudgetJson(queueRaw) as { records: { id: string; estimatedAmount: string; version: number; businessVersion: number }[] };
    expect(queue.records.find(row => row.id === seed.requestId)).toMatchObject({ estimatedAmount: seed.exactSourceAmount,
      version: seed.currentVersion, businessVersion: seed.businessVersion });
    await page.getByRole("row").filter({ has: page.getByRole("cell", { name: seed.number, exact: true }) }).getByRole("button", { name: "Review funding", exact: true }).click();
    const amount = page.getByRole("textbox", { name: /Amount checked/ });
    await expect(amount).toHaveValue(""); await expect(page.getByText("This request has more precision", { exact: false })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Funding outcome", exact: true })).toContainText("Choose funding outcome");
    await page.getByRole("textbox", { name: "Finance check reference", exact: true }).fill(seed.financeCheckReference);
    await page.getByRole("textbox", { name: /Evidence reference/ }).fill(seed.evidenceReference);
    await page.getByRole("combobox", { name: "Funding outcome", exact: true }).click();
    await page.getByRole("option", { name: "Full amount available", exact: true }).click();
    await page.getByRole("textbox", { name: "Confirmed Finance reservation reference", exact: true }).fill(seed.reservationReference);
    await amount.fill("0.0001"); await page.getByRole("button", { name: "Save Finance check", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("full exact request amount");
    expect(traffic.filter(row => row.method !== "GET")).toHaveLength(0);
    await amount.fill(seed.reviewedCheckedAmount);
    const savedReply = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save Finance check", exact: true }).click();
    const saved = await savedReply; expect(saved.status(), await saved.text()).toBe(201);
    const captured = parseBudgetJson(await saved.text()) as { checkedAmount: string; requestVersion: number; checkedBySubjectId: string; checkerIdentitySchemaVersion: number; checkedByWorkerId: string };
    expect(captured).toMatchObject({ checkedAmount: seed.reviewedCheckedAmount, requestVersion: seed.businessVersion,
      checkedBySubjectId: seed.financePrincipalId, checkerIdentitySchemaVersion: 1 });
    expect(guid.test(captured.checkedByWorkerId)).toBe(true);
    await expect(page.getByText(`Finance check saved for ${seed.number}. This does not approve the purchase.`, { exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: seed.financeCheckReference, exact: true })).toBeVisible();
    const writes = traffic.filter(row => row.method !== "GET"); expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: "POST", path, status: 201 });
    const input = JSON.parse(writes[0].body!) as Record<string, unknown>;
    expect(input).toMatchObject({ requestVersion: seed.currentVersion, checkedAmount: seed.reviewedCheckedAmount, currencyCode: "ZMW",
      financeCheckRef: seed.financeCheckReference, evidenceRef: seed.evidenceReference, reservationRef: seed.reservationReference, reservationStatus: "Confirmed" });
    expect(input).not.toHaveProperty("businessVersion"); expect(input).not.toHaveProperty("checkedByWorkerId");
    const reads = traffic.filter(row => row.method === "GET" && row.path === path); expect(reads.length).toBeGreaterThanOrEqual(2);
    const history = parseBudgetJson(reads[reads.length - 1].rawResponse) as { records: Record<string, unknown>[] };
    expect(history.records).toHaveLength(1); expect(history.records[0]).toMatchObject({ checkedAmount: seed.reviewedCheckedAmount,
      requestVersion: seed.businessVersion, financeCheckRef: seed.financeCheckReference, checkerIdentitySchemaVersion: 1 });
    await expect(page.getByRole("main").getByRole("button", { name: /approve|pay|release funds/i })).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    const file = info.outputPath("actual-budget-api-traffic.json"); writeFileSync(file, JSON.stringify(traffic, null, 2) + "\n", { mode: 0o600 });
    await info.attach("actual-budget-api-traffic", { path: file, contentType: "application/json" });
  }
});
