import { expect, test, type Page } from "@playwright/test";

const company = "11111111-1111-4111-8111-111111111111";
const branch = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const principal = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const firstBatch = "33333333-3333-4333-8333-333333333333";
const finalBatch = "55555555-5555-4555-8555-555555555555";
const digest = "a".repeat(64), nextDigest = "b".repeat(64);
const expiry = "2099-01-01T00:00:00Z";
const capabilityKeys = ["vendorDraft", "itemDraft", "requestDraft", "approvals", "sourcing", "contracts", "orders",
  "receiving", "invoiceIntake", "invoiceValidation", "financeHandoff", "supplierPortal", "planningDraft",
  "configurationDraft", "contractDraft", "sourcingDraft"];
type Kind = "vendors" | "items";
async function setup(page: Page, kind: Kind, options: { grant?: boolean; available?: boolean; lostCommit?: boolean;
  holdPreview?: (resume: () => void) => void } = {}) {
  const previewBodies: Array<Record<string, unknown>> = [];
  const commitBodies: Array<Record<string, unknown>> = [];
  await page.addInitScript(id => localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id })), company);
  await page.route("**/api/**", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/hrm/auth/me") return json({ authenticated: true, user: { id: principal, isActive: true, displayName: "Buyer", roles: ["procurement_buyer"] } });
    if (path === "/api/hrm/branding") return json({ displayName: "Amizo Power" });
    if (path === "/api/core/v1/workspace-context") return json({ schemaVersion: 1, tenantId: "amizo", principalId: principal,
      organisationWide: false, companies: [{ id: company, code: "AMIZO", registeredName: "Amizo Power", currency: "ZMW", isDefault: true }],
      branches: [{ id: branch, code: "HQ", name: "Lusaka", legalEntityId: company, type: "Headquarters" }] });
    if (path === "/api/hrm/admin/legal-entities") return json({ items: [{ id: company, code: "AMIZO", registeredName: "Amizo Power" }] });
    if (path === "/api/hrm/admin/locations") return json({ items: [{ id: branch, name: "Lusaka", legalEntityId: company }] });
    if (path === "/api/hrm/shell/") return json({ assignedLocationIds: [], confined: false });
    if (path === "/api/procurement/v1/context") return json({ principalId: principal, workerId: null, tenantId: "amizo", legalEntityId: company,
      permissions: kind === "vendors" ? ["procurement-access", "procurement-vendor-read", "procurement-vendor-create",
        ...(options.grant ? ["procurement-vendor-import"] : [])] : ["procurement-access", "procurement-item-manage",
        ...(options.grant ? ["procurement-item-import"] : [])],
      company: { id: company, code: "AMIZO", name: "Amizo Power", currencyCode: "ZMW" },
      branch: req.headers()["x-shell-branch-scope"] === "all" ? null : { id: branch } });
    if (path === "/api/procurement/v1/meta") return json({ tenantId: "amizo", legalEntityId: company, schemaReady: true,
      capabilities: Object.fromEntries(capabilityKeys.map(key => [key, ["vendorDraft", "itemDraft"].includes(key)])) });
    if (path === `/api/procurement/v1/${kind}`) return json({ items: [], total: 0, page: 1, pageSize: 25 });
    if (path === `/api/procurement/v1/${kind}/import/schema`) return options.available === false
      ? json({ code: "import-unavailable" }, 503)
      : json({ schemaVersion: 1, kind, fields: kind === "vendors"
        ? [{ key: "legalName", label: "Legal name", required: true }, { key: "displayName", label: "Display name", required: true },
          { key: "countryCode", label: "Country code", required: true }]
        : [{ key: "code", label: "Code", required: true }, { key: "name", label: "Name", required: true },
          { key: "kind", label: "Kind", required: true }, { key: "categoryCode", label: "Category code", required: true },
          { key: "unitCode", label: "Unit code", required: true }] });
    if (path === `/api/procurement/v1/${kind}/import/template`) return route.fulfill({ status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-template.csv"` }, body: "Code,Name\r\n" });
    if (path === `/api/procurement/v1/${kind}/import/preview`) {
      const body = req.postDataJSON() as Record<string, unknown>; previewBodies.push(body);
      if (options.holdPreview) await new Promise<void>(resolve => options.holdPreview?.(resolve));
      const acknowledged = (body.acknowledgedSimilarityRows as number[]).includes(2);
      return json({ batchId: acknowledged ? finalBatch : firstBatch, previewSha256: acknowledged ? nextDigest : digest, expiresAt: expiry,
        rows: [{ rowNumber: 2, startLine: 2, endLine: 2, disposition: acknowledged || kind === "items" ? "create" : "error",
          ...(!acknowledged && kind === "vendors" ? { code: "similar-vendor", message: "Review similar vendor." } : {}) }],
        willCreate: acknowledged || kind === "items" ? 1 : 0, willSkip: 0, willError: acknowledged || kind === "items" ? 0 : 1 });
    }
    if (path === `/api/procurement/v1/${kind}/import/commit`) {
      const body = req.postDataJSON() as Record<string, unknown>; commitBodies.push(body);
      if (options.lostCommit) return route.abort("failed");
      return json({ batchId: body.batchId, created: 1, skipped: 0,
        rows: [{ rowNumber: 2, disposition: "create", recordId: "66666666-6666-4666-8666-666666666666" }] });
    }
    if (path === `/api/procurement/v1/${kind}/import/${finalBatch}`) return json({ state: "Committed", batchId: finalBatch,
      result: { batchId: finalBatch, created: 1, skipped: 0,
        rows: [{ rowNumber: 2, disposition: "create", recordId: "66666666-6666-4666-8666-666666666666" }] } });
    if (path === `/api/procurement/v1/${kind}/import/${firstBatch}`) return kind === "items"
      ? json({ state: "Committed", batchId: firstBatch, result: { batchId: firstBatch, created: 1, skipped: 0,
        rows: [{ rowNumber: 2, disposition: "create", recordId: "66666666-6666-4666-8666-666666666666" }] } })
      : json({ state: "Previewed", batchId: firstBatch,
        previewSha256: digest, expiresAt: expiry, rows: [], willCreate: 0, willSkip: 0, willError: 0 });
    return json({ code: "unexpected-mock-route" }, 404);
  });
  return { previewBodies, commitBodies };
}
async function open(page: Page, kind: Kind) {
  await page.getByRole("button", { name: "More Actions" }).click();
  await page.getByRole("menuitem", { name: "Import", exact: true }).click();
  await page.getByRole("menuitem", { name: `Import ${kind === "vendors" ? "Vendors" : "Items"}` }).click();
}
test("mocked ERP Vendor import keeps the list and confirms only the acknowledged server preview", async ({ page }) => {
  const calls = await setup(page, "vendors", { grant: true });
  await page.goto("/procurement/workspace/vendors");
  await expect(page.getByRole("link", { name: "Add vendor" })).toBeVisible();
  await open(page, "vendors");
  const template = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the ERP sample CSV file" }).click();
  expect((await template).suggestedFilename()).toBe("vendors-template.csv");
  await page.getByLabel("Choose import file").setInputFiles({ name: "vendors.csv", mimeType: "text/csv",
    buffer: Buffer.from("Legal name,Display name,Country code\nAcme,Acme,ZM\n") });
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /Preview on ERP/ }).click();
  await expect(page.getByText("1 need attention")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm import" })).toBeDisabled();
  await page.getByRole("switch", { name: /reviewed CSV row 2/ }).click();
  await page.getByRole("button", { name: "Preview acknowledged rows" }).click();
  await expect(page.getByText("1 to create")).toBeVisible();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByText("ERP saved this import.")).toBeVisible();
  expect(calls.previewBodies).toHaveLength(2);
  expect(calls.previewBodies[1].acknowledgedSimilarityRows).toEqual([2]);
  expect(calls.commitBodies).toEqual([{ batchId: finalBatch, previewSha256: nextDigest, commandKey: expect.any(String) }]);
  expect(JSON.stringify(calls.commitBodies)).not.toContain("csvBase64");
});

