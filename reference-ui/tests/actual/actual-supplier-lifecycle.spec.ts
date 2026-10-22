import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { actualCrudEnabled, actualFixture, actualId, actualMutation, actualShell } from "./actual-crud-helpers";

test.skip(!actualCrudEnabled, "Opt-in private actual API fixture/socket required; never production");
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function lifecycleFixture() {
  const f = actualFixture(), reviewer = f.actors?.systemReviewer;
  if (f.browserActorSwitch !== "manifest-alias-v1" || f.workerId !== null || !reviewer
    || !guid.test(reviewer.principalId) || reviewer.workerId !== null
    || reviewer.principalId.toLowerCase() === f.actorId.toLowerCase())
    throw new Error("Genuine distinct Core system maker/reviewer proof manifest required");
  return { ...f, reviewer };
}
function owner(id: string): { supplier: Record<string, unknown>; decisions: Array<Record<string, unknown>> } {
  const f = lifecycleFixture(); if (!guid.test(id)) throw new Error("Actual supplier UUID required");
  // Fixed tables, validated synthetic database/UUID, SELECT only. No fixture or production writes.
  const sql = `SELECT jsonb_build_object('supplier',to_jsonb(s),'decisions',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at,d.id) FROM procurement.supplier_decisions d WHERE d.supplier_id=s.id AND d.tenant_id=s.tenant_id AND d.legal_entity_id=s.legal_entity_id),'[]'::jsonb))::text FROM procurement.suppliers s WHERE s.id='${id}'::uuid;`;
  const raw = execFileSync("docker", ["exec", "procurement-approval-rehearsal-postgres", "psql", "-U", "postgres", "-d", f.database,
    "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024 }).trim();
  if (!raw || raw.includes("\n")) throw new Error("Exactly one retained synthetic supplier required");
  const row = JSON.parse(raw); expect(row.supplier).toMatchObject({ tenant_id: f.tenantId, legal_entity_id: f.companyId, created_by: f.actorId });
  return row;
}
async function contextIs(page: Page, principalId: string) {
  const f = lifecycleFixture(); const response = await page.request.get("/api/procurement/v1/context", {
    headers: { "X-Shell-Entity": f.companyId, "X-Shell-Location": f.branchId },
  });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ principalId, workerId: null, legalEntityId: f.companyId });
}

