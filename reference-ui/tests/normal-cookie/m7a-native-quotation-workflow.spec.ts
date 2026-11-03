import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { digest, nativeReadInput } from "./m7a-native-read-input";
const input = nativeReadInput("M7A_NATIVE_WORKFLOW_RESULT"), fixture = input.fixture;
const need = (value: unknown, code: string) => { if (!value) throw new Error(code); };
const retained = (snapshot: any) => JSON.stringify({ offer: snapshot.header.offer, receivedAt: snapshot.header.receivedAt, lines: snapshot.lines, documentPins: snapshot.documentPins, totals: snapshot.totals });
const headers = { "X-Shell-Entity": fixture.companyId, "X-Shell-Location": fixture.branchId };
const sourcePath = `/api/procurement/v1/sourcing/${fixture.eventId}`;
async function get(context: BrowserContext, path: string) { const response = await context.request.get(path, { headers }); need(response.status() === 200, "Native owning read failed"); return response.json(); }
async function choose(page: Page, label: string, option: string) { await page.getByRole("combobox", { name: label, exact: true }).click(); await page.getByRole("option", { name: option, exact: true }).click(); }

// PREPARED, NOT EXECUTED. Requires Root's NEW untouched dedicated UI clone.
// Four actual UI commands only: B contact/create; C revise/cancel. Every response
// remains the real owning API response. No fetch mocks, aliases or fabricated pins.
test("normal-cookie B captures full offer and C revises/cancels through the original UI", async ({ browser }) => {
  need(test.info().project.use.trace === "off" && test.info().project.use.screenshot === "off" && test.info().project.use.video === "off", "Credential capture must remain disabled");
  const evidence: any = { schemaVersion: 1, status: "RUNNING_NOT_ACCEPTANCE", uiSourceCommit: input.uiSourceCommit, fixtureSha256: input.fixtureSha256, runtimeSha256: input.runtimeSha256, proxySha256: input.proxySha256,
    authentication: "NORMAL_LOCAL_PASSWORD_AND_SESSION_COOKIE", businessResponsesMocked: false, identityHeadersInjected: false, productionTouched: false, authenticationCommands: [], startedCommands: [], commands: [], unexpectedBusinessWrites: 0, snapshotHashes: {}, nativeOwnerReconciliationRequired: true, nativeMutationAcceptanceClaimed: false };
  let failed = false;
  let active: BrowserContext | null = null;
  let activeIndex: number | null = null;
  const writeBudget = new Map<string, number>();
  const marker = `M7A-UI-${randomUUID()}`;
  async function login(actorIndex: number) {
    evidence.step = `actor-${actorIndex}-normal-login`;
    const context = await browser.newContext({ baseURL: input.origin, ignoreHTTPSErrors: true, timezoneId: "UTC" }); active = context; activeIndex = actorIndex;
    const user = fixture.users[actorIndex];
    const response = await context.request.post("/api/hrm/auth/login", { data: { email: user.email, password: user.password }, failOnStatusCode: false }); evidence.authenticationCommands.push({ actorIndex, action: "Login", status: response.status() }); need(response.status() === 200, "Native normal login failed");
    const scope = await get(context, "/api/procurement/v1/context"); need(scope.principalId === user.id && scope.workerId === null && scope.legalEntityId === fixture.companyId && scope.permissions.includes("procurement-quotation-read"), "Workerless native quotation principal not confirmed");
    await context.addInitScript(({ companyId, branchId }) => { if (localStorage.getItem("erp.shell.state.v1") === null) localStorage.setItem("erp.shell.state.v1", JSON.stringify({ entityId: companyId, branch: branchId })); }, { companyId: fixture.companyId, branchId: fixture.branchId });
    await context.route("**/api/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      need(!Object.keys(request.headers()).some(key => key.startsWith("x-private-") || key.startsWith("x-test-") || key === "x-crud-actor" || key === "x-crud-browser-actor"), "Identity aliases forbidden");
      if (!["GET", "HEAD"].includes(request.method())) {
        const budget = writeBudget.get(path) ?? 0;
        if (request.method() !== "POST" || budget !== 1) { evidence.unexpectedBusinessWrites++; await route.abort("blockedbyclient"); return; }
        writeBudget.set(path, 0); evidence.startedCommands.push({ actorIndex, path, originalKey: request.headers()["idempotency-key"] });
      }
      await route.continue();
    });
    const page = await context.newPage(); page.on("pageerror", () => { evidence.pageErrors = (evidence.pageErrors ?? 0) + 1; });
    return { context, page };
  }
  async function logout() {
    if (!active) return;
    const context = active; active = null;
    try { const response = await context.request.post("/api/hrm/auth/logout", { failOnStatusCode: false }); evidence.authenticationCommands.push({ actorIndex: activeIndex, action: "Logout", status: response.status() }); need([200, 204].includes(response.status()), "Native logout failed"); } finally { await context.close(); activeIndex = null; }
  }
  async function command(page: Page, path: string, action: string, actorIndex: number, click: () => Promise<unknown>, expectedStatus: number) {
    evidence.step = `actor-${actorIndex}-${action}`; writeBudget.set(path, 1);
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === "POST");
    await click(); const response = await responsePromise;
    const originalKey = response.request().headers()["idempotency-key"], body = await response.json();
    evidence.commands.push({ actorIndex, action, status: response.status(), originalKey, responseSha256: digest(await response.body()) });
    need(response.status() === expectedStatus && body.commandKey === originalKey && body.eventId === fixture.eventId, "Native UI command was not confirmed by its owning response");
    return body;
  }
  try {
    let { context, page } = await login(0);
    const fresh = await get(context, `${sourcePath}/quotation-drafts`);
    need(fresh.items?.length === 0 && fresh.source.lines?.length === 1 && /^2(?:\.0{1,4})?$/.test(fresh.source.lines[0].quantity) && fresh.invitations?.length === 1 && fresh.invitations[0].allowedActions?.includes("RecordOutsideContact"), "Fresh native UI source/invitation required; do not reuse retained drafts");
    const invitation = fresh.invitations[0], contactPath = `${sourcePath}/invitations/${invitation.id}/manual-contact`, createPath = `${sourcePath}/invitations/${invitation.id}/quotation-drafts`;
    await page.goto(`/procurement/workspace/rfqs/${fixture.eventId}?source=quotations`);
    await page.getByRole("button", { name: "Record outside contact", exact: true }).first().click();
    let dialog = page.getByRole("dialog"); await dialog.getByLabel("Contact reference").fill(`${marker}-outside-contact`); await dialog.getByLabel("Reported contact time (local)").fill(new Date().toISOString().slice(0, 16));
    const contact = await command(page, contactPath, "Contact", 0, () => dialog.getByRole("button", { name: "Record outside contact", exact: true }).click(), 201);
    need(contact.emailSentBySystem === false && contact.status === "ManualContactRecorded", "Outside contact must not claim ERP email delivery"); await expect(dialog).toHaveCount(0);
    await page.getByRole("tab", { name: "Related", exact: true }).click(); await expect(page.getByText("Contact recorded", { exact: true }).last()).toBeVisible();
    await page.getByRole("button", { name: "Create supplier draft", exact: true }).click(); dialog = page.getByRole("dialog");
    await dialog.getByLabel("Supplier quotation reference", { exact: true }).fill(marker); await dialog.getByLabel("Quotation date", { exact: true }).fill("2026-11-03");
    await choose(page, "Validity", "Fixed expiry date"); await dialog.getByLabel("Valid until", { exact: true }).fill("2026-12-03");
    await dialog.getByLabel("Offered payment code", { exact: true }).fill("SUPPLIER-OFFERED"); await dialog.getByLabel("Offered payment terms", { exact: true }).fill("45 days after delivery"); await dialog.getByLabel("Warranty", { exact: true }).fill("Three years including labor");
    await dialog.getByLabel("Delivery terms", { exact: true }).fill("Delivered to the agreed site"); await dialog.getByLabel("Delivery date", { exact: true }).fill("2026-11-20"); await dialog.getByLabel("Offer received at (UTC)", { exact: true }).fill(new Date().toISOString());
    await dialog.getByLabel("Unit price", { exact: true }).fill("12.3456"); await choose(page, "Discount", "Percent"); await dialog.getByLabel("Discount value", { exact: true }).fill("12.5"); await choose(page, "Quoted tax treatment", "Exclusive");
    await dialog.getByLabel("Declared quoted tax", { exact: true }).fill("0.01"); await dialog.getByLabel("Delivery amount", { exact: true }).fill("0.12"); await dialog.getByLabel("Offered tax code", { exact: true }).fill("SUPPLIER-TAX"); await dialog.getByLabel("Lead time", { exact: true }).fill("Two weeks"); await dialog.getByLabel("Line notes", { exact: true }).fill("Retain accessories and complete quoted terms");
    const created = await command(page, createPath, "Create", 0, () => dialog.getByRole("button", { name: "Save supplier draft", exact: true }).click(), 201); await expect(dialog).toHaveCount(0);
    const bidId = created.quotationId; need(typeof bidId === "string" && created.version === 1 && created.supplierSubmitted === false, "Native quotation creation result invalid");
    await page.reload(); await page.getByRole("button", { name: "View draft and history", exact: true }).first().click(); await expect(page.getByText("Three years including labor", { exact: true })).toBeVisible();
    const v1 = await get(context, `${sourcePath}/quotation-drafts/${bidId}/versions/1`); need(v1.snapshot.header.offer.validity === 1 && v1.snapshot.lines[0].unitPrice === "12.3456" && v1.snapshot.header.offer.paymentTerms.text === "45 days after delivery", "Native full offer did not survive creation/reload"); evidence.snapshotHashes.created = digest(JSON.stringify(v1.snapshot));
    await logout(); ({ context, page } = await login(1));
    await page.goto(`/procurement/workspace/rfqs/${fixture.eventId}?source=quotations`); await page.getByRole("button", { name: "View draft and history", exact: true }).first().click(); await page.getByRole("button", { name: "Revise draft", exact: true }).click(); dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Offered payment terms", { exact: true })).toHaveValue("45 days after delivery"); await expect(dialog.getByLabel("Unit price", { exact: true })).toHaveValue("12.3456"); await expect(dialog.getByLabel("Warranty", { exact: true })).toHaveValue("Three years including labor");
    await dialog.getByLabel("Unit price", { exact: true }).fill("15.1234"); await dialog.getByLabel("Reason", { exact: true }).fill("Supplier corrected the quoted unit price");
    const revised = await command(page, `${sourcePath}/quotation-drafts/${bidId}/revise`, "Revise", 1, () => dialog.getByRole("button", { name: "Save supplier draft", exact: true }).click(), 200); await expect(dialog).toHaveCount(0); need(revised.version === 2, "Native revision version invalid");
    const v2 = await get(context, `${sourcePath}/quotation-drafts/${bidId}/versions/2`); need(v2.snapshot.header.capturedBy === fixture.users[1].id && JSON.stringify(v1.snapshot.header.offer) === JSON.stringify(v2.snapshot.header.offer) && v2.snapshot.lines[0].deliveryAmount === v1.snapshot.lines[0].deliveryAmount && v2.snapshot.lines[0].notes === v1.snapshot.lines[0].notes && v2.snapshot.lines[0].unitPrice === "15.1234" && v2.snapshot.totals.payable === "26.59595", "Different-principal full retained revision was not confirmed"); evidence.snapshotHashes.revised = digest(JSON.stringify(v2.snapshot)); evidence.revisedPayable = v2.snapshot.totals.payable;
    await page.getByLabel("Historical version", { exact: true }).fill("1"); await page.getByRole("button", { name: "Open version", exact: true }).click(); await expect(page.getByRole("heading", { name: "Retained version 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel supplier draft", exact: true }).click(); dialog = page.getByRole("dialog"); await dialog.getByLabel("Reason", { exact: true }).fill("Supplier withdrew the retained offer");
    const cancelled = await command(page, `${sourcePath}/quotation-drafts/${bidId}/cancel`, "Cancel", 1, () => dialog.getByRole("button", { name: "Confirm cancellation", exact: true }).click(), 200); await expect(dialog).toHaveCount(0); need(cancelled.version === 3 && cancelled.status === "Cancelled", "Native cancellation was not confirmed");
    await page.reload(); await page.getByRole("button", { name: "View draft and history", exact: true }).first().click(); await expect(page.getByRole("heading", { name: "Quotation history", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Create supplier draft", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Revise draft", exact: true })).toHaveCount(0);
    const current = await get(context, `${sourcePath}/quotation-drafts/${bidId}`); need(current.status === "Cancelled" && current.version === 3 && current.historyTotal === 3 && retained(v2.snapshot) === retained(current.snapshot), "Native cancellation changed retained terms/evidence or history"); evidence.snapshotHashes.cancelled = digest(JSON.stringify(current.snapshot));
    need(evidence.startedCommands.length === 4 && evidence.commands.length === 4 && new Set(evidence.commands.map((x: any) => x.originalKey)).size === 4 && evidence.unexpectedBusinessWrites === 0 && !evidence.pageErrors, "Native command count, original keys or UI behavior invalid");
    evidence.status = "PASS_NATIVE_QUOTATION_UI_CONTACT_CREATE_REVISE_CANCEL"; evidence.step = "completed";
  } catch { failed = true; evidence.status = "FAILED_NOT_ACCEPTANCE"; }
  finally { try { await logout(); } catch { failed = true; evidence.status = "FAILED_NOT_ACCEPTANCE"; } writeFileSync(input.output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600, flag: "wx" }); }
  need(!failed, "Native quotation UI workflow did not pass; inspect the protected receipt");
});