test("mocked denied action or unavailable schema leaves Import unavailable", async ({ page }) => {
  await setup(page, "vendors", { grant: false }); await page.goto("/procurement/workspace/vendors");
  await page.getByRole("button", { name: "More Actions" }).click();
  await expect(page.getByText("Import unavailable")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Import", exact: true })).toHaveCount(0);
});

test("mocked controlled 503 keeps the original toolbar and starts no browser-local import", async ({ page }) => {
  const calls = await setup(page, "items", { grant: true, available: false });
  await page.goto("/procurement/workspace/items");
  await expect(page.getByRole("link", { name: "Add item" })).toBeVisible();
  await page.getByRole("button", { name: "More Actions" }).click();
  await expect(page.getByText("Import unavailable")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Import", exact: true })).toHaveCount(0);
  expect(calls.commitBodies).toHaveLength(0);
});

test("mocked lost Item commit survives hard reload and recovers with GET, without a second POST", async ({ page }) => {
  const calls = await setup(page, "items", { grant: true, lostCommit: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/procurement/workspace/items");
  await open(page, "items");
  await page.getByLabel("Choose import file").setInputFiles({ name: "items.csv", mimeType: "text/csv",
    buffer: Buffer.from("Code,Name,Kind,Category code,Unit code\nIT-1,Widget,Goods,IT,each\n") });
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /Preview on ERP/ }).click();
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(page.getByText("Check whether this import was saved before another change.")).toBeVisible();
  await page.evaluate(id => { localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: id, branchScope: "all" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "erp.shell.state.v1" })); }, company);
  await page.reload();
  await open(page, "items");
  await page.getByRole("button", { name: "Check saved import" }).click();
  await expect(page.getByText("ERP saved this import.")).toBeVisible();
  expect(calls.commitBodies).toHaveLength(1);
});