// No route interception or Procurement response mocks: all transitions use existing UI and real handlers.
test("actual system-only maker and independent reviewer retain the supplier lifecycle", async ({ page, browser }, testInfo) => {
  test.setTimeout(240000);
  const f = lifecycleFixture(), name = `SUPPLIER-LIFECYCLE-${Date.now()}`;
  await actualShell(page); await contextIs(page, f.actorId);
  // Separate browser storage/session and actual Core principal; never mutate the application's login state.
  const reviewerContext = await browser.newContext({ baseURL: "http://127.0.0.1:3027",
    extraHTTPHeaders: { "X-Crud-Browser-Actor": "systemReviewer" } });
  await reviewerContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const reviewer = await reviewerContext.newPage(); await actualShell(reviewer);
  try {
    await contextIs(reviewer, f.reviewer.principalId);
    await page.goto("/procurement/workspace/vendors/new");
    await page.getByLabel("Company name", { exact: true }).fill(`${name} Ltd`);
    await page.getByLabel("Display name", { exact: true }).fill(name);
    await page.getByLabel("First name", { exact: true }).fill("Synthetic");
    await page.getByLabel("Last name", { exact: true }).fill("Contact");
    await page.getByLabel("Vendor category", { exact: true }).fill("SYNTHETIC");
    const created = await actualMutation(page, "POST", "/vendors", () => page.getByRole("button", { name: "Save draft", exact: true }).click());
    const id = actualId(created), path = `/api/procurement/v1/vendors/${id}`;
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByLabel("Why do you need this vendor?", { exact: true }).fill("Actual browser business need");
    const submitted = await actualMutation(page, "POST", `/vendors/${id}/submit`, () => page.getByRole("button", { name: "Submit for review", exact: true }).click());
    expect(submitted).toMatchObject({ status: "Submitted", isOrderable: false });
    await page.reload(); await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve vendor", exact: true })).toHaveCount(0);
    const beforeDenied = owner(id);
    const denied = await page.request.post(path + "/approve", { headers: { "X-Shell-Entity": f.companyId, "X-Shell-Location": f.branchId },
      data: { version: submitted.version, reason: "Self approval must be denied", duplicatesReviewed: true } });
    expect(denied.status()).toBe(403); expect(owner(id)).toEqual(beforeDenied);

    await reviewer.goto(`/procurement/workspace/vendors/${id}`);
    await reviewer.getByLabel("Reason for your decision", { exact: true }).fill("Clarify the supplier display name");
    const returned = await actualMutation(reviewer, "POST", `/vendors/${id}/return`, () => reviewer.getByRole("button", { name: "Send back for changes", exact: true }).click());
    expect(returned).toMatchObject({ status: "More Information Required", isOrderable: false });
    await page.reload(); await page.getByRole("link", { name: "Edit vendor", exact: true }).click();
    await page.getByLabel("Display name", { exact: true }).fill(`${name} Revised`);
    await actualMutation(page, "PUT", `/vendors/${id}`, () => page.getByRole("button", { name: "Save vendor details", exact: true }).click());
    await expect(page.getByRole("status").filter({ hasText: "Vendor details saved" })).toBeVisible();
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await page.getByLabel("Why do you need this vendor?", { exact: true }).fill("Actual browser requested clarification completed");
    const resubmitted = await actualMutation(page, "POST", `/vendors/${id}/submit`, () => page.getByRole("button", { name: "Resubmit for review", exact: true }).click());
    expect(resubmitted).toMatchObject({ status: "Submitted", isOrderable: false });
    await reviewer.reload();
    await reviewer.getByLabel("Reason for your decision", { exact: true }).fill("Actual independent supplier details verified");
    await reviewer.getByLabel("I checked for duplicate vendors", { exact: true }).check();
    const approved = await actualMutation(reviewer, "POST", `/vendors/${id}/approve`, () => reviewer.getByRole("button", { name: "Approve vendor", exact: true }).click());
    expect(approved).toMatchObject({ status: "Active", isOrderable: true });
    expect(owner(id).supplier).toMatchObject({ display_name: `${name} Revised`, status: "Active", is_orderable: true });
    await reviewer.getByLabel("Why is this vendor on hold?", { exact: true }).fill("Actual independent supplier hold review");
    await reviewer.getByLabel("I checked existing orders and will follow up on any open commitments", { exact: true }).check();
    const held = await actualMutation(reviewer, "POST", `/vendors/${id}/suspend`, () => reviewer.getByRole("button", { name: "Place on hold", exact: true }).click());
    expect(held).toMatchObject({ status: "Suspended", isOrderable: false });
    await reviewer.reload(); await expect(reviewer.getByRole("heading", { name: `${name} Revised`, exact: true })).toBeVisible();
    const retained = owner(id);
    expect(retained.supplier).toMatchObject({ status: "Suspended", is_orderable: false, status_decided_by: f.reviewer.principalId });
    expect(retained.decisions.map(row => [row.from_status, row.to_status, row.actor_subject_id])).toEqual([
      ["Draft", "Submitted", f.actorId], ["Submitted", "More Information Required", f.reviewer.principalId],
      ["More Information Required", "Submitted", f.actorId], ["Submitted", "Active", f.reviewer.principalId],
      ["Active", "Suspended", f.reviewer.principalId],
    ]);
    expect(retained.decisions.map(row => row.reason)).toEqual([
      "Actual browser business need", "Clarify the supplier display name", "Actual browser requested clarification completed",
      "Actual independent supplier details verified", "Actual independent supplier hold review",
    ]);
    for (const row of retained.decisions) expect(row).toMatchObject({ tenant_id: f.tenantId, legal_entity_id: f.companyId, supplier_id: id });
  } finally {
    const trace = testInfo.outputPath("system-reviewer-trace.zip");
    await reviewerContext.tracing.stop({ path: trace }); await testInfo.attach("system-reviewer-trace", { path: trace, contentType: "application/zip" });
    await reviewerContext.close();
  }
});