test("mocked company change aborts a late preview and cannot reach commit", async ({ page }) => {
  let resume: (() => void) | undefined;
  const calls = await setup(page, "items", { grant: true, holdPreview: next => { resume = next; } });
  await page.goto("/procurement/workspace/items"); await open(page, "items");
  await page.getByLabel("Choose import file").setInputFiles({ name: "items.csv", mimeType: "text/csv",
    buffer: Buffer.from("Code,Name,Kind,Category code,Unit code\nIT-1,Widget,Goods,IT,each\n") });
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /Preview on ERP/ }).click();
  await expect.poll(() => calls.previewBodies.length).toBe(1);
  await page.evaluate(() => { localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: "77777777-7777-4777-8777-777777777777" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "erp.shell.state.v1" })); });
  resume?.();
  await expect(page.getByRole("button", { name: "Confirm import" })).toHaveCount(0);
  expect(calls.commitBodies).toHaveLength(0);
});

test("mocked scope change rejects a late local file read before mapping", async ({ page }) => {
  const calls = await setup(page, "items", { grant: true });
  await page.goto("/procurement/workspace/items"); await open(page, "items");
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function (this: File) {
      const chosen = this;
      return new Promise<ArrayBuffer>(resolve => {
        (window as Window & { releaseImportFile?: () => Promise<void> }).releaseImportFile = async () => resolve(await original.call(chosen));
      });
    };
  });
  await page.getByLabel("Choose import file").setInputFiles({ name: "items.csv", mimeType: "text/csv",
    buffer: Buffer.from("Code,Name,Kind,Category code,Unit code\nIT-1,Widget,Goods,IT,each\n") });
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { releaseImportFile?: () => Promise<void> }).releaseImportFile))).toBe(true);
  await page.evaluate(() => { localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: "77777777-7777-4777-8777-777777777777" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "erp.shell.state.v1" })); });
  await page.evaluate(async () => { await (window as Window & { releaseImportFile?: () => Promise<void> }).releaseImportFile?.(); });
  await expect(page.getByRole("button", { name: /Preview on ERP/ })).toHaveCount(0);
  expect(calls.previewBodies).toHaveLength(0); expect(calls.commitBodies).toHaveLength(0);
});
